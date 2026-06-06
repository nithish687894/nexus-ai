import { Hono } from "hono";
import { ingestNexusDocsController, ingestSrmPublicController, ragSearchController } from "../controllers/ingest.controller.js";

export const ingestRoutes = new Hono()
  .post("/ingest/srm-public", ingestSrmPublicController)
  .post("/ingest/nexus-docs", ingestNexusDocsController)
  .post("/rag/search", ragSearchController);
