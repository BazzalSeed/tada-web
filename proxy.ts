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

  // Unauthenticated → sign-in, preserving the intended destination.
  // Non-prod: go to /dev-login (the test-session entry) so the reviewer can get
  // in on any port — real Google only works on a registered redirect URI (:3000 /
  // app.gettada.app), so a Google-only target would dead-end on the :3939 fallback.
  // Prod: the built-in sign-in page (Google).
  const target = process.env.NODE_ENV === "production" ? "/api/auth/signin" : "/dev-login";
  const signInUrl = new URL(target, req.nextUrl.origin);
  signInUrl.searchParams.set("callbackUrl", req.nextUrl.pathname + req.nextUrl.search);
  return Response.redirect(signInUrl);
});

export const config = {
  // Gate the authed app pages ONLY. Everything else stays public: "/" (landing),
  // "/dev-login" (test session), "/api/auth/*" (sign-in), "/tokens", and all
  // static assets. Bare "/app" + nested "/app/*" both covered.
  matcher: ["/app", "/app/:path*"],
};
