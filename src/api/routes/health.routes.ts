import { Hono } from "hono";

export const healthRoutes = new Hono()
  .get("/live", (c) => c.json({ status: "live" }))
  .get("/ready", (c) => c.json({ status: "ready" }));
