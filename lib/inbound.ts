// ============================================================================
// T2.6 — inbound email ingestion (hero flow #3, forward an email). Each user has
// a unique alias u_<id>@in.gettada.app. Postmark POSTs the parsed message to the
// webhook; we verify it (Basic-Auth: password === POSTMARK_INBOUND_WEBHOOK_SECRET,
// any username), resolve alias→user, and run the SAME capture-first pipeline
// (Capture{kind:'email'} + plain Todo BEFORE extract). Asynchronous, server-side.
// ============================================================================

import { timingSafeEqual } from "node:crypto";
import { prisma } from "./db";
import { runCapture } from "./capture";
import { INBOUND_DOMAIN } from "./contracts";
import type {
  AliasForUser,
  Plan,
  UserIdFromAlias,
  HandleInboundEmail,
  UserCtx,
} from "./contracts";

export const aliasForUser: AliasForUser = (userId) =>
  `u_${userId}@${INBOUND_DOMAIN}`;

// Parses u_<id>@in.gettada.app out of a To/Recipient field (tolerates a
// "Name <addr>" wrapper). Returns the user id, or null if it doesn't match.
export const userIdFromAlias: UserIdFromAlias = (toAddress) => {
  const re = new RegExp(
    `u_([^@\\s>]+)@${INBOUND_DOMAIN.replace(/\./g, "\\.")}`,
    "i",
  );
  const m = toAddress.match(re);
  return m ? m[1] : null;
};

// Constant-time secret check on the Basic-Auth password (username ignored).
function verifyWebhookAuth(req: Request): boolean {
  const secret = process.env.POSTMARK_INBOUND_WEBHOOK_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const m = header.match(/^Basic\s+(.+)$/i);
  if (!m) return false;
  const decoded = Buffer.from(m[1], "base64").toString("utf8");
  const password = decoded.slice(decoded.indexOf(":") + 1);
  const a = Buffer.from(password);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Minimal shape of the Postmark inbound payload we read.
interface PostmarkInbound {
  From?: string;
  To?: string;
  OriginalRecipient?: string;
  Subject?: string;
  TextBody?: string;
  HtmlBody?: string;
  Attachments?: { Name?: string; Content?: string; ContentType?: string }[];
}

export const handleInboundEmail: HandleInboundEmail = async (req) => {
  // 1. Verify the provider (reject if invalid).
  if (!verifyWebhookAuth(req)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  // 2. Parse the payload.
  let body: PostmarkInbound;
  try {
    body = (await req.json()) as PostmarkInbound;
  } catch {
    return new Response(JSON.stringify({ error: "bad payload" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  // 3. Resolve alias → user. Unknown alias / user → drop (200, no retry).
  const recipient = body.OriginalRecipient ?? body.To ?? "";
  const userId = userIdFromAlias(recipient);
  const user = userId
    ? await prisma.user.findUnique({ where: { id: userId } })
    : null;
  if (!user) {
    return new Response(JSON.stringify({ status: "dropped" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  // 4. Capture-first via the shared pipeline (Capture{email} + plain Todo, then
  //    extract). UserCtx carries the plan for withQuota.
  const ctx: UserCtx = {
    userId: user.id,
    email: user.email,
    plan: user.plan as Plan,
  };
  await runCapture(ctx, {
    kind: "email",
    note: body.Subject ?? null,
    email: {
      from: body.From,
      subject: body.Subject,
      body: body.TextBody || body.HtmlBody || "",
      attachments: (body.Attachments ?? [])
        .filter((a) => a.Content && a.ContentType)
        .map((a) => ({ base64: a.Content as string, mimeType: a.ContentType as string })),
    },
  });

  return new Response(JSON.stringify({ status: "ok" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
