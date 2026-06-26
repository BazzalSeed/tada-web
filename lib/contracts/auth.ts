// ============================================================================
// FROZEN v0 CONTRACT — accounts, auth, invite gating.
// Auth.js (NextAuth) Google OAuth (access_type=offline, prompt=consent); we
// persist the refresh_token and refresh against oauth2.googleapis.com ourselves.
// Invite codes gate account CREATION only; admins (ADMIN_EMAILS) bypass + get
// plan='unlimited'. UserCtx is the boundary every query/executor passes through.
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
}

// The boundary every query passes through (resolves the session -> UserCtx).
export function currentUser(): Promise<UserCtx> {
  throw new Error("not implemented");
}

// ---- Invite codes (gate account CREATION only) ----
export interface InviteCode {
  code: string;
  maxUses: number;
  usedCount: number;
  expiresAt?: string | null;
  invitedEmail?: string | null;
}

// Atomic conditional UPDATE ... RETURNING; true if a use was successfully claimed.
export function redeemInvite(code: string, email: string): Promise<boolean> {
  throw new Error("not implemented");
}

// email is in ADMIN_EMAILS (comma-split env).
export function isAdminEmail(email: string): boolean {
  throw new Error("not implemented");
}
