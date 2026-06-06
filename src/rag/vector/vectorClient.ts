export type VectorDocument = {
  id: string;
  content: string;
  embedding: number[];
  metadata: {
    source_url: string;
    title: string;
    category: string;
    type: "webpage" | "pdf" | "scanned_pdf" | "image" | "local_doc" | "unknown";
    sourceType?: "official_srm" | "public_study_material";
    official?: boolean;
    source?: string;
    document_id?: string;
    chunk_id?: string;
    file_url?: string;
    drive_url?: string;
    semester?: number;
    subject?: string;
    section?: string;
    resourceType?: "pyq" | "notes" | "answer_key" | "mcq" | "syllabus" | "strategy" | "important_topics" | "unknown";
    version?: number;
    is_latest?: boolean;
    status?: "active" | "inactive" | "failed";
    page_number?: number;
    pageNumber?: number;
    last_checked_at?: string;
    last_updated?: string;
    ingested_at: string;
    content_hash: string;
  };
};

export type ScoredVectorDocument = VectorDocument & {
  score: number;
};

export interface VectorClient {
  upsert(documents: VectorDocument[]): Promise<void>;
  search(query: string, limit?: number, filter?: VectorSearchFilter): Promise<ScoredVectorDocument[]>;
}

export type VectorSearchFilter = {
  sourceType?: "official_srm" | "public_study_material";
  official?: boolean;
  source?: string;
  category?: string;
  semester?: number;
  subject?: string;
  resourceType?: string;
  status?: string;
  is_latest?: boolean;
};
