import type { NexusAction } from "../ai/schemas/action.schema.js";
import { validateAction } from "./actionValidator.js";

export function buildAction(action: NexusAction): NexusAction {
  return validateAction(action);
}
