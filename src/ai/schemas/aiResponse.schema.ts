import { z } from "zod";
import { actionSchema } from "./action.schema.js";
import { intentSchema } from "./intent.schema.js";

export const sourceSchema = z.object({
  title: z.string(),
  source_url: z.string().url(),
  category: z.string(),
  last_updated: z.string().optional()
});

export const cardSchema = z.object({
  type: z.string(),
  title: z.string(),
  current: z.number().optional(),
  target: z.number().optional(),
  risk: z.string().optional(),
  message: z.string(),
  data: z.record(z.unknown()).optional()
});

export const aiResponseSchema = z.object({
  intent: intentSchema,
  reply: z.string().min(1),
  cards: z.array(cardSchema).default([]),
  actions: z.array(actionSchema).default([]),
  sources: z.array(sourceSchema).default([]),
  premiumRequired: z.boolean().default(false),
  missingData: z.array(z.string()).default([])
});

export type AiResponse = z.infer<typeof aiResponseSchema>;
