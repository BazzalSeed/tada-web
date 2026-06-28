// ============================================================================
// T3.6 — Auth.js v5 configuration (root). Google OAuth only (offline + consent so
// we get a refresh_token, persisted on the Account row by the adapter for
// sendMeetingInvite). JWT session strategy; PrismaAdapter persists users/accounts.
// New-user admission is gated by authorizeSignIn (admin bypass / invite redeem).
// NO Claude/Anthropic anywhere — this is auth only.
// ============================================================================

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { cookies } from "next/headers";
import type { Provider } from "next-auth/providers";
import { prisma } from "@/lib/db";
import { authorizeSignIn, isAdminEmail } from "@/lib/auth";

const providers: Provider[] = [
  Google({
    authorization: {
      params: {
        access_type: "offline",
        prompt: "consent",
        // calendar.events → sendMeetingInvite creates events + sends invites.
        // contacts.readonly → saved "My Contacts"; contacts.other.readonly →
        // Gmail-derived "Other contacts" (people you've emailed but not saved),
        // so attendee resolution covers the common "book with <name>" case.
        scope:
          "openid email profile https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/contacts.readonly https://www.googleapis.com/auth/contacts.other.readonly",
      },
    },
    allowDangerousEmailAccountLinking: true,
  }),
];

// Cross-subdomain auth cookies. The marketing landing lives on the apex
// (gettada.app) but the OAuth callback + app live on app.gettada.app. By default
// Auth.js scopes the transient PKCE/state/nonce cookies host-only, so a sign-in
// STARTED on the apex loses them when Google calls back on the app subdomain
// (InvalidCheck: "pkceCodeVerifier could not be parsed"). Scoping Domain to the
// shared parent (gettada.app) lets the cookies span both hosts. Source of truth:
// AUTH_COOKIE_DOMAIN if set, else derived from AUTH_URL's host (a subdomain like
// app.gettada.app → gettada.app). localhost / bare-apex / IP → undefined, so dev
// stays single-host and unchanged. The CSRF cookie is intentionally left at its
// __Host- default — host-only is correct; it's validated only on the same-host
// sign-in POST, never at the callback.
function resolveCookieDomain(): string | undefined {
  const explicit = process.env.AUTH_COOKIE_DOMAIN?.trim();
  if (explicit) return explicit;
  const url = process.env.AUTH_URL?.trim();
  if (!url) return undefined;
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return undefined;
  }
  if (host === "localhost" || /^[0-9.]+$/.test(host)) return undefined;
  const parts = host.split(".");
  // Only share when there's an actual subdomain to share WITH (app.gettada.app →
  // gettada.app). A bare apex has no sibling host, so leave it host-only.
  if (parts.length < 3) return undefined;
  return parts.slice(-2).join(".");
}
const cookieDomain = resolveCookieDomain();
const crossSubdomainCookies = cookieDomain
  ? (() => {
      const base = {
        httpOnly: true,
        sameSite: "lax" as const,
        path: "/",
        secure: true,
        domain: cookieDomain,
      };
      return {
        sessionToken: { name: "__Secure-authjs.session-token", options: { ...base } },
        callbackUrl: { name: "__Secure-authjs.callback-url", options: { ...base } },
        pkceCodeVerifier: {
          name: "__Secure-authjs.pkce.code_verifier",
          options: { ...base, maxAge: 900 },
        },
        state: { name: "__Secure-authjs.state", options: { ...base, maxAge: 900 } },
        nonce: { name: "__Secure-authjs.nonce", options: { ...base } },
      };
    })()
  : undefined;

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  providers,
  pages: { signIn: "/join" },
  cookies: crossSubdomainCookies,
  callbacks: {
    // Gate account CREATION: existing → admit; admin → admit; else require a
    // valid invite code (read from the join cookie).
    async signIn({ user }) {
      const code = (await cookies()).get("invite_code")?.value ?? null;
      return authorizeSignIn(user.email, code);
    },
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        // Effective plan, resolved at sign-in. Admin status is env-driven
        // (ADMIN_EMAILS) so we derive it live → admins always get unlimited even
        // if their stored row predates being granted admin. Everyone else keeps
        // their stored plan (e.g. an upgraded "pro"), defaulting to "free".
        const stored =
          (user as { plan?: string }).plan ??
          (user.email
            ? (await prisma.user.findUnique({ where: { email: user.email } }))?.plan
            : undefined);
        token.plan = (
          user.email && isAdminEmail(user.email) ? "unlimited" : stored ?? "free"
        ) as typeof token.plan;
      }
      // NOTE: the Google refresh_token is deliberately NOT carried on the JWT or
      // session — it would be readable by the client (/api/auth/session). It
      // lives only in the Account row; currentUser reads it server-side on demand.
      return token;
    },
    async session({ session, token }) {
      if (token.uid) session.user.id = token.uid;
      if (token.plan) session.user.plan = token.plan;
      return session;
    },
  },
});
