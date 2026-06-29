// @vitest-environment node
// Beta admission: there is no in-app allowlist — access is gated by the Google
// OAuth app's "Testing" publishing status (its test-user list). So authorizeSignIn
// admits any account Google authenticated (a real email) and rejects only a
// missing/empty one. rejectsGoogleMerge enforces one-Google-account-per-user (the
// account-merge guard). See lib/auth.ts.
import { describe, expect, it } from "vitest";
import { authorizeSignIn, rejectsGoogleMerge } from "@/lib/auth";

describe("authorizeSignIn (beta: Google OAuth test-users are the gate)", () => {
  it("admits any authenticated email", () => {
    expect(authorizeSignIn("anyone@example.com")).toBe(true);
    expect(authorizeSignIn("  spaced@x.com  ")).toBe(true);
  });

  it("rejects a missing or empty email", () => {
    expect(authorizeSignIn(null)).toBe(false);
    expect(authorizeSignIn(undefined)).toBe(false);
    expect(authorizeSignIn("")).toBe(false);
    expect(authorizeSignIn("   ")).toBe(false);
  });
});

describe("rejectsGoogleMerge (one Google account = one app user)", () => {
  it("REJECTS a new Google account attaching to a user that already has one", () => {
    // The bug: signed in as A, then sign in as B → B would merge onto A.
    expect(
      rejectsGoogleMerge({ accountAlreadyLinked: false, targetUserHasGoogleAccount: true }),
    ).toBe(true);
  });

  it("allows a returning sign-in (account already linked)", () => {
    expect(
      rejectsGoogleMerge({ accountAlreadyLinked: true, targetUserHasGoogleAccount: true }),
    ).toBe(false);
  });

  it("allows a brand-new user with no Google account yet (normal sign-up + recovery)", () => {
    expect(
      rejectsGoogleMerge({ accountAlreadyLinked: false, targetUserHasGoogleAccount: false }),
    ).toBe(false);
  });

  it("allows a returning account even if somehow already linked to a fresh user", () => {
    expect(
      rejectsGoogleMerge({ accountAlreadyLinked: true, targetUserHasGoogleAccount: false }),
    ).toBe(false);
  });
});
