export function isOcrConfigured() {
  return process.env.GEMINI_VISION_ENABLED === "true" && Boolean(process.env.GEMINI_API_KEY);
}

export async function extractTextWithOcr(_buffer: Buffer, _mimeType: string) {
  if (!isOcrConfigured()) {
    return { text: "", extractionMethod: "unavailable" as const };
  }
  return { text: "", extractionMethod: "vision" as const };
}
