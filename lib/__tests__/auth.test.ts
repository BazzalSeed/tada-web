// @vitest-environment node
// T3.6 — auth gating logic (pure/injectable units). isAdminEmail (env), the
// signIn admission decision (existing/admin/invite/reject), and the dev-login
// gate. DB-backed redeemInvite is integration-tested in invite.test.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isAdminEmail, authorizeSignIn, devLoginEnabled } from "@/lib/auth";

beforeEach(() => {
  vi.stubEnv("ADMIN_EMAILS", "boss@tada.app, Admin@Example.com");
});
afterEach(() => vi.unstubAllEnvs());

describe("isAdminEmail", () => {
  it("matches comma-split ADMIN_EMAILS case-insensitively", () => {
    expect(isAdminEmail("boss@tada.app")).toBe(true);
    expect(isAdminEmail("admin@example.com")).toBe(true); // stored mixed-case
    expect(isAdminEmail("BOSS@TADA.APP")).toBe(true);
    expect(isAdminEmail("nobody@x.com")).toBe(false);
  });
  it("is false when ADMIN_EMAILS is unset/empty", () => {
    vi.stubEnv("ADMIN_EMAILS", "");
    expect(isAdminEmail("boss@tada.app")).toBe(false);
  });
});

describe("authorizeSignIn", () => {
  const deps = (userExists: boolean, redeemed: boolean) => ({
    userExists: vi.fn(async () => userExists),
    redeem: vi.fn(async () => redeemed),
  });

  it("rejects when there is no email", async () => {
    expect(await authorizeSignIn(null, "code", deps(false, false))).toBe(false);
  });
  it("admits an existing user regardless of invite", async () => {
    const d = deps(true, false);
    expect(await authorizeSignIn("returning@x.com", null, d)).toBe(true);
    expect(d.redeem).not.toHaveBeenCalled();
  });
  it("admits a new admin email with no invite code", async () => {
    expect(await authorizeSignIn("boss@tada.app", null, deps(false, false))).toBe(true);
  });
  it("admits a new non-admin with a valid invite", async () => {
    const d = deps(false, true);
    expect(await authorizeSignIn("new@x.com", "GOLDEN", d)).toBe(true);
    expect(d.redeem).toHaveBeenCalledWith("GOLDEN", "new@x.com");
  });
  it("rejects a new non-admin with no invite code", async () => {
    expect(await authorizeSignIn("new@x.com", null, deps(false, false))).toBe(false);
  });
  it("rejects a new non-admin with an invalid invite", async () => {
    expect(await authorizeSignIn("new@x.com", "BAD", deps(false, false))).toBe(false);
  });
});

describe("devLoginEnabled", () => {
  it("true only when non-prod AND ENABLE_DEV_LOGIN=1", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ENABLE_DEV_LOGIN", "1");
    expect(devLoginEnabled()).toBe(true);
  });
  it("false in production even with the flag", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ENABLE_DEV_LOGIN", "1");
    expect(devLoginEnabled()).toBe(false);
  });
  it("false when the flag is unset", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("ENABLE_DEV_LOGIN", "");
    expect(devLoginEnabled()).toBe(false);
  });
});
