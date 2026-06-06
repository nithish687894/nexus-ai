import { readFile } from "node:fs/promises";
import { z } from "zod";

export const knowledgeSourceSchema = z.object({
  url: z.string().url(),
  title: z.string(),
  category: z.string(),
  sourceType: z.literal("public_study_material"),
  source: z.literal("thehelpers"),
  official: z.literal(false),
  type: z.enum(["webpage", "pdf", "image", "sitemap"]),
  enabled: z.boolean(),
  checkFrequency: z.enum(["hourly", "daily", "weekly", "monthly"]),
  priority: z.enum(["high", "medium", "low"])
});

export type KnowledgeSource = z.infer<typeof knowledgeSourceSchema>;

export async function readKnowledgeSources(path = "data/sources/knowledge-sources.json") {
  const raw = await readFile(path, "utf8");
  return z.array(knowledgeSourceSchema).parse(JSON.parse(raw));
}
