import { afterEach, describe, expect, it, vi } from "vitest";
import type { Todo } from "@/lib/contracts";
import { createTodo, patchTodo, reorderTodo } from "../api";

const todo: Todo = {
  id: "t1",
  createdAt: "2026-06-26T09:00:00",
  sourceCaptureId: "c1",
  title: "Email Dakota",
  status: "open",
  actionType: "none",
  actionState: "none",
  sortIndex: 0,
  priority: "none",
  labelIds: [],
};

function mockFetch(body: unknown, ok = true, status = 200) {
  const fn = vi.fn(async () => ({
    ok,
    status,
    json: async () => body,
  })) as unknown as typeof fetch;
  globalThis.fetch = fn;
  return fn as unknown as ReturnType<typeof vi.fn>;
}

afterEach(() => vi.restoreAllMocks());

describe("api client", () => {
  it("patchTodo PATCHes /api/todos/:id and unwraps { todo }", async () => {
    const fetchMock = mockFetch({ todo: { ...todo, status: "done" } });
    const result = await patchTodo("t1", { status: "done" });
    expect(result.status).toBe("done");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/todos/t1");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ status: "done" });
  });

  it("reorderTodo POSTs neighbors to /reorder", async () => {
    const fetchMock = mockFetch({ todo: { ...todo, sortIndex: 1.5 } });
    const result = await reorderTodo("t1", "a", "b");
    expect(result.sortIndex).toBe(1.5);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/todos/t1/reorder");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ beforeId: "a", afterId: "b" });
  });

  it("createTodo POSTs a draft to /api/todos", async () => {
    const fetchMock = mockFetch({ todo });
    const result = await createTodo({ title: "Email Dakota" });
    expect(result.id).toBe("t1");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/todos");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ title: "Email Dakota" });
  });

  it("throws on a non-ok response", async () => {
    mockFetch({ error: "nope" }, false, 500);
    await expect(patchTodo("t1", { status: "done" })).rejects.toThrow();
  });
});
