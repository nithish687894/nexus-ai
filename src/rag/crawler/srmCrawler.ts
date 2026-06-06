import { cleanHtml } from "../ingestion/cleanHtml.js";

export async function fetchPublicSrmPage(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error("Only HTTPS public sources are allowed");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch ${url}`);
  return cleanHtml(await response.text());
}
