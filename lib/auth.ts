// ============================================================================
// T3.6 — backend auth boundary + admission logic.
//  - currentUser(): session → UserCtx (the boundary every query/executor uses).
//  - authorizeSignIn: the sign-in admission decision; wired by the Auth.js
//    signIn callback in @/auth.
// Beta has no in-app allowlist: access is gated entirely by the Google OAuth
// app's "Testing" publishing status (only its listed test users can complete
// OAuth). So admission here = "Google authenticated a real email." If the OAuth
// app is ever Published, this gate disappears — keep it in Testing during beta.
// The Auth.js v5 config lives in `@/auth` (root); currentUser dynamically
// imports it to avoid an init cycle.
// ============================================================================

import { prisma } from "./db";
import type { CurrentUser, Plan, UserCtx } from "./contracts";

// Admission decision: admit any account Google authenticated (a non-empty
// email). The real gate is the OAuth app's test-user list — see the file header.
export function authorizeSignIn(rawEmail: string | null | undefined): boolean {
  return !!rawEmail?.trim();
}

// The Google refresh token is the user's, persisted by the adapter on the
// `Account` row. We read it server-side (NEVER via the session — that would leak
// it to the client at /api/auth/session) so the meeting/contacts executors can
// mint an access token on demand.
export async function googleRefreshTokenFor(userId: string): Promise<string | null> {
  const acct = await prisma.account.findFirst({
    where: { userId, provider: "google" },
    select: { refresh_token: true },
  });
  return acct?.refresh_token ?? null;
}

// Resolves the Auth.js session → UserCtx. plan comes off the session; the Google
// refresh token is looked up server-side from the Account row (never client-exposed).
export const currentUser: CurrentUser = async () => {
  const { auth } = await import("@/auth");
  const session = await auth();
  const u = session?.user;
  if (!u?.id || !u.email) throw new Error("unauthorized");
  const [googleRefreshToken, row] = await Promise.all([
    googleRefreshTokenFor(u.id),
    prisma.user.findUnique({ where: { id: u.id }, select: { timezone: true } }),
  ]);
  return {
    userId: u.id,
    email: u.email,
    plan: (u.plan ?? "free") as Plan,
    googleRefreshToken,
    timezone: row?.timezone ?? null,
  };
};
