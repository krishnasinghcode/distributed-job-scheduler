import { claimNextJob } from "./claim";
import { runOneJob } from "./runJob";
import { registerWorker, startHeartbeatLoop, markWorkerOffline } from "./heartbeat";

const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY) || 5;
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS) || 500;

let shuttingDown = false;
const activeJobs = new Map<string, Promise<unknown>>();

async function pollLoop(workerId: string) {
  while (!shuttingDown) {
    const freeSlots = CONCURRENCY - activeJobs.size;
    if (freeSlots <= 0) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    const job = await claimNextJob(workerId).catch((err) => {
      console.error("[claim_error]", err);
      return null;
    });

    if (!job) {
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    const promise = runOneJob(job, workerId)
      .catch((err) => console.error("[run_job_error]", err))
      .finally(() => activeJobs.delete(job.id));
    activeJobs.set(job.id, promise);
    // Loop immediately to try to fill remaining slots rather than waiting
    // a full poll interval between claims.
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const workerId = await registerWorker(CONCURRENCY);
  console.log(`[worker] registered as ${workerId}, concurrency=${CONCURRENCY}`);

  const stopHeartbeat = startHeartbeatLoop(workerId, () => activeJobs.size);
  const loopPromise = pollLoop(workerId);

  async function shutdown(signal: string) {
    console.log(`[worker] received ${signal}, draining ${activeJobs.size} active job(s)...`);
    shuttingDown = true;
    stopHeartbeat();

    const DRAIN_TIMEOUT_MS = 30_000;
    await Promise.race([Promise.allSettled(Array.from(activeJobs.values())), sleep(DRAIN_TIMEOUT_MS)]);

    await markWorkerOffline(workerId);
    console.log("[worker] shutdown complete");
    process.exit(0);
  }

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  await loopPromise;
}

main().catch((err) => {
  console.error("[worker] fatal error", err);
  process.exit(1);
});
