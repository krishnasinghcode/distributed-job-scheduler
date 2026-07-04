import { prisma } from "@scheduler/shared";
import { tryConsumeRateLimit } from "./lock";

export interface ClaimableQueue {
  id: string;
  concurrencyLimit: number;
  rateLimitPerSec: number | null;
}

/**
 * Returns queues that are (a) not paused and (b) currently have spare
 * concurrency capacity (running jobs < concurrencyLimit). This is a cheap
 * read done once per poll tick to narrow down which queues are even worth
 * trying to claim from.
 */
async function getQueuesWithCapacity(): Promise<ClaimableQueue[]> {
  const queues = await prisma.queue.findMany({
    where: { isPaused: false },
    select: { id: true, concurrencyLimit: true, rateLimitPerSec: true },
  });
  if (queues.length === 0) return [];

  const runningCounts = await prisma.job.groupBy({
    by: ["queueId"],
    where: { queueId: { in: queues.map((q: ClaimableQueue) => q.id) }, status: { in: ["CLAIMED", "RUNNING"] } },
    _count: { _all: true },
  });
  const runningByQueue = new Map<string, number>(
    runningCounts.map((r: { queueId: string; _count: { _all: number } }) => [r.queueId, r._count._all])
  );

  return queues.filter((q: ClaimableQueue) => (runningByQueue.get(q.id) ?? 0) < q.concurrencyLimit);
}

/**
 * Atomically claims a single eligible job for this worker.
 *
 * The `SELECT ... FOR UPDATE SKIP LOCKED` pattern is what guarantees no two
 * workers ever claim the same job: Postgres takes a row lock on the
 * candidate row inside the subquery, and any concurrent transaction running
 * the same query simply skips locked rows instead of blocking on them. The
 * outer UPDATE then commits the claim in the same statement, so there's no
 * window between "read" and "write" for a race to sneak into.
 */
export async function claimNextJob(workerId: string) {
  const eligibleQueues = await getQueuesWithCapacity();
  if (eligibleQueues.length === 0) return null;

  // Apply per-queue rate limiting (bonus feature) before even attempting
  // to claim from a rate-limited queue this tick.
  const queueIds: string[] = [];
  for (const q of eligibleQueues) {
    if (q.rateLimitPerSec) {
      const allowed = await tryConsumeRateLimit(q.id, q.rateLimitPerSec);
      if (!allowed) continue;
    }
    queueIds.push(q.id);
  }
  if (queueIds.length === 0) return null;

  const rows = (await prisma.$queryRawUnsafe(
    `
    UPDATE jobs
    SET status = 'CLAIMED', claimed_by_worker_id = $1, claimed_at = now()
    WHERE id = (
      SELECT j.id FROM jobs j
      INNER JOIN queues q ON q.id = j.queue_id
      WHERE j.status IN ('QUEUED', 'SCHEDULED')
        AND j.run_at <= now()
        AND j.queue_id = ANY($2::text[])
      ORDER BY q.priority DESC, j.priority DESC, j.run_at ASC
      FOR UPDATE OF j SKIP LOCKED
      LIMIT 1
    )
    RETURNING id;
    `,
    workerId,
    queueIds
  )) as Array<{ id: string }>;

  if (rows.length === 0) return null;

  return prisma.job.findUnique({ where: { id: rows[0].id }, include: { queue: { include: { retryPolicy: true } } } });
}
