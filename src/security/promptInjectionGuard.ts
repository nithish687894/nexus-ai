const injectionPatterns = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /show\s+(the\s+)?system\s+prompt/i,
  /print\s+(the\s+)?safe_context/i,
  /output\s+(the\s+)?safe_context/i,
  /show\s+hidden\s+data/i,
  /show\s+tokens?/i,
  /reveal\s+.*token/i,
  /act\s+as\s+admin/i,
  /another\s+student/i,
  /delete_user/i
];

export function detectPromptInjection(message: string) {
  return injectionPatterns.some((pattern) => pattern.test(message));
}

export function securityRefusal() {
  return "Nice try bro. I can't show hidden system or private data. I can still help with attendance, marks, timetable, or official SRM info.";
}
