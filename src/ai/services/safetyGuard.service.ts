import { detectPromptInjection, securityRefusal } from "../../security/promptInjectionGuard.js";
import type { AiResponse } from "../schemas/aiResponse.schema.js";

export function getSafetyResponse(message: string): AiResponse | null {
  if (!detectPromptInjection(message)) return null;
  return {
    intent: "unsupported",
    reply: securityRefusal(),
    cards: [],
    actions: [],
    sources: [],
    premiumRequired: false,
    missingData: []
  };
}
