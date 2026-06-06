import { readJsonl, writeJsonl } from "../indexing/metadataStore.js";
import { contentHash, stableDocumentId } from "../indexing/contentHash.js";
import { classifyDriveUrl, driveDirectDownloadUrl, normalizeDriveUrl } from "./googleDrive.js";
import { downloadPublicFile, type DownloadResult } from "./downloadFile.js";
import { classifyResourceType, type TheHelpersCrawlRecord } from "../crawler/crawlTheHelpers.js";

export type TheHelpersMetadata = TheHelpersCrawlRecord & {
  document_id: string;
  fileType: "pdf" | "image" | "webpage" | "unknown";
  localPath?: string;
  downloadStatus: "downloaded" | "metadata_only" | "failed" | "permission_denied";
  contentHash: string;
  sizeBytes: number;
  downloadedAt: string;
};

export async function downloadTheHelpersResources(
  crawlPath = "data/crawl/thehelpers-resources.jsonl",
  metadataPath = "data/metadata/thehelpers-resources.jsonl"
) {
  const resources = await readJsonl<TheHelpersCrawlRecord>(crawlPath);
  const seen = new Set<string>();
  const rows: TheHelpersMetadata[] = [];
  const summary = { resourcesRead: resources.length, downloadedPdfs: 0, downloadedImages: 0, driveLinksFound: 0, metadataOnly: 0, permissionDenied: 0, failedDownloads: 0, duplicatesSkipped: 0 };

  for (const resource of resources) {
    const candidateUrl = resource.downloadUrl || resource.driveUrl || resource.iframeUrl || resource.fileViewerUrl || resource.subjectPageUrl;
    const metadataIdentity = `${resource.subjectPageUrl}:${resource.section}:${resource.resourceTitle}`;
    if (!candidateUrl) {
      summary.metadataOnly += 1;
      rows.push({
        ...resource,
        resourceType: resource.resourceType ?? classifyResourceType(resource.section, resource.resourceTitle),
        document_id: stableDocumentId(metadataIdentity),
        fileType: "unknown",
        downloadStatus: "metadata_only",
        contentHash: contentHash(metadataIdentity),
        sizeBytes: 0,
        downloadedAt: new Date().toISOString()
      });
      continue;
    }
    const hasDirectResourceUrl = Boolean(resource.downloadUrl || resource.driveUrl || resource.iframeUrl || resource.fileViewerUrl);
    const normalized = hasDirectResourceUrl
      ? resource.driveUrl ? normalizeDriveUrl(resource.driveUrl) : candidateUrl
      : metadataIdentity;
    if (seen.has(normalized)) {
      summary.duplicatesSkipped += 1;
      continue;
    }
    seen.add(normalized);
    if (resource.driveUrl) summary.driveLinksFound += 1;

    let result: DownloadResult & { contentHash: string } = { status: "metadata_only", fileType: "unknown", sizeBytes: 0, contentHash: contentHash(normalized) };
    const directUrl = hasDirectResourceUrl
      ? resource.driveUrl && classifyDriveUrl(resource.driveUrl) === "file" ? driveDirectDownloadUrl(resource.driveUrl) : candidateUrl
      : null;
    if (directUrl) {
      try {
        const download = await downloadPublicFile(directUrl, "thehelpers");
        result = { ...download, contentHash: download.contentHash ?? contentHash(normalized) };
      } catch {
        result = { status: "failed", fileType: "unknown", sizeBytes: 0, contentHash: contentHash(normalized) };
      }
    }

    if (result.status === "downloaded" && result.fileType === "pdf") summary.downloadedPdfs += 1;
    else if (result.status === "downloaded" && result.fileType === "image") summary.downloadedImages += 1;
    else if (result.status === "permission_denied") summary.permissionDenied += 1;
    else if (result.status === "failed") summary.failedDownloads += 1;
    else summary.metadataOnly += 1;

    rows.push({
      ...resource,
      resourceType: resource.resourceType ?? classifyResourceType(resource.section, resource.resourceTitle),
      document_id: stableDocumentId(normalized),
      fileType: result.fileType,
      localPath: result.localPath,
      downloadStatus: result.status,
      contentHash: result.contentHash,
      sizeBytes: result.sizeBytes,
      downloadedAt: new Date().toISOString()
    });
  }

  await writeJsonl(metadataPath, rows);
  return summary;
}
