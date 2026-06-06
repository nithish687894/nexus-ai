import { chromium, type Page } from "playwright";
import { writeJsonl } from "../indexing/metadataStore.js";
import { extractSemesterLinks, extractSubjectLinks } from "./extractLinks.js";
import { withCrawlerDelay } from "./rateLimitCrawler.js";

export type TheHelpersResourceType = "pyq" | "answer_key" | "mcq" | "important_topics" | "notes" | "syllabus" | "strategy" | "unknown";

export type TheHelpersCrawlRecord = {
  source: "thehelpers";
  sourceType: "public_study_material";
  official: false;
  semester: number;
  subject: string;
  section: string;
  resourceTitle: string;
  resourceType: TheHelpersResourceType;
  subjectPageUrl: string;
  fileViewerUrl?: string;
  downloadUrl?: string;
  driveUrl?: string;
  iframeUrl?: string;
  discoveredAt: string;
};

export function classifyResourceType(section = "", title = ""): TheHelpersResourceType {
  const text = `${section} ${title}`.toLowerCase();
  if (/(pyq|previous year|ct\s?1|ct\s?2|ct\s?3|papers?)/i.test(text)) return "pyq";
  if (/answer keys?/i.test(text)) return "answer_key";
  if (/mcq/i.test(text)) return "mcq";
  if (/important topics?/i.test(text)) return "important_topics";
  if (/(chapter|class notes?|notes?)/i.test(text)) return "notes";
  if (/syllabus/i.test(text)) return "syllabus";
  if (/(exam strategies?|general rules?|suggestions?)/i.test(text)) return "strategy";
  return "unknown";
}

export function parseSemesterFromUrl(url: string) {
  return Number(new URL(url).pathname.match(/\/semesters\/(\d+)/)?.[1] ?? 0);
}

export function parseSubjectFromUrl(url: string) {
  const value = new URL(url).pathname.match(/\/subjects\/([^/]+)/)?.[1] ?? "Unknown";
  return decodeURIComponent(value).replace(/[-_]+/g, " ");
}

export function extractFileUrls(text: string) {
  const urls = [...text.matchAll(/https?:\/\/[^\s"'<>]+/g)].map((match) => match[0]);
  return {
    driveUrl: urls.find((url) => url.includes("drive.google.com")),
    pdfUrl: urls.find((url) => /\.pdf(\?|$)/i.test(url)),
    imageUrl: urls.find((url) => /\.(jpe?g|png|webp)(\?|$)/i.test(url))
  };
}

async function extractResourcesFromSubjectPage(page: Page, subjectPageUrl: string): Promise<TheHelpersCrawlRecord[]> {
  const semester = parseSemesterFromUrl(subjectPageUrl);
  const subject = parseSubjectFromUrl(subjectPageUrl);
  const links = await page.locator("a,button").evaluateAll((elements) =>
    elements.map((element) => ({
      text: element.textContent?.trim() ?? "",
      href: element instanceof HTMLAnchorElement ? element.href : "",
      onclick: element.getAttribute("onclick") ?? ""
    }))
  );
  const records: TheHelpersCrawlRecord[] = [];
  for (const link of links.filter((item) => /view|download|resource/i.test(`${item.text} ${item.href} ${item.onclick}`))) {
    const combined = `${link.href} ${link.onclick}`;
    const extracted = extractFileUrls(combined);
    records.push({
      source: "thehelpers",
      sourceType: "public_study_material",
      official: false,
      semester,
      subject,
      section: "Unknown",
      resourceTitle: link.text || "Resource",
      resourceType: classifyResourceType("Unknown", link.text),
      subjectPageUrl,
      fileViewerUrl: link.href.includes("/file-viewer") ? link.href : undefined,
      downloadUrl: extracted.pdfUrl || extracted.imageUrl,
      driveUrl: extracted.driveUrl,
      discoveredAt: new Date().toISOString()
    });
  }
  return records;
}

export async function crawlTheHelpers(outputPath = "data/crawl/thehelpers-resources.jsonl") {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const records: TheHelpersCrawlRecord[] = [];
  try {
    await page.goto("https://thehelpers.tech/semesters", { waitUntil: "domcontentloaded", timeout: 30_000 });
    const semesterLinks = extractSemesterLinks(await page.content());
    for (const semesterUrl of semesterLinks.slice(0, 8)) {
      await withCrawlerDelay();
      await page.goto(semesterUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
      const subjectLinks = extractSubjectLinks(await page.content());
      for (const subjectUrl of subjectLinks) {
        await withCrawlerDelay();
        await page.goto(subjectUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
        records.push(...await extractResourcesFromSubjectPage(page, subjectUrl));
      }
    }
  } finally {
    await browser.close();
  }
  await writeJsonl(outputPath, records);
  return { records: records.length, outputPath };
}
