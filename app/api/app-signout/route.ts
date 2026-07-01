// Robust sign-out. The default /api/auth/signout couldn't reliably clear our
// session cookie: it may exist as a Domain-scoped cookie (Domain=gettada.app,
// today's config) OR as a legacy host-only cookie on app.gettada.app (older
// sessions), and it can be chunked (…session-token.0/.1). Auth.js clears only the
// variant its config knows about, leaving the other → user stays signed in.
// Cookie identity is (name, domain, path), so here we emit an explicit expiring
// Set-Cookie for EVERY (name × {host-only, Domain}) combination — a route handler
// lets us append duplicate Set-Cookie headers for the same name, which the
// cookies() store can't. This guarantees deletion regardless of how it was set.
// The session strategy is JWT, so the cookie IS the session — deleting it is the
// sign-out (no server state to invalidate). We do it deterministically here
// rather than via Auth.js signOut(), whose partial cookie clear was the bug.
import { NextResponse, type NextRequest } from "next/server";
import { authCookieDomain } from "@/auth";

const SESSION_COOKIE_NAMES = [
  "__Secure-authjs.session-token",
  "__Secure-authjs.session-token.0",
  "__Secure-authjs.session-token.1",
  "__Secure-authjs.session-token.2",
  "authjs.session-token",
  "authjs.session-token.0",
  "authjs.session-token.1",
];

function clearAndRedirect(req: NextRequest): NextResponse {
  const res = NextResponse.redirect(new URL("/", req.nextUrl.origin), { status: 303 });
  for (const name of SESSION_COOKIE_NAMES) {
    const secure = name.startsWith("__Secure-") ? "; Secure" : "";
    const base = `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`;
    res.headers.append("Set-Cookie", base); // host-only variant
    if (authCookieDomain) {
      res.headers.append("Set-Cookie", `${base}; Domain=${authCookieDomain}`); // Domain-scoped variant
    }
  }
  // Never let the redirect (or its Set-Cookie clears) be cached.
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export function POST(req: NextRequest): NextResponse {
  return clearAndRedirect(req);
}

// GET support so a plain link (or a stuck user hitting the URL directly) works.
export function GET(req: NextRequest): NextResponse {
  return clearAndRedirect(req);
}
