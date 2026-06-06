import { retrieveRelevantChunks as retrieve } from "../retrieval/retrieveRelevantChunks.js";
import type { VectorSearchFilter } from "../vector/vectorClient.js";

export async function retrieveRelevantChunks(query: string, limit = 5, categoryOrFilter?: string | VectorSearchFilter) {
  const filter = typeof categoryOrFilter === "string" ? { category: categoryOrFilter } : categoryOrFilter;
  return retrieve(query, limit, filter);
}
