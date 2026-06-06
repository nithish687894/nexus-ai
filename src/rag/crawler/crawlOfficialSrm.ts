import { readOfficialSrmSources } from "../sources/officialSrmSources.js";
import { assertSafePublicUrl } from "../downloader/downloadFile.js";

export async function crawlOfficialSrmSources() {
  const sources = await readOfficialSrmSources();
  return sources.filter((source) => {
    if (!source.enabled) return false;
    assertSafePublicUrl(source.url);
    return true;
  });
}
