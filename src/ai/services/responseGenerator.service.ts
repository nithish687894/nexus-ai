import { z } from "zod";
import { buildAction } from "../../actions/actionBuilder.js";
import { calculateAttendanceRecovery } from "../../tools/attendance/calculateAttendanceRecovery.js";
import { calculateSkipRisk } from "../../tools/attendance/calculateSkipRisk.js";
import { calculateMarksTarget } from "../../tools/marks/calculateMarksTarget.js";
import { generateStudyPlan } from "../../tools/study/generateStudyPlan.js";
import { retrieveRelevantChunks } from "../../rag/retriever/retrieveRelevantChunks.js";
import { officialSrmFilter, publicStudyMaterialFilter } from "../../rag/retrieval/sourceFilters.js";
import { sanitizeSafeContext } from "../../security/contextSanitizer.js";
import { getAiProvider } from "../providers/index.js";
import { aiResponseSchema, type AiResponse } from "../schemas/aiResponse.schema.js";
import type { Intent } from "../schemas/intent.schema.js";
import { classifyIntent } from "./intentRouter.service.js";
import { getSafetyResponse } from "./safetyGuard.service.js";

const subjectSchema = z.object({
  name: z.string(),
  attendance_pct: z.number().optional(),
  total_classes: z.number().int().nonnegative().optional(),
  attended_classes: z.number().int().nonnegative().optional(),
  next_class_time: z.string().optional(),
  is_lab: z.boolean().optional()
});

const safeContextSchema = z.object({
  overall_attendance: z.number().optional(),
  subjects: z.array(subjectSchema).optional(),
  timetable_today: z.array(z.object({ subject: z.string(), time: z.string().optional(), type: z.string().optional() })).optional(),
  marks: z.array(z.object({
    subject: z.string(),
    current_internal: z.number(),
    max_internal: z.number()
  })).optional()
}).passthrough();

