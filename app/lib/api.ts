import type { Capture, ExtractedTodo, Todo, TodoLabel } from "@/lib/contracts";

// Typed client for the frozen front↔back todo routes. Every endpoint returns a
// `{ todo }` envelope; these unwrap to the bare Todo. Wire keys are snake_case
// on the DB but the JSON contract is camelCase (matches the Todo type 1:1).

// Fields a client may set on create (server owns id/createdAt/sourceCaptureId).
export type TodoDraft = Partial<
  Pick<
    Todo,
    | "title"
    | "detail"
    | "dueAt"
    | "reminderAt"
    | "priority"
    | "labelIds"
    | "listId"
    | "recurrence"
    | "parentId"
    | "actionType"
    | "actionPayload"
    | "sortIndex"
  >
> & { note?: string };

async function send<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    throw new Error(`${init.method ?? "GET"} ${url} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// Load the owner's full flat pool (client-side filtering stays ours). 401s until
// auth; the app boots empty in that case rather than showing stale seed data.
export async function listTodos(): Promise<Todo[]> {
  const { todos } = await send<{ todos: Todo[] }>("/api/todos", {
    method: "GET",
  });
  return todos;
}

export async function listCaptures(): Promise<Capture[]> {
  const { captures } = await send<{ captures: Capture[] }>("/api/captures", {
    method: "GET",
  });
  return captures;
}

export async function createTodo(draft: TodoDraft): Promise<Todo> {
  const { todo } = await send<{ todo: Todo }>("/api/todos", {
    method: "POST",
    body: JSON.stringify(draft),
  });
  return todo;
}

export async function patchTodo(
  id: string,
  patch: Partial<Todo>,
): Promise<Todo> {
  const { todo } = await send<{ todo: Todo }>(`/api/todos/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return todo;
}

// Async quick-add enrichment (T2.5). Non-mutating: returns AI SUGGESTIONS for the
// just-created todo; the UI folds them into tappable chips and applies accepted
// ones via patchTodo. Never auto-applied.
export async function enrichText(text: string): Promise<ExtractedTodo[]> {
  const { suggestions } = await send<{ suggestions: ExtractedTodo[] }>(
    "/api/enrich",
    { method: "POST", body: JSON.stringify({ text }) },
  );
  return suggestions;
}

// Waitlist (T4.1). Public, idempotent on normalized email. `alreadyJoined`
// lets the UI distinguish a fresh join from a repeat, though both succeed.
export async function joinWaitlist(
  email: string,
): Promise<{ ok: boolean; alreadyJoined?: boolean }> {
  return send<{ ok: boolean; alreadyJoined?: boolean }>("/api/waitlist", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

// Labels (T1.2b). Persisted so ids are stable across the filter-builder, inline
// label-create, and enrichment's name→id resolution.
export async function listLabels(): Promise<TodoLabel[]> {
  const { labels } = await send<{ labels: TodoLabel[] }>("/api/labels", {
    method: "GET",
  });
  return labels;
}

// Upsert a label by name (lowercased, idempotent) → its persisted TodoLabel.
export async function ensureLabel(name: string): Promise<TodoLabel> {
  const { label } = await send<{ label: TodoLabel }>("/api/labels", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  return label;
}

export async function reorderTodo(
  id: string,
  beforeId: string | null,
  afterId: string | null,
): Promise<Todo> {
  const { todo } = await send<{ todo: Todo }>(`/api/todos/${id}/reorder`, {
    method: "POST",
    body: JSON.stringify({ beforeId, afterId }),
  });
  return todo;
}
