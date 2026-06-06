import type { AiProvider } from "./aiProvider.js";

export const mockProvider: AiProvider = {
  name: "mock",
  async generate(input) {
    const source = input.ragChunks?.[0];
    if (input.intent === "official_srm_info" && source) {
      return {
        intent: input.intent,
        reply: `According to ${source.metadata.title}, this should be verified from the official SRM source before making decisions.`,
        cards: [],
        actions: [],
        sources: [{
          title: source.metadata.title,
          source_url: source.metadata.source_url,
          category: source.metadata.category,
          last_updated: source.metadata.last_updated
        }],
        premiumRequired: false,
        missingData: []
      };
    }
    if (input.intent === "study_resource_query" && source) {
      return {
        intent: input.intent,
        reply: `This is a non-official public study resource: ${source.metadata.title}. Use it for practice, not official SRM policy.`,
        cards: [{
          type: "study_resource",
          title: source.metadata.title,
          message: source.metadata.file_url || source.metadata.drive_url || source.metadata.source_url,
          data: source.metadata
        }],
        actions: [],
        sources: [{
          title: source.metadata.title,
          source_url: source.metadata.source_url,
          category: source.metadata.category,
          last_updated: source.metadata.last_updated
        }],
        premiumRequired: false,
        missingData: []
      };
    }
    return {
      intent: input.intent,
      reply: "I can help with attendance, marks, timetable, SRM info, and safe Nexus actions.",
      cards: [],
      actions: [],
      sources: [],
      premiumRequired: false,
      missingData: []
    };
  }
};
