import type { NextFunction, Request, Response } from "express";
import { redis } from "./redis";
import { ApiError } from "./apiError";

/**
 * Fixed-window rate limiter backed by Redis, so it works correctly across
 * multiple API instances (unlike an in-memory counter).
 *
 * Key = `${keyPrefix}:${identifier}:${windowStart}`
 * We increment then set TTL only on first write in the window (INCR + EXPIRE NX).
 */
export function rateLimit(options: { windowMs: number; max: number; keyPrefix: string }) {
  const { windowMs, max, keyPrefix } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    const identifier = req.user?.userId || req.ip || "anonymous";
    const windowStart = Math.floor(Date.now() / windowMs);
    const key = `ratelimit:${keyPrefix}:${identifier}:${windowStart}`;

    try {
      const count = await redis.incr(key);
      if (count === 1) {
        await redis.pexpire(key, windowMs);
      }
      res.setHeader("X-RateLimit-Limit", String(max));
      res.setHeader("X-RateLimit-Remaining", String(Math.max(0, max - count)));

      if (count > max) {
        return next(ApiError.forbidden(`Rate limit exceeded: ${max} requests per ${windowMs}ms`));
      }
      next();
    } catch (err) {
      // Fail-open: if Redis is briefly unavailable, don't block all traffic.
      // eslint-disable-next-line no-console
      console.error("[rate_limiter_error]", err);
      next();
    }
  };
}
