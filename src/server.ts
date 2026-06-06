import { serve } from "@hono/node-server";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  logger.info("nexus_ai_started", { port: info.port });
});
