import type {
  Attendee,
  Capture,
  ExtractedTodo,
  ProposeResult,
  Todo,
  TodoLabel,
} from "@/lib/contracts";
import type { CaptureRequest } from "@/lib/capture";

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
    // Never serve a per-user API response from the browser cache — otherwise a
    // GET (/api/todos) can replay the previous account's data after a switch.
    cache: "no-store",
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

// Delete a label and strip it from all todos (atomic server-side transaction).
export async function deleteLabel(id: string): Promise<void> {
  await send<{ ok: boolean }>(`/api/labels/${id}`, { method: "DELETE" });
}

// The "do it for me" tap path (FIX2). POST /api/todos/:id/finish dispatches on
// actionType (meeting/reminder deterministic; research via the agent) and returns
// the ExecResult — incl. `needsField` (one inline ask) and `needsDisambiguation`
// (attendee candidates). `markdown` is present for a finished research run. The
// server already persisted the new actionState; the client mirrors it locally.
export interface FinishResponse {
  ok: boolean;
  actionExternalId?: string;
  actionLink?: string;
  error?: string;
  needsField?: string;
  needsDisambiguation?: Attendee[];
  markdown?: string;
}

export async function finishTodo(id: string): Promise<FinishResponse> {
  return send<FinishResponse>(`/api/todos/${id}/finish`, { method: "POST" });
}

// Resolve raw attendee names → Attendee[] (resolved email or unresolved+candidates)
// via POST /api/contacts/resolve, so the meeting card confirms contacts before Send.
export async function resolveContacts(names: string[]): Promise<Attendee[]> {
  const { attendees } = await send<{ attendees: Attendee[] }>("/api/contacts/resolve", {
    method: "POST",
    body: JSON.stringify({ names }),
  });
  return attendees;
}

// Persist the browser's IANA timezone so bookings anchor to the user's real zone.
// Fire-and-forget on app load; failures are non-fatal (booking falls back).
export async function setTimezone(timezone: string): Promise<void> {
  await send("/api/me/timezone", {
    method: "POST",
    body: JSON.stringify({ timezone }),
  });
}

// Clear a conversation's message history (DELETE /api/chat). The caller is
// responsible for remounting the chat with a fresh conversationId afterwards.
export async function clearChat(conversationId: string): Promise<void> {
  await send<{ ok: boolean }>(
    `/api/chat?conversationId=${encodeURIComponent(conversationId)}`,
    { method: "DELETE" },
  );
}

// Review-and-approve capture (Task 1-2 backend): extract without persisting so
// the UI can show the AI's proposal before any todo is written.
export async function proposeCapture(
  body: CaptureRequest,
): Promise<ProposeResult> {
  return send<ProposeResult>("/api/capture/propose", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// Persist the user-approved (and possibly edited) todos from a prior propose.
export async function commitCapture(
  captureId: string,
  todos: ExtractedTodo[],
): Promise<Todo[]> {
  const { todos: created } = await send<{ todos: Todo[] }>(
    "/api/capture/commit",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ captureId, todos }),
    },
  );
  return created;
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
