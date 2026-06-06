import type { MiddlewareHandler } from "hono";
import { env } from "../config/env.js";

export const authGuard: MiddlewareHandler = async (c, next) => {
  if (!env.NEXUS_BACKEND_SHARED_SECRET) return next();
  const secret = c.req.header("x-nexus-shared-secret");
  if (secret !== env.NEXUS_BACKEND_SHARED_SECRET) {
    return c.json({ error: "unauthorized" }, 401);
  }
  return next();
};
