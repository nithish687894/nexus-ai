import { env } from "../../config/env.js";
import { createGeminiEmbedding } from "./geminiEmbeddingProvider.js";
import { createMockEmbedding } from "./mockEmbeddingProvider.js";

export async function createEmbedding(text: string) {
  if (env.GEMINI_API_KEY) {
    try {
      const embedding = await createGeminiEmbedding(text);
      if (embedding.length > 0) return embedding;
    } catch {
      return createMockEmbedding(text);
    }
  }
  return createMockEmbedding(text);
}
