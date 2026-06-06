import { readFile } from "node:fs/promises";
import { chunkText } from "../chunking/chunkText.js";
import { createEmbedding } from "../embeddings/embeddingProvider.js";
import { parsePdf } from "../parsing/parsePdf.js";
import { parseImage } from "../parsing/parseImage.js";
import { parseWebpage } from "../parsing/parseWebpage.js";
import { contentHash, stableDocumentId } from "./contentHash.js";
import { readJsonl, writeJsonl } from "./metadataStore.js";
import { indexVectors } from "./vectorIndexer.js";
import type { TheHelpersMetadata } from "../downloader/downloadTheHelpers.js";
import type { VectorDocument } from "../vector/vectorClient.js";

export async function ingestTheHelpers(metadataPath = "data/metadata/thehelpers-resources.jsonl") {
  const resources = await readJsonl<TheHelpersMetadata>(metadataPath);
  const chunks: Array<{ id: string; text: string; metadata: VectorDocument["metadata"] }> = [];
  const vectors: VectorDocument[] = [];
  const summary = { resourcesIngested: 0, metadataOnlyIndexed: 0, chunksCreated: 0, vectorsUploaded: 0, failedParses: 0 };

  for (const resource of resources) {
    let text = `${resource.resourceTitle} ${resource.subject} ${resource.section} ${resource.downloadUrl ?? resource.driveUrl ?? resource.fileViewerUrl ?? ""}`.trim();
    try {
      if (resource.downloadStatus === "downloaded" && resource.localPath) {
        if (resource.fileType === "pdf") text = await parsePdf(await readFile(resource.localPath));
        else if (resource.fileType === "image") text = (await parseImage(await readFile(resource.localPath), "image/*")).text || text;
        else if (resource.fileType === "webpage") text = parseWebpage(await readFile(resource.localPath, "utf8")).text;
      } else {
        summary.metadataOnlyIndexed += 1;
      }
    } catch {
      summary.failedParses += 1;
    }

    summary.resourcesIngested += 1;
    for (const chunk of chunkText(text, 500, 50)) {
      const chunkId = stableDocumentId(`${resource.document_id}:${chunk.index}:${chunk.text}`);
      const now = new Date().toISOString();
      const metadata: VectorDocument["metadata"] = {
        document_id: resource.document_id,
        chunk_id: chunkId,
        title: resource.resourceTitle,
        source_url: resource.subjectPageUrl,
        file_url: resource.downloadUrl,
        drive_url: resource.driveUrl,
        source: "thehelpers",
        sourceType: "public_study_material",
        official: false,
        category: "study_resources",
        semester: resource.semester,
        subject: resource.subject,
        section: resource.section,
        resourceType: resource.resourceType,
        type: resource.fileType,
        version: 1,
        is_latest: true,
        status: "active",
        pageNumber: 1,
        last_checked_at: now,
        ingested_at: now,
        content_hash: contentHash(chunk.text)
      };
      const vector = { id: chunkId, content: chunk.text, embedding: await createEmbedding(chunk.text), metadata };
      vectors.push(vector);
      chunks.push({ id: chunkId, text: chunk.text, metadata });
    }
  }

  await writeJsonl("data/processed/thehelpers-chunks.jsonl", chunks);
  summary.chunksCreated = chunks.length;
  summary.vectorsUploaded = (await indexVectors(vectors)).uploaded;
  return summary;
}
