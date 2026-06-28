// POST /api/me/timezone — persist the browser's IANA zone on the User so meeting
// bookings anchor "10am" to the user's REAL timezone (lib/executors). Idempotent;
// fired fire-and-forget on app load. NO Claude/Anthropic.
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { handleApiError, json, readJson } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  try {
    const user = await currentUser();
    const { timezone } = await readJson<{ timezone?: string }>(req);
    const tz = typeof timezone === "string" ? timezone.trim() : "";
    // Loosely validate an IANA zone (e.g. "America/New_York") — bounded + charset.
    if (!tz || tz.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(tz)) {
      return json({ error: "invalid timezone" }, 400);
    }
    await prisma.user.update({ where: { id: user.userId }, data: { timezone: tz } });
    return json({ ok: true, timezone: tz });
  } catch (err) {
    return handleApiError(err);
  }
}
