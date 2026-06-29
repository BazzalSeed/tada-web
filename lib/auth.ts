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

// One Google account = one app user. Auth.js (the adapter) links a freshly
// authenticated OAuth account to the CURRENTLY signed-in user — its "connect
// another account" behavior. That means: sign in as B while still logged in as A
// and B's Google account gets attached to A's user row, so B then sees A's data
// (a cross-tenant leak). We never want implicit linking. rejectsGoogleMerge is
// the pure decision; the signIn callback feeds it two facts from the accounts
// table. wouldMergeGoogleAccount looks those facts up.
export function rejectsGoogleMerge(facts: {
  accountAlreadyLinked: boolean; // this (google, providerAccountId) already has a row
  targetUserHasGoogleAccount: boolean; // the user it would attach to already has a google account
}): boolean {
  // Block only the dangerous case: a brand-new Google account (not yet linked)
  // attaching to a user that already owns a different Google account. A returning
  // account (already linked) or a fresh user (no google account yet) is fine —
  // the latter keeps normal new-user creation and account-recovery working.
  return !facts.accountAlreadyLinked && facts.targetUserHasGoogleAccount;
}

// DB-backed evaluation of rejectsGoogleMerge for a pending google sign-in:
// would admitting this providerAccountId onto `userId` merge a second Google
// account onto that user?
export async function wouldMergeGoogleAccount(
  userId: string,
  providerAccountId: string,
): Promise<boolean> {
  const [linked, ownGoogle] = await Promise.all([
    prisma.account.findFirst({
      where: { provider: "google", providerAccountId },
      select: { id: true },
    }),
    prisma.account.findFirst({
      where: { userId, provider: "google" },
      select: { id: true },
    }),
  ]);
  return rejectsGoogleMerge({
    accountAlreadyLinked: !!linked,
    targetUserHasGoogleAccount: !!ownGoogle,
  });
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
