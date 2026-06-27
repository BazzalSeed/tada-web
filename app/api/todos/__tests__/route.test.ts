// @vitest-environment node
// T1.2 — CRUD route handler tests. No DB: the store + currentUser boundary are
// mocked so we assert request parsing, capture-first wiring, response shapes,
// and status codes. The store itself is integration-tested in lib/__tests__.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({ currentUser: vi.fn() }));
vi.mock("@/lib/store", () => ({
  store: {
    listTodos: vi.fn(),
    createCapture: vi.fn(),
    createTodo: vi.fn(),
    updateTodo: vi.fn(),
    reorderTodo: vi.fn(),
  },
}));

import { currentUser } from "@/lib/auth";
import { store } from "@/lib/store";
import { GET as listTodos, POST as createTodo } from "@/app/api/todos/route";
import { PATCH as patchTodo } from "@/app/api/todos/[id]/route";
import { POST as reorderTodo } from "@/app/api/todos/[id]/reorder/route";

const user = { userId: "u1", email: "u1@test.local", plan: "free" as const };
const mockUser = currentUser as unknown as ReturnType<typeof vi.fn>;

const req = (body: unknown) =>
  new Request("http://localhost/api/todos", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mockUser.mockResolvedValue(user);
});

describe("GET /api/todos", () => {
  it("returns the owner's todos in a { todos } envelope", async () => {
    (store.listTodos as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "t1", title: "a" },
      { id: "t2", title: "b" },
    ]);
    const res = await listTodos(new Request("http://localhost/api/todos"));
    expect(res.status).toBe(200);
    expect(store.listTodos).toHaveBeenCalledWith("u1");
    expect((await res.json()).todos.map((t: { id: string }) => t.id)).toEqual(["t1", "t2"]);
  });

  it("returns 401 when unauthenticated", async () => {
    mockUser.mockRejectedValue(new Error("unauthorized"));
    const res = await listTodos(new Request("http://localhost/api/todos"));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/todos", () => {
  it("is capture-first: creates a text Capture, then the todo", async () => {
    (store.createCapture as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "cap1",
      kind: "text",
    });
    (store.createTodo as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "t1",
      title: "buy milk",
    });

    const res = await createTodo(req({ title: "buy milk" }));
    expect(res.status).toBe(201);
    expect(store.createCapture).toHaveBeenCalledWith("u1", expect.objectContaining({ kind: "text" }));
    // todo must reference the freshly-created capture
    expect(store.createTodo).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ title: "buy milk", sourceCaptureId: "cap1" }),
    );
    const json = await res.json();
    expect(json.todo.id).toBe("t1");
  });

  it("rejects an empty title with 400", async () => {
    const res = await createTodo(req({ title: "  " }));
    expect(res.status).toBe(400);
    expect(store.createTodo).not.toHaveBeenCalled();
  });

  it("returns 401 when unauthenticated", async () => {
    mockUser.mockRejectedValue(new Error("unauthorized"));
    const res = await createTodo(req({ title: "x" }));
    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/todos/:id", () => {
  it("patches and returns the updated todo", async () => {
    (store.updateTodo as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "t1",
      priority: "p1",
    });
    const res = await patchTodo(
      new Request("http://localhost/api/todos/t1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ priority: "p1" }),
      }),
      { params: Promise.resolve({ id: "t1" }) },
    );
    expect(res.status).toBe(200);
    expect(store.updateTodo).toHaveBeenCalledWith("u1", "t1", { priority: "p1" });
    expect((await res.json()).todo.priority).toBe("p1");
  });

  it("returns 404 when the todo is not the owner's / missing", async () => {
    (store.updateTodo as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("todo not found"),
    );
    const res = await patchTodo(
      new Request("http://localhost/api/todos/nope", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: "x" }),
      }),
      { params: Promise.resolve({ id: "nope" }) },
    );
    expect(res.status).toBe(404);
  });
});

describe("POST /api/todos/:id/reorder", () => {
  it("reorders via fractional index and returns the todo", async () => {
    (store.reorderTodo as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "t1",
      sortIndex: 5,
    });
    const res = await reorderTodo(
      new Request("http://localhost/api/todos/t1/reorder", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ beforeId: "a", afterId: "b" }),
      }),
      { params: Promise.resolve({ id: "t1" }) },
    );
    expect(res.status).toBe(200);
    expect(store.reorderTodo).toHaveBeenCalledWith("u1", "t1", "a", "b");
    expect((await res.json()).todo.sortIndex).toBe(5);
  });
});
