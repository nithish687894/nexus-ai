import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import { isoNow } from "../../utils/date.js";
import { chunkText } from "./chunkText.js";
import { createEmbedding } from "./createEmbeddings.js";
import { assertPublicSourceUrl, fetchPublicPage } from "./fetchPage.js";
import { ingestToVectorDb } from "./ingestToVectorDb.js";
import { parsePdf } from "./parsePdf.js";
import { readOfficialSources, type OfficialSource } from "./sourceList.js";
import type { VectorDocument } from "../vector/vectorClient.js";

type ExtractedSource = {
  title: string;
  text: string;
  lastUpdated?: string;
};

function hash(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

function uuidFromHash(input: string) {
  const value = hash(input).slice(0, 32);
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

async function fetchPdfSource(source: OfficialSource): Promise<ExtractedSource> {
  assertPublicSourceUrl(source.url);
  const response = await fetch(source.url, {
    headers: { "User-Agent": "NexusAI-RAG-Ingestion/1.0" }
  });
  if (!response.ok) throw new Error(`Failed to fetch ${source.url}: ${response.status}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  return {
    title: source.title ?? source.url.split("/").filter(Boolean).at(-1) ?? source.url,
    text: await parsePdf(buffer),
    lastUpdated: response.headers.get("last-modified") ?? undefined
  };
}

async function extractSource(source: OfficialSource) {
  if (source.type === "pdf") return fetchPdfSource(source);
  const page = await fetchPublicPage(source.url);
  return {
    title: source.title ?? page.title,
    text: page.text,
    lastUpdated: page.lastUpdated
  };
}

export async function ingestSrmSources(sourcePath = "data/sources/official-srm-sources.json") {
  const sources = (await readOfficialSources(sourcePath)).filter((source) => source.enabled);
  const documents: VectorDocument[] = [];
  const lines: string[] = [];
  let fetchedWebpages = 0;
  let parsedPdfs = 0;
  let skipped = 0;

  for (const source of sources) {
    try {
      const extracted = await extractSource(source);
      if (source.type === "pdf") parsedPdfs += 1;
      else fetchedWebpages += 1;

      for (const chunk of chunkText(extracted.text, 500, 50)) {
        const contentHash = hash(chunk.text);
        const document: VectorDocument = {
          id: uuidFromHash(`${source.url}:${chunk.index}:${contentHash}`),
          content: chunk.text,
          embedding: await createEmbedding(chunk.text),
          metadata: {
            source_url: source.url,
            title: extracted.title,
            category: source.category,
            type: source.type,
            last_updated: extracted.lastUpdated ?? "unknown",
            ingested_at: isoNow(),
            content_hash: contentHash
          }
        };
        documents.push(document);
        lines.push(JSON.stringify({ id: document.id, text: document.content, metadata: document.metadata }));
      }
    } catch (error) {
      skipped += 1;
      logger.warn("srm_source_skipped", {
        url: source.url,
        category: source.category,
        errorCategory: error instanceof Error ? error.name : "UnknownError"
      });
    }
  }

  const processedPath = join("data", "processed", "chunks.jsonl");
  await mkdir(dirname(processedPath), { recursive: true });
  await writeFile(processedPath, `${lines.join("\n")}${lines.length ? "\n" : ""}`, "utf8");
  await ingestToVectorDb(documents);

  return {
    loadedSources: sources.length,
    fetchedWebpages,
    parsedPdfs,
    skipped,
    createdChunks: documents.length,
    uploadedVectors: documents.length,
    vectorProvider: env.QDRANT_URL ? "qdrant" : "memory",
    processedPath
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const summary = await ingestSrmSources();
  logger.info("srm_ingestion_complete", summary);
  console.log(`Loaded ${summary.loadedSources} sources`);
  console.log(`Fetched ${summary.fetchedWebpages} webpages`);
  console.log(`Parsed ${summary.parsedPdfs} PDFs`);
  console.log(`Skipped ${summary.skipped} sources`);
  console.log(`Created ${summary.createdChunks} chunks`);
  console.log(`Uploaded ${summary.uploadedVectors} vectors to ${summary.vectorProvider}`);
  console.log("Done");
}
