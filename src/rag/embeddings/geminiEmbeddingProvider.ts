import { env } from "../../config/env.js";

export async function createGeminiEmbedding(text: string) {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=" + env.GEMINI_API_KEY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: { parts: [{ text }] }
    })
  });
  if (!response.ok) throw new Error(`Gemini embedding failed: ${response.status}`);
  const json = (await response.json()) as { embedding?: { values?: number[] } };
  return json.embedding?.values ?? [];
}
