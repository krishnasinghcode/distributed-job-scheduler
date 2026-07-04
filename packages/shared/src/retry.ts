/**
 * Retry strategy calculators.
 * Each strategy takes the current attempt number (1-indexed) and policy config,
 * returns delay in ms before job becomes eligible again. Clamped to maxDelayMs.
 * Pure, dependency-free module for unit testing and shared use by worker and API.
 */

export type RetryStrategyName = "FIXED" | "LINEAR" | "EXPONENTIAL";

export interface RetryPolicyConfig {
  strategy: RetryStrategyName;
  baseDelayMs: number;
  maxDelayMs: number;
  maxRetries: number;
}

export interface RetryCalculator {
  nextDelayMs(attemptNo: number, policy: RetryPolicyConfig): number;
}

const fixed: RetryCalculator = {
  nextDelayMs(_attemptNo, policy) {
    return Math.min(policy.baseDelayMs, policy.maxDelayMs);
  },
};

const linear: RetryCalculator = {
  nextDelayMs(attemptNo, policy) {
    return Math.min(policy.baseDelayMs * attemptNo, policy.maxDelayMs);
  },
};

const exponential: RetryCalculator = {
  nextDelayMs(attemptNo, policy) {
    // Full jitter backoff: base * 2^(n-1), then reduce by 0-20% to stay under maxDelayMs
    const raw = policy.baseDelayMs * Math.pow(2, attemptNo - 1);
    const capped = Math.min(raw, policy.maxDelayMs);
    const jitterFraction = Math.random() * 0.2;
    return Math.floor(capped * (1 - jitterFraction));
  },
};

const strategies: Record<RetryStrategyName, RetryCalculator> = {
  FIXED: fixed,
  LINEAR: linear,
  EXPONENTIAL: exponential,
};

export function computeNextDelayMs(attemptNo: number, policy: RetryPolicyConfig): number {
  return strategies[policy.strategy].nextDelayMs(attemptNo, policy);
}

export function shouldGoToDeadLetter(attemptCount: number, policy: RetryPolicyConfig): boolean {
  return attemptCount >= policy.maxRetries;
}

export const DEFAULT_RETRY_POLICY: RetryPolicyConfig = {
  strategy: "EXPONENTIAL",
  baseDelayMs: 1000,
  maxDelayMs: 5 * 60 * 1000,
  maxRetries: 5,
};