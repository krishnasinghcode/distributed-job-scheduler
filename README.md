# Pulse — Distributed Job Scheduler

A production-inspired distributed job scheduling platform: submit immediate, delayed,
scheduled, recurring (cron), and batch jobs; a fleet of workers claims and executes them
concurrently and safely; a live dashboard shows queue health, worker status, and job history.

**[Live demo →](https://distributed-job-scheduler-x4ts.onrender.com)** &nbsp;·&nbsp; Demo login: `demo@scheduler.dev` / `password123`

## Docs

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system design and component responsibilities
- [`docs/ER_DIAGRAM.md`](docs/ER_DIAGRAM.md) — database schema and rationale
- [`docs/API.md`](docs/API.md) — REST API reference
- [`docs/DESIGN_DECISIONS.md`](docs/DESIGN_DECISIONS.md) — trade-offs and why

## Features

- **Auth & multi-tenancy** — JWT auth, organizations, projects, role-based access (owner/admin/member/viewer)
- **Queues** — priority, concurrency limits, pause/resume, per-queue rate limiting, live stats
- **Job kinds** — immediate, delayed, scheduled, recurring (cron), and batch submission
- **Reliability** — atomic job claiming via Postgres `SELECT ... FOR UPDATE SKIP LOCKED` (no double execution, no broker needed), configurable retry strategies (fixed/linear/exponential backoff), automatic dead-letter queue for permanent failures
- **Observability** — per-job execution history, structured logs, worker heartbeats with crash detection, throughput/duration metrics
- **Live dashboard** — React + TypeScript, WebSocket-driven updates, job lifecycle visualization, worker fleet monitoring

## Quick start (Docker — recommended)

Requires Docker and Docker Compose.

```bash
cp .env.example .env   # optional, docker-compose.yml already has working defaults
docker compose up --build
```

This starts, in order: Postgres, Redis, a one-shot `migrate` job (schema push + demo data
seed), the API, two worker replicas, the scheduler, and the web dashboard.

- Dashboard: http://localhost:5173
- API: http://localhost:4000 (health check at `/health`)
- Demo login: `demo@scheduler.dev` / `password123`

To scale the worker fleet: `docker compose up --scale worker=5`

## Quick start (without Docker)

Requires Node.js 20+, PostgreSQL 16+, Redis 7+.

```bash
npm install --workspaces --include-workspace-root

# point packages/shared/prisma at your local Postgres
export DATABASE_URL="postgresql://scheduler:scheduler@localhost:5432/scheduler"
npm run prisma:generate
npx prisma db push --schema packages/shared/prisma/schema.prisma   # first run
npm run prisma:seed

# in separate terminals:
npm run dev:api          # http://localhost:4000
npm run dev:worker       # polls and executes jobs
npm run dev:scheduler    # materializes recurring jobs from cron templates
npm run dev:web          # http://localhost:5173
```

Each service reads config from environment variables — see `.env.example` for the full list
(`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `WORKER_CONCURRENCY`, `POLL_INTERVAL_MS`, etc).

## Running tests

```bash
npm test   # runs services/api and services/worker vitest suites
```

Tests mock the Prisma client and Redis, so they run without a live database — fast enough
for CI, and they exercise the retry-strategy math, pagination, request validation, and the
retry/dead-letter decision logic described in `docs/DESIGN_DECISIONS.md`.

## Repository layout

```
packages/shared/     Prisma schema, generated client, shared types, retry-strategy math
services/api/        REST API — auth, projects, queues, jobs, workers, websocket relay
services/worker/     Polls queues, atomically claims jobs, executes, retries, heartbeats
services/scheduler/  Materializes recurring (cron) jobs from ScheduledJob templates
web/                 React + TypeScript dashboard (Vite, Tailwind, Recharts, Socket.IO)
docs/                Architecture, ER diagram, API reference, design decisions, deployment
```

## Using the API directly

```bash
# Register (returns a JWT + your organization id)
curl -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"password123","name":"You","orgName":"Acme"}'

# Create a project (use the orgId from the response above)
curl -X POST http://localhost:4000/api/projects \
  -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"orgId":"<orgId>","name":"My Project"}'
```

Full endpoint reference, request/response shapes, and job-kind examples: [`docs/API.md`](docs/API.md).

## Tech stack

Node.js, TypeScript, Express, PostgreSQL, Prisma, Redis, React, Vite, Tailwind CSS,
Socket.IO, Docker.
