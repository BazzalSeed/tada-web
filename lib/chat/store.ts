// Persistence for chat conversations. The DB is the source of truth (stateless
// compute, rehydrate every turn); the model only ever receives the bounded slice
// that context.ts builds. We persist the full AI SDK UIMessage shape so tool
// tiles re-render verbatim on reload.
import type { UIMessage } from "ai";
import { prisma } from "@/lib/db";

export interface LoadedConversation {
  id: string;
  summary: string | null;
  summaryThroughId: string | null;
  messages: UIMessage[];
}

function toUiMessage(row: {
  id: string;
  role: string;
  parts: unknown;
}): UIMessage {
  return {
    id: row.id,
    role: row.role as UIMessage["role"],
    parts: row.parts as UIMessage["parts"],
  };
}

export interface ConversationMeta {
  summary: string | null;
  summaryThroughId: string | null;
}

// Upsert the conversation row, asserting ownership, and return its compaction
// meta (one query serves both, keeping the request path lean). The client mints
// the id for a fresh chat and sends it, so a brand-new id creates the row; an
// existing id must belong to this user (else we refuse someone else's thread).
export async function getOrCreateConversation(
  userId: string,
  conversationId: string,
): Promise<ConversationMeta> {
  const existing = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { userId: true, summary: true, summaryThroughId: true },
  });
  if (existing) {
    if (existing.userId !== userId) {
      throw new Error("conversation not found");
    }
    return { summary: existing.summary, summaryThroughId: existing.summaryThroughId };
  }
  await prisma.conversation.create({
    data: { id: conversationId, userId },
  });
  return { summary: null, summaryThroughId: null };
}

// Full conversation for a turn: compaction state + every raw message in order.
// Returns null if it doesn't exist or isn't owned by this user.
export async function loadConversation(
  userId: string,
  conversationId: string,
): Promise<LoadedConversation | null> {
  const convo = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      userId: true,
      summary: true,
      summaryThroughId: true,
      messages: {
        orderBy: { createdAt: "asc" },
        select: { id: true, role: true, parts: true },
      },
    },
  });
  if (!convo || convo.userId !== userId) return null;
  return {
    id: conversationId,
    summary: convo.summary,
    summaryThroughId: convo.summaryThroughId,
    messages: convo.messages.map(toUiMessage),
  };
}

// The user's most recent thread — what the single-window UI opens on mount.
export async function loadLatestConversation(
  userId: string,
): Promise<LoadedConversation | null> {
  const convo = await prisma.conversation.findFirst({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  if (!convo) return null;
  return loadConversation(userId, convo.id);
}

// Persist a completed turn. We write only the brand-new messages plus the last
// few (the active turn region) so the HITL resubmit — where the pending assistant
// message mutates from approval-request to executed result — is captured without
// rewriting the whole history.
export async function persistMessages(
  conversationId: string,
  messages: UIMessage[],
): Promise<void> {
  // Guard the whole id-collision class: a message with no id would upsert onto
  // the empty-string key and let successive turns overwrite each other. The
  // route assigns response ids (generateMessageId), so this should never fire —
  // but if it ever regresses we drop the row loudly rather than corrupt history.
  const withIds = messages.filter((m) => m.id);
  if (withIds.length !== messages.length) {
    console.error(
      `persistMessages: dropping ${messages.length - withIds.length} message(s) with empty id`,
    );
  }

  const existing = await prisma.message.findMany({
    where: { conversationId },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((m) => m.id));
  const activeFrom = Math.max(0, withIds.length - 3);

  const writes = withIds
    .map((m, i) => ({ m, i }))
    .filter(({ m, i }) => !existingIds.has(m.id) || i >= activeFrom)
    .map(({ m }) =>
      prisma.message.upsert({
        where: { id: m.id },
        create: {
          id: m.id,
          conversationId,
          role: m.role,
          parts: m.parts as object,
        },
        update: { parts: m.parts as object },
      }),
    );

  await prisma.$transaction([
    ...writes,
    prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    }),
  ]);
}

// Clear a conversation's history (ownership-checked): delete its messages and
// reset the rolling summary. Keeps the row; the client starts a fresh thread.
export async function clearConversation(
  userId: string,
  conversationId: string,
): Promise<void> {
  const convo = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { userId: true },
  });
  if (!convo || convo.userId !== userId) return; // not found / not owned → no-op
  await prisma.$transaction([
    prisma.message.deleteMany({ where: { conversationId } }),
    prisma.conversation.update({
      where: { id: conversationId },
      data: { summary: null, summaryThroughId: null },
    }),
  ]);
}

// Advance the rolling-summary state after a Layer-2 fold (see context.ts).
export async function saveSummary(
  conversationId: string,
  summary: string,
  summaryThroughId: string,
): Promise<void> {
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { summary, summaryThroughId },
  });
}
