import { Hono } from "hono";
import { chatController, summaryController } from "../controllers/ai.controller.js";

export const aiRoutes = new Hono()
  .post("/chat", chatController)
  .post("/summary", summaryController);
