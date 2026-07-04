/**
 * Job "handlers" -- the actual business logic that runs for a given job
 * `type`. In a real deployment these would call out to email providers,
 * report generators, etc. For this assessment they're small deterministic
 * (and occasionally randomly-failing) simulations so the whole retry / DLQ
 * pipeline is exercisable end-to-end without external dependencies.
 *
 * Adding a new job type is a one-line registration -- this is the extension
 * point referenced in docs/DESIGN_DECISIONS.md.
 */

export type JobHandler = (payload: Record<string, unknown>) => Promise<Record<string, unknown> | void>;

const registry = new Map<string, JobHandler>();

export function registerHandler(type: string, handler: JobHandler) {
  registry.set(type, handler);
}

export function getHandler(type: string): JobHandler {
  return registry.get(type) ?? registry.get("default")!;
}

registerHandler("send_welcome_email", async (payload) => {
  await sleep(200 + Math.random() * 300);
  return { sent: true, to: payload.to };
});

registerHandler("generate_report", async (payload) => {
  await sleep(500 + Math.random() * 1000);
  if (Math.random() < 0.15) throw new Error("Report generation timed out");
  return { reportId: `rpt_${Date.now()}`, rows: payload.rows ?? 0 };
});

registerHandler("send_notification", async () => {
  await sleep(100);
  return { delivered: true };
});

// Fallback used by any job `type` without a specific registration -- keeps
// the platform usable for arbitrary job types submitted via the API without
// requiring a code change per type.
registerHandler("default", async (payload) => {
  await sleep(150);
  return { echoed: payload };
});

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
