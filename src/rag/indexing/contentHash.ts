import { createHash } from "node:crypto";

export function contentHash(input: string | Buffer | Uint8Array) {
  return createHash("sha256").update(input).digest("hex");
}

export function stableDocumentId(input: string) {
  const value = contentHash(input).slice(0, 32);
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}
