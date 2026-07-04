import parser from "cron-parser";
import { prisma, Prisma } from "@scheduler/shared";
import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

/**
 * Finds every active ScheduledJob whose nextRunAt has passed, materializes
 * a concrete Job row for it (status QUEUED, so the normal worker claim path
 * picks it up), then advances nextRunAt using the cron expression.
 *
 * Wrapped in a distributed lock so that if this service is ever scaled to
 * multiple replicas, only one instance ticks at a time and jobs aren't
 * double-created.
 */
export async function tickScheduledJobs() {
  const lockToken = Math.random().toString(36).slice(2);
  const gotLock = await redis.set("lock:cron-tick", lockToken, "PX", 5000, "NX");
  if (!gotLock) return;

  try {
    const due = await prisma.scheduledJob.findMany({
      where: { isActive: true, nextRunAt: { lte: new Date() } },
    });

    for (const sched of due) {
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.job.create({
          data: {
            queueId: sched.queueId,
            type: sched.jobType,
            payload: sched.payload as any,
            kind: "RECURRING",
            status: "QUEUED",
          },
        });

        const interval = parser.parseExpression(sched.cronExpr, { currentDate: new Date() });
        await tx.scheduledJob.update({
          where: { id: sched.id },
          data: { nextRunAt: interval.next().toDate(), lastRunAt: new Date() },
        });
      });
      // eslint-disable-next-line no-console
      console.log(`[scheduler] materialized job for scheduled_job=${sched.id} (${sched.jobType})`);
    }
  } finally {
    const script = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;
    await redis.eval(script, 1, "lock:cron-tick", lockToken);
  }
}
