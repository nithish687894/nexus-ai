import { describe, expect, it } from "vitest";
import {
  classifyResourceType,
  extractResourceCandidatesFromHtml,
  shouldCrawlSemester,
  shouldCrawlSubject,
  buildDedupeKey,
  computeGroupedStats,
  formatSummary,
  parseSemesterFromUrl
} from "../../src/rag/crawler/crawlTheHelpers.js";
import { extractSemesterLinks, extractSubjectLinks } from "../../src/rag/crawler/extractLinks.js";
import { assertSafePublicUrl } from "../../src/rag/downloader/downloadFile.js";
import { classifyDriveUrl, extractDriveFileId, extractDriveFolderId, normalizeDriveUrl } from "../../src/rag/downloader/googleDrive.js";
import { detectScannedPdf } from "../../src/rag/parsing/detectScannedPdf.js";
import { parseImage } from "../../src/rag/parsing/parseImage.js";

describe("THE HELPER resource helpers", () => {
  it("classifies resource types", () => {
    expect(classifyResourceType("Previous Year Questions", "PYQ Dec 2023")).toBe("pyq");
    expect(classifyResourceType("Study Notes And Other Resources", "Class Notes Chapter 1")).toBe("notes");
    expect(classifyResourceType("Syllabus", "Calculus syllabus")).toBe("syllabus");
    expect(classifyResourceType("Exam Strategies And General Suggestions", "General Rules")).toBe("strategy");
  });

  it("extracts semester and subject links", () => {
    const html = `<a href="/semesters/1">Sem 1</a><a href="/semesters/1/subjects/Calculus%20And%20Linear%20Algebra">CLA</a>`;
    expect(extractSemesterLinks(html)).toContain("https://thehelpers.tech/semesters/1");
    expect(extractSubjectLinks(html)).toContain("https://thehelpers.tech/semesters/1/subjects/Calculus%20And%20Linear%20Algebra");
  });

  it("extracts resource candidates with section context", () => {
    const html = `
      <h2>Previous Year Questions</h2>
      <div><span>PYQ Dec 2023</span><a href="/file-viewer?id=dec2023">View</a></div>
      <h2>Study Notes And Other Resources</h2>
      <a href="https://drive.google.com/file/d/note123/view">Class Notes Chapter 1</a>
    `;
    const candidates = extractResourceCandidatesFromHtml(html, "https://thehelpers.tech/semesters/1/subjects/Calculus%20And%20Linear%20Algebra");
    expect(candidates[0]).toMatchObject({
      section: "Previous Year Questions",
      resourceTitle: "PYQ Dec 2023",
      href: "https://thehelpers.tech/file-viewer?id=dec2023"
    });
    expect(candidates[1]).toMatchObject({
      section: "Study Notes And Other Resources",
      resourceTitle: "Class Notes Chapter 1"
    });
  });

  it("parses Google Drive URLs safely", () => {
    expect(extractDriveFileId("https://drive.google.com/file/d/abc123/view")).toBe("abc123");
    expect(extractDriveFileId("https://drive.google.com/open?id=file789")).toBe("file789");
    expect(extractDriveFolderId("https://drive.google.com/drive/folders/folder123")).toBe("folder123");
    expect(classifyDriveUrl("https://drive.google.com/drive/folders/folder123")).toBe("folder");
    expect(normalizeDriveUrl("https://drive.google.com/open?id=file789")).toBe("https://drive.google.com/file/d/file789/view");
  });

  it("rejects private or login-looking URLs", () => {
    expect(() => assertSafePublicUrl("https://sp.srmist.edu.in/dashboard?token=secret")).toThrow();
    expect(() => assertSafePublicUrl("https://www.srmist.edu.in/students/")).not.toThrow();
  });

  it("falls back when OCR is unavailable", async () => {
    await expect(parseImage(Buffer.from("fake"), "image/png")).resolves.toEqual({ text: "", extractionMethod: "unavailable" });
    await expect(detectScannedPdf(Buffer.from("%PDF-1.1\n%%EOF"))).resolves.toBe(true);
  });
});

