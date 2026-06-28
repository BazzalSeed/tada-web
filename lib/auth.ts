// ============================================================================
// T3.6 — backend auth boundary + gating logic.
//  - currentUser(): session → UserCtx (the boundary every query/executor uses).
//  - isAdminEmail / redeemInvite: typed against the frozen contract aliases.
//  - authorizeSignIn: the new-user admission decision (admin bypass / invite),
//    injectable for unit tests; wired by the Auth.js signIn callback in @/auth.
// The Auth.js v5 config lives in `@/auth` (root); it imports the gating helpers
// here. currentUser dynamically imports `@/auth` to avoid an init cycle.
// ============================================================================

import { prisma } from "./db";
import type { CurrentUser, IsAdminEmail, Plan, RedeemInvite, UserCtx } from "./contracts";

// email ∈ ADMIN_EMAILS (comma-split env), case-insensitive.
export const isAdminEmail: IsAdminEmail = (email) => {
  const list = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.trim().toLowerCase());
};

// Atomic conditional claim: increments used_count iff the code is still valid
// (under maxUses, unexpired, and not bound to a different email). Single SQL
// statement → race-safe. Returns true iff a use was claimed.
export const redeemInvite: RedeemInvite = async (code, email) => {
  const claimed = await prisma.$executeRaw`
    UPDATE invite_codes
       SET used_count = used_count + 1
     WHERE code = ${code}
       AND used_count < max_uses
       AND (expires_at IS NULL OR expires_at > NOW())
       AND (invited_email IS NULL OR lower(invited_email) = lower(${email}))
  `;
  return claimed > 0;
};

// The signIn admission decision for a NEW user. Existing users always pass;
// admins bypass invites; everyone else needs a valid invite code. Injectable.
export async function authorizeSignIn(
  rawEmail: string | null | undefined,
  inviteCode: string | null | undefined,
  deps: {
    userExists: (email: string) => Promise<boolean>;
    redeem: (code: string, email: string) => Promise<boolean>;
  } = {
    userExists: async (email) =>
      !!(await prisma.user.findUnique({ where: { email } })),
    redeem: redeemInvite,
  },
): Promise<boolean> {
  const email = rawEmail?.trim().toLowerCase();
  if (!email) return false;
  if (await deps.userExists(email)) return true; // returning user
  if (isAdminEmail(email)) return true; // admin bypass
  if (inviteCode && (await deps.redeem(inviteCode, email))) return true;
  return false; // new non-admin without a valid invite
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
