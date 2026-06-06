import { ingestTheHelpers } from "../rag/indexing/ingestTheHelpers.js";

const summary = await ingestTheHelpers();
console.log(JSON.stringify(summary, null, 2));
