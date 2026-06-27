// ============================================================================
// Backend-owned auth boundary. `currentUser()` resolves the session → UserCtx —
// the boundary every query/executor passes through. Stub until T3.6 (Auth.js
// Google + invite gating) lands the real session resolution here.
//
// Consumers import `currentUser` from "@/lib/auth" (NOT "@/lib/contracts" — the
// contract keeps only the `UserCtx`/`User` types + the `CurrentUser` signature).
// ============================================================================

import type { CurrentUser } from "./contracts";

// Typed against the frozen `CurrentUser` alias so any signature drift fails tsc.
export const currentUser: CurrentUser = async () => {
  // T3.6 replaces this with the Auth.js session → UserCtx lookup.
  throw new Error("unauthorized: currentUser not implemented yet (T3.6)");
};
