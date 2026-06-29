// @vitest-environment node
// Regression for the OAuth account-MERGE bug: Auth.js links a freshly
// authenticated OAuth account to the currently signed-in user, which merged two
// distinct Google accounts onto one app user (a cross-tenant data leak — the new
// account saw the first user's todos). wouldMergeGoogleAccount is the guard the
// signIn callback uses to refuse that link; verify it against real rows.
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { wouldMergeGoogleAccount } from "@/lib/auth";

const userIds: string[] = [];
let seq = 0;
const uniq = (p: string) => `${p}-${Date.now()}-${seq++}`;

async function mkUserWithGoogle(providerAccountId: string) {
  const user = await prisma.user.create({ data: { email: uniq("u") + "@x.test" } });
  userIds.push(user.id);
  await prisma.account.create({
    data: { userId: user.id, type: "oauth", provider: "google", providerAccountId },
  });
  return user;
}

afterEach(async () => {
  if (userIds.length) {
    // accounts cascade on user delete (onDelete: Cascade)
    await prisma.user.deleteMany({ where: { id: { in: userIds.splice(0) } } });
  }
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("wouldMergeGoogleAccount", () => {
  it("BLOCKS linking a different Google account onto a user that already has one", async () => {
    const a = await mkUserWithGoogle(uniq("acc-A"));
    expect(await wouldMergeGoogleAccount(a.id, uniq("acc-B"))).toBe(true);
  });

  it("allows a returning sign-in of the user's own already-linked account", async () => {
    const pid = uniq("acc-own");
    const a = await mkUserWithGoogle(pid);
    expect(await wouldMergeGoogleAccount(a.id, pid)).toBe(false);
  });

  it("allows a brand-new user that has no Google account yet", async () => {
    const u = await prisma.user.create({ data: { email: uniq("fresh") + "@x.test" } });
    userIds.push(u.id);
    expect(await wouldMergeGoogleAccount(u.id, uniq("acc-new"))).toBe(false);
  });
});
