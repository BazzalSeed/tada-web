// POST /api/waitlist — public landing CTA capture (no auth). The `waitlist` table
// in our own Neon Postgres is the source of truth; at launch an ESP (Resend) is
// the send transport only. Idempotent upsert on the normalized email so repeat
// signups never 500. Frontend converts the CTAs; this endpoint backs them.
import { prisma } from "@/lib/db";
import { json, badRequest, handleApiError, readJson } from "@/lib/http";

export const runtime = "nodejs";

// Pragmatic email check — good enough to reject obvious garbage at the door.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request): Promise<Response> {
  try {
    const { email, source } = await readJson<{ email?: unknown; source?: unknown }>(req);

    const normalized = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (!EMAIL_RE.test(normalized)) throw badRequest("a valid email is required");

    const src = typeof source === "string" && source.trim() ? source.trim() : null;

    // Idempotent: a repeat signup is a no-op, not a unique-constraint error.
    await prisma.waitlist.upsert({
      where: { email: normalized },
      update: {},
      create: { email: normalized, source: src },
    });

    return json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
