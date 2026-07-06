# Architecture

## Overview

Four independently-deployable services share one Postgres database and one Redis instance:

```
                         ┌───────────────────┐
                         │   Web Dashboard   │  React + Vite, Tailwind, Recharts
                         │  (Socket.IO client)│
                         └─────────┬─────────┘
                                   │ REST + WebSocket
                         ┌─────────▼─────────┐
                         │     API service    │  Express, JWT auth, Socket.IO server
                         └────┬─────────┬─────┘
                              │         │
                    ┌─────────▼───┐   ┌─▼──────────────┐
                    │  PostgreSQL │   │      Redis      │
                    │  (source of │◄──┤ rate limiting,  │
                    │    truth)   │   │ distributed lock,│
                    └───────┬─────┘   │ pub/sub events   │
                            │         └─┬──────────────┬─┘
              claim (SKIP LOCKED)       │              │
                            │           │              │
                  ┌─────────▼──────┐    │    ┌─────────▼────────┐
                  │  Worker fleet   │◄──┘    │  Scheduler service │
                  │ (N replicas)    │        │  (cron ticker)     │
                  └─────────────────┘        └────────────────────┘
```

## Why four services instead of one monolith

Each has a different scaling and failure profile, and the assignment explicitly asks for
"a worker service" distinct from the API — treating them as separate deployables from day
one avoids a rewrite later:

- **API** is stateless and CPU-light. Scale it horizontally behind a load balancer purely
  based on request volume.
- **Worker** is the only service that does real (simulated) work and needs its own
  concurrency knob (`WORKER_CONCURRENCY`) independent of API traffic. Scaling workers is
  "add more replicas," full stop — `claimNextJob` is safe under arbitrary worker count
  because of the atomic claim query (see below).
- **Scheduler** does one narrow thing (tick cron templates into concrete jobs) on its own
  clock, unrelated to request or worker load. It's cheap to run as a single replica with a
  Redis lock guarding against double-ticking if it's ever scaled anyway.
- **Web** is a static bundle served by nginx — it has no server-side state at all.

## The atomic claim: the core reliability mechanism

The one invariant the whole platform depends on is *no two workers ever run the same job*.
This is enforced entirely by Postgres, not by application-level coordination:

```sql
UPDATE jobs
SET status = 'CLAIMED', claimed_by_worker_id = $1, claimed_at = now()
WHERE id = (
  SELECT j.id FROM jobs j
  WHERE j.status IN ('QUEUED', 'SCHEDULED') AND j.run_at <= now() AND j.queue_id = ANY($2)
  ORDER BY priority DESC, run_at ASC
  FOR UPDATE OF j SKIP LOCKED
  LIMIT 1
)
RETURNING id;
```

`FOR UPDATE SKIP LOCKED` takes a row lock on the candidate inside the same transaction that
performs the `UPDATE`. If two workers run this query concurrently, Postgres gives each one a
*different* row — the second worker's subquery simply skips the row the first one is
holding, instead of blocking on it. There is no read-then-write race window because the
read (subquery) and write (outer `UPDATE`) are one statement. This is the same pattern used
by production queue implementations (e.g. Oban for Elixir, or Postgres-backed queues at
several infra companies) instead of reaching for a separate broker.

Before running that query, the worker does one cheap read to narrow down which queues even
have spare concurrency (`running count < concurrencyLimit`) and aren't paused or
rate-limited — this keeps the hot-path query scoped to a small `queue_id IN (...)` set
rather than a full-table scan across every queue in the system.

## Request flow: submitting and running a job

1. Client calls `POST /api/jobs` with `queueId`, `type`, `payload`, and a `kind`
   (immediate/delayed/scheduled/recurring/batch).
2. API validates (Zod), checks the caller has `MEMBER` role or higher on the owning
   project (RBAC), and writes a `Job` row with `status = QUEUED` (or `SCHEDULED` if
   `runAt` is in the future — the claim query treats both identically once `run_at` has
   passed).
