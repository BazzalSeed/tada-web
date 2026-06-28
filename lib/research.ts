// ============================================================================
// T3.2 — deep research runner. Research is the only agent loop. Runs under
// withQuota(deepResearch) (reserves 10, refunds on failure), streams progress,
// and writes the Markdown report into todo.detail (actionState → done). v0 runs
// synchronously within the request; progress is exposed via the todo + an
// optional SSE on GET /api/research/:id.
// ============================================================================

import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { withQuota } from "./quota";
import { executors as defaultExecutors } from "./executors";
import { store as defaultStore } from "./store";
import type { Executors, TadaStore, Todo, UserCtx } from "./contracts";

export interface ResearchResult {
  ok: boolean;
  markdown?: string;
  error?: string;
}

export interface ResearchDeps {
  store?: TadaStore;
  executors?: Executors;
}

// Derives the research topic from the todo (research payload topic, else title).
function topicFor(todo: Todo): string {
  if (todo.actionPayload?.kind === "research") return todo.actionPayload.topic;
  return todo.title;
}

// Append text to a parent goal's notes (preserving what's there), so a prep
// subtask can feed the meeting/goal it belongs to.
async function appendDetail(
  store: TadaStore,
  userId: string,
  todoId: string,
  text: string,
): Promise<void> {
  const target = (await store.listTodos(userId)).find((t) => t.id === todoId);
  if (!target) return;
  const detail = target.detail ? `${target.detail}\n\n${text}` : text;
  await store.updateTodo(userId, todoId, { detail });
}

// Condense a full research report to 1-2 sentences of actionable prep context for
// the parent goal's notes — we DON'T dump the whole report up to the parent (or
// the meeting invite). Cheap Flash call; falls back to the first line on error.
async function prepSummary(markdown: string): Promise<string> {
  try {
    const google = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });
    const { text } = await generateText({
      model: google("gemini-2.5-flash"),
      system:
        "Condense the research below into ONE or TWO plain sentences of actionable prep context. No preamble, no markdown, no headings — just the sentences.",
      prompt: markdown,
    });
    const s = text.trim();
    if (s) return s;
  } catch {
    /* fall through to the heuristic */
  }
  const line = markdown
    .split("\n")
    .map((l) => l.replace(/[#*>`-]/g, "").trim())
    .find(Boolean);
  return line ?? "Research complete — open the subtask for the full report.";
}

export async function runResearch(
  todo: Todo,
  user: UserCtx,
  deps: ResearchDeps = {},
  onProgress?: (s: string) => void,
): Promise<ResearchResult> {
  const store = deps.store ?? defaultStore;
  const executors = deps.executors ?? defaultExecutors;
  try {
    // Mark the research task in-flight so the tile can show a spinner (best effort).
    try {
      await store.updateTodo(user.userId, todo.id, { actionState: "running" });
    } catch {
      /* non-fatal — proceed with the research */
    }
    const { markdown } = await withQuota(user, "deepResearch", () =>
      executors.deepResearch({ kind: "research", topic: topicFor(todo) }, onProgress),
    );
    // The FULL report always lives on THIS todo's notes (open the subtask to read
    // it). When it's a prep subtask, only a short summary goes up to the parent —
    // we never dump the whole report into the goal's notes (or the invite).
    await store.updateTodo(user.userId, todo.id, {
      detail: markdown,
      actionState: "done",
      actionExternalId: "research",
    });
    if (todo.parentId) {
      const summary = await prepSummary(markdown);
      // Summary on the parent + an in-note link to THIS subtask's full report.
      await appendDetail(
        store,
        user.userId,
        todo.parentId,
        `**Prep research:** ${summary} [→ full report](todo:${todo.id})`,
      );
    }
    return { ok: true, markdown };
  } catch (err) {
    // withQuota already refunded the reservation on throw.
    await store
      .updateTodo(user.userId, todo.id, { actionState: "failed" })
      .catch(() => undefined);
    return { ok: false, error: err instanceof Error ? err.message : "research failed" };
  }
}
