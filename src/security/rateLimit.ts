import type { MiddlewareHandler } from "hono";
import { env } from "../config/env.js";

const buckets = new Map<string, { count: number; resetAt: number }>();

export const rateLimit: MiddlewareHandler = async (c, next) => {
  const key = `${c.req.header("x-forwarded-for") ?? "local"}:${c.req.path}`;
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + 60_000 });
    return next();
  }
  bucket.count += 1;
  if (bucket.count > env.RATE_LIMIT_PER_MINUTE) {
    return c.json({ error: "rate_limited" }, 429);
  }
  return next();
};
