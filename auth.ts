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
import type { Provider } from "next-auth/providers";
import { prisma } from "@/lib/db";
import { authorizeSignIn } from "@/lib/auth";

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
  pages: { signIn: "/" },
  cookies: crossSubdomainCookies,
  callbacks: {
    // Beta admission: admit any account Google authenticated. The OAuth app stays
    // in "Testing", so only its listed test users can reach here — there is no
    // in-app allowlist (see lib/auth.ts). Publishing the OAuth app would remove
    // the only gate, so keep it in Testing during the beta.
    async signIn({ user, account }) {
      if (!authorizeSignIn(user.email)) return false;
      // Refresh the stored Google token + granted scopes on EVERY sign-in. The
      // PrismaAdapter persists the Account row only on the FIRST link, so a user
      // who consented before a scope was added (e.g. contacts.other.readonly)
      // keeps a stale token forever — otherContacts:search then 403s and contact
      // resolution silently misses Gmail-derived contacts. prompt=consent (above)
      // makes Google return a fresh refresh_token + the full scope set each time,
      // so we mirror it onto the existing row. updateMany no-ops for a brand-new
      // user whose row the adapter hasn't created yet.
      if (account?.provider === "google" && account.providerAccountId) {
        await prisma.account.updateMany({
          where: { provider: "google", providerAccountId: account.providerAccountId },
          data: {
            access_token: account.access_token ?? undefined,
            refresh_token: account.refresh_token ?? undefined,
            expires_at:
              typeof account.expires_at === "number" ? account.expires_at : undefined,
            scope: account.scope ?? undefined,
            token_type: account.token_type ?? undefined,
            id_token: account.id_token ?? undefined,
          },
        });
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        // Beta: every admitted user is a trusted OAuth test user → unlimited
        // (quota metering off). Revisit plan tiers when the beta opens up beyond
        // the Google OAuth test-user list.
        token.plan = "unlimited";
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
