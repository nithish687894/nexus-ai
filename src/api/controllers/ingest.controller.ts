import type { Context } from "hono";
import { ingestOfficialSrm } from "../../rag/indexing/ingestOfficialSrm.js";
import { retrieveRelevantChunks } from "../../rag/retrieval/retrieveRelevantChunks.js";

export async function ingestSrmPublicController(c: Context) {
  return c.json(await ingestOfficialSrm());
}

export async function ingestNexusDocsController(c: Context) {
  return c.json({ ingested: 0, message: "Nexus local docs are available as markdown seed files in data/knowledge." });
}

export async function ragSearchController(c: Context) {
  const body = await c.req.json();
  const query = String(body?.query ?? "");
  const topK = Number(body?.topK ?? body?.limit ?? 5);
  const results = await retrieveRelevantChunks(query, topK, {
    category: typeof body?.category === "string" ? body.category : undefined,
    sourceType: body?.sourceType,
    official: typeof body?.official === "boolean" ? body.official : undefined,
    source: body?.source,
    semester: typeof body?.semester === "number" ? body.semester : undefined,
    subject: body?.subject,
    resourceType: body?.resourceType
  });
  return c.json({
    chunks: results.map((result) => ({
      text: result.content,
      score: result.score,
      metadata: result.metadata
    }))
  });
}
