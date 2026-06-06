import { describe, expect, it } from "vitest";
import { app } from "../../src/app.js";

describe("RAG search integration", () => {
  it("returns chunks with metadata", async () => {
    const res = await app.request("/api/rag/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "What is SRM student portal?", topK: 5, category: "student_portal" })
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.chunks.length).toBeGreaterThan(0);
    expect(body.chunks[0].metadata.source_url).toContain("https://");
  });

  it("official info answer falls back when no reliable source exists", async () => {
    const res = await app.request("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_message: "What is official SRM quantum banana policy?", premium: false })
    });
    const body = await res.json();
    expect(body.intent).toBe("official_srm_info");
    expect(body.sources).toHaveLength(0);
    expect(body.missingData).toContain("official_source");
  });
});
