import { cleanText } from "./cleanText.js";

const privateUrlPatterns = [
  /login/i,
  /signin/i,
  /auth/i,
  /dashboard/i,
  /\/student-?portal\/.+/i
];

export function assertPublicSourceUrl(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") {
    throw new Error("Only HTTPS public sources are allowed");
  }
  if (privateUrlPatterns.some((pattern) => pattern.test(parsed.pathname))) {
    throw new Error(`Rejected private or login-like source: ${url}`);
  }
}

export function extractTitle(html: string, fallback: string) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return cleanText(title ?? fallback);
}

export async function fetchPublicPage(url: string) {
  assertPublicSourceUrl(url);
  const response = await fetch(url, {
    headers: { "User-Agent": "NexusAI-RAG-Ingestion/1.0" }
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  const html = await response.text();
  return {
    title: extractTitle(html, url),
    text: cleanText(html),
    lastUpdated: response.headers.get("last-modified") ?? undefined
  };
}
