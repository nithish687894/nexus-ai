import { generateMockEmbedding } from "../ingestion/generateEmbeddings.js";

export async function createMockEmbedding(text: string) {
  return generateMockEmbedding(text);
}
