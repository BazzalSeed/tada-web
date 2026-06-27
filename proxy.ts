// ============================================================================
// T3.6b — page-level auth gate (Next 16 "proxy" convention, formerly middleware).
// The ship-goal auth model is "no app access without a session". API routes
// already 401 via currentUser(); this adds the REDIRECT so an unauthenticated
// visitor lands on sign-in instead of a broken app shell that silently 401s every
// write. Runs on the Edge runtime, so it uses the prisma-free auth.config (JWT
// decode only — no DB).
// ============================================================================

import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
  if (req.auth) return; // valid session → proceed

  // Unauthenticated → the built-in sign-in page, preserving the intended
  // destination via callbackUrl. /api/auth/signin lists BOTH Google AND (in
  // non-prod) dev-login, so it's not a Google-only dead-end and the reviewer's
  // e2e can reach an authed session through it. callbackUrl returns the user to
  // /app post-sign-in; the branded marketing "/" + its Log-in CTA is a separate
  // entry (frontend's).
  const signInUrl = new URL("/api/auth/signin", req.nextUrl.origin);
  signInUrl.searchParams.set("callbackUrl", req.nextUrl.pathname + req.nextUrl.search);
  return Response.redirect(signInUrl);
});

export const config = {
  // Gate the authed app pages ONLY. Everything else stays public: "/" (landing),
  // "/dev-login" (test session), "/api/auth/*" (sign-in), "/tokens", and all
  // static assets. Bare "/app" + nested "/app/*" both covered.
  matcher: ["/app", "/app/:path*"],
};
