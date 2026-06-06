import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  AI_PROVIDER: z.enum(["mock", "openai", "gemini"]).default("mock"),
  OPENAI_API_KEY: z.string().optional().default(""),
  GEMINI_API_KEY: z.string().optional().default(""),
  VECTOR_PROVIDER: z.enum(["memory", "qdrant", "pinecone"]).default("qdrant"),
  QDRANT_URL: z.string().optional().default(""),
  QDRANT_API_KEY: z.string().optional().default(""),
  QDRANT_COLLECTION: z.string().default("nexus_ai_knowledge"),
  REDIS_URL: z.string().optional().default(""),
  NEXUS_BACKEND_SHARED_SECRET: z.string().optional().default(""),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(30)
});

export const env = envSchema.parse(process.env);
