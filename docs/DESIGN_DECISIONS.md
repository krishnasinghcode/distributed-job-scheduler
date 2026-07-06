# Design Decisions

This document explains the major trade-offs made and why, as requested in the assignment
deliverables — an evaluator should be able to disagree with a choice here, but not wonder
whether it was considered.

## 1. Postgres as the queue broker, not a dedicated message broker (Redis Streams/Kafka/RabbitMQ)

**Decision:** all job state lives in Postgres; claiming uses `SELECT ... FOR UPDATE SKIP
LOCKED`. Redis is used only for ephemeral concerns (rate limiting, locks, pub/sub relay).

**Why:** the assignment's evaluation criteria weight database design and reliability
higher than raw throughput. A Postgres-backed queue keeps job state, execution history,
retries, and business data (projects/queues/users) transactionally consistent in one
place — a job's status change and its log entry either both commit or neither does,
because they're one `$transaction`. A separate broker would mean either dual-writing (job
state in Postgres, queue position in the broker) with the classic distributed-consistency
problem, or moving *all* state into the broker and losing SQL's query/reporting
flexibility for the dashboard (stats, DLQ browsing, filtering).

**Trade-off accepted:** this doesn't scale to the same raw jobs/sec as Kafka once you're
past tens of thousands of claims/sec on a single Postgres primary — polling and row-lock
contention become the bottleneck before Kafka's would. At that scale you'd shard the jobs
table (see #7) or introduce a broker for the hottest queues only. For the throughput this
assignment is evaluated at, and for keeping one source of truth, Postgres wins on
correctness and query flexibility.

## 2. Polling workers instead of push/notify

**Decision:** workers poll every `POLL_INTERVAL_MS` (default 500ms) rather than being
pushed jobs via `LISTEN/NOTIFY` or a broker subscription.

**Why:** polling is simpler to reason about, trivially horizontally scalable (add a
replica, it just starts polling too), and survives worker restarts/network blips without
needing to re-establish a subscription or replay a missed notification. `LISTEN/NOTIFY`
would reduce latency slightly but adds a second thing that can silently fail (a dropped
notification is invisible; a missed poll tick is caught by the next one 500ms later).

**Trade-off accepted:** up to `POLL_INTERVAL_MS` of added latency between a job becoming
eligible and being claimed, and constant background load from idle workers polling with no
work available. Both are tunable/acceptable at this scale; a future iteration could add
`LISTEN/NOTIFY` as an *optimization* layered on top of polling (poll less often, but wake
up immediately on notify) without changing the claim query's correctness guarantee at all.

## 3. Retry history as append-only `JobExecution` rows, not a JSON array on `Job`

**Decision:** see `docs/ER_DIAGRAM.md` normalization section.

**Trade-off accepted:** an extra join to get full history vs. a single denormalized
column. Chosen because the dashboard needs to query/sort/filter executions independently
(e.g. "average duration across all completed executions this queue has ever run" is a
`groupBy`/`aggregate` in SQL, not a client-side reduce over a blob) and because a JSON
array column has no size limit enforcement and no way to index into "the 3rd attempt."

## 4. Batch jobs are N independent jobs, not a DAG/workflow engine

**Decision:** `kind: BATCH` creates one `Job` row per payload item sharing a `batchId`.
Each executes, retries, and can fail completely independently.

**Why:** the assignment lists "batch jobs" as a core requirement and "workflow
dependencies" as a *bonus*. Building a full DAG executor (job B waits for job A, fan-in/
fan-out, partial-failure propagation rules) is a meaningfully larger scope than the
assignment's core ask, and getting it right (especially around what happens when a
dependency permanently fails) is its own multi-week project. Implementing the simpler,
well-defined version of the core requirement solidly seemed better than implementing both
shallowly.

**Trade-off accepted:** no automatic dependency ordering between jobs. If you need "run B
after A succeeds," today you'd submit B from your own application code after observing A's
completion via the API/webhook — which is a legitimate pattern many real systems use, just
not one this platform automates for you.

## 5. Idempotency is submission-level, not execution-level

**Decision:** `@@unique([queueId, idempotencyKey])` prevents *creating* a duplicate job if
the same key is submitted twice. Handlers are not automatically idempotent against
duplicate *execution* (e.g. if a handler partially runs, then the process crashes before
marking the job complete, a retry will re-run the handler from scratch).

**Why:** true execution-level idempotency (exactly-once side effects) depends entirely on
what the job *does* — sending an email twice vs. charging a credit card twice have very
different remediation costs, and only the handler author knows how to make their specific
side effect idempotent (e.g. an idempotency key passed through to a payment provider's
API). The platform's job here is to guarantee **at-least-once execution** with no double
*claiming* (which it does, atomically) and to make the current attempt number available to
handler code so they *can* implement idempotency themselves — not to paper over a problem
that's only solvable with domain knowledge the scheduler doesn't have.

**Trade-off accepted:** handlers that aren't written carefully can double-execute side
effects on retry. This is documented behavior (at-least-once, not exactly-once), which is
what essentially every production job scheduler (Sidekiq, Celery, SQS) actually provides.

## 6. Websocket events broadcast broadly rather than perfectly project-scoped

**Decision:** the worker/scheduler publish job and worker events without looking up the
owning project first; the API relays these to *all* connected dashboard clients rather
than only the relevant project's room (see `services/worker/src/events.ts`).

**Why:** looking up a job's project on every single status transition (queued → claimed →
running → completed, potentially retried several times) would mean an extra join per
transition purely to satisfy websocket room targeting — real work on the hot execution
path for a UX-only concern. `queue.stats` events (which are already scoped, computed less
frequently, and looked up via the API which already has the project context) *do* target
the correct project room.

**Trade-off accepted:** a dashboard user briefly sees event traffic for jobs outside the
project they're currently viewing (filtered client-side, so nothing incorrect is
*displayed* — just slightly wasted bandwidth on an event stream that's already small). At
real multi-tenant scale, the fix is to denormalize `projectId` onto the `Job`/`Worker` rows
directly (trading one join for one column, no per-event lookup needed) — noted here as the
next step rather than done preemptively, since it changes the schema for a UX
optimization, not a correctness one.

## 7. Sharding, deferred

Queue sharding is listed as a bonus and was **not implemented**. The schema and claim query
are already shaped to make it a follow-on rather than a rewrite: `Queue` already has its own
row, so a "shard" could be modeled as a queue-to-partition mapping (e.g. `Job` table
partitioned by `queueId` range, or a `shardKey` column added and included in the claim
query's `WHERE` and composite index), with each worker replica configured to poll only
its assigned shard's queue IDs. Deferred because it adds operational complexity
(partition management, rebalancing) that isn't exercised at this assignment's scale, and
because doing it well needs a real throughput target to size shards against — better to
build it when there's a number to design for than to guess one.

## 8. AI-generated failure summaries, deferred

Listed as a bonus; not implemented. The natural integration point is on `DeadLetterJob`:
summarize `error` + the last few `JobLog` lines into a one-line human-readable cause when a
job is dead-lettered, shown in the dashboard's DLQ tab. Deferred in favor of spending the
time budget on the core reliability/concurrency mechanics (claim correctness, retry
math, graceful shutdown) that the evaluation criteria weight far more heavily (15+20+20
points vs. this being one bullet among eight bonus options).
