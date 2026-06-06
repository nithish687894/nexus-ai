export type DriveUrlKind = "file" | "folder" | "unknown";

export function extractDriveFileId(url: string) {
  const parsed = new URL(url);
  if (!parsed.hostname.includes("drive.google.com")) return null;
  const fileMatch = parsed.pathname.match(/\/file\/d\/([^/]+)/);
  if (fileMatch) return fileMatch[1];
  return parsed.searchParams.get("id");
}

export function extractDriveFolderId(url: string) {
  const parsed = new URL(url);
  if (!parsed.hostname.includes("drive.google.com")) return null;
  return parsed.pathname.match(/\/drive\/folders\/([^/]+)/)?.[1] ?? null;
}

export function classifyDriveUrl(url: string): DriveUrlKind {
  try {
    if (extractDriveFileId(url)) return "file";
    if (extractDriveFolderId(url)) return "folder";
    return "unknown";
  } catch {
    return "unknown";
  }
}

export function normalizeDriveUrl(url: string) {
  const kind = classifyDriveUrl(url);
  if (kind === "file") return `https://drive.google.com/file/d/${extractDriveFileId(url)}/view`;
  if (kind === "folder") return `https://drive.google.com/drive/folders/${extractDriveFolderId(url)}`;
  return url;
}

export function driveDirectDownloadUrl(url: string) {
  const id = extractDriveFileId(url);
  return id ? `https://drive.google.com/uc?export=download&id=${id}` : null;
}
