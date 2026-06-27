import type { Todo } from "@/lib/contracts";

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
