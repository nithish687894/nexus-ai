import { env } from "../../config/env.js";
import { createEmbedding } from "../embeddings/embeddingProvider.js";
import { officialSources } from "../data/officialSources.js";
import type { ScoredVectorDocument, VectorClient, VectorDocument, VectorSearchFilter } from "./vectorClient.js";

const memoryStore: VectorDocument[] = [];
const genericSearchTerms = new Set(["what", "where", "when", "how", "the", "and", "for", "official", "srm", "srmist", "policy", "rules", "info"]);
let seedPromise: Promise<void> | null = null;

function cosine(a: number[], b: number[]) {
  const dot = a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0);
  const magA = Math.hypot(...a) || 1;
  const magB = Math.hypot(...b) || 1;
  return dot / (magA * magB);
}

async function seedMemoryStore() {
  if (memoryStore.some((doc) => doc.id.startsWith("seed:"))) return;
  if (seedPromise) return seedPromise;
  seedPromise = seedMemoryStoreOnce().finally(() => {
    seedPromise = null;
  });
  return seedPromise;
}

async function seedMemoryStoreOnce() {
  if (memoryStore.some((doc) => doc.id.startsWith("seed:"))) return;
  const now = new Date().toISOString();
  for (const source of officialSources) {
    memoryStore.push({
      id: `seed:${source.source_url}`,
      content: source.content,
      embedding: await createEmbedding(`${source.title} ${source.content}`),
      metadata: {
        source_url: source.source_url,
        title: source.title,
        category: source.category,
        type: "webpage",
        sourceType: "official_srm",
        official: true,
        version: 1,
        is_latest: true,
        status: "active",
        last_checked_at: now,
        ingested_at: now,
        content_hash: `seed-${source.category}`
      }
    });
  }
}

export const memoryVectorClient: VectorClient = {
  async upsert(documents) {
    documents.forEach((document) => {
      const existingIndex = memoryStore.findIndex((stored) => stored.id === document.id);
      if (existingIndex >= 0) memoryStore.splice(existingIndex, 1, document);
      else memoryStore.push(document);
    });
  },
  async search(query, limit = 5, filter: VectorSearchFilter = {}) {
    await seedMemoryStore();
    const embedding = await createEmbedding(query);
    const terms = query
      .toLowerCase()
      .split(/\s+/)
      .map((term) => term.replace(/[^a-z0-9_]/g, ""))
      .filter((term) => term.length > 2 && !genericSearchTerms.has(term));
    return memoryStore
      .filter((doc) => matchesFilter(doc, filter))
      .map((doc): ScoredVectorDocument => {
        const haystack = `${doc.metadata.title} ${doc.content}`.toLowerCase();
        const lexical = terms.length ? terms.filter((term) => haystack.includes(term)).length / terms.length : 0;
        return { ...doc, score: lexical + cosine(embedding, doc.embedding) * 0.05 };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
};

export const qdrantClient: VectorClient = {
  async upsert(documents) {
    if (!env.QDRANT_URL) return memoryVectorClient.upsert(documents);
    const collectionUrl = `${env.QDRANT_URL.replace(/\/$/, "")}/collections/${env.QDRANT_COLLECTION}`;
    const headers = {
      "Content-Type": "application/json",
      ...(env.QDRANT_API_KEY ? { "api-key": env.QDRANT_API_KEY } : {})
    };
    await fetch(collectionUrl, {
      method: "PUT",
      headers,
      body: JSON.stringify({ vectors: { size: documents[0]?.embedding.length ?? 64, distance: "Cosine" } })
    });
    await fetch(`${collectionUrl}/points?wait=true`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        points: documents.map((document) => ({
          id: document.id,
          vector: document.embedding,
          payload: { content: document.content, metadata: document.metadata }
        }))
      })
    });
  },
  async search(query, limit = 5, filter: VectorSearchFilter = {}) {
    if (!env.QDRANT_URL) return memoryVectorClient.search(query, limit, filter);
    const queryVector = await createEmbedding(query);
    const must = Object.entries({
      "metadata.category": filter.category,
      "metadata.sourceType": filter.sourceType,
      "metadata.official": filter.official,
      "metadata.source": filter.source,
      "metadata.semester": filter.semester,
      "metadata.subject": filter.subject,
      "metadata.resourceType": filter.resourceType,
      "metadata.status": filter.status ?? "active",
      "metadata.is_latest": filter.is_latest ?? true
    })
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => ({ key, match: { value } }));
    const response = await fetch(`${env.QDRANT_URL.replace(/\/$/, "")}/collections/${env.QDRANT_COLLECTION}/points/search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(env.QDRANT_API_KEY ? { "api-key": env.QDRANT_API_KEY } : {})
      },
      body: JSON.stringify({
        vector: queryVector,
        limit,
        with_payload: true,
        filter: must.length ? { must } : undefined
      })
    });
    if (!response.ok) throw new Error(`Qdrant search failed: ${response.status}`);
    const json = (await response.json()) as {
      result?: Array<{ id: string; score: number; payload?: { content?: string; metadata?: VectorDocument["metadata"] } }>;
    };
    return (json.result ?? []).map((point) => ({
      id: String(point.id),
      content: point.payload?.content ?? "",
      embedding: [],
      metadata: point.payload?.metadata ?? {
        source_url: "",
        title: "Unknown source",
        category: "unknown",
        type: "webpage",
        sourceType: "official_srm",
        official: true,
        ingested_at: "",
        content_hash: ""
      },
      score: point.score
    }));
  }
};

export function getVectorClient() {
  return qdrantClient;
}

export function clearMemoryVectorStore() {
  memoryStore.splice(0, memoryStore.length);
  seedPromise = null;
}

function matchesFilter(doc: VectorDocument, filter: VectorSearchFilter) {
  const metadata = doc.metadata;
  if (filter.status !== undefined && metadata.status !== filter.status) return false;
  if (filter.status === undefined && metadata.status && metadata.status !== "active") return false;
  if (filter.is_latest !== undefined && metadata.is_latest !== filter.is_latest) return false;
  if (filter.is_latest === undefined && metadata.is_latest === false) return false;
  if (filter.category && metadata.category !== filter.category) return false;
  if (filter.sourceType && metadata.sourceType !== filter.sourceType) return false;
  if (filter.official !== undefined && metadata.official !== filter.official) return false;
  if (filter.source && metadata.source !== filter.source) return false;
  if (filter.semester !== undefined && metadata.semester !== filter.semester) return false;
  if (filter.subject && metadata.subject?.toLowerCase() !== filter.subject.toLowerCase()) return false;
  if (filter.resourceType && metadata.resourceType !== filter.resourceType) return false;
  return true;
}
