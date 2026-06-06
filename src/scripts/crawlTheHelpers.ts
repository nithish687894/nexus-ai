import { crawlTheHelpers } from "../rag/crawler/crawlTheHelpers.js";

const summary = await crawlTheHelpers();
console.log(JSON.stringify(summary, null, 2));
