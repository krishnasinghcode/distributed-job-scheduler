import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@scheduler/shared", async () => {
  const actual = await vi.importActual<typeof import("@scheduler/shared")>("@scheduler/shared");
  return {
    ...actual,
    prisma: {
      job: { update: vi.fn(), findUnique: vi.fn().mockResolvedValue({ payload: { a: 1 } }) },
      deadLetterJob: { create: vi.fn() },
      $transaction: vi.fn((ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
    },
  };
});

vi.mock("../src/events", () => ({ publishEvent: vi.fn() }));

import { handleJobFailure } from "../src/retryHandler";
import { prisma } from "@scheduler/shared";

const policy = { strategy: "FIXED" as const, baseDelayMs: 1000, maxDelayMs: 60000, maxRetries: 3 };

describe("handleJobFailure", () => {
  beforeEach(() => vi.clearAllMocks());

  it("re-queues the job with a future runAt when under maxRetries", async () => {
    const outcome = await handleJobFailure({ id: "job1", queueId: "q1", attemptCount: 1 }, new Error("boom"), policy);
    expect(outcome).toBe("RETRY_SCHEDULED");
    expect(prisma.job.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "job1" }, data: expect.objectContaining({ status: "QUEUED" }) })
    );
  });

  it("moves the job to DEAD_LETTER once attemptCount reaches maxRetries", async () => {
    const outcome = await handleJobFailure({ id: "job2", queueId: "q1", attemptCount: 3 }, new Error("boom"), policy);
    expect(outcome).toBe("DEAD_LETTER");
    expect(prisma.deadLetterJob.create).toHaveBeenCalled();
  });

  it("falls back to DEFAULT_RETRY_POLICY when the queue has no retry policy configured", async () => {
    const outcome = await handleJobFailure({ id: "job3", queueId: "q1", attemptCount: 1 }, new Error("boom"), null);
    expect(outcome).toBe("RETRY_SCHEDULED");
  });
});
