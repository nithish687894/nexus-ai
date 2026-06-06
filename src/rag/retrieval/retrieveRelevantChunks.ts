import { getVectorClient } from "../vector/qdrantClient.js";
import type { VectorSearchFilter } from "../vector/vectorClient.js";

export async function retrieveRelevantChunks(query: string, limit = 5, filter: VectorSearchFilter = {}) {
  return getVectorClient().search(query, limit, {
    status: "active",
    is_latest: true,
    ...filter
  });
}
