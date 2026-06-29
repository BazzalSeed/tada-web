// ============================================================================
// FROZEN v0 CONTRACT — accounts + auth.
// Auth.js (NextAuth) Google OAuth (access_type=offline, prompt=consent); we
// persist the refresh_token and refresh against oauth2.googleapis.com ourselves.
// Beta access is gated by the Google OAuth app's "Testing" publishing status
// (its test-user allowlist) — there is no in-app invite/admin gate. UserCtx is
// the boundary every query/executor passes through.
// ============================================================================

export type Plan = "free" | "pro" | "unlimited";

export interface User {
  id: string;
  email: string;
  name?: string | null;
  image?: string | null;
  plan: Plan;
  createdAt: string;
}

export interface UserCtx {
  userId: string;
  email: string;
  plan: Plan;
  googleRefreshToken?: string | null;
  timezone?: string | null; // IANA zone (e.g. "America/New_York"), captured from the browser
}

// The boundary every query passes through (resolves the session -> UserCtx).
// Impl lives in backend-owned lib/auth.ts, typed against this alias.
export type CurrentUser = () => Promise<UserCtx>;
