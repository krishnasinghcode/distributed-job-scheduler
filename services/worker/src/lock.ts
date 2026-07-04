import Redis from "ioredis";

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

/**
 * Simple distributed lock (SET NX PX). Used to make sure only one worker
 * process runs a given maintenance task (e.g. "promote batch on completion")
 * at a time across the fleet. Not a full Redlock implementation -- fine for
 * a single-Redis-instance deployment, which is what docker-compose gives us.
 */
export async function withLock<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T | undefined> {
  const token = Math.random().toString(36).slice(2);
  const acquired = await redis.set(`lock:${key}`, token, "PX", ttlMs, "NX");
  if (!acquired) return undefined;
  try {
    return await fn();
  } finally {
    // Only release if we still hold it (avoid deleting someone else's lock
    // if this call ran long and the TTL already expired).
    const script = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;
    await redis.eval(script, 1, `lock:${key}`, token);
  }
}

/**
 * Token-bucket-ish rate limiter for per-queue throughput caps (bonus:
 * rate limiting). Allows up to `limitPerSec` claims per rolling second.
 */
export async function tryConsumeRateLimit(queueId: string, limitPerSec: number): Promise<boolean> {
  const windowKey = `ratelimit:queue:${queueId}:${Math.floor(Date.now() / 1000)}`;
  const count = await redis.incr(windowKey);
  if (count === 1) await redis.pexpire(windowKey, 1000);
  return count <= limitPerSec;
}

export { redis };