describe("THE HELPER crawler advanced options and summary", () => {
  it("extracts all 8 semester links from semesters page HTML", () => {
    const html = `
      <a href="/semesters/1">Semester 1</a>
      <a href="/semesters/2">Semester 2</a>
      <a href="/semesters/3">Semester 3</a>
      <a href="/semesters/4">Semester 4</a>
      <a href="/semesters/5">Semester 5</a>
      <a href="/semesters/6">Semester 6</a>
      <a href="/semesters/7">Semester 7</a>
      <a href="/semesters/8">Semester 8</a>
      <a href="/semesters/9">Semester 9 (Invalid)</a>
    `;
    const links = extractSemesterLinks(html);
    expect(links).toHaveLength(8);
    expect(links).toContain("https://thehelpers.tech/semesters/1");
    expect(links).toContain("https://thehelpers.tech/semesters/8");
    expect(links).not.toContain("https://thehelpers.tech/semesters/9");
  });

  it("extracts subject links from multiple semesters", () => {
    const html = `
      <a href="/semesters/1/subjects/Calculus%20And%20Linear%20Algebra">CLA</a>
      <a href="/semesters/2/subjects/Probability%20And%20Queueing%20Theory">PQT</a>
    `;
    const links = extractSubjectLinks(html);
    expect(links).toHaveLength(2);
    expect(links).toContain("https://thehelpers.tech/semesters/1/subjects/Calculus%20And%20Linear%20Algebra");
    expect(links).toContain("https://thehelpers.tech/semesters/2/subjects/Probability%20And%20Queueing%20Theory");
  });

  it("preserves correct semester number in metadata and does not label Sem 2+ as Sem 1", () => {
    expect(parseSemesterFromUrl("https://thehelpers.tech/semesters/1/subjects/Calculus")).toBe(1);
    expect(parseSemesterFromUrl("https://thehelpers.tech/semesters/2/subjects/Physics")).toBe(2);
    expect(parseSemesterFromUrl("https://thehelpers.tech/semesters/8/subjects/Project")).toBe(8);
  });

  it("supports --semester=1 filter and --semester=all default", () => {
    expect(shouldCrawlSemester("https://thehelpers.tech/semesters/1", 1)).toBe(true);
    expect(shouldCrawlSemester("https://thehelpers.tech/semesters/2", 1)).toBe(false);
    expect(shouldCrawlSemester("https://thehelpers.tech/semesters/2", "all")).toBe(true);
  });

  it("supports optional subject filter", () => {
    expect(shouldCrawlSubject("https://thehelpers.tech/semesters/1/subjects/Calculus%20And%20Linear%20Algebra", "Calculus And Linear Algebra")).toBe(true);
    expect(shouldCrawlSubject("https://thehelpers.tech/semesters/1/subjects/Calculus%20And%20Linear%20Algebra", "Physics")).toBe(false);
    expect(shouldCrawlSubject("https://thehelpers.tech/semesters/1/subjects/Calculus%20And%20Linear%20Algebra", undefined)).toBe(true);
  });

  it("skips duplicate resource URLs safely using buildDedupeKey", () => {
    const key1 = buildDedupeKey(1, "Calculus", "CT1", "PYQ 2023", "https://example.com/pyq.pdf");
    const key2 = buildDedupeKey(1, "Calculus", "CT1", "PYQ 2023", "https://example.com/pyq.pdf");
    const key3 = buildDedupeKey(2, "Calculus", "CT1", "PYQ 2023", "https://example.com/pyq.pdf");
    
    expect(key1).toBe(key2);
    expect(key1).not.toBe(key3);
  });

  it("generates and formats grouped summary properly", () => {
    const records: any[] = [
      { semester: 1, subject: "CLA", section: "PYQ", resourceTitle: "PYQ 2023", downloadUrl: "https://example.com/1.pdf" },
      { semester: 1, subject: "CLA", section: "Notes", resourceTitle: "Notes 1", fileViewerUrl: "https://example.com/view1" },
      { semester: 2, subject: "PQT", section: "PYQ", resourceTitle: "PYQ 2024" }
    ];
    
    const summary: any = {
      semestersFound: 8,
      ...computeGroupedStats(records, [1, 2, 3, 4, 5, 6, 7, 8]),
      totalDuplicatesSkipped: 2,
      totalFailedPages: 1,
      outputPath: "data/crawl/test.jsonl"
    };

    expect(summary.semestersFound).toBe(8);
    expect(summary.semesters).toHaveLength(8);
    expect(summary.semesters[0]).toEqual({ semester: 1, subjectsFound: 1, resourcesFound: 2 });
    expect(summary.semesters[1]).toEqual({ semester: 2, subjectsFound: 1, resourcesFound: 1 });
    expect(summary.semesters[2]).toEqual({ semester: 3, subjectsFound: 0, resourcesFound: 0 });
    
    expect(summary.totalSemestersCrawled).toBe(2);
    expect(summary.totalSubjectsFound).toBe(2);
    expect(summary.totalResourcesFound).toBe(3);
    expect(summary.totalFileViewerLinksFound).toBe(1);
    expect(summary.totalDownloadUrlsFound).toBe(1);
    expect(summary.totalMetadataOnly).toBe(1);
    
    const output = formatSummary(summary);
    expect(output).toContain("Semesters found: 8");
    expect(output).toContain("Semester 1:");
    expect(output).toContain("  Subjects found: 1");
    expect(output).toContain("  Resources found: 2");
    expect(output).toContain("Total:");
    expect(output).toContain("  Semesters crawled: 2");
    expect(output).toContain("  Duplicates skipped: 2");
    expect(output).toContain("  Failed pages: 1");
  });
});
