import { readFile } from "node:fs/promises";
import { z } from "zod";

export const sourceTypeSchema = z.enum(["webpage", "pdf"]);

export const officialSourceSchema = z.object({
  url: z.string().url(),
  title: z.string().optional(),
  category: z.string().min(1),
  type: sourceTypeSchema,
  enabled: z.boolean().default(true)
});

export type OfficialSource = z.infer<typeof officialSourceSchema>;

export async function readOfficialSources(path = "data/sources/official-srm-sources.json") {
  const raw = await readFile(path, "utf8");
  return z.array(officialSourceSchema).parse(JSON.parse(raw));
}
