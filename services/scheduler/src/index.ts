import { tickScheduledJobs } from "./cronTicker";

const TICK_INTERVAL_MS = Number(process.env.TICK_INTERVAL_MS) || 1000;
let shuttingDown = false;

async function loop() {
  while (!shuttingDown) {
    try {
      await tickScheduledJobs();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[scheduler] tick error", err);
    }
    await sleep(TICK_INTERVAL_MS);
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

console.log(`[scheduler] starting, tick interval=${TICK_INTERVAL_MS}ms`);
loop();

process.on("SIGTERM", () => {
  console.log("[scheduler] received SIGTERM, stopping after current tick");
  shuttingDown = true;
  setTimeout(() => process.exit(0), 200);
});
process.on("SIGINT", () => {
  shuttingDown = true;
  setTimeout(() => process.exit(0), 200);
});
