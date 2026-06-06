import { describe, expect, it, afterEach } from "vitest";
import { generateChatResponse } from "../../src/ai/services/responseGenerator.service.js";
import { memoryVectorClient, clearMemoryVectorStore } from "../../src/rag/vector/qdrantClient.js";

afterEach(() => clearMemoryVectorStore());

describe("source separation", () => {
  it("uses public study material for PYQ questions and marks it non-official", async () => {
    await memoryVectorClient.upsert([{
      id: "helper-pyq",
      content: "Calculus And Linear Algebra PYQ Dec 2023 public study material",
      embedding: Array.from({ length: 64 }, (_, index) => index === 0 ? 1 : 0),
      metadata: {
        document_id: "helper-doc",
        chunk_id: "helper-pyq",
        title: "PYQ Dec 2023",
        source_url: "https://thehelpers.tech/semesters/1/subjects/Calculus%20And%20Linear%20Algebra",
        file_url: "https://example.com/pyq.pdf",
        source: "thehelpers",
        sourceType: "public_study_material",
        official: false,
        category: "study_resources",
        semester: 1,
        subject: "Calculus And Linear Algebra",
        resourceType: "pyq",
        type: "pdf",
        version: 1,
        is_latest: true,
        status: "active",
        ingested_at: new Date().toISOString(),
        content_hash: "helper-hash"
      }
    }]);

    const response = await generateChatResponse({ user_message: "Give Sem 1 Calculus PYQ Dec 2023", premium: true });
    expect(response.intent).toBe("study_resource_query");
    expect(response.reply).toContain("non-official public study resource");
    expect(response.cards[0].data).toMatchObject({ official: false, sourceType: "public_study_material", source: "thehelpers" });
  });

  it("does not use THE HELPER for official SRM rules", async () => {
    await memoryVectorClient.upsert([{
      id: "helper-rule",
      content: "official exam dress code from helper",
      embedding: Array.from({ length: 64 }, (_, index) => index === 0 ? 1 : 0),
      metadata: {
        title: "Helper Exam Rule",
        source_url: "https://thehelpers.tech/rules",
        source: "thehelpers",
        sourceType: "public_study_material",
        official: false,
        category: "study_resources",
        type: "webpage",
        version: 1,
        is_latest: true,
        status: "active",
        ingested_at: new Date().toISOString(),
        content_hash: "helper-rule"
      }
    }]);

    const response = await generateChatResponse({ user_message: "What is official exam dress code?", premium: false });
    expect(response.intent).toBe("official_srm_info");
    expect(response.sources.every((source) => !source.source_url.includes("thehelpers.tech"))).toBe(true);
  });
});
