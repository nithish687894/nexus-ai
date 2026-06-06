import { crawlTheHelpers } from "../rag/crawler/crawlTheHelpers.js";
import { downloadTheHelpersResources } from "../rag/downloader/downloadTheHelpers.js";
import { ingestTheHelpers } from "../rag/indexing/ingestTheHelpers.js";

const crawl = await crawlTheHelpers();
const download = await downloadTheHelpersResources();
const ingest = await ingestTheHelpers();
console.log("watch:thehelpers completed one safe check pass. Use external cron for daily scheduling.");
console.log(JSON.stringify({ crawl, download, ingest }, null, 2));
