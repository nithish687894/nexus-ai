import { z } from "zod";

export const allowedActionTypes = [
  "OPEN_PAGE",
  "FILTER_ATTENDANCE",
  "REFRESH_PORTAL_DATA",
  "ENABLE_NOTIFICATION",
  "DISABLE_NOTIFICATION",
  "CREATE_STUDY_PLAN",
  "CREATE_REMINDER",
  "GENERATE_REPORT",
  "START_PREMIUM_TRIAL"
] as const;

export const forbiddenActionTypes = [
  "DELETE_USER",
  "CHANGE_MARKS",
  "CHANGE_ATTENDANCE",
  "SEND_BULK_NOTIFICATION",
  "ACCESS_ADMIN_PANEL",
  "EXPORT_ALL_USERS",
  "VIEW_OTHER_STUDENT",
  "MAKE_PAYMENT_WITHOUT_CONFIRMATION"
] as const;

export const actionSchema = z.object({
  type: z.enum(allowedActionTypes),
  label: z.string().min(1).max(120),
  requiresConfirmation: z.boolean(),
  dangerLevel: z.enum(["none", "low", "medium", "high"]),
  payload: z.record(z.unknown()).default({})
});

export type NexusAction = z.infer<typeof actionSchema>;
