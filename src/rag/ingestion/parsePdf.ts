import { Buffer } from "node:buffer";
import { PDFParse } from "pdf-parse";
import { cleanText } from "./cleanText.js";

function parseSimplePdfText(buffer: Buffer) {
  const raw = buffer.toString("latin1");
  const matches = [...raw.matchAll(/\(([^()]*)\)\s*Tj/g)].map((match) => match[1]);
  return cleanText(matches.join(" "));
}

export async function parsePdf(buffer: Buffer) {
  let parser: PDFParse | undefined;
  try {
    parser = new PDFParse({ data: new Uint8Array(buffer) });
    const parsed = await parser.getText();
    const text = cleanText(parsed.text);
    if (text) return text;
  } catch {
    // Keep a narrow fallback for simple uncompressed PDFs and fixtures.
  } finally {
    await parser?.destroy().catch(() => undefined);
  }
  const fallback = parseSimplePdfText(buffer);
  if (!fallback) throw new Error("PDF text extraction produced no text");
  return fallback;
}
