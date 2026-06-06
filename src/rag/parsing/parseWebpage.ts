import { cleanText } from "./cleanText.js";

export function parseWebpage(html: string) {
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return {
    title: cleanText(title ?? "Untitled webpage"),
    text: cleanText(html)
  };
}
