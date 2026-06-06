import { actionSchema, type NexusAction } from "../ai/schemas/action.schema.js";

const confirmationRequired = new Set(["START_PREMIUM_TRIAL", "GENERATE_REPORT", "REFRESH_PORTAL_DATA"]);

export function validateAction(action: unknown): NexusAction {
  const parsed = actionSchema.parse(action);
  if (confirmationRequired.has(parsed.type) && !parsed.requiresConfirmation) {
    throw new Error(`${parsed.type} requires confirmation`);
  }
  return parsed;
}

export function validateActions(actions: unknown[]) {
  return actions.map(validateAction);
}
