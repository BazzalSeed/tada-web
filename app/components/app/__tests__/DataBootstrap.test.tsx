import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TadaProvider, useTada } from "@/app/lib/store";

const listTodos = vi.fn();
const listLabels = vi.fn();
const listCaptures = vi.fn();
vi.mock("@/app/lib/api", () => ({
  listTodos: () => listTodos(),
  listLabels: () => listLabels(),
  listCaptures: () => listCaptures(),
}));

import { DataBootstrap } from "../DataBootstrap";

function Probe() {
  const { state } = useTada();
  return (
    <div>
      <span data-testid="todos">{state.todos.map((t) => t.title).join("|")}</span>
      <span data-testid="labels">{state.labels.map((l) => l.name).join("|")}</span>
      <span data-testid="captures">
        {Object.values(state.captures)
          .map((c) => c.blobPath)
          .join("|")}
      </span>
    </div>
  );
}

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("DataBootstrap", () => {
  it("hydrates todos + labels + captures from the live API on mount", async () => {
    listTodos.mockResolvedValue([
      {
        id: "t1",
        createdAt: "x",
        sourceCaptureId: "cap1",
        title: "Real loaded todo",
        status: "open",
        actionType: "none",
        actionState: "none",
        sortIndex: 0,
        priority: "none",
        labelIds: [],
      },
    ]);
    listLabels.mockResolvedValue([{ id: "l1", name: "work", colorHex: "#c8632e" }]);
    listCaptures.mockResolvedValue([
      { id: "cap1", createdAt: "x", kind: "image", blobPath: "https://blob/shot.png" },
    ]);

    render(
      <TadaProvider>
        <Probe />
        <DataBootstrap />
      </TadaProvider>,
    );
    await waitFor(() =>
      expect(screen.getByTestId("todos")).toHaveTextContent("Real loaded todo"),
    );
    expect(screen.getByTestId("labels")).toHaveTextContent("work");
    // Captures hydrate keyed by id → the row thumbnail's blobPath survives reload.
    expect(screen.getByTestId("captures")).toHaveTextContent("https://blob/shot.png");
  });

  it("leaves the store empty and warns when the load fails (e.g. unauthenticated)", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    listTodos.mockRejectedValue(new Error("401"));
    listLabels.mockRejectedValue(new Error("401"));
    listCaptures.mockRejectedValue(new Error("401"));
    render(
      <TadaProvider>
        <Probe />
        <DataBootstrap />
      </TadaProvider>,
    );
    await waitFor(() => expect(consoleWarn).toHaveBeenCalled());
    expect(screen.getByTestId("todos")).toHaveTextContent("");
  });

  it("still hydrates the todos when a sibling fetch fails transiently (FIX resilience)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    listTodos.mockResolvedValue([
      {
        id: "t1",
        createdAt: "x",
        sourceCaptureId: "cap1",
        title: "Survives a captures 500",
        status: "open",
        actionType: "none",
        actionState: "none",
        sortIndex: 0,
        priority: "none",
        labelIds: [],
      },
    ]);
    listLabels.mockResolvedValue([{ id: "l1", name: "work", colorHex: "#c8632e" }]);
    // captures fails on the first round, then recovers — the todos must NOT be
    // blanked by the sibling failure (the old Promise.all behavior).
    listCaptures
      .mockRejectedValueOnce(new Error("57P01"))
      .mockResolvedValue([
        { id: "cap1", createdAt: "x", kind: "image", blobPath: "https://blob/shot.png" },
      ]);
    render(
      <TadaProvider>
        <Probe />
        <DataBootstrap />
      </TadaProvider>,
    );
    // todos appear despite the captures failure on the first attempt
    await waitFor(() =>
      expect(screen.getByTestId("todos")).toHaveTextContent("Survives a captures 500"),
    );
    // and the retry eventually fills the captures too
    await waitFor(() =>
      expect(screen.getByTestId("captures")).toHaveTextContent("https://blob/shot.png"),
    );
  });
});
