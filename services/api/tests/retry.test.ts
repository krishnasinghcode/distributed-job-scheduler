import { describe, it, expect } from "vitest";
import { computeNextDelayMs, shouldGoToDeadLetter, DEFAULT_RETRY_POLICY } from "@scheduler/shared";

describe("retry strategies", () => {
  it("FIXED always returns the same delay", () => {
    const policy = { ...DEFAULT_RETRY_POLICY, strategy: "FIXED" as const, baseDelayMs: 2000 };
    expect(computeNextDelayMs(1, policy)).toBe(2000);
    expect(computeNextDelayMs(4, policy)).toBe(2000);
  });

  it("LINEAR scales delay by attempt number", () => {
    const policy = { ...DEFAULT_RETRY_POLICY, strategy: "LINEAR" as const, baseDelayMs: 1000, maxDelayMs: 10000 };
    expect(computeNextDelayMs(1, policy)).toBe(1000);
    expect(computeNextDelayMs(3, policy)).toBe(3000);
  });

  it("LINEAR clamps to maxDelayMs", () => {
    const policy = { ...DEFAULT_RETRY_POLICY, strategy: "LINEAR" as const, baseDelayMs: 1000, maxDelayMs: 2500 };
    expect(computeNextDelayMs(10, policy)).toBe(2500);
  });

  it("EXPONENTIAL grows roughly 2x per attempt and stays within jitter bounds", () => {
    const policy = { ...DEFAULT_RETRY_POLICY, strategy: "EXPONENTIAL" as const, baseDelayMs: 1000, maxDelayMs: 100000 };
    const d1 = computeNextDelayMs(1, policy); // ~1000
    const d2 = computeNextDelayMs(2, policy); // ~2000
    const d3 = computeNextDelayMs(3, policy); // ~4000
    expect(d1).toBeGreaterThan(700);
    expect(d1).toBeLessThanOrEqual(1000);
    expect(d2).toBeGreaterThan(1400);
    expect(d2).toBeLessThanOrEqual(2000);
    expect(d3).toBeGreaterThan(2800);
    expect(d3).toBeLessThanOrEqual(4000);
  });

  it("EXPONENTIAL never exceeds maxDelayMs even at high attempt counts", () => {
    const policy = { ...DEFAULT_RETRY_POLICY, strategy: "EXPONENTIAL" as const, baseDelayMs: 1000, maxDelayMs: 5000 };
    expect(computeNextDelayMs(20, policy)).toBeLessThanOrEqual(5000);
  });

  it("shouldGoToDeadLetter is true once attemptCount reaches maxRetries", () => {
    const policy = { ...DEFAULT_RETRY_POLICY, maxRetries: 3 };
    expect(shouldGoToDeadLetter(2, policy)).toBe(false);
    expect(shouldGoToDeadLetter(3, policy)).toBe(true);
    expect(shouldGoToDeadLetter(4, policy)).toBe(true);
  });
});
