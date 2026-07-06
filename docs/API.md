# API Reference

Base URL: `http://localhost:4000` (docker-compose default).

All endpoints except `/health`, `/api/auth/register`, and `/api/auth/login` require:
```
Authorization: Bearer <jwt>
```

Errors follow a consistent shape:
```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Invalid request", "details": { ... } } }
```
`code` is one of `VALIDATION_ERROR` (400), `ApiError` (400/401/403/404/409 — see `message`),
or `INTERNAL_ERROR` (500).

---

## Auth

### `POST /api/auth/register`
```json
{ "email": "you@example.com", "password": "min 8 chars", "name": "You", "orgName": "Acme" }
```
→ `201` `{ "token": "...", "user": {...}, "organization": { "id": "...", "name": "..." } }`

Creates a user, a new organization, and an `OWNER` membership, atomically.

### `POST /api/auth/login`
```json
{ "email": "you@example.com", "password": "..." }
```
→ `200` `{ "token": "...", "user": {...} }`

---

## Projects

### `GET /api/projects`
Lists every project across every org the caller belongs to. Paginated implicitly by org
membership size (typically small); includes a `_count.queues` per project.

### `POST /api/projects`
```json
{ "orgId": "uuid", "name": "My Project" }
```
Requires `ADMIN` or `OWNER` role in the target org. Generates a project `apiKey`.

### `GET /api/projects/:id`
Returns the project with its queues. Requires `VIEWER`+ role.

### `POST /api/projects/:id/rotate-key`
Requires `ADMIN`+. Rotates and returns the new `apiKey`.

---

## Queues

### `POST /api/queues`
```json
{
  "projectId": "uuid",
  "name": "emails",
  "priority": 5,
  "concurrencyLimit": 10,
  "rateLimitPerSec": 50,
  "retryPolicy": { "strategy": "EXPONENTIAL", "baseDelayMs": 1000, "maxDelayMs": 60000, "maxRetries": 5 }
}
```
`retryPolicy` is optional — omit it to use no retry policy (falls back to the worker's
`DEFAULT_RETRY_POLICY` at runtime). `strategy` is one of `FIXED`, `LINEAR`, `EXPONENTIAL`.

### `GET /api/queues/project/:projectId`
Lists queues for a project, including their retry policy, ordered by priority descending.

### `GET /api/queues/:id`
### `PATCH /api/queues/:id`
```json
{ "priority": 10, "concurrencyLimit": 20, "rateLimitPerSec": null }
```
Partial update of tunable queue settings.

### `POST /api/queues/:id/pause` / `POST /api/queues/:id/resume`
Paused queues are skipped entirely by the worker's claim query — jobs stay `QUEUED`.

### `GET /api/queues/:id/stats`
```json
{
  "data": {
    "statusCounts": { "QUEUED": 3, "RUNNING": 1, "COMPLETED": 152, "DEAD_LETTER": 2 },
    "throughputPerHour": 47,
    "avgDurationMs": 823.4
  }
}
```

---

## Jobs

### `POST /api/jobs`
Shape depends on `kind` (default `IMMEDIATE`):

| kind | required fields | behavior |
|---|---|---|
| `IMMEDIATE` | `queueId`, `type`, `payload` | eligible for claim immediately |
| `DELAYED` | + `runAt` (ISO datetime) | eligible once `runAt` passes |
| `SCHEDULED` | + `runAt` | same mechanism as DELAYED; semantic label for "planned ahead" jobs |
| `RECURRING` | `cronExpr` instead of payload timing | creates a `ScheduledJob` template, not a `Job` directly — the scheduler service materializes runs |
| `BATCH` | `batchItems: [{...}, {...}]` | creates one `Job` per array item, sharing a generated `batchId` |

Example (immediate):
```json
{ "queueId": "uuid", "type": "send_notification", "payload": { "userId": 42 } }
```

Example (batch):
```json
{
  "queueId": "uuid",
  "type": "resize_image",
  "kind": "BATCH",
  "batchItems": [{ "imageId": 1 }, { "imageId": 2 }, { "imageId": 3 }]
}
```
→ `201` `{ "data": { "batchId": "uuid", "jobs": [...] } }`

Example (recurring):
```json
{ "queueId": "uuid", "type": "nightly_report", "kind": "RECURRING", "cronExpr": "0 2 * * *", "payload": {} }
```
→ `201` `{ "data": { "scheduledJob": {...} } }`

Rate limited to 300 requests/min per authenticated user.

### `GET /api/jobs?queueId=uuid&status=FAILED,DEAD_LETTER&type=send_email&page=1&pageSize=20`
Paginated, filterable job list. `status` accepts a comma-separated list. `pageSize` capped
at 100.
```json
{ "data": [...], "page": 1, "pageSize": 20, "total": 143, "totalPages": 8 }
```

### `GET /api/jobs/:id`
Full detail: job fields + `executions` (ordered by attempt), `logs` (last 200), `queue`,
and `deadLetter` if present.

### `POST /api/jobs/:id/retry`
Idempotent: retrying a job that's already `QUEUED`/`RUNNING` returns `200` with a message
instead of erroring. Otherwise resets the job to `QUEUED`, clears any dead-letter record,
and clears prior worker claim fields.

### `POST /api/jobs/:id/cancel`
Rejects with `400` if the job is already `COMPLETED`, `DEAD_LETTER`, or `CANCELLED`.

### `GET /api/jobs/dead-letter/:queueId`
Paginated list of dead-lettered jobs for a queue, including the original job.

---

## Workers

### `GET /api/workers`
Lists all registered workers (global — not project-scoped, since one worker fleet can serve
many projects). A worker is reported `OFFLINE` if its last heartbeat is older than 15s, even
if its stored `status` says otherwise (crash detection).

### `GET /api/workers/:id/heartbeats`
Last 100 heartbeat samples for a worker (job count, memory usage over time).

---

## WebSocket events

Connect via Socket.IO to the API's base URL, then:
```js
socket.emit("subscribe:project", projectId);
socket.on("event", (evt) => { ... });
```
Event shapes:
```ts
{ type: "job.updated", jobId: string, status: JobStatus, queueId: string }
{ type: "worker.heartbeat", workerId: string, status: "IDLE"|"BUSY" }
{ type: "queue.stats", queueId: string, stats: Record<string, number> }
```
Job/worker events from the worker and scheduler processes are broadcast to all connected
dashboards (see `docs/DESIGN_DECISIONS.md` for why), rather than scoped to a project room.
