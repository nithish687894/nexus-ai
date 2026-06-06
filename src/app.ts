import { Hono } from "hono";
import { cors } from "hono/cors";
import { requestId } from "hono/request-id";
import { logger } from "./config/logger.js";
import { aiRoutes } from "./api/routes/ai.routes.js";
import { healthRoutes } from "./api/routes/health.routes.js";
import { ingestRoutes } from "./api/routes/ingest.routes.js";
import { authGuard } from "./security/authGuard.js";
import { rateLimit } from "./security/rateLimit.js";

export const app = new Hono();

app.use("*", requestId());
app.use("*", cors());
app.use("*", rateLimit);
app.use("/api/*", authGuard);

app.route("/health", healthRoutes);
app.route("/api/ai", aiRoutes);
app.route("/api", ingestRoutes);

app.notFound((c) => c.json({ error: "not_found" }, 404));

app.onError((error, c) => {
  logger.error("request_error", {
    requestId: c.get("requestId"),
    path: c.req.path,
    errorCategory: error.name
  });
  return c.json({ error: "internal_error", message: "Nexus AI hit a safe fallback. Try again in a bit." }, 500);
});
