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

type ResourceCandidate = {
  section: string;
  resourceTitle: string;
  href?: string;
  onclick?: string;
};

type FileViewerDetails = {
  fileViewerUrl?: string;
  downloadUrl?: string;
  driveUrl?: string;
  iframeUrl?: string;
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

export function extractResourceCandidatesFromHtml(html: string, baseUrl: string): ResourceCandidate[] {
  const candidates: ResourceCandidate[] = [];
  const headingPattern = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi;
  const headingMatches = [...html.matchAll(headingPattern)];
  const sections = headingMatches.length
    ? headingMatches.map((match, index) => ({
      title: stripHtml(match[1]),
      start: match.index ?? 0,
      end: headingMatches[index + 1]?.index ?? html.length
    }))
    : [{ title: "Unknown", start: 0, end: html.length }];

  for (const section of sections) {
    const block = html.slice(section.start, section.end);
    const linkMatches = [...block.matchAll(/<(a|button)\b([^>]*)>([\s\S]*?)<\/\1>/gi)];
    for (const match of linkMatches) {
      const attrs = match[2];
      const text = stripHtml(match[3]);
      const href = attrs.match(/\bhref=["']([^"']+)["']/i)?.[1];
      const onclick = attrs.match(/\bonclick=["']([^"']+)["']/i)?.[1];
      const combined = `${text} ${href ?? ""} ${onclick ?? ""}`;
      if (!/view|download|resource|file-viewer|drive\.google|\.pdf|\.png|\.jpe?g|\.webp/i.test(combined)) continue;
      const inferredTitle = /^(view|download|open)$/i.test(text)
        ? inferNearbyResourceTitle(block, match.index ?? 0) || inferResourceTitle(href, onclick)
        : text || inferResourceTitle(href, onclick);
      const title = cleanResourceTitle(inferredTitle.replace(new RegExp(`^${escapeRegExp(section.title)}\\s+`, "i"), ""));
      candidates.push({
        section: section.title || "Unknown",
        resourceTitle: title,
        href: href ? new URL(href, baseUrl).toString() : undefined,
        onclick
      });
    }
  }
  return candidates;
}

async function resolveFileViewer(page: Page, fileViewerUrl: string): Promise<FileViewerDetails> {
  const networkUrls: string[] = [];
  const onRequest = (request: { url(): string }) => {
    networkUrls.push(request.url());
  };
  page.on("request", onRequest);
  try {
    await page.goto(fileViewerUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.locator("text=Loading resource...").waitFor({ state: "hidden", timeout: 10_000 }).catch(() => undefined);
    await page.waitForTimeout(750);
    const pageData = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll("a")).map((anchor) => ({ text: anchor.textContent ?? "", href: anchor.href }));
      const iframeUrl = document.querySelector("iframe")?.getAttribute("src") ?? undefined;
      const storage = {
        local: Object.fromEntries(Array.from({ length: localStorage.length }, (_, index) => {
          const key = localStorage.key(index) ?? "";
          return [key, localStorage.getItem(key)];
        })),
        session: Object.fromEntries(Array.from({ length: sessionStorage.length }, (_, index) => {
          const key = sessionStorage.key(index) ?? "";
          return [key, sessionStorage.getItem(key)];
        }))
      };
      return { anchors, iframeUrl, storageText: JSON.stringify(storage) };
    });
    const combined = [
      fileViewerUrl,
      pageData.iframeUrl,
      pageData.storageText,
      ...pageData.anchors.map((anchor) => `${anchor.text} ${anchor.href}`),
      ...networkUrls
    ].filter(Boolean).join(" ");
    const extracted = extractFileUrls(combined);
    const downloadUrl = pageData.anchors.find((anchor) => /download/i.test(anchor.text))?.href || extracted.pdfUrl || extracted.imageUrl;
    return {
      fileViewerUrl,
      downloadUrl,
      driveUrl: extracted.driveUrl,
      iframeUrl: pageData.iframeUrl || undefined
    };
  } finally {
    page.off("request", onRequest);
  }
}

