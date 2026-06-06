import type { VectorClient, VectorDocument } from "../vector/vectorClient.js";
import { getVectorClient } from "../vector/qdrantClient.js";

export async function ingestToVectorDb(documents: VectorDocument[], client: VectorClient = getVectorClient()) {
  await client.upsert(documents);
  return { uploaded: documents.length };
}
