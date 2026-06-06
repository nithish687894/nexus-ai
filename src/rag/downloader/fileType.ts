export type DownloadFileType = "pdf" | "image" | "webpage" | "unknown";

export function detectFileType(url: string, contentType = ""): DownloadFileType {
  const lowerUrl = url.toLowerCase();
  const lowerType = contentType.toLowerCase();
  if (lowerType.includes("pdf") || lowerUrl.endsWith(".pdf")) return "pdf";
  if (lowerType.startsWith("image/") || /\.(jpe?g|png|webp)$/i.test(lowerUrl)) return "image";
  if (lowerType.includes("html") || /^https?:\/\//i.test(url)) return "webpage";
  return "unknown";
}

export function storageFolderFor(source: "srm" | "thehelpers", type: DownloadFileType) {
  if (source === "srm") {
    if (type === "pdf") return "storage/raw/srm/pdfs";
    if (type === "image") return "storage/raw/srm/images";
    return "storage/raw/srm/webpages";
  }
  if (type === "pdf") return "storage/raw/thehelpers/pdfs";
  if (type === "image") return "storage/raw/thehelpers/images";
  return "storage/raw/thehelpers/webpages";
}
