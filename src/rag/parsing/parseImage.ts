import { extractTextWithOcr } from "./ocrProvider.js";

export async function parseImage(buffer: Buffer, mimeType: string) {
  return extractTextWithOcr(buffer, mimeType);
}
