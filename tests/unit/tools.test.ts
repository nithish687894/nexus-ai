import { describe, expect, it } from "vitest";
import { calculateAttendanceRecovery } from "../../src/tools/attendance/calculateAttendanceRecovery.js";
import { calculateSkipRisk } from "../../src/tools/attendance/calculateSkipRisk.js";
import { calculateMarksTarget } from "../../src/tools/marks/calculateMarksTarget.js";
import { chunkText } from "../../src/rag/ingestion/chunkText.js";
import { safeJsonParse } from "../../src/utils/safeJson.js";

describe("deterministic tools", () => {
  it("calculates skip risk from attendance counts", () => {
    const result = calculateSkipRisk(29, 40);
    expect(result.currentPct).toBe(72.5);
    expect(result.afterSkipPct).toBe(70.7);
    expect(result.risk).toBe("already_low");
  });

  it("calculates exact classes needed to recover attendance", () => {
    const result = calculateAttendanceRecovery(29, 40, 75);
    expect(result.classesNeeded).toBe(4);
  });

  it("calculates remaining marks target and impossible state", () => {
    expect(calculateMarksTarget(32, 50, 40, 18).impossible).toBe(false);
    expect(calculateMarksTarget(10, 50, 45, 20).impossible).toBe(true);
  });
});

describe("utility functions", () => {
  it("chunks text with overlap", () => {
    const chunks = chunkText("one two three four five six", 3, 1);
    expect(chunks).toHaveLength(3);
    expect(chunks[1].text).toBe("three four five");
  });

  it("safely parses invalid JSON", () => {
    expect(safeJsonParse("{nope", { ok: false })).toEqual({ ok: false });
  });
});
