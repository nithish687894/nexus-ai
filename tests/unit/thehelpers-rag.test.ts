import { describe, expect, it } from "vitest";
import { classifyResourceType } from "../../src/rag/crawler/crawlTheHelpers.js";
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
