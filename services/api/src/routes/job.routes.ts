import { Router } from "express";
import { z } from "zod";
import { randomUUID } from "crypto";
import parser from "cron-parser";
import { prisma, parsePagination, buildPaginatedResult, Prisma } from "@scheduler/shared";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { assertProjectAccess } from "../lib/rbac";
import { ApiError } from "../lib/apiError";
import { rateLimit } from "../lib/rateLimiter";
import { publishEvent } from "../ws/socket";

export const jobRouter = Router();
jobRouter.use(requireAuth);
jobRouter.use(rateLimit({ windowMs: 60_000, max: 300, keyPrefix: "jobs" }));

const createJobSchema = z.object({
  queueId: z.string().uuid(),
  type: z.string().min(1),
  payload: z.record(z.unknown()).default({}),
  kind: z.enum(["IMMEDIATE", "DELAYED", "SCHEDULED", "RECURRING", "BATCH"]).default("IMMEDIATE"),
  priority: z.number().int().default(0),
  runAt: z.string().datetime().optional(), // required for DELAYED/SCHEDULED
  cronExpr: z.string().optional(), // required for RECURRING
  maxAttempts: z.number().int().min(1).default(5),
  idempotencyKey: z.string().optional(),
  batchItems: z.array(z.record(z.unknown())).optional(), // for BATCH: one job per item
});

async function loadQueueForJobAccess(queueId: string, userId: string) {
  const queue = await prisma.queue.findUnique({ where: { id: queueId } });
  if (!queue) throw ApiError.notFound("Queue not found");
  await assertProjectAccess(userId, queue.projectId, "MEMBER");
  return queue;
}

jobRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createJobSchema.parse(req.body);
    const queue = await loadQueueForJobAccess(body.queueId, req.user!.userId);

    if ((body.kind === "DELAYED" || body.kind === "SCHEDULED") && !body.runAt) {
      throw ApiError.badRequest(`kind=${body.kind} requires runAt`);
    }
    if (body.kind === "RECURRING" && !body.cronExpr) {
      throw ApiError.badRequest("kind=RECURRING requires cronExpr");
    }

    // RECURRING jobs are templates managed by the scheduler service, not
    // direct Job rows -- they live in ScheduledJob and spawn Jobs over time.
    if (body.kind === "RECURRING") {
      const interval = parser.parseExpression(body.cronExpr!);
      const scheduled = await prisma.scheduledJob.create({
        data: {
          queueId: queue.id,
          name: body.type,
          cronExpr: body.cronExpr!,
          jobType: body.type,
          payload: body.payload,
          nextRunAt: interval.next().toDate(),
        },
      });
      return res.status(201).json({ data: { scheduledJob: scheduled } });
    }

    // BATCH: create N sibling jobs sharing a batchId, one per payload item.
    if (body.kind === "BATCH") {
      if (!body.batchItems?.length) throw ApiError.badRequest("kind=BATCH requires non-empty batchItems");
      const batchId = randomUUID();
      const jobs = await prisma.$transaction(
        body.batchItems.map((item) =>
          prisma.job.create({
            data: {
              queueId: queue.id,
              type: body.type,
              payload: item,
              kind: "BATCH",
              batchId,
              priority: body.priority,
              maxAttempts: body.maxAttempts,
            },
          })
        )
      );
      return res.status(201).json({ data: { batchId, jobs } });
    }

    const job = await prisma.job.create({
      data: {
        queueId: queue.id,
        type: body.type,
        payload: body.payload,
        kind: body.kind,
        priority: body.priority,
        runAt: body.runAt ? new Date(body.runAt) : new Date(),
        status: body.runAt ? "SCHEDULED" : "QUEUED",
        maxAttempts: body.maxAttempts,
        idempotencyKey: body.idempotencyKey,
      },
    });

    await publishEvent(queue.projectId, { type: "job.updated", jobId: job.id, status: job.status as any, queueId: queue.id });
    res.status(201).json({ data: job });
  })
);

