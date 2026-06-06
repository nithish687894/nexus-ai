import type { VectorSearchFilter } from "../vector/vectorClient.js";

export function officialSrmFilter(extra: VectorSearchFilter = {}): VectorSearchFilter {
  return {
    status: "active",
    is_latest: true,
    sourceType: "official_srm",
    official: true,
    ...extra
  };
}

export function publicStudyMaterialFilter(extra: VectorSearchFilter = {}): VectorSearchFilter {
  return {
    status: "active",
    is_latest: true,
    sourceType: "public_study_material",
    official: false,
    ...extra
  };
}
