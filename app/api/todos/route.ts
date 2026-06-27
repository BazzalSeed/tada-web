// POST /api/todos — manual quick-add (deterministic, no LLM).
// Capture-first: every Todo references a Capture (FK), so a manual add persists a
// lightweight text Capture, then the plain Todo. Body is a Todo draft.
import { currentUser } from "@/lib/auth";
import type { Todo } from "@/lib/contracts";
import { store } from "@/lib/store";
import { badRequest, handleApiError, json, readJson } from "@/lib/http";

// Fields a client may set on create (server owns id/createdAt/sourceCaptureId).
type CreateBody = Partial<
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

// GET /api/todos — the owner's full flat pool (one read; client filters via
// applyFilter/criteriaFor). Deterministic, no LLM.
export async function GET(_req: Request): Promise<Response> {
  try {
    const user = await currentUser();
    const todos = await store.listTodos(user.userId);
    return json({ todos });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const user = await currentUser();
    const body = await readJson<CreateBody>(req);
    const title = (body.title ?? "").trim();
    if (!title) throw badRequest("title is required");

    const capture = await store.createCapture(user.userId, {
      kind: "text",
      note: body.note ?? title,
    });
    const { note: _note, ...draft } = body;
    const todo = await store.createTodo(user.userId, {
      ...draft,
      title,
      sourceCaptureId: capture.id,
    });
    return json({ todo }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
