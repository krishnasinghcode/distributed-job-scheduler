import { Router } from "express";
import { z } from "zod";
import { prisma } from "@scheduler/shared";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";
import { assertProjectAccess } from "../lib/rbac";
import { ApiError } from "../lib/apiError";

export const queueRouter = Router();
queueRouter.use(requireAuth);

const createQueueSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1),
  priority: z.number().int().default(0),
  concurrencyLimit: z.number().int().min(1).default(5),
  rateLimitPerSec: z.number().int().min(1).optional(),
  retryPolicy: z
    .object({
      strategy: z.enum(["FIXED", "LINEAR", "EXPONENTIAL"]).default("EXPONENTIAL"),
      baseDelayMs: z.number().int().min(0).default(1000),
      maxDelayMs: z.number().int().min(0).default(300000),
      maxRetries: z.number().int().min(0).default(5),
    })
    .optional(),
});

queueRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = createQueueSchema.parse(req.body);
    await assertProjectAccess(req.user!.userId, body.projectId, "MEMBER");

    let retryPolicyId: string | undefined;
    if (body.retryPolicy) {
      const rp = await prisma.retryPolicy.create({
        data: { name: `${body.name}-policy`, ...body.retryPolicy },
      });
      retryPolicyId = rp.id;
    }

    const queue = await prisma.queue.create({
      data: {
        projectId: body.projectId,
        name: body.name,
        priority: body.priority,
        concurrencyLimit: body.concurrencyLimit,
        rateLimitPerSec: body.rateLimitPerSec,
        retryPolicyId,
      },
    });
    res.status(201).json({ data: queue });
  })
);

queueRouter.get(
  "/project/:projectId",
  asyncHandler(async (req, res) => {
    await assertProjectAccess(req.user!.userId, req.params.projectId, "VIEWER");
    const queues = await prisma.queue.findMany({
      where: { projectId: req.params.projectId },
      include: { retryPolicy: true },
      orderBy: { priority: "desc" },
    });
    res.json({ data: queues });
  })
);

async function loadQueueOrThrow(id: string) {
  const queue = await prisma.queue.findUnique({ where: { id } });
  if (!queue) throw ApiError.notFound("Queue not found");
  return queue;
}

queueRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const queue = await loadQueueOrThrow(req.params.id);
    await assertProjectAccess(req.user!.userId, queue.projectId, "VIEWER");
    res.json({ data: queue });
  })
);

const updateQueueSchema = z.object({
  priority: z.number().int().optional(),
  concurrencyLimit: z.number().int().min(1).optional(),
  rateLimitPerSec: z.number().int().min(1).nullable().optional(),
});

queueRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const queue = await loadQueueOrThrow(req.params.id);
    await assertProjectAccess(req.user!.userId, queue.projectId, "MEMBER");
    const body = updateQueueSchema.parse(req.body);
    const updated = await prisma.queue.update({ where: { id: req.params.id }, data: body });
    res.json({ data: updated });
  })
);

queueRouter.post(
  "/:id/pause",
  asyncHandler(async (req, res) => {
    const queue = await loadQueueOrThrow(req.params.id);
    await assertProjectAccess(req.user!.userId, queue.projectId, "MEMBER");
    const updated = await prisma.queue.update({ where: { id: req.params.id }, data: { isPaused: true } });
    res.json({ data: updated });
  })
);

queueRouter.post(
  "/:id/resume",
  asyncHandler(async (req, res) => {
    const queue = await loadQueueOrThrow(req.params.id);
    await assertProjectAccess(req.user!.userId, queue.projectId, "MEMBER");
    const updated = await prisma.queue.update({ where: { id: req.params.id }, data: { isPaused: false } });
    res.json({ data: updated });
  })
);

// Aggregate stats: counts per status + naive throughput (completed in last hour).
queueRouter.get(
  "/:id/stats",
  asyncHandler(async (req, res) => {
    const queue = await loadQueueOrThrow(req.params.id);
    await assertProjectAccess(req.user!.userId, queue.projectId, "VIEWER");

    const grouped = await prisma.job.groupBy({
      by: ["status"],
      where: { queueId: req.params.id },
      _count: { _all: true },
    });
    const statusCounts = Object.fromEntries(
      grouped.map((g: { status: string; _count: { _all: number } }) => [g.status, g._count._all])
    );

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const completedLastHour = await prisma.job.count({
      where: { queueId: req.params.id, status: "COMPLETED", completedAt: { gte: oneHourAgo } },
    });

    const avgDuration = await prisma.jobExecution.aggregate({
      where: { job: { queueId: req.params.id }, status: "COMPLETED" },
      _avg: { durationMs: true },
    });

    res.json({
      data: {
        statusCounts,
        throughputPerHour: completedLastHour,
        avgDurationMs: avgDuration._avg.durationMs ?? null,
      },
    });
  })
);
