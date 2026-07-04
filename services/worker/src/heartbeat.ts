import os from "os";
import { prisma } from "@scheduler/shared";
import { publishEvent } from "./events";

export async function registerWorker(concurrency: number): Promise<string> {
  const worker = await prisma.worker.create({
    data: {
      hostname: os.hostname(),
      pid: process.pid,
      status: "IDLE",
      concurrency,
    },
  });
  return worker.id;
}

export function startHeartbeatLoop(workerId: string, getActiveJobCount: () => number, intervalMs = 5000) {
  const timer = setInterval(async () => {
    const activeJobCount = getActiveJobCount();
    try {
      await prisma.worker.update({
        where: { id: workerId },
        data: {
          lastHeartbeatAt: new Date(),
          status: activeJobCount > 0 ? "BUSY" : "IDLE",
          currentJobCount: activeJobCount,
        },
      });
      await prisma.workerHeartbeat.create({
        data: { workerId, jobCount: activeJobCount, memMb: process.memoryUsage().rss / (1024 * 1024) },
      });
      await publishEvent("", { type: "worker.heartbeat", workerId, status: activeJobCount > 0 ? "BUSY" : "IDLE" });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[heartbeat_error]", err);
    }
  }, intervalMs);
  return () => clearInterval(timer);
}

export async function markWorkerOffline(workerId: string) {
  await prisma.worker.update({ where: { id: workerId }, data: { status: "OFFLINE" } }).catch(() => {});
}
