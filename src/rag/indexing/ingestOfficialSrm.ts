import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { readOfficialSrmSources } from "../sources/officialSrmSources.js";
import { downloadPublicFile, assertSafePublicUrl } from "../downloader/downloadFile.js";
import { parseWebpage } from "../parsing/parseWebpage.js";
import { parsePdf } from "../parsing/parsePdf.js";
import { parseImage } from "../parsing/parseImage.js";
import { chunkText } from "../chunking/chunkText.js";
import { createEmbedding } from "../embeddings/embeddingProvider.js";
import { contentHash, stableDocumentId } from "./contentHash.js";
import { readJsonl, writeJsonl } from "./metadataStore.js";
import { indexVectors } from "./vectorIndexer.js";
import type { VectorDocument } from "../vector/vectorClient.js";

export type OfficialSrmDocumentMetadata = {
  document_id: string;
  title: string;
  source_url: string;
  sourceType: "official_srm";
  official: true;
  type: "webpage" | "pdf" | "scanned_pdf" | "image";
  category: string;
  raw_file_url?: string;
  content_hash: string;
  version: number;
  is_latest: boolean;
  status: "active" | "inactive" | "failed";
  last_checked_at: string;
  last_updated_from_source?: string;
  ingested_at: string;
  page_count: number;
  extraction_method: "html" | "pdf_text" | "ocr" | "vision" | "unavailable";
};

export async function ingestOfficialSrm(sourcePath = "data/sources/official-srm-sources.json") {
  const sources = (await readOfficialSrmSources(sourcePath)).filter((source) => source.enabled);
  const existing = await readJsonl<OfficialSrmDocumentMetadata>("data/metadata/srm-documents.jsonl");
  const metadataRows: OfficialSrmDocumentMetadata[] = [];
  const chunkRows: Array<{ id: string; text: string; metadata: VectorDocument["metadata"] }> = [];
  const vectors: VectorDocument[] = [];
  const summary = { loadedSources: sources.length, fetchedWebpages: 0, parsedPdfs: 0, parsedImages: 0, extractionUnavailable: 0, skippedDuplicates: 0, failed: 0, createdChunks: 0, uploadedVectors: 0 };

  for (const source of sources) {
    try {
      assertSafePublicUrl(source.url);
      const downloaded = await downloadPublicFile(source.url, "srm");
      const now = new Date().toISOString();
      const documentId = stableDocumentId(source.url);
      const type = downloaded.fileType === "pdf" ? "pdf" : downloaded.fileType === "image" ? "image" : "webpage";
      const sourceHash = downloaded.contentHash ?? contentHash(source.url);
      if (existing.some((row) => row.content_hash === sourceHash && row.is_latest)) {
        summary.skippedDuplicates += 1;
        continue;
      }
      let text = "";
      let extractionMethod: OfficialSrmDocumentMetadata["extraction_method"] = "unavailable";
      if (downloaded.localPath && type === "webpage") {
        const parsed = parseWebpage(await readFile(downloaded.localPath, "utf8"));
        text = parsed.text;
        extractionMethod = "html";
        summary.fetchedWebpages += 1;
      } else if (downloaded.localPath && type === "pdf") {
        text = await parsePdf(await readFile(downloaded.localPath));
        extractionMethod = text ? "pdf_text" : "unavailable";
        summary.parsedPdfs += 1;
      } else if (downloaded.localPath && type === "image") {
        const parsed = await parseImage(await readFile(downloaded.localPath), downloaded.contentType ?? "image/*");
        text = parsed.text;
        extractionMethod = parsed.extractionMethod;
        summary.parsedImages += 1;
      }
      if (!text) summary.extractionUnavailable += 1;

      const version = Math.max(0, ...existing.filter((row) => row.document_id === documentId).map((row) => row.version)) + 1;
      metadataRows.push({
        document_id: documentId,
        title: source.title ?? source.url,
        source_url: source.url,
        sourceType: "official_srm",
        official: true,
        type,
        category: source.category,
        raw_file_url: downloaded.localPath,
        content_hash: sourceHash,
        version,
        is_latest: true,
        status: "active",
        last_checked_at: now,
        ingested_at: now,
        page_count: 0,
        extraction_method: extractionMethod
      });

      for (const chunk of chunkText(text || `${source.title ?? source.url} ${source.url}`, 500, 50)) {
        const chunkId = stableDocumentId(`${documentId}:${chunk.index}:${chunk.text}`);
        const metadata: VectorDocument["metadata"] = {
          document_id: documentId,
          chunk_id: chunkId,
          title: source.title ?? source.url,
          source_url: source.url,
          sourceType: "official_srm",
          official: true,
          category: source.category,
          type,
          version,
          is_latest: true,
          status: "active",
          page_number: 1,
          last_checked_at: now,
          ingested_at: now,
          content_hash: contentHash(chunk.text)
        };
        const vector = { id: chunkId, content: chunk.text, embedding: await createEmbedding(chunk.text), metadata };
        vectors.push(vector);
        chunkRows.push({ id: chunkId, text: chunk.text, metadata });
      }
    } catch {
      summary.failed += 1;
    }
  }

  const mergedMetadata = [...existing.map((row) => metadataRows.some((next) => next.document_id === row.document_id) ? { ...row, is_latest: false, status: "inactive" as const } : row), ...metadataRows];
  await writeJsonl("data/metadata/srm-documents.jsonl", mergedMetadata);
  await writeJsonl("data/processed/srm-chunks.jsonl", chunkRows);
  summary.createdChunks = chunkRows.length;
  summary.uploadedVectors = (await indexVectors(vectors)).uploaded;
  await mkdir(dirname(join("data", "processed", "srm-chunks.jsonl")), { recursive: true });
  await writeFile("data/processed/chunks.jsonl", chunkRows.map((row) => JSON.stringify(row)).join("\n") + (chunkRows.length ? "\n" : ""), "utf8");
  return summary;
}
