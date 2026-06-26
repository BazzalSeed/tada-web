// ============================================================================
// FROZEN v0 CONTRACT — plan gating / credit metering.
// ai_usage PK (user_id, period 'YYYY-MM'); atomic UPDATE ... WHERE used+cost<=limit
// RETURNING. Admin (plan='unlimited') short-circuits. deepResearch reserves up
// front and refunds on failure. QuotaError => HTTP 402 (vs 429 for burst).
// ============================================================================

import type { Plan, UserCtx } from "./auth";

export type Capability = "extractTodos" | "chatTurn" | "deepResearch";

export const COST: Record<Capability, number> = {
  extractTodos: 1,
  chatTurn: 1,
  deepResearch: 10,
};

export const PLAN_CREDITS: Record<Plan, number> = {
  free: 50,
  pro: 2000,
  unlimited: Infinity,
};

export class QuotaError extends Error {
  readonly status = 402;
  constructor(message = "Quota exceeded") {
    super(message);
    this.name = "QuotaError";
  }
}

// Reserves cost atomically, runs the capability, refunds on failure where applicable.
export function withQuota<T>(
  user: UserCtx,
  cap: Capability,
  run: () => Promise<T>,
): Promise<T> {
  throw new Error("not implemented");
}
