import { Router } from "express";
import { prisma } from "@scheduler/shared";
import { claimNextJob } from "@scheduler/worker/dist/claim";
import { runOneJob } from "@scheduler/worker/dist/runJob";
import { registerWorker } from "@scheduler/worker/dist/heartbeat";
import { tickScheduledJobs } from "@scheduler/scheduler/dist/cronTicker";
import { asyncHandler } from "../middleware/errorHandler";
import { ApiError } from "../lib/apiError";

export const internalRouter = Router();

const MAX_JOBS_PER_TICK = Number(process.env.TICK_MAX_JOBS) || 10;

// Lazily register one long-lived "Worker" row representing this API process
// acting as an embedded worker. Cached in memory so we don't create a new
// Worker row on every tick -- this process IS one worker for as long as it
// stays alive between requests.
let embeddedWorkerId: string | null = null;
async function getEmbeddedWorkerId(): Promise<string> {
  if (embeddedWorkerId) return embeddedWorkerId;
  embeddedWorkerId = await registerWorker(MAX_JOBS_PER_TICK);
  return embeddedWorkerId;
}

/**
 * POST /internal/tick
 *
 * Not part of the public API surface -- this exists purely so the platform
 * can run on a single free web-service instance (no separate worker/scheduler
 * process) by having an external free cron pinger (cron-job.org, GitHub
 * Actions schedule, etc.) call this every 1-2 minutes. Each call:
 *   1. materializes any due recurring jobs (the scheduler's job)
 *   2. claims and executes up to MAX_JOBS_PER_TICK eligible jobs (the worker's job)
 * sequentially, within the HTTP request/response cycle, so it stays bounded
 * and doesn't need a background process at all.
 *
 * See docs/DEPLOYMENT.md. Disabled entirely unless TICK_SECRET is set, and
 * requires that exact value in the X-Tick-Secret header -- this endpoint can
 * execute arbitrary registered job handlers, so it must not be left open.
 */
internalRouter.post(
  "/tick",
  asyncHandler(async (req, res) => {
    const secret = process.env.TICK_SECRET;
    if (!secret) throw ApiError.notFound("Not found");
    if (req.headers["x-tick-secret"] !== secret) throw ApiError.unauthorized("Invalid tick secret");

    const workerId = await getEmbeddedWorkerId();

    const scheduledBefore = await prisma.scheduledJob.count({ where: { isActive: true, nextRunAt: { lte: new Date() } } });
    await tickScheduledJobs();

    let executed = 0;
    const outcomes: Record<string, number> = {};
    for (let i = 0; i < MAX_JOBS_PER_TICK; i++) {
      const job = await claimNextJob(workerId);
      if (!job) break;
      const outcome = await runOneJob(job, workerId);
      executed++;
      outcomes[outcome ?? "unknown"] = (outcomes[outcome ?? "unknown"] ?? 0) + 1;
    }

    await prisma.worker.update({
      where: { id: workerId },
      data: { lastHeartbeatAt: new Date(), status: "IDLE", currentJobCount: 0 },
    });

    res.json({ data: { recurringJobsMaterialized: scheduledBefore, jobsExecuted: executed, outcomes } });
  })
);
