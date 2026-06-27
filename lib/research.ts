// ============================================================================
// T3.2 — deep research runner. Research is the only agent loop. Runs under
// withQuota(deepResearch) (reserves 10, refunds on failure), streams progress,
// and writes the Markdown report into todo.detail (actionState → done). v0 runs
// synchronously within the request; progress is exposed via the todo + an
// optional SSE on GET /api/research/:id.
// ============================================================================

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

export async function runResearch(
  todo: Todo,
  user: UserCtx,
  deps: ResearchDeps = {},
  onProgress?: (s: string) => void,
): Promise<ResearchResult> {
  const store = deps.store ?? defaultStore;
  const executors = deps.executors ?? defaultExecutors;
  try {
    const { markdown } = await withQuota(user, "deepResearch", () =>
      executors.deepResearch({ kind: "research", topic: topicFor(todo) }, onProgress),
    );
    await store.updateTodo(user.userId, todo.id, {
      detail: markdown,
      actionState: "done",
      actionExternalId: "research",
    });
    return { ok: true, markdown };
  } catch (err) {
    // withQuota already refunded the reservation on throw.
    await store
      .updateTodo(user.userId, todo.id, { actionState: "failed" })
      .catch(() => undefined);
    return { ok: false, error: err instanceof Error ? err.message : "research failed" };
  }
}
