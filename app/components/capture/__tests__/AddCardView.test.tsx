import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TadaProvider, useTada } from "@/app/lib/store";
import { AddCardView } from "../AddCardView";

const reviewStart = vi.fn();
vi.mock("@/app/lib/useCaptureReview", () => ({
  useCaptureReviewContext: () => ({
    open: false,
    source: null,
    note: "",
    status: "describing",
    captureId: null,
    proposals: [],
    start: reviewStart,
    setNote: vi.fn(),
    extract: vi.fn(),
    editProposal: vi.fn(),
    removeProposal: vi.fn(),
    commit: vi.fn(),
    cancel: vi.fn(),
  }),
}));

function Probe() {
  const { state } = useTada();
  return (
    <div>
      <span data-testid="count">{state.todos.length}</span>
      <span data-testid="sel">{state.selection.kind}</span>
      <span data-testid="titles">{state.todos.map((t) => t.title).join("|")}</span>
      <span data-testid="labels">{state.labels.map((l) => l.name).join("|")}</span>
      <span data-testid="prios">{state.todos.map((t) => t.priority).join("|")}</span>
      <span data-testid="todolabels">
        {state.todos.map((t) => t.labelIds.length).join("|")}
      </span>
      <span data-testid="enrichment-todo-id">{state.enrichment?.todoId ?? ""}</span>
      <span data-testid="enrichment-chip-count">
        {state.enrichment?.chips.length ?? 0}
      </span>
    </div>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  reviewStart.mockClear();
});

function renderAdd(preload = {}) {
  return render(
    <TadaProvider preload={preload}>
      <Probe />
      <AddCardView />
    </TadaProvider>,
  );
}

