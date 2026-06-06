import { ingestOfficialSrm } from "../rag/indexing/ingestOfficialSrm.js";

const summary = await ingestOfficialSrm();
console.log(JSON.stringify(summary, null, 2));
