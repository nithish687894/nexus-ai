import { describe, expect, it } from "vitest";
import { validateAction } from "../../src/actions/actionValidator.js";
import { classifyIntent } from "../../src/ai/services/intentRouter.service.js";
import { sanitizeSafeContext } from "../../src/security/contextSanitizer.js";

describe("context sanitizer", () => {
  it("rejects forbidden safe_context keys", () => {
    const result = sanitizeSafeContext({ subjects: [], email: "student@example.com", nested: { token: "secret" } });
    expect(result.ok).toBe(false);
    expect(result.rejectedKeys).toContain("safe_context.email");
    expect(result.rejectedKeys).toContain("safe_context.nested.token");
  });
});

describe("action validator", () => {
  it("rejects unknown actions", () => {
    expect(() => validateAction({ type: "DELETE_USER", label: "Delete", requiresConfirmation: true, dangerLevel: "high", payload: {} })).toThrow();
  });

  it("requires confirmation for premium trial", () => {
    expect(() => validateAction({ type: "START_PREMIUM_TRIAL", label: "Trial", requiresConfirmation: false, dangerLevel: "medium", payload: {} })).toThrow();
  });
});

describe("intent router", () => {
  it("routes skip questions", () => {
    expect(classifyIntent("Can I bunk OS?")).toBe("skip_prediction");
  });

  it("routes official SRM questions", () => {
    expect(classifyIntent("Where is exam portal?")).toBe("official_srm_info");
  });
});
