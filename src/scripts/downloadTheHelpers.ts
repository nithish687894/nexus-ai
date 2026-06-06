import { downloadTheHelpersResources } from "../rag/downloader/downloadTheHelpers.js";

const summary = await downloadTheHelpersResources();
console.log(JSON.stringify(summary, null, 2));
