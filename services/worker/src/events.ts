import type { WsEvent } from "@scheduler/shared";
import { redis } from "./lock";

export async function publishEvent(queueId: string, event: WsEvent) {
  // The worker doesn't know a job's projectId without an extra join, and the
  // API side keys its rooms by projectId. To keep this cheap, we publish
  // queueId and let subscribers who care look it up; the API additionally
  // re-publishes queue.stats keyed by project after recomputation. For job
  // updates specifically we accept a slightly wider broadcast (all projects
  // briefly see queueId-only events) traded for not doing a DB join on every
  // single status transition in the hot path.
  await redis.publish("ws-events", JSON.stringify({ ...event, projectId: "__broadcast__", queueId }));
}
