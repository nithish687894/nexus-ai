import { readFile } from "node:fs/promises";
import { z } from "zod";

export const officialSrmSourceSchema = z.object({
  url: z.string().url(),
  title: z.string().optional(),
  category: z.enum(["exam", "academics", "student_portal", "coe", "notices", "hostel", "transport", "fees", "department", "general"]),
  type: z.enum(["webpage", "pdf", "image", "sitemap"]),
  sourceType: z.literal("official_srm"),
  official: z.literal(true),
  enabled: z.boolean(),
  checkFrequency: z.enum(["hourly", "daily", "weekly", "monthly"]),
  priority: z.enum(["high", "medium", "low"])
});

export type OfficialSrmSource = z.infer<typeof officialSrmSourceSchema>;

export async function readOfficialSrmSources(path = "data/sources/official-srm-sources.json") {
  const raw = await readFile(path, "utf8");
  return z.array(officialSrmSourceSchema).parse(JSON.parse(raw));
}
