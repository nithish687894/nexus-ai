import { describe, expect, it } from "vitest";
import { app } from "../../src/app.js";

async function postJson(path: string, body: unknown) {
  return app.request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("chat integration", () => {
  it("official SRM info returns sources", async () => {
    const res = await postJson("/api/ai/chat", { user_message: "What is student portal?", premium: false });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.intent).toBe("official_srm_info");
    expect(body.sources.length).toBeGreaterThan(0);
  });

  it("skip question uses safe_context", async () => {
    const res = await postJson("/api/ai/chat", {
      user_message: "Can I skip my next OS class?",
      premium: true,
      safe_context: {
        subjects: [{ name: "Operating Systems", attended_classes: 29, total_classes: 40, next_class_time: "10:30 AM" }]
      }
    });
    const body = await res.json();
    expect(body.intent).toBe("skip_prediction");
    expect(body.cards[0].type).toBe("attendance_risk");
  });

  it("missing context asks to sync", async () => {
    const res = await postJson("/api/ai/chat", { user_message: "Can I skip?", premium: true });
    const body = await res.json();
    expect(body.missingData).toContain("safe_context");
    expect(body.actions[0].type).toBe("REFRESH_PORTAL_DATA");
  });

  it("premium study plan returns premiumRequired for free users", async () => {
    const res = await postJson("/api/ai/chat", {
      user_message: "What should I study today?",
      premium: false,
      safe_context: { subjects: [{ name: "Math", attendance_pct: 80 }] }
    });
    const body = await res.json();
    expect(body.premiumRequired).toBe(true);
  });

  it("app action returns allowed action schema", async () => {
    const res = await postJson("/api/ai/chat", { user_message: "Open attendance", premium: false });
    const body = await res.json();
    expect(body.actions[0].type).toBe("OPEN_PAGE");
    expect(body.actions[0].requiresConfirmation).toBe(false);
  });
});
