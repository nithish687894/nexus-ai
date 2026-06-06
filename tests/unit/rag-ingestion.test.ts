import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { chunkText } from "../../src/rag/ingestion/chunkText.js";
import { cleanText } from "../../src/rag/ingestion/cleanText.js";
import { ingestSrmSources } from "../../src/rag/ingestion/ingestSrm.js";
import { parsePdf } from "../../src/rag/ingestion/parsePdf.js";
import { clearMemoryVectorStore } from "../../src/rag/vector/qdrantClient.js";

function tinyPdfWithText(text: string) {
  return Buffer.from(`%PDF-1.1
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /Contents 4 0 R >> endobj
4 0 obj << /Length 44 >> stream
BT /F1 12 Tf 10 10 Td (${text}) Tj ET
endstream endobj
trailer << /Root 1 0 R >>
%%EOF`, "latin1");
}

describe("RAG ingestion primitives", () => {
  afterEach(() => clearMemoryVectorStore());

  it("cleans webpage navigation and extracts text", () => {
    const cleaned = cleanText("<header>Menu</header><main><h1>SRM Students</h1><p>Academic resources</p></main><footer>Home</footer>");
    expect(cleaned).toContain("SRM Students");
    expect(cleaned).toContain("Academic resources");
    expect(cleaned).not.toContain("Menu");
  });

  it("extracts PDF text", async () => {
    await expect(parsePdf(tinyPdfWithText("SRM Academic Calendar"))).resolves.toContain("SRM Academic Calendar");
  });

  it("chunks text with configured overlap", () => {
    const chunks = chunkText("one two three four five six seven", 4, 2);
    expect(chunks.map((chunk) => chunk.text)).toEqual(["one two three four", "three four five six", "five six seven"]);
  });

  it("creates metadata and chunks jsonl during ingestion", async () => {
    const originalFetch = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<title>Students | SRMIST</title><main>SRM public student resources and academic help.</main>", {
      status: 200,
      headers: { "last-modified": "Sat, 06 Jun 2026 00:00:00 GMT" }
    })));
    const fixtureDir = join("tests", ".tmp");
    await mkdir(fixtureDir, { recursive: true });
    const sourcePath = join(fixtureDir, "sources.json");
    await writeFile(sourcePath, JSON.stringify([{
      url: "https://www.srmist.edu.in/students/",
      title: "Students | SRMIST",
      category: "students",
      type: "webpage",
      enabled: true
    }]));

    const summary = await ingestSrmSources(sourcePath);
    expect(summary.loadedSources).toBe(1);
    expect(summary.createdChunks).toBe(1);
    const chunks = await readFile(join("data", "processed", "chunks.jsonl"), "utf8");
    const line = JSON.parse(chunks.trim());
    expect(line.metadata.source_url).toBe("https://www.srmist.edu.in/students/");
    expect(line.metadata.category).toBe("students");
    expect(line.metadata.type).toBe("webpage");
    globalThis.fetch = originalFetch;
  });
});
