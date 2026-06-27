import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("does not submit an empty/whitespace title", () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    globalThis.fetch = fetchMock as never;
    renderAdd();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "   " } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" });
    expect(screen.getByTestId("count")).toHaveTextContent("0");
  });
});
