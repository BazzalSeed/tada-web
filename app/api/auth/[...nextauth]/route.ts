// Auth.js v5 catch-all handler — delegates to the root config in @/auth.
// Node runtime: the Prisma adapter is not Edge-compatible.
import { handlers } from "@/auth";

export const runtime = "nodejs";
export const { GET, POST } = handlers;
