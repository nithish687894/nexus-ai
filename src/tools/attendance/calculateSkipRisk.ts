import { roundTo } from "../../utils/math.js";

export type SkipRiskLevel = "safe" | "caution" | "danger" | "already_low";

export function calculateSkipRisk(
  attendedClasses: number,
  totalClasses: number,
  classesToSkip = 1,
  threshold = 75
) {
  if (totalClasses <= 0 || attendedClasses < 0 || attendedClasses > totalClasses || classesToSkip < 0) {
    throw new Error("Invalid attendance inputs");
  }
  const currentPct = roundTo((attendedClasses / totalClasses) * 100, 1);
  const afterSkipPct = roundTo((attendedClasses / (totalClasses + classesToSkip)) * 100, 1);
  let risk: SkipRiskLevel;
  if (currentPct < threshold) risk = "already_low";
  else if (afterSkipPct >= 80) risk = "safe";
  else if (afterSkipPct >= threshold) risk = "caution";
  else risk = "danger";

  const message =
    risk === "already_low"
      ? `Already below ${threshold}%. Attend first, skip later.`
      : risk === "danger"
        ? `Skipping will drop below ${threshold}%.`
        : risk === "caution"
          ? `Still above ${threshold}%, but getting tight.`
          : "Attendance-safe for now.";

  return { currentPct, afterSkipPct, risk, message };
}
