// ============================================================================
// T3.6 — Auth.js v5 configuration (root). Google OAuth (offline + consent so we
// get a refresh_token, persisted on the Account row by the adapter for
// sendMeetingInvite) + a hard-gated dev-only Credentials test-login. JWT session
// strategy (required by Credentials; PrismaAdapter still persists users/accounts).
// New-user admission is gated by authorizeSignIn (admin bypass / invite redeem).
// NO Claude/Anthropic anywhere — this is auth only.
// ============================================================================

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { cookies } from "next/headers";
import type { Provider } from "next-auth/providers";
import { prisma } from "@/lib/db";
import { authorizeSignIn, devLoginEnabled, planForEmail } from "@/lib/auth";

const providers: Provider[] = [
  Google({
    authorization: {
      params: {
        access_type: "offline",
        prompt: "consent",
        // calendar.events → sendMeetingInvite can create events + send invites.
        scope:
          "openid email profile https://www.googleapis.com/auth/calendar.events",
      },
    },
    allowDangerousEmailAccountLinking: true,
  }),
];

// TEST SEAM — never in prod. Only mounted when NODE_ENV!=='production' AND
// ENABLE_DEV_LOGIN==='1'; authorize() re-asserts the gate (defense-in-depth).
if (devLoginEnabled()) {
  providers.push(
    Credentials({
      id: "dev-login",
      name: "Dev Login (test only)",
      credentials: { email: { label: "email", type: "text" } },
      authorize: async (creds) => {
        if (process.env.NODE_ENV === "production") {
          throw new Error("dev-login is disabled in production");
        }
        const email = (
          (creds?.email as string) ||
          process.env.DEV_LOGIN_EMAIL ||
          "seedzpy@gmail.com"
        ).toLowerCase();
        const user = await prisma.user.upsert({
          where: { email },
          create: { email, name: "Dev User", plan: planForEmail(email) },
          update: {},
        });
        return { id: user.id, email: user.email, name: user.name, plan: user.plan };
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  providers,
  pages: { signIn: "/join" },
  callbacks: {
    // Gate account CREATION: existing → admit; admin → admit; else require a
    // valid invite code (read from the join cookie). Dev-login bypasses (test).
    async signIn({ user, account }) {
      if (account?.provider === "dev-login") return true;
      const code = (await cookies()).get("invite_code")?.value ?? null;
      return authorizeSignIn(user.email, code);
    },
    async jwt({ token, account, user }) {
      if (user) {
        token.uid = user.id;
        // plan: from the credentials user, else look up the adapter-created user.
        const plan =
          (user as { plan?: string }).plan ??
          (user.email
            ? (await prisma.user.findUnique({ where: { email: user.email } }))?.plan
            : undefined);
        if (plan) token.plan = plan as typeof token.plan;
      }
      if (account?.provider === "google" && account.refresh_token) {
        token.refresh_token = account.refresh_token;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.uid) session.user.id = token.uid;
      if (token.plan) session.user.plan = token.plan;
      session.user.googleRefreshToken = token.refresh_token ?? null;
      return session;
    },
  },
});