3. Every worker replica polls in a loop (`POLL_INTERVAL_MS`, default 500ms). When it has a
   free execution slot, it runs the atomic claim query above.
4. On claim, the worker transitions the job to `RUNNING`, creates a `JobExecution` row
   (append-only attempt history), and calls the registered handler for `job.type`.
5. On success: `Job.status = COMPLETED`, the `JobExecution` is marked `COMPLETED` with a
   duration, and a `JobLog` entry is written.
6. On failure: the queue's `RetryPolicy` decides the outcome — either re-queue with a
   FIXED/LINEAR/EXPONENTIAL backoff delay (`runAt` pushed into the future) or, once
   `attemptCount >= maxRetries`, move to `DEAD_LETTER` and write a `DeadLetterJob` row.
7. Every transition publishes a `WsEvent` over Redis pub/sub (`ws-events` channel); the API
   process (the only one holding live Socket.IO connections) relays it to subscribed
   dashboard clients. Workers/scheduler never hold websocket connections themselves — they
   just publish, which keeps them stateless and horizontally scalable.

## Recurring jobs

A `RECURRING` submission doesn't create a `Job` row directly — it creates a `ScheduledJob`
template with a cron expression and a computed `nextRunAt`. The scheduler service ticks
every `TICK_INTERVAL_MS` (default 1s), finds templates whose `nextRunAt` has passed,
materializes a concrete `Job` row (`status = QUEUED`), and advances `nextRunAt` using
`cron-parser`. This keeps the worker's claim query simple (it only ever sees real,
concrete jobs) and keeps the cron logic in exactly one place.

## Batch jobs

A `BATCH` submission takes an array of payload items and creates one `Job` row per item,
all sharing a generated `batchId`. Each job in the batch is claimed, retried, and can fail
independently — the dashboard's job explorer can filter by `batchId` to see the whole
group's progress. This is intentionally simple (N independent jobs) rather than a
map-reduce construct, since the assignment's "batch jobs" requirement is about submission
ergonomics, not a workflow engine — see `docs/DESIGN_DECISIONS.md` for the trade-off
against building full workflow-dependency support.

## Graceful shutdown

On `SIGTERM`/`SIGINT`, a worker stops polling for new work immediately, but does not kill
in-flight executions — it awaits all currently-running job promises (up to a 30s drain
timeout) before marking itself `OFFLINE` and exiting. This means a rolling deploy of the
worker fleet never kills a job mid-execution; it just stops that worker from picking up
new work.

## Observability

- **Structured logs**: every job execution writes `JobLog` rows (info on success, error on
  failure) tied to both the job and the specific execution attempt.
- **Heartbeats**: each worker updates `lastHeartbeatAt` and writes a `WorkerHeartbeat` row
  every 5s. The API additionally treats a worker as `OFFLINE` if no heartbeat has arrived
  in 15s, even if its last known `status` says otherwise — this catches crashed workers
  that never got to run their shutdown handler.
- **Metrics**: `GET /api/queues/:id/stats` aggregates status counts, last-hour throughput,
  and average execution duration directly from `Job`/`JobExecution`, no separate metrics
  store required at this scale.

## Bonus features implemented

| Feature | Where |
|---|---|
| Rate limiting | Redis fixed-window limiter on API routes (`lib/rateLimiter.ts`) *and* a per-queue token-bucket limiter in the worker's claim path (`worker/lock.ts`) |
| Distributed locking | Redis `SET NX PX` + safe-release Lua script, used by the scheduler to prevent double-ticking (`scheduler/cronTicker.ts`) and available to the worker (`worker/lock.ts`) |
| WebSocket live updates | Socket.IO server in the API, Redis pub/sub relay from worker/scheduler, `useLiveEvents` hook in the dashboard |
| Role-based access control | `Membership.role` (OWNER/ADMIN/MEMBER/VIEWER) enforced per-project in `lib/rbac.ts` |
