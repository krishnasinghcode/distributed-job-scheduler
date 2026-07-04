import { Router } from "express";
import { prisma } from "@scheduler/shared";
import { asyncHandler } from "../middleware/errorHandler";
import { requireAuth } from "../middleware/auth";

export const workerRouter = Router();
workerRouter.use(requireAuth);

// Workers are global infrastructure (not project-scoped) since one worker
// fleet can serve many projects' queues. Any authenticated user can view
// fleet health -- there's no sensitive payload data here, just status.
workerRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const workers = await prisma.worker.findMany({ orderBy: { lastHeartbeatAt: "desc" } });

    // A worker that hasn't sent a heartbeat in 15s is considered offline
    // even if its row still says otherwise (crash without graceful shutdown).
    const STALE_MS = 15_000;
    const now = Date.now();
    const withComputedStatus = workers.map((w: (typeof workers)[number]) => ({
      ...w,
      status: now - w.lastHeartbeatAt.getTime() > STALE_MS ? "OFFLINE" : w.status,
    }));
    res.json({ data: withComputedStatus });
  })
);

workerRouter.get(
  "/:id/heartbeats",
  asyncHandler(async (req, res) => {
    const heartbeats = await prisma.workerHeartbeat.findMany({
      where: { workerId: req.params.id },
      orderBy: { ts: "desc" },
      take: 100,
    });
    res.json({ data: heartbeats });
  })
);
