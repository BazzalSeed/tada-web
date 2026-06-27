import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Todo } from "@/lib/contracts";
import { TadaProvider, useTada } from "@/app/lib/store";
import { DetailPaneView } from "../DetailPaneView";

const todo: Todo = {
  id: "t1",
  createdAt: "2026-06-26T09:00:00",
  sourceCaptureId: "c1",
  title: "Email Dakota",
  detail: "",
  status: "open",
  actionType: "none",
  actionState: "none",
  sortIndex: 0,
  priority: "none",
  labelIds: [],
};

function Probe() {
  const { state } = useTada();
  const t = state.todos.find((x) => x.id === "t1");
  return (
    <div>
      <span data-testid="title">{t?.title}</span>
      <span data-testid="prio">{t?.priority}</span>
      <span data-testid="sel">{String(state.selectedTodoId)}</span>
    </div>
  );
}

afterEach(() => vi.restoreAllMocks());

function renderView() {
  return render(
    <TadaProvider preload={{ todos: [todo], selectedTodoId: "t1" }}>
      <Probe />
      <DetailPaneView todo={todo} />
    </TadaProvider>,
  );
}

describe("DetailPaneView (store-wired)", () => {
  it("optimistically persists a priority change", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ todo: { ...todo, priority: "p1" } }),
    })) as never;
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /set priority p1/i }));
    await waitFor(() => expect(screen.getByTestId("prio")).toHaveTextContent("p1"));
  });

  it("closing clears the selection", () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) })) as never;
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /close detail/i }));
    expect(screen.getByTestId("sel")).toHaveTextContent("null");
  });

  it("keeps the optimistic edit when persistence fails (pre-auth interim)", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("no user");
    }) as never;
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /set priority p2/i }));
    await waitFor(() => expect(screen.getByTestId("prio")).toHaveTextContent("p2"));
  });
});
