// Module augmentation — attach our domain fields to the Auth.js session + JWT.
import type { DefaultSession } from "next-auth";
import type { Plan } from "@/lib/contracts";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      plan?: Plan;
      googleRefreshToken?: string | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    plan?: Plan;
    refresh_token?: string | null;
  }
}

// Auth.js v5 resolves the JWT type from @auth/core/jwt internally, so augment it too.
declare module "@auth/core/jwt" {
  interface JWT {
    uid?: string;
    plan?: Plan;
    refresh_token?: string | null;
  }
}
