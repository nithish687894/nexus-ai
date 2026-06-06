import type { Intent } from "../schemas/intent.schema.js";

const rules: Array<[Intent, RegExp]> = [
  ["greeting", /^(hi|hello|hey|yo|sup)\b/i],
  ["skip_prediction", /\b(skip|bunk|miss class|safe to miss)\b/i],
  ["attendance_recovery", /\b(reach\s*75|recover attendance|how many classes|attendance recovery)\b/i],
  ["study_plan", /\b(what should i study|plan my study|study today|study plan)\b/i],
  ["study_resource_query", /\b(pyq|previous year|notes?|answer keys?|mcq|important topics?|chapter notes?|study resources?|exam strategies?|ct\s?papers?|class notes?)\b/i],
  ["official_srm_info", /\b(student portal|exam portal|coe|srm guidelines|srm rules|official srm|official .*policy|official .*rules|official .*dress code|fee policy|academic calendar|portal instructions|parent portal)\b/i],
  ["app_action", /\b(open attendance|show risky|enable alerts|refresh portal|open marks|open timetable)\b/i],
  ["notification_request", /\b(remind|notification|alert)\b/i],
  ["premium_question", /\b(premium|trial|paid|subscription)\b/i],
  ["marks_target", /\b(marks needed|target marks|a grade|how much marks)\b/i],
  ["marks_question", /\b(marks|internal)\b/i],
  ["attendance_question", /\b(attendance)\b/i],
  ["timetable_question", /\b(timetable|next class|class today)\b/i],
  ["nexus_app_help", /\b(nexus app|how to use|feature|ai tools)\b/i]
];

export function classifyIntent(message: string): Intent {
  const hit = rules.find(([, pattern]) => pattern.test(message));
  return hit?.[0] ?? "unsupported";
}
