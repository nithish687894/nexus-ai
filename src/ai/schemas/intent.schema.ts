import { z } from "zod";

export const intentSchema = z.enum([
  "greeting",
  "official_srm_info",
  "nexus_app_help",
  "attendance_question",
  "skip_prediction",
  "attendance_recovery",
  "marks_question",
  "marks_target",
  "timetable_question",
  "study_plan",
  "notification_request",
  "app_action",
  "premium_question",
  "study_resource_query",
  "unsupported"
]);

export type Intent = z.infer<typeof intentSchema>;
