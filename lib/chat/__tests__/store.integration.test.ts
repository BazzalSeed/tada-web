// @vitest-environment node
// Integration test for the chat persistence layer (lib/chat/store) — runs against
// the isolated Postgres container the harness provisions (see
// vitest.integration.config.ts).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import type { UIMessage } from "ai";
import {
  clearConversation,
  getOrCreateConversation,
  loadConversation,
  loadLatestConversation,
  persistMessages,
  saveSummary,
} from "@/lib/chat/store";

const prisma = new PrismaClient();

const stamp = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
const userId = `u-${stamp}`;
const otherUserId = `other-${stamp}`;

const text = (id: string, role: UIMessage["role"], body: string): UIMessage => ({
  id,
  role,
  parts: [{ type: "text", text: body }],
});

async function makeUser(id: string) {
  await prisma.user.create({
    data: { id, email: `${id}@test.local`, plan: "free" },
  });
}

describe("chat store", () => {
  beforeAll(async () => {
    await makeUser(userId);
    await makeUser(otherUserId);
  });

  afterAll(async () => {
    // Conversations + messages cascade-delete via FK onDelete: Cascade.
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    await prisma.$disconnect();
  });

  it("creates a conversation lazily and returns empty compaction meta", async () => {
    const id = `c-create-${stamp}`;
    const meta = await getOrCreateConversation(userId, id);
    expect(meta).toEqual({ summary: null, summaryThroughId: null });
    // Second call is idempotent and still owned.
    const again = await getOrCreateConversation(userId, id);
    expect(again.summary).toBeNull();
  });

  it("refuses a conversation owned by another user", async () => {
    const id = `c-owned-${stamp}`;
    await getOrCreateConversation(userId, id);
    await expect(getOrCreateConversation(otherUserId, id)).rejects.toThrow();
    // And a cross-owner load returns null rather than leaking.
    expect(await loadConversation(otherUserId, id)).toBeNull();
  });

  it("persists a turn and reloads messages in order", async () => {
    const id = `c-persist-${stamp}`;
    await getOrCreateConversation(userId, id);
    await persistMessages(id, [
      text("m1", "user", "what's due today?"),
      text("m2", "assistant", "Nothing due today."),
    ]);
    const loaded = await loadConversation(userId, id);
    expect(loaded?.messages.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(loaded?.messages[0].role).toBe("user");
  });

  it("upserts the active tail so a HITL approval mutation is captured", async () => {
    const id = `c-hitl-${stamp}`;
    await getOrCreateConversation(userId, id);
    await persistMessages(id, [
      text("h1", "user", "complete my todo"),
      text("h2", "assistant", "approval-requested"),
    ]);
    // Resubmit after approval: same id, mutated parts (now the executed result).
    await persistMessages(id, [
      text("h1", "user", "complete my todo"),
      text("h2", "assistant", "Done — marked complete."),
    ]);
    const loaded = await loadConversation(userId, id);
    expect(loaded?.messages).toHaveLength(2);
    const assistant = loaded?.messages.find((m) => m.id === "h2");
    expect(JSON.stringify(assistant?.parts)).toContain("Done — marked complete.");
  });

  it("loadLatestConversation returns the most recently updated thread", async () => {
    const older = `c-old-${stamp}`;
    const newer = `c-new-${stamp}`;
    await getOrCreateConversation(userId, older);
    await persistMessages(older, [text(`o1-${stamp}`, "user", "older")]);
    await getOrCreateConversation(userId, newer);
    await persistMessages(newer, [text(`n1-${stamp}`, "user", "newer")]);
    const latest = await loadLatestConversation(userId);
    expect(latest?.id).toBe(newer);
  });

  it("clearConversation deletes all messages and resets summary", async () => {
    const id = `c-clear-${stamp}`;
    await getOrCreateConversation(userId, id);
    await persistMessages(id, [
      text(`cl1-${stamp}`, "user", "hello"),
      text(`cl2-${stamp}`, "assistant", "hi there"),
    ]);
    // Advance the summary watermark so we can verify it resets.
    await saveSummary(id, "User greeted assistant.", `cl1-${stamp}`);

    // Clear should wipe messages and reset the compaction state.
    await clearConversation(userId, id);

    const loaded = await loadConversation(userId, id);
    // Row is still there (soft clear), but history is empty.
    expect(loaded).not.toBeNull();
    expect(loaded?.messages).toHaveLength(0);
    expect(loaded?.summary).toBeNull();
    expect(loaded?.summaryThroughId).toBeNull();
  });

  it("clearConversation is a no-op for a conversation owned by another user", async () => {
    const id = `c-clear-other-${stamp}`;
    await getOrCreateConversation(userId, id);
    await persistMessages(id, [text(`co1-${stamp}`, "user", "keep me")]);

    // Clearing with the wrong userId should be a no-op (ownership guard).
    await clearConversation(otherUserId, id);

    const loaded = await loadConversation(userId, id);
    expect(loaded?.messages).toHaveLength(1);
  });

  it("saveSummary advances the rolling-summary watermark", async () => {
    const id = `c-summary-${stamp}`;
    await getOrCreateConversation(userId, id);
    await persistMessages(id, [text("s1", "user", "hi"), text("s2", "assistant", "hello")]);
    await saveSummary(id, "The user greeted the assistant.", "s1");
    const meta = await getOrCreateConversation(userId, id);
    expect(meta.summary).toBe("The user greeted the assistant.");
    expect(meta.summaryThroughId).toBe("s1");
  });
});
