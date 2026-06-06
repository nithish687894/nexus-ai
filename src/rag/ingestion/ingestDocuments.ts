import { createHash } from "node:crypto";
import { isoNow } from "../../utils/date.js";
import { officialSources } from "../data/officialSources.js";
import { createEmbedding } from "./createEmbeddings.js";
import { chunkText } from "./chunkText.js";
import { getVectorClient } from "../vector/qdrantClient.js";
import type { VectorDocument } from "../vector/vectorClient.js";

export async function ingestOfficialSources() {
  const documents: VectorDocument[] = [];
  for (const source of officialSources) {
    for (const chunk of chunkText(source.content)) {
      documents.push({
      id: createHash("sha256").update(`${source.source_url}:${chunk.index}:${chunk.text}`).digest("hex"),
      content: chunk.text,
      embedding: await createEmbedding(chunk.text),
      metadata: {
        source_url: source.source_url,
        title: source.title,
        category: source.category,
        type: "webpage" as const,
        ingested_at: isoNow(),
        content_hash: createHash("sha256").update(chunk.text).digest("hex")
      }
    });
    }
  }
  await getVectorClient().upsert(documents);
  return { ingested: documents.length };
}
