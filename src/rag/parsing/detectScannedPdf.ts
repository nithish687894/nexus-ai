import { parsePdf } from "./parsePdf.js";

export async function detectScannedPdf(buffer: Buffer) {
  try {
    const text = await parsePdf(buffer);
    return text.trim().length < 40;
  } catch {
    return true;
  }
}
