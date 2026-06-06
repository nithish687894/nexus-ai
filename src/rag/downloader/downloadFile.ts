import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { contentHash } from "../indexing/contentHash.js";
import { detectFileType, storageFolderFor, type DownloadFileType } from "./fileType.js";

const privateUrlPatterns = /(login|dashboard|token|session|auth|cookie|password|netid|register|studentLogin|loginManager)/i;

export function assertSafePublicUrl(url: string) {
  const parsed = new URL(url);
  if (!["https:", "http:"].includes(parsed.protocol)) throw new Error("Only HTTP(S) URLs are supported");
  if (privateUrlPatterns.test(url)) throw new Error(`Rejected private or login-looking URL: ${url}`);
}

export type DownloadResult = {
  status: "downloaded" | "metadata_only" | "failed" | "permission_denied";
  fileType: DownloadFileType;
  localPath?: string;
  contentHash?: string;
  sizeBytes: number;
  contentType?: string;
};

export async function downloadPublicFile(url: string, source: "srm" | "thehelpers"): Promise<DownloadResult> {
  assertSafePublicUrl(url);
  const response = await fetch(url, { headers: { "User-Agent": "NexusAI-RAG/1.0" } });
  if (response.status === 401 || response.status === 403) {
    return { status: "permission_denied", fileType: "unknown", sizeBytes: 0 };
  }
  if (!response.ok) return { status: "failed", fileType: "unknown", sizeBytes: 0 };
  const contentType = response.headers.get("content-type") ?? "";
  const fileType = detectFileType(url, contentType);
  const buffer = Buffer.from(await response.arrayBuffer());
  const hash = contentHash(buffer);
  const ext = fileType === "pdf" ? ".pdf" : fileType === "image" ? imageExt(contentType, url) : ".html";
  const folder = storageFolderFor(source, fileType);
  await mkdir(folder, { recursive: true });
  const localPath = join(folder, `${hash}${ext}`);
  await writeFile(localPath, buffer);
  return { status: "downloaded", fileType, localPath, contentHash: hash, sizeBytes: buffer.byteLength, contentType };
}

function imageExt(contentType: string, url: string) {
  if (contentType.includes("png") || url.toLowerCase().endsWith(".png")) return ".png";
  if (contentType.includes("webp") || url.toLowerCase().endsWith(".webp")) return ".webp";
  return ".jpg";
}
