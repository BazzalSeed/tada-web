// ============================================================================
// T3.6b — Edge-safe Auth.js base config. middleware.ts runs on the Edge runtime,
// which CANNOT bundle the Prisma adapter. So the session-reading config the
// middleware needs lives here with NO Prisma import; the full config (adapter,
// prisma-touching callbacks) stays in auth.ts. JWT session strategy means
// decoding the cookie needs no DB.
// ============================================================================

import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  providers: [], // middleware only READS the session JWT; it never starts sign-in
  session: { strategy: "jwt" },
} satisfies NextAuthConfig;
