// @vitest-environment node
// FIX9 (live) — proves the real Gemini agent now uses the expanded registry:
// "what's due today?" drives query_todos (the app-mirroring filter tool) instead
// of dead-ending on "I can only list all open todos". Gated behind RUN_LLM_TESTS.
import { describe, expect, it, vi } from "vitest";

// Stub the store with a small pool so the read tool returns deterministically.
vi.mock("@/lib/store", () => {
  const now = new Date();
  const iso = (d: Date) => d.toISOString();
  const todos = [
    { id: "t1", title: "Submit tax form", status: "open", dueAt: iso(now), priority: "p1", labelIds: [], actionType: "none", detail: null },
    { id: "t2", title: "Water the plants", status: "open", dueAt: null, priority: "none", labelIds: [], actionType: "none", detail: null },
  ];
  return {
    store: {
      listTodos: vi.fn(async () => todos),
      labels: vi.fn(async () => []),
      createCapture: vi.fn(),
      createTodo: vi.fn(),
      updateTodo: vi.fn(),
      upsertLabelByName: vi.fn(),
    },
  };
});
vi.mock("@/lib/executors", () => ({
  executors: { setReminder: vi.fn(), sendMeetingInvite: vi.fn(), deepResearch: vi.fn() },
}));
vi.mock("@/lib/contacts", () => ({ contactResolverFor: vi.fn() }));

import { generateText, stepCountIs } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { toAiSdkTools } from "@/lib/agent-tools";
import type { UserCtx } from "@/lib/contracts";

const RUN = !!process.env.RUN_LLM_TESTS && !!process.env.GEMINI_API_KEY;
const user: UserCtx = { userId: "u1", email: "u1@t.local", plan: "unlimited" };

describe.skipIf(!RUN)("chat agent (live) — FIX9 capability", () => {
  it("answers 'what's due today?' by calling query_todos", async () => {
    const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });
    const result = await generateText({
      model: google("gemini-2.5-flash"),
      system:
        "You are Tada. Use query_todos to answer questions about due/overdue/filtered todos (it mirrors the app's Views). Read tools run without approval.",
      prompt: "What's due today?",
      tools: toAiSdkTools(user),
      stopWhen: stepCountIs(5),
    });
    const toolNames = result.steps.flatMap((s) => s.toolCalls.map((c) => c.toolName));
    expect(toolNames).toContain("query_todos");
    // and it should reference the actually-due item in its answer
    expect(result.text.toLowerCase()).toContain("tax");
  }, 45_000);
});
