import { env } from "../../config/env.js";
import { mockProvider } from "./mockProvider.js";
import type { AiProvider } from "./aiProvider.js";

export const geminiProvider: AiProvider = {
  name: "gemini",
  async generate(input) {
    if (!env.GEMINI_API_KEY) return mockProvider.generate(input);
    // v1 keeps deterministic paths local. This hook is ready for a production Gemini structured-output call.
    return mockProvider.generate(input);
  }
};