describe("AddCardView (store-wired)", () => {
  it("live-highlights parsed tokens as you type", () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) })) as never;
    renderAdd();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Plan offsite p1 #home" },
    });
    expect(screen.getByText("p1")).toHaveAttribute("data-kind", "priority");
    expect(screen.getByText("#home")).toHaveAttribute("data-kind", "label");
  });

  it("submitting creates a plain todo instantly with the parsed title + priority", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ todo: null }),
    })) as never;
    renderAdd();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Plan offsite p1" },
    });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    await waitFor(() =>
      expect(screen.getByTestId("titles")).toHaveTextContent("Plan offsite"),
    );
    // input cleared for rapid add
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it("reconciles the optimistic row with the server todo — ONE row, no dup (FIX3)", async () => {
    globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url) === "/api/todos" && init?.method === "POST") {
        return {
          ok: true,
          json: async () => ({
            todo: {
              id: "cuid-server-1",
              createdAt: "2026-06-27T09:00:00",
              sourceCaptureId: "c1",
              title: "Buy stamps",
              status: "open",
              actionType: "none",
              actionState: "none",
              sortIndex: -1,
              priority: "none",
              labelIds: [],
            },
          }),
        };
      }
      return { ok: true, json: async () => ({ suggestions: [] }) };
    }) as never;
    renderAdd();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Buy stamps" },
    });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    // exactly one row, titled once (not "Buy stamps|Buy stamps")
    await waitFor(() => expect(screen.getByTestId("count")).toHaveTextContent("1"));
    expect(screen.getByTestId("titles")).toHaveTextContent("Buy stamps");
    expect(screen.getByTestId("titles").textContent).toBe("Buy stamps");
  });

  it("snaps selection back to All on submit (capture always lands in All)", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ todo: null }) })) as never;
    renderAdd({ selection: { kind: "today" } });
    expect(screen.getByTestId("sel")).toHaveTextContent("today");
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Quick thing" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    await waitFor(() => expect(screen.getByTestId("sel")).toHaveTextContent("all"));
  });

  it("creates an inline label from a #token on submit", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ todo: null }) })) as never;
    renderAdd();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Call vet #pets" },
    });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    await waitFor(() =>
      expect(screen.getByTestId("labels")).toHaveTextContent("pets"),
    );
  });

  it("dictation fills the quick-add text (same parse path)", () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) })) as never;
    // install a fake SpeechRecognition so the mic is enabled
    let instance: { onresult: ((e: unknown) => void) | null; start: () => void; stop: () => void } | null =
      null;
    (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition =
      function () {
        instance = { onresult: null, start: vi.fn(), stop: vi.fn() };
        return instance;
      };
    renderAdd();
    fireEvent.click(screen.getByRole("button", { name: /dictate/i }));
    act(() =>
      instance!.onresult?.({
        resultIndex: 0,
        results: [[{ transcript: "call the vet" }]],
      } as never),
    );
    expect(screen.getByRole("textbox")).toHaveValue("call the vet");
    delete (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition;
  });

  it("dispatches SET_ENRICHMENT to the store after submit — no chip in the add card itself", async () => {
    globalThis.fetch = vi.fn(async (url: string) => {
      if (String(url) === "/api/enrich") {
        return {
          ok: true,
          json: async () => ({
            suggestions: [
              { title: "Plan offsite", actionType: "none", suggestedPriority: "p1" },
            ],
          }),
        };
      }
      return { ok: true, json: async () => ({ todo: null }) };
    }) as never;
    renderAdd();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Plan offsite" },
    });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });

    // enrichment lands in the store (chip count > 0)
    await waitFor(() =>
      expect(screen.getByTestId("enrichment-chip-count")).toHaveTextContent("1"),
    );
    // the add card itself must NOT render any chip button — chips are on the row
    expect(screen.queryByRole("button", { name: /add p1/i })).toBeNull();
    // priority unchanged — no auto-apply
    expect(screen.getByTestId("prios")).toHaveTextContent("none");
  });

  it("only enriches with what the deterministic parse missed — no store enrichment for redundant chips", async () => {
    globalThis.fetch = vi.fn(async (url: string) => {
      if (String(url) === "/api/enrich") {
        return {
          ok: true,
          json: async () => ({
            // suggests p1 — but the user already typed p1, so no chip
            suggestions: [
              { title: "Ship it", actionType: "none", suggestedPriority: "p1" },
            ],
          }),
        };
      }
      return { ok: true, json: async () => ({ todo: null }) };
    }) as never;
    renderAdd();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Ship it p1" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    await waitFor(() => expect(screen.getByTestId("prios")).toHaveTextContent("p1"));
    // give the enrich promise a tick; the redundant p1 chip must not appear in the store
    await Promise.resolve();
    expect(screen.getByTestId("enrichment-chip-count")).toHaveTextContent("0");
  });

  it("does not submit an empty/whitespace title", () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    globalThis.fetch = fetchMock as never;
    renderAdd();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "   " } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(screen.getByTestId("count")).toHaveTextContent("0");
  });

  it("a single short line still creates a plain todo instantly and does NOT open review", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ todo: null }) }));
    globalThis.fetch = fetchMock as never;
    renderAdd();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "buy milk" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    await waitFor(() =>
      expect(screen.getByTestId("titles")).toHaveTextContent("buy milk"),
    );
    expect(reviewStart).not.toHaveBeenCalled();
  });

  it("multi-line text opens the review instead of creating a todo directly", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ todo: null }) }));
    globalThis.fetch = fetchMock as never;
    renderAdd();
    const multiline = "call bank\nemail dakota\nbook room";
    fireEvent.change(screen.getByRole("textbox"), { target: { value: multiline } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    await waitFor(() => expect(reviewStart).toHaveBeenCalledWith({ kind: "text", text: multiline }));
    // nothing created directly — no optimistic todo, no POST to /api/todos
    expect(screen.getByTestId("count")).toHaveTextContent("0");
    expect(fetchMock).not.toHaveBeenCalled();
    // input cleared
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it("a long single line (>140 chars) also opens review instead of instant add", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ todo: null }) }));
    globalThis.fetch = fetchMock as never;
    renderAdd();
    const longLine = "a".repeat(141);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: longLine } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    await waitFor(() => expect(reviewStart).toHaveBeenCalledWith({ kind: "text", text: longLine }));
    expect(screen.getByTestId("count")).toHaveTextContent("0");
  });

  it("the screenshot affordance has a clear accessible label", () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) })) as never;
    renderAdd();
    expect(
      screen.getByRole("button", { name: "Add a screenshot — Tada turns it into todos" }),
    ).toBeInTheDocument();
  });

  it("shows the hint only while the input is empty", () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) })) as never;
    renderAdd();
    expect(
      screen.getByText(/paste or upload a screenshot, or type a paragraph/i),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "buy milk" } });
    expect(
      screen.queryByText(/paste or upload a screenshot, or type a paragraph/i),
    ).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "" } });
    expect(
      screen.getByText(/paste or upload a screenshot, or type a paragraph/i),
    ).toBeInTheDocument();
  });

  it("whitespace-only submit does nothing — no todo, no review, no dispatch", () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    globalThis.fetch = fetchMock as never;
    renderAdd();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "  \n  " } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(screen.getByTestId("count")).toHaveTextContent("0");
    expect(reviewStart).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
