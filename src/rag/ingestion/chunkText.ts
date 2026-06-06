export type TextChunk = { text: string; index: number };

export function chunkText(text: string, maxTokens = 500, overlapTokens = 50): TextChunk[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const chunks: TextChunk[] = [];
  const step = Math.max(1, maxTokens - overlapTokens);
  for (let start = 0; start < words.length; start += step) {
    chunks.push({ text: words.slice(start, start + maxTokens).join(" "), index: chunks.length });
    if (start + maxTokens >= words.length) break;
  }
  return chunks;
}
