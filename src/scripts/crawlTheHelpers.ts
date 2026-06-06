import { crawlTheHelpers, formatSummary } from "../rag/crawler/crawlTheHelpers.js";

const args = process.argv.slice(2);
let semester: number | "all" = "all";
let subject: string | undefined;
let maxResources: number | undefined;

function cleanArgValue(val: string): string {
  return val.replace(/^["']|["']$/g, "");
}

for (const arg of args) {
  if (arg.startsWith("--semester=")) {
    const val = cleanArgValue(arg.split("=")[1]);
    if (val === "all") {
      semester = "all";
    } else {
      semester = Number(val);
    }
  } else if (arg.startsWith("--subject=")) {
    subject = cleanArgValue(arg.split("=")[1]);
  } else if (arg.startsWith("--maxResources=")) {
    maxResources = Number(cleanArgValue(arg.split("=")[1]));
  }
}

console.log(`Starting crawl with options: semester=${semester}, subject=${subject ?? "none"}, maxResources=${maxResources ?? "none"}`);

const summary = await crawlTheHelpers({ semester, subject, maxResources });
console.log("\n" + formatSummary(summary));
