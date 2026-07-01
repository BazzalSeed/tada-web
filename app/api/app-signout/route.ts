// Robust sign-out. The default /api/auth/signout couldn't reliably clear our
// session cookie: it may exist as a Domain-scoped cookie (Domain=gettada.app,
// today's config) OR as a legacy host-only cookie on app.gettada.app (older
// sessions), and it can be chunked (…session-token.0/.1). Auth.js clears only the
// variant its config knows about, leaving the other → user stays signed in.
// Cookie identity is (name, domain, path), so here we emit an explicit expiring
// Set-Cookie for EVERY (name × {host-only, Domain}) combination — a route handler
// lets us append duplicate Set-Cookie headers for the same name, which the
// cookies() store can't. This guarantees deletion regardless of how it was set.
import { NextResponse, type NextRequest } from "next/server";
import { signOut, authCookieDomain } from "@/auth";

const SESSION_COOKIE_NAMES = [
  "__Secure-authjs.session-token",
  "__Secure-authjs.session-token.0",
  "__Secure-authjs.session-token.1",
  "__Secure-authjs.session-token.2",
  "authjs.session-token",
  "authjs.session-token.0",
  "authjs.session-token.1",
];

async function clearAndRedirect(req: NextRequest): Promise<NextResponse> {
  // Fire Auth.js sign-out (events, its own cookie clear). Never let it block the
  // hard cookie wipe below.
  try {
    await signOut({ redirect: false });
  } catch {
    // ignore — the explicit cookie clear is what actually signs the user out
  }

  const res = NextResponse.redirect(new URL("/", req.nextUrl.origin), { status: 303 });
  for (const name of SESSION_COOKIE_NAMES) {
    const secure = name.startsWith("__Secure-") ? "; Secure" : "";
    const base = `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure}`;
    res.headers.append("Set-Cookie", base); // host-only variant
    if (authCookieDomain) {
      res.headers.append("Set-Cookie", `${base}; Domain=${authCookieDomain}`); // Domain-scoped variant
    }
  }
  return res;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  return clearAndRedirect(req);
}

// GET support so a plain link (or a stuck user hitting the URL directly) works.
export async function GET(req: NextRequest): Promise<NextResponse> {
  return clearAndRedirect(req);
}
