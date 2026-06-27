// POST /api/inbound/email — Postmark inbound webhook. Verifies the shared secret
// (Basic-Auth), resolves the user alias, and runs the capture-first pipeline.
// Node runtime (Prisma + capture pipeline).
import { handleInboundEmail } from "@/lib/inbound";

export const runtime = "nodejs";
export const POST = handleInboundEmail;
