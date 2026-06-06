import { ingestOfficialSrm } from "../rag/indexing/ingestOfficialSrm.js";

const summary = await ingestOfficialSrm();
console.log("watch:srm completed one safe check pass. Use external cron for scheduling.");
console.log(JSON.stringify({
  sourcesChecked: summary.loadedSources,
  unchangedSkipped: summary.skippedDuplicates,
  changedReindexed: summary.createdChunks > 0 ? summary.loadedSources - summary.skippedDuplicates - summary.failed : 0,
  failed: summary.failed,
  vectorsUploaded: summary.uploadedVectors
}, null, 2));
