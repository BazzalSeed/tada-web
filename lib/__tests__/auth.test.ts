// @vitest-environment node
// Beta admission: there is no in-app allowlist — access is gated by the Google
// OAuth app's "Testing" publishing status (its test-user list). So authorizeSignIn
// admits any account Google authenticated (a real email) and rejects only a
// missing/empty one. See lib/auth.ts.
import { describe, expect, it } from "vitest";
import { authorizeSignIn } from "@/lib/auth";

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
