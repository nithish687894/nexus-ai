import { env } from "../../config/env.js";
import type { AiProvider } from "./aiProvider.js";
import { geminiProvider } from "./geminiProvider.js";
import { mockProvider } from "./mockProvider.js";
import { openaiProvider } from "./openaiProvider.js";

export function getAiProvider(): AiProvider {
  if (env.AI_PROVIDER === "openai") return openaiProvider;
  if (env.AI_PROVIDER === "gemini") return geminiProvider;
  return mockProvider;
}
