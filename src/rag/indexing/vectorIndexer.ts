import { getVectorClient } from "../vector/qdrantClient.js";
import type { VectorDocument } from "../vector/vectorClient.js";

export async function indexVectors(documents: VectorDocument[]) {
  await getVectorClient().upsert(documents);
  return { uploaded: documents.length };
}
