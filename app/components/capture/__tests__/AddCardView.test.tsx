import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TadaProvider, useTada } from "@/app/lib/store";
import { AddCardView } from "../AddCardView";

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
    </div>
  );
}

afterEach(() => vi.restoreAllMocks());

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
      target: { value: "Plan offsite p1 @home" },
    });
    expect(screen.getByText("p1")).toHaveAttribute("data-kind", "priority");
    expect(screen.getByText("@home")).toHaveAttribute("data-kind", "label");
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

  it("creates an inline label from an @token on submit", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ todo: null }) })) as never;
    renderAdd();
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Call vet @pets" },
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

  it("offers AI enrichment chips after submit and applies one only on tap", async () => {
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

    // the created todo starts at priority "none"
    await waitFor(() => expect(screen.getByTestId("prios")).toHaveTextContent("none"));
    // suggestion surfaces as a tappable chip; nothing applied yet
    const chip = await screen.findByRole("button", { name: /add p1/i });
    expect(screen.getByTestId("prios")).toHaveTextContent("none");

    fireEvent.click(chip);
    await waitFor(() => expect(screen.getByTestId("prios")).toHaveTextContent("p1"));
    // chip consumed after applying
    expect(screen.queryByRole("button", { name: /add p1/i })).toBeNull();
  });

  it("only enriches with what the deterministic parse missed", async () => {
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
    // give the enrich promise a tick; the redundant p1 chip must not appear
    await Promise.resolve();
    expect(screen.queryByRole("button", { name: /add p1/i })).toBeNull();
  });

  it("does not submit an empty/whitespace title", () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    globalThis.fetch = fetchMock as never;
    renderAdd();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "   " } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(screen.getByTestId("count")).toHaveTextContent("0");
  });
});
