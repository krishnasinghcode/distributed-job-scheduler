import { prisma, computeNextDelayMs, shouldGoToDeadLetter, DEFAULT_RETRY_POLICY } from "@scheduler/shared";
import type { RetryPolicyConfig } from "@scheduler/shared";
import { publishEvent } from "./events";

/**
 * Called when a job's handler throws. Decides, based on the queue's retry
 * policy, whether to schedule another attempt (with FIXED/LINEAR/EXPONENTIAL
 * backoff) or to move the job permanently to the Dead Letter Queue.
 */
export async function handleJobFailure(job: { id: string; queueId: string; attemptCount: number }, error: Error, retryPolicyRow: RetryPolicyConfig | null) {
  const policy: RetryPolicyConfig = retryPolicyRow ?? DEFAULT_RETRY_POLICY;

  if (shouldGoToDeadLetter(job.attemptCount, policy)) {
    await prisma.$transaction([
      prisma.job.update({
        where: { id: job.id },
        data: { status: "DEAD_LETTER" },
      }),
      prisma.deadLetterJob.create({
        data: {
          originalJobId: job.id,
          payload: (await prisma.job.findUnique({ where: { id: job.id } }))!.payload as any,
          error: error.message.slice(0, 2000),
          attemptCount: job.attemptCount,
        },
      }),
    ]);
    await publishEvent(job.queueId, { type: "job.updated", jobId: job.id, status: "DEAD_LETTER", queueId: job.queueId });
    return "DEAD_LETTER" as const;
  }

  const delayMs = computeNextDelayMs(job.attemptCount, policy);
  await prisma.job.update({
    where: { id: job.id },
    data: {
      status: "QUEUED",
      runAt: new Date(Date.now() + delayMs),
      claimedByWorkerId: null,
      claimedAt: null,
    },
  });
  await publishEvent(job.queueId, { type: "job.updated", jobId: job.id, status: "QUEUED", queueId: job.queueId });
  return "RETRY_SCHEDULED" as const;
}