const listJobsQuerySchema = z.object({
  queueId: z.string().uuid().optional(),
  status: z.string().optional(), // comma-separated
  type: z.string().optional(),
  page: z.string().optional(),
  pageSize: z.string().optional(),
});

jobRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const q = listJobsQuerySchema.parse(req.query);
    if (!q.queueId) throw ApiError.badRequest("queueId query param is required");
    await loadQueueForJobAccess(q.queueId, req.user!.userId);

    const pagination = parsePagination(req.query as Record<string, unknown>);
    const where = {
      queueId: q.queueId,
      ...(q.status ? { status: { in: q.status.split(",") as any[] } } : {}),
      ...(q.type ? { type: q.type } : {}),
    };

    const [data, total] = await Promise.all([
      prisma.job.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (pagination.page - 1) * pagination.pageSize,
        take: pagination.pageSize,
      }),
      prisma.job.count({ where }),
    ]);

    res.json(buildPaginatedResult(data, total, pagination));
  })
);

jobRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const job = await prisma.job.findUnique({
      where: { id: req.params.id },
      include: {
        executions: { orderBy: { attemptNo: "asc" } },
        logs: { orderBy: { ts: "asc" }, take: 200 },
        queue: true,
        deadLetter: true,
      },
    });
    if (!job) throw ApiError.notFound("Job not found");
    await assertProjectAccess(req.user!.userId, job.queue.projectId, "VIEWER");
    res.json({ data: job });
  })
);

// Manually retry a FAILED or DEAD_LETTER job: reset it back to QUEUED and
// clear the dead-letter record if present. This is idempotent -- retrying an
// already-queued job is a no-op response, not an error.
jobRouter.post(
  "/:id/retry",
  asyncHandler(async (req, res) => {
    const job = await prisma.job.findUnique({ where: { id: req.params.id }, include: { queue: true } });
    if (!job) throw ApiError.notFound("Job not found");
    await assertProjectAccess(req.user!.userId, job.queue.projectId, "MEMBER");

    if (job.status === "QUEUED" || job.status === "RUNNING") {
      return res.json({ data: job, message: "Job is already active" });
    }

    const updated = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.deadLetterJob.deleteMany({ where: { originalJobId: job.id } });
      return tx.job.update({
        where: { id: job.id },
        data: { status: "QUEUED", runAt: new Date(), claimedByWorkerId: null, claimedAt: null },
      });
    });

    await publishEvent(job.queue.projectId, { type: "job.updated", jobId: job.id, status: "QUEUED", queueId: job.queueId });
    res.json({ data: updated });
  })
);

jobRouter.post(
  "/:id/cancel",
  asyncHandler(async (req, res) => {
    const job = await prisma.job.findUnique({ where: { id: req.params.id }, include: { queue: true } });
    if (!job) throw ApiError.notFound("Job not found");
    await assertProjectAccess(req.user!.userId, job.queue.projectId, "MEMBER");
    if (["COMPLETED", "DEAD_LETTER", "CANCELLED"].includes(job.status)) {
      throw ApiError.badRequest(`Cannot cancel a job in status ${job.status}`);
    }
    const updated = await prisma.job.update({ where: { id: job.id }, data: { status: "CANCELLED" } });
    res.json({ data: updated });
  })
);

// Dead-letter listing, scoped to a queue.
jobRouter.get(
  "/dead-letter/:queueId",
  asyncHandler(async (req, res) => {
    await loadQueueForJobAccess(req.params.queueId, req.user!.userId);
    const pagination = parsePagination(req.query as Record<string, unknown>);
    const where = { originalJob: { queueId: req.params.queueId } };
    const [data, total] = await Promise.all([
      prisma.deadLetterJob.findMany({
        where,
        include: { originalJob: true },
        orderBy: { failedAt: "desc" },
        skip: (pagination.page - 1) * pagination.pageSize,
        take: pagination.pageSize,
      }),
      prisma.deadLetterJob.count({ where }),
    ]);
    res.json(buildPaginatedResult(data, total, pagination));
  })
);
