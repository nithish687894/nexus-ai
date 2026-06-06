import { env } from "../../config/env.js";
import { mockProvider } from "./mockProvider.js";
import type { AiProvider } from "./aiProvider.js";

export const openaiProvider: AiProvider = {
  name: "openai",
  async generate(input) {
    if (!env.OPENAI_API_KEY) return mockProvider.generate(input);
    // v1 keeps deterministic paths local. This hook is ready for a production OpenAI structured-output call.
    return mockProvider.generate(input);
  }
};
