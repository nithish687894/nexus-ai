import { chromium, type Page } from "playwright";
import { writeJsonl, appendJsonl } from "../indexing/metadataStore.js";
import { extractSemesterLinks, extractSubjectLinks } from "./extractLinks.js";
import { withCrawlerDelay, sleep } from "./rateLimitCrawler.js";

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

export interface CrawlOptions {
  semester?: number | "all";
  subject?: string;
  maxResources?: number;
  outputPath?: string;
}

export type SemesterStats = {
  semester: number;
  subjectsFound: number;
  resourcesFound: number;
};

export type TheHelpersCrawlSummary = {
  semestersFound: number;
  semesters: SemesterStats[];
  totalSemestersCrawled: number;
  totalSubjectsFound: number;
  totalResourcesFound: number;
  totalFileViewerLinksFound: number;
  totalDownloadUrlsFound: number;
  totalMetadataOnly: number;
  totalDuplicatesSkipped: number;
  totalFailedPages: number;
  outputPath: string;
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
  html = html.replace(/<svg\b[^>]*>([\s\S]*?)<\/svg>/gi, "");
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

export async function gotoWithRetry(page: Page, url: string, retries = 2, delayMs = 500): Promise<any> {
  let attempt = 0;
  while (true) {
    try {
      const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      const status = response?.status() ?? 200;
      if (status === 403 || status === 429) {
        if (attempt < retries) {
          const backoff = delayMs * Math.pow(2, attempt);
          await sleep(backoff);
          attempt++;
          continue;
        }
        throw new Error(`Failed to load ${url} with status ${status} after ${attempt} retries`);
      }
      return response;
    } catch (error) {
      if (attempt < retries) {
        const backoff = delayMs * Math.pow(2, attempt);
        await sleep(backoff);
        attempt++;
        continue;
      }
      throw error;
    }
  }
}

async function resolveFileViewer(page: Page, fileViewerUrl: string): Promise<FileViewerDetails> {
  const networkUrls: string[] = [];
  const onRequest = (request: { url(): string }) => {
    networkUrls.push(request.url());
  };
  page.on("request", onRequest);
  try {
    await gotoWithRetry(page, fileViewerUrl);
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

async function extractResourcesFromSubjectPage(
  page: Page,
  subjectPageUrl: string,
  options: {
    semester: number;
    subjectFilter?: string;
    maxResources: number;
    getCurrentCount: () => number;
    incrementCount: () => void;
    seenKeys: Set<string>;
    incrementDuplicates: () => void;
    incrementFailed: () => void;
  }
): Promise<TheHelpersCrawlRecord[]> {
  const semester = options.semester;
  const subject = parseSubjectFromUrl(subjectPageUrl);
  
  const candidates = extractResourceCandidatesFromHtml(await page.content(), subjectPageUrl);
  const records: TheHelpersCrawlRecord[] = [];
  
  for (const candidate of candidates) {
    if (options.getCurrentCount() >= options.maxResources) {
      break;
    }
    
    const combined = `${candidate.href ?? ""} ${candidate.onclick ?? ""}`;
    const extracted = extractFileUrls(combined);
    const fileViewerUrl = candidate.href?.includes("/file-viewer") ? candidate.href : undefined;
    
    // Stable dedupe check
    const dedupeKey = buildDedupeKey(semester, subject, candidate.section, candidate.resourceTitle, fileViewerUrl ?? extracted.pdfUrl ?? extracted.imageUrl);
    if (options.seenKeys.has(dedupeKey)) {
      options.incrementDuplicates();
      continue;
    }
    options.seenKeys.add(dedupeKey);
    
    let resolved: FileViewerDetails = {};
    if (fileViewerUrl) {
      try {
        await withCrawlerDelay();
        resolved = await resolveFileViewer(page, fileViewerUrl);
      } catch (error) {
        options.incrementFailed();
        console.error(`Failed to resolve file viewer ${fileViewerUrl}:`, error);
        resolved = { fileViewerUrl };
      }
      // Go back to subject page to handle next resource candidate
      await withCrawlerDelay();
      await gotoWithRetry(page, subjectPageUrl).catch(() => undefined);
    }
    
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
    
    options.incrementCount();
  }
  
  return records;
}

export function shouldCrawlSemester(semesterUrl: string, semesterFilter: number | "all"): boolean {
  if (semesterFilter === "all") return true;
  const sem = parseSemesterFromUrl(semesterUrl);
  return sem === semesterFilter;
}

export function shouldCrawlSubject(subjectUrl: string, subjectFilter?: string): boolean {
  if (!subjectFilter) return true;
  const subjectName = parseSubjectFromUrl(subjectUrl).toLowerCase().trim();
  const filter = subjectFilter.toLowerCase().trim();
  return subjectName === filter;
}

export function buildDedupeKey(
  semester: number,
  subject: string,
  section: string,
  title: string,
  fileUrlOrViewerUrl?: string
): string {
  return `${semester}|${subject.trim().toLowerCase()}|${section.trim().toLowerCase()}|${title.trim().toLowerCase()}|${(fileUrlOrViewerUrl || "").trim().toLowerCase()}`;
}

export function computeGroupedStats(records: TheHelpersCrawlRecord[], semestersFoundList: number[]): {
  semesters: SemesterStats[];
  totalSemestersCrawled: number;
  totalSubjectsFound: number;
  totalResourcesFound: number;
  totalFileViewerLinksFound: number;
  totalDownloadUrlsFound: number;
  totalMetadataOnly: number;
} {
  const semestersMap = new Map<number, { subjects: Set<string>; resources: number }>();
  
  for (const record of records) {
    if (!semestersMap.has(record.semester)) {
      semestersMap.set(record.semester, { subjects: new Set<string>(), resources: 0 });
    }
    const semData = semestersMap.get(record.semester)!;
    semData.subjects.add(record.subject);
    semData.resources += 1;
  }
  
  const semestersStats: SemesterStats[] = semestersFoundList.map((sem) => {
    const data = semestersMap.get(sem);
    return {
      semester: sem,
      subjectsFound: data ? data.subjects.size : 0,
      resourcesFound: data ? data.resources : 0
    };
  });
  
  const totalSemestersCrawled = semestersMap.size;
  let totalSubjectsFound = 0;
  for (const data of semestersMap.values()) {
    totalSubjectsFound += data.subjects.size;
  }
  
  const totalResourcesFound = records.length;
  const totalFileViewerLinksFound = records.filter((r) => r.fileViewerUrl).length;
  const totalDownloadUrlsFound = records.filter((r) => r.downloadUrl).length;
  
  const totalMetadataOnly = records.filter((r) => {
    return !Boolean(r.downloadUrl || r.driveUrl || r.iframeUrl || r.fileViewerUrl);
  }).length;
  
  return {
    semesters: semestersStats,
    totalSemestersCrawled,
    totalSubjectsFound,
    totalResourcesFound,
    totalFileViewerLinksFound,
    totalDownloadUrlsFound,
    totalMetadataOnly
  };
}

export function formatSummary(summary: TheHelpersCrawlSummary): string {
  const lines: string[] = [];
  lines.push(`Semesters found: ${summary.semestersFound}\n`);
  
  for (const sem of summary.semesters) {
    lines.push(`Semester ${sem.semester}:`);
    lines.push(`  Subjects found: ${sem.subjectsFound}`);
    lines.push(`  Resources found: ${sem.resourcesFound}\n`);
  }
  
  lines.push(`Total:`);
  lines.push(`  Semesters crawled: ${summary.totalSemestersCrawled}`);
  lines.push(`  Subjects found: ${summary.totalSubjectsFound}`);
  lines.push(`  Resources found: ${summary.totalResourcesFound}`);
  lines.push(`  File viewer links found: ${summary.totalFileViewerLinksFound}`);
  lines.push(`  Download URLs found: ${summary.totalDownloadUrlsFound}`);
  lines.push(`  Metadata-only: ${summary.totalMetadataOnly}`);
  lines.push(`  Duplicates skipped: ${summary.totalDuplicatesSkipped}`);
  lines.push(`  Failed pages: ${summary.totalFailedPages}`);
  
  return lines.join("\n");
}

export async function crawlTheHelpers(options: CrawlOptions = {}): Promise<TheHelpersCrawlSummary> {
  const semesterFilter = options.semester ?? "all";
  const subjectFilter = options.subject;
  const maxResources = options.maxResources ?? Number.MAX_SAFE_INTEGER;
  const outputPath = options.outputPath ?? "data/crawl/thehelpers-resources.jsonl";

  // Initialize/clear output file
  await writeJsonl(outputPath, []);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const records: TheHelpersCrawlRecord[] = [];
  const seenKeys = new Set<string>();
  
  let totalResourcesCrawled = 0;
  let totalDuplicatesSkipped = 0;
  let totalFailedPages = 0;
  let semestersFoundList: number[] = [];
  let semestersFoundCount = 0;

  try {
    try {
      await gotoWithRetry(page, "https://thehelpers.tech/semesters");
    } catch (err) {
      totalFailedPages++;
      throw new Error(`Failed to load root semesters page: ${err}`);
    }

    const semestersHtml = await page.content();
    const semesterLinks = extractSemesterLinks(semestersHtml);
    semestersFoundCount = semesterLinks.length;
    semestersFoundList = semesterLinks.map((url) => parseSemesterFromUrl(url)).filter(Boolean);

    const filteredSemesterLinks = semesterLinks.filter((url) => 
      shouldCrawlSemester(url, semesterFilter)
    );

    for (const semesterUrl of filteredSemesterLinks) {
      if (totalResourcesCrawled >= maxResources) break;

      const semester = parseSemesterFromUrl(semesterUrl);
      const semesterRecords: TheHelpersCrawlRecord[] = [];

      try {
        await withCrawlerDelay();
        await gotoWithRetry(page, semesterUrl);
        const subjectLinks = extractSubjectLinks(await page.content());

        const filteredSubjectUrls = subjectLinks.filter((url) => 
          shouldCrawlSubject(url, subjectFilter)
        );

        const workerCount = Math.min(2, filteredSubjectUrls.length);
        const workerPromises: Promise<void>[] = [];
        let nextSubjectIndex = 0;

        for (let i = 0; i < workerCount; i++) {
          const workerPage = i === 0 ? page : await browser.newPage();
          
          workerPromises.push((async () => {
            while (nextSubjectIndex < filteredSubjectUrls.length && totalResourcesCrawled < maxResources) {
              const index = nextSubjectIndex++;
              const subjectUrl = filteredSubjectUrls[index];
              try {
                await withCrawlerDelay();
                await gotoWithRetry(workerPage, subjectUrl);
                
                const recs = await extractResourcesFromSubjectPage(workerPage, subjectUrl, {
                  semester,
                  subjectFilter,
                  maxResources,
                  getCurrentCount: () => totalResourcesCrawled,
                  incrementCount: () => { totalResourcesCrawled++; },
                  seenKeys,
                  incrementDuplicates: () => { totalDuplicatesSkipped++; },
                  incrementFailed: () => { totalFailedPages++; }
                });
                semesterRecords.push(...recs);
              } catch (error) {
                totalFailedPages++;
                console.error(`Failed to crawl subject page ${subjectUrl}:`, error);
              }
            }
            if (workerPage !== page) {
              await workerPage.close();
            }
          })());
        }

        await Promise.all(workerPromises);

        // Incremental progress saving per semester
        if (semesterRecords.length > 0) {
          records.push(...semesterRecords);
          await appendJsonl(outputPath, semesterRecords);
        }
      } catch (error) {
        totalFailedPages++;
        console.error(`Failed to crawl semester page ${semesterUrl}:`, error);
      }
    }
  } finally {
    await browser.close();
  }

  const stats = computeGroupedStats(records, semestersFoundList);
  return {
    semestersFound: semestersFoundCount,
    semesters: stats.semesters,
    totalSemestersCrawled: stats.totalSemestersCrawled,
    totalSubjectsFound: stats.totalSubjectsFound,
    totalResourcesFound: stats.totalResourcesFound,
    totalFileViewerLinksFound: stats.totalFileViewerLinksFound,
    totalDownloadUrlsFound: stats.totalDownloadUrlsFound,
    totalMetadataOnly: stats.totalMetadataOnly,
    totalDuplicatesSkipped,
    totalFailedPages,
    outputPath
  };
}

function stripHtml(input: string) {
  const cleanStart = input.replace(/^[^<]*>/, "");
  return cleanStart.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function inferResourceTitle(href?: string, onclick?: string) {
  const text = `${href ?? ""} ${onclick ?? ""}`;
  return cleanResourceTitle(decodeURIComponent(text.split(/[/?#=&]/).filter(Boolean).at(-1) ?? "Resource").replace(/[-_]+/g, " "));
}

function inferNearbyResourceTitle(block: string, linkIndex: number) {
  const before = stripHtml(block.slice(Math.max(0, linkIndex - 220), linkIndex));
  const parts = before.split(/\s{2,}|[|]/).map((part) => part.trim()).filter(Boolean);
  return parts.at(-1)?.replace(/\b(View|Download|Open)$/i, "").trim() || "";
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
