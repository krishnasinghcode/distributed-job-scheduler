// Cross-service DTO types, separate from Prisma generated types.
// Allows API to shape responses without depending on Prisma schema.

export type JobStatus =
  | "QUEUED"
  | "SCHEDULED"
  | "CLAIMED"
  | "RUNNING"
  | "COMPLETED"
  | "FAILED"
  | "DEAD_LETTER"
  | "CANCELLED";

export type JobKind = "IMMEDIATE" | "DELAYED" | "SCHEDULED" | "RECURRING" | "BATCH";

export interface CreateJobInput {
  queueId: string;
  type: string;
  payload: Record<string, unknown>;
  kind?: JobKind;
  priority?: number;
  runAt?: string; // ISO date, for DELAYED / SCHEDULED
  cronExpr?: string; // for RECURRING
  maxAttempts?: number;
  idempotencyKey?: string;
  batchSize?: number; // for BATCH: create N sibling jobs from an array payload
}

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface JwtPayload {
  userId: string;
  email: string;
}

// WebSocket event contract shared between API/worker and web client
export type WsEvent =
  | { type: "job.updated"; jobId: string; status: JobStatus; queueId: string }
  | { type: "worker.heartbeat"; workerId: string; status: string }
  | { type: "queue.stats"; queueId: string; stats: Record<string, number> };