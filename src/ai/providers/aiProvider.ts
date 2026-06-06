import type { AiResponse } from "../schemas/aiResponse.schema.js";
import type { Intent } from "../schemas/intent.schema.js";
import type { ScoredVectorDocument } from "../../rag/vector/vectorClient.js";

export type AiProviderInput = {
  message: string;
  intent: Intent;
  context?: unknown;
  ragChunks?: ScoredVectorDocument[];
};

export interface AiProvider {
  name: string;
  generate(input: AiProviderInput): Promise<AiResponse>;
}