async function extractResourcesFromSubjectPage(page: Page, subjectPageUrl: string): Promise<TheHelpersCrawlRecord[]> {
  const semester = parseSemesterFromUrl(subjectPageUrl);
  const subject = parseSubjectFromUrl(subjectPageUrl);
  const candidates = extractResourceCandidatesFromHtml(await page.content(), subjectPageUrl);
  const records: TheHelpersCrawlRecord[] = [];
  for (const candidate of candidates) {
    const combined = `${candidate.href ?? ""} ${candidate.onclick ?? ""}`;
    const extracted = extractFileUrls(combined);
    const fileViewerUrl = candidate.href?.includes("/file-viewer") ? candidate.href : undefined;
    const resolved: FileViewerDetails = fileViewerUrl ? await resolveFileViewer(page, fileViewerUrl).catch(() => ({ fileViewerUrl })) : {};
    records.push({
      source: "thehelpers",
      sourceType: "public_study_material",
      official: false,
      semester,
      subject,
      section: candidate.section,
      resourceTitle: candidate.resourceTitle || "Resource",
      resourceType: classifyResourceType(candidate.section, candidate.resourceTitle),
      subjectPageUrl,
      fileViewerUrl: fileViewerUrl ?? resolved.fileViewerUrl,
      downloadUrl: resolved.downloadUrl ?? extracted.pdfUrl ?? extracted.imageUrl,
      driveUrl: resolved.driveUrl ?? extracted.driveUrl,
      iframeUrl: resolved.iframeUrl,
      discoveredAt: new Date().toISOString()
    });
    await page.goto(subjectPageUrl, { waitUntil: "domcontentloaded", timeout: 30_000 }).catch(() => undefined);
  }
  return records;
}

export async function crawlTheHelpers(outputPath = "data/crawl/thehelpers-resources.jsonl") {
  const maxSemesters = Number(process.env.THEHELPERS_MAX_SEMESTERS ?? 8);
  const maxSubjects = Number(process.env.THEHELPERS_MAX_SUBJECTS ?? Number.MAX_SAFE_INTEGER);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const records: TheHelpersCrawlRecord[] = [];
  let visitedSemesters = 0;
  let visitedSubjects = 0;
  try {
    await page.goto("https://thehelpers.tech/semesters", { waitUntil: "domcontentloaded", timeout: 30_000 });
    const semesterLinks = extractSemesterLinks(await page.content());
    for (const semesterUrl of semesterLinks.slice(0, maxSemesters)) {
      await withCrawlerDelay();
      await page.goto(semesterUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
      visitedSemesters += 1;
      const subjectLinks = extractSubjectLinks(await page.content());
      for (const subjectUrl of subjectLinks) {
        if (visitedSubjects >= maxSubjects) break;
        await withCrawlerDelay();
        await page.goto(subjectUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
        visitedSubjects += 1;
        records.push(...await extractResourcesFromSubjectPage(page, subjectUrl));
      }
      if (visitedSubjects >= maxSubjects) break;
    }
  } finally {
    await browser.close();
  }
  await writeJsonl(outputPath, records);
  return { records: records.length, visitedSemesters, visitedSubjects, outputPath };
}

function stripHtml(input: string) {
  return input.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function inferResourceTitle(href?: string, onclick?: string) {
  const text = `${href ?? ""} ${onclick ?? ""}`;
  return cleanResourceTitle(decodeURIComponent(text.split(/[/?#=&]/).filter(Boolean).at(-1) ?? "Resource").replace(/[-_]+/g, " "));
}

function inferNearbyResourceTitle(block: string, linkIndex: number) {
  const before = stripHtml(block.slice(Math.max(0, linkIndex - 220), linkIndex));
  const parts = before.split(/\s{2,}|[|]/).map((part) => part.trim()).filter(Boolean);
  return parts.at(-1)?.replace(/\b(View|Download|Open)$/i, "").trim();
}

function escapeRegExp(input: string) {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanResourceTitle(input: string) {
  return input
    .replace(/^[\\"'>\s-]+/g, "")
    .replace(/\b(View|Download|Open)\b\s*/i, "")
    .replace(/\s+/g, " ")
    .trim() || "Resource";
}
