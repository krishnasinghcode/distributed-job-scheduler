import { prisma } from "@scheduler/shared";
import { claimNextJob } from "./claim";
import { getHandler } from "./executor";
import { handleJobFailure } from "./retryHandler";
import { publishEvent } from "./events";

export type ClaimedJob = NonNullable<Awaited<ReturnType<typeof claimNextJob>>>;

/**
 * Executes one already-claimed job end to end: marks it RUNNING, runs its
 * handler, records the JobExecution + JobLog, and on failure hands off to
 * the retry/DLQ decision logic. Shared by:
 *  - the long-running worker's poll loop (services/worker/src/index.ts)
 *  - the serverless "tick" endpoint used for free-tier deployments where a
 *    standalone worker process isn't available (services/api/src/routes/internal.routes.ts)
 */
export async function runOneJob(job: ClaimedJob, workerId: string) {
  const startedAt = new Date();

  await prisma.job.update({ where: { id: job.id }, data: { status: "RUNNING", startedAt } });
  await publishEvent(job.queueId, { type: "job.updated", jobId: job.id, status: "RUNNING", queueId: job.queueId });

  const attemptNo = job.attemptCount + 1;
  const execution = await prisma.jobExecution.create({
    data: { jobId: job.id, workerId, attemptNo, status: "RUNNING", startedAt },
  });

  try {
    const handler = getHandler(job.type);
    const result = await handler(job.payload as Record<string, unknown>);
    const finishedAt = new Date();

    await prisma.$transaction([
      prisma.job.update({
        where: { id: job.id },
        data: { status: "COMPLETED", completedAt: finishedAt, attemptCount: attemptNo },
      }),
      prisma.jobExecution.update({
        where: { id: execution.id },
        data: {
          status: "COMPLETED",
          finishedAt,
          durationMs: finishedAt.getTime() - startedAt.getTime(),
          result: (result ?? {}) as any,
        },
      }),
      prisma.jobLog.create({
        data: { jobId: job.id, executionId: execution.id, level: "info", message: `Completed on attempt ${attemptNo}` },
      }),
    ]);
    await publishEvent(job.queueId, { type: "job.updated", jobId: job.id, status: "COMPLETED", queueId: job.queueId });
    return "COMPLETED" as const;
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const finishedAt = new Date();

    await prisma.$transaction([
      prisma.job.update({ where: { id: job.id }, data: { attemptCount: attemptNo } }),
      prisma.jobExecution.update({
        where: { id: execution.id },
        data: { status: "FAILED", finishedAt, durationMs: finishedAt.getTime() - startedAt.getTime(), error: error.message },
      }),
      prisma.jobLog.create({
        data: { jobId: job.id, executionId: execution.id, level: "error", message: `Attempt ${attemptNo} failed: ${error.message}` },
      }),
    ]);

    const outcome = await handleJobFailure(
      { id: job.id, queueId: job.queueId, attemptCount: attemptNo },
      error,
      job.queue.retryPolicy
        ? {
            strategy: job.queue.retryPolicy.strategy,
            baseDelayMs: job.queue.retryPolicy.baseDelayMs,
            maxDelayMs: job.queue.retryPolicy.maxDelayMs,
            maxRetries: job.queue.retryPolicy.maxRetries,
          }
        : null
    );
    // eslint-disable-next-line no-console
    console.log(`[worker] job ${job.id} failed attempt ${attemptNo} -> ${outcome}`);
    return outcome;
  }
}