export const chatRequestSchema = z.object({
  user_message: z.string().min(1).max(2000),
  session_id: z.string().optional(),
  premium: z.boolean().default(false),
  safe_context: z.unknown().optional()
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

function missingContext(intent: Intent): AiResponse {
  return {
    intent,
    reply: "Sync Nexus once and I can answer this properly. I need your latest safe attendance or marks summary, not portal passwords.",
    cards: [],
    actions: [buildAction({
      type: "REFRESH_PORTAL_DATA",
      label: "Sync portal data",
      requiresConfirmation: true,
      dangerLevel: "low",
      payload: { reason: "missing_safe_context" }
    })],
    sources: [],
    premiumRequired: false,
    missingData: ["safe_context"]
  };
}

function firstSubject(context: z.infer<typeof safeContextSchema>) {
  return context.subjects?.find((subject) => subject.total_classes !== undefined && subject.attended_classes !== undefined)
    ?? context.subjects?.[0];
}

function noOfficialSourceFallback(): AiResponse {
  return {
    intent: "official_srm_info",
    reply: "I don't have a reliable official SRM source for that yet. Please verify it on the official SRM website or add the source to Nexus AI RAG.",
    cards: [],
    actions: [],
    sources: [],
    premiumRequired: false,
    missingData: ["official_source"]
  };
}

export async function generateChatResponse(rawRequest: unknown): Promise<AiResponse> {
  const request = chatRequestSchema.parse(rawRequest);
  const safety = getSafetyResponse(request.user_message);
  if (safety) return safety;

  const sanitized = sanitizeSafeContext(request.safe_context);
  if (!sanitized.ok) {
    return {
      intent: "unsupported",
      reply: "I can't accept private fields like tokens, email, register number, or cookies. Send only safe academic summary data.",
      cards: [],
      actions: [],
      sources: [],
      premiumRequired: false,
      missingData: sanitized.rejectedKeys
    };
  }

  const intent = classifyIntent(request.user_message);
  const context = safeContextSchema.optional().parse(sanitized.context);
  const personalIntents: Intent[] = ["skip_prediction", "attendance_recovery", "attendance_question", "marks_target", "marks_question", "timetable_question", "study_plan"];
  if (personalIntents.includes(intent) && !context) return missingContext(intent);

  if (intent === "greeting") {
    return aiResponseSchema.parse({
      intent,
      reply: "Hey, I'm Nexus AI. Ask me about attendance, marks, timetable, or official SRM info.",
      cards: [],
      actions: [],
      sources: [],
      premiumRequired: false,
      missingData: []
    });
  }

  if (intent === "skip_prediction" && context) {
    const subject = firstSubject(context);
    if (!subject?.attended_classes || !subject.total_classes) return missingContext(intent);
    const risk = calculateSkipRisk(subject.attended_classes, subject.total_classes);
    return aiResponseSchema.parse({
      intent,
      reply: risk.risk === "safe"
        ? `Attendance-wise, ${subject.name} is safe at ${risk.currentPct}%. But if it is a lab or test, don't gamble with it.`
        : `Don't skip ${subject.name} bro. You're at ${risk.currentPct}% and after one skip it becomes ${risk.afterSkipPct}%.`,
      cards: [{
        type: "attendance_risk",
        title: subject.name,
        current: risk.currentPct,
        risk: risk.risk,
        message: risk.message,
        data: { afterSkipPct: risk.afterSkipPct }
      }],
      actions: [buildAction({
        type: "ENABLE_NOTIFICATION",
        label: `Enable ${subject.name} reminder`,
        requiresConfirmation: true,
        dangerLevel: "low",
        payload: { category: "class_reminder", subject: subject.name, time: subject.next_class_time ?? "09:30" }
      })],
      sources: [],
      premiumRequired: false,
      missingData: []
    });
  }

  if (intent === "attendance_recovery" && context) {
    const subject = firstSubject(context);
    if (!subject?.attended_classes || !subject.total_classes) return missingContext(intent);
    const recovery = calculateAttendanceRecovery(subject.attended_classes, subject.total_classes);
    return aiResponseSchema.parse({
      intent,
      reply: `For ${subject.name}, attend ${recovery.classesNeeded} more classes in a row to reach 75%. No skips until then.`,
      cards: [{ type: "attendance_recovery", title: subject.name, target: 75, message: `${recovery.classesNeeded} classes needed.` }],
      actions: [],
      sources: [],
      premiumRequired: false,
      missingData: []
    });
  }

  if (intent === "marks_target" && context) {
    const mark = context.marks?.[0];
    if (!mark) return missingContext(intent);
    const target = calculateMarksTarget(mark.current_internal, mark.max_internal, mark.max_internal * 0.8, mark.max_internal - mark.current_internal);
    return aiResponseSchema.parse({
      intent,
      reply: target.impossible ? `For ${mark.subject}, that target is not reachable with remaining internal marks.` : `For ${mark.subject}, you need ${target.requiredMarks} more marks to hit that target.`,
      cards: [{ type: "marks_target", title: mark.subject, message: target.message, data: target }],
      actions: [],
      sources: [],
      premiumRequired: false,
      missingData: []
    });
  }

  if (intent === "study_plan" && context) {
    if (!request.premium) {
      return { intent, reply: "Study planning is a premium AI tool. You can still ask official SRM or basic attendance questions.", cards: [], actions: [buildAction({ type: "START_PREMIUM_TRIAL", label: "Start premium trial", requiresConfirmation: true, dangerLevel: "medium", payload: { feature: "study_plan" } })], sources: [], premiumRequired: true, missingData: [] };
    }
    const plan = generateStudyPlan(context);
    return aiResponseSchema.parse({
      intent,
      reply: `Start with ${plan.prioritySubject}. ${plan.reason}`,
      cards: [{ type: "study_plan", title: plan.prioritySubject, message: plan.plan.join(" | "), data: plan }],
      actions: [buildAction({ type: "CREATE_STUDY_PLAN", label: "Create study plan", requiresConfirmation: true, dangerLevel: "low", payload: plan })],
      sources: [],
      premiumRequired: false,
      missingData: []
    });
  }

  if (intent === "official_srm_info") {
    const chunks = await retrieveRelevantChunks(request.user_message, 5, officialSrmFilter());
    const reliableChunks = chunks.filter((chunk) => chunk.score >= 0.15).slice(0, 5);
    if (reliableChunks.length === 0) return noOfficialSourceFallback();
    const providerResponse = await getAiProvider().generate({ message: request.user_message, intent, context, ragChunks: reliableChunks });
    return aiResponseSchema.parse(providerResponse);
  }

  if (intent === "study_resource_query") {
    const resourceType = detectResourceType(request.user_message);
    const semester = Number(request.user_message.match(/\bsem(?:ester)?\s*([1-8])\b/i)?.[1] ?? 0) || undefined;
    const chunks = await retrieveRelevantChunks(request.user_message, 5, publicStudyMaterialFilter({
      source: "thehelpers",
      category: "study_resources",
      semester,
      resourceType
    }));
    const reliableChunks = chunks.filter((chunk) => chunk.score >= 0.05).slice(0, 5);
    if (reliableChunks.length === 0) {
      return {
        intent,
        reply: "I could not find a matching non-official public study resource yet. Try crawling and ingesting THE HELPER first.",
        cards: [],
        actions: [],
        sources: [],
        premiumRequired: false,
        missingData: ["public_study_material"]
      };
    }
    return aiResponseSchema.parse(await getAiProvider().generate({ message: request.user_message, intent, context, ragChunks: reliableChunks }));
  }

  if (intent === "app_action") {
    return aiResponseSchema.parse({
      intent,
      reply: "Sure, I can suggest that action. SRM Nexus backend will validate before doing anything.",
      cards: [],
      actions: [buildAction({ type: "OPEN_PAGE", label: "Open attendance", requiresConfirmation: false, dangerLevel: "none", payload: { page: "attendance" } })],
      sources: [],
      premiumRequired: false,
      missingData: []
    });
  }

  if (intent === "premium_question") {
    return aiResponseSchema.parse({
      intent,
      reply: "Premium unlocks deeper AI tools like study planning, reports, and higher daily AI limits.",
      cards: [],
      actions: [buildAction({ type: "START_PREMIUM_TRIAL", label: "Start premium trial", requiresConfirmation: true, dangerLevel: "medium", payload: {} })],
      sources: [],
      premiumRequired: false,
      missingData: []
    });
  }

  const providerResponse = await getAiProvider().generate({ message: request.user_message, intent, context });
  return aiResponseSchema.parse(providerResponse);
}

function detectResourceType(message: string) {
  const text = message.toLowerCase();
  if (/(pyq|previous year|ct\s?papers?|ct\s?\d|papers?)/.test(text)) return "pyq";
  if (/answer keys?/.test(text)) return "answer_key";
  if (/mcq/.test(text)) return "mcq";
  if (/important topics?/.test(text)) return "important_topics";
  if (/(chapter|class notes?|notes?)/.test(text)) return "notes";
  if (/syllabus/.test(text)) return "syllabus";
  if (/(exam strategies?|general rules?|suggestions?)/.test(text)) return "strategy";
  return undefined;
}
