const forbiddenPatterns = [
  "password",
  "token",
  "cookie",
  "session",
  "netid",
  "register",
  "reg_no",
  "email",
  "phone",
  "srn",
  "secret",
  "auth",
  "jwt"
];

export type SanitizedContextResult = {
  ok: boolean;
  context?: unknown;
  rejectedKeys: string[];
};

function hasForbiddenKey(key: string) {
  const normalized = key.toLowerCase();
  return forbiddenPatterns.some((pattern) => normalized.includes(pattern));
}

function scan(value: unknown, path = "safe_context", rejectedKeys: string[] = []): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) => scan(item, `${path}[${index}]`, rejectedKeys));
  }
  if (value && typeof value === "object") {
    const clean: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      const childPath = `${path}.${key}`;
      if (hasForbiddenKey(key)) {
        rejectedKeys.push(childPath);
        continue;
      }
      clean[key] = scan(child, childPath, rejectedKeys);
    }
    return clean;
  }
  return value;
}

export function sanitizeSafeContext(value: unknown): SanitizedContextResult {
  if (value === undefined || value === null) {
    return { ok: true, context: undefined, rejectedKeys: [] };
  }
  const rejectedKeys: string[] = [];
  const context = scan(value, "safe_context", rejectedKeys);
  return { ok: rejectedKeys.length === 0, context, rejectedKeys };
}
