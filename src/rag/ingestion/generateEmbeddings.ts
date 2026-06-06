export function generateMockEmbedding(text: string, dimensions = 64) {
  const vector = Array.from({ length: dimensions }, () => 0);
  for (let i = 0; i < text.length; i += 1) {
    vector[i % dimensions] += text.charCodeAt(i) / 255;
  }
  const magnitude = Math.hypot(...vector) || 1;
  return vector.map((value) => value / magnitude);
}
