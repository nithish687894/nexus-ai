import type { Context } from "hono";
import { generateChatResponse } from "../../ai/services/responseGenerator.service.js";

export async function chatController(c: Context) {
  const body = await c.req.json();
  const startedAt = Date.now();
  const response = await generateChatResponse(body);
  return c.json({ ...response, meta: { latencyMs: Date.now() - startedAt } });
}

export async function summaryController(c: Context) {
  const body = await c.req.json();
  const response = await generateChatResponse({
    user_message: "What should I focus on today?",
    premium: body?.premium ?? false,
    safe_context: body?.safe_context
  });
  return c.json(response);
}
