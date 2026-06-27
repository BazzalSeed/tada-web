import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TadaProvider, useEnsureLabel, useTada } from "../store";

afterEach(() => vi.restoreAllMocks());

function Probe() {
  const ensureLabel = useEnsureLabel();
  const { state } = useTada();
  return (
    <div>
      <button onClick={() => ensureLabel("Pets")}>add</button>
      <span data-testid="ids">{state.labels.map((l) => l.id).join(",")}</span>
      <span data-testid="names">{state.labels.map((l) => l.name).join(",")}</span>
    </div>
  );
}

describe("useEnsureLabel", () => {
  it("lowercases, shows an optimistic label immediately, then reconciles to the persisted id", async () => {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ label: { id: "l-pets", name: "pets", colorHex: "#c8632e" } }),
    })) as never;

    render(
      <TadaProvider>
        <Probe />
      </TadaProvider>,
    );
    fireEvent.click(screen.getByText("add"));

    // optimistic: a temp (non-persisted) label exists immediately, lowercased
    expect(screen.getByTestId("names")).toHaveTextContent("pets");
    expect(screen.getByTestId("ids").textContent).not.toBe("l-pets");

    // background POST /api/labels reconciles the temp id → server id
    await waitFor(() =>
      expect(screen.getByTestId("ids")).toHaveTextContent("l-pets"),
    );
    expect(screen.getByTestId("names").textContent).toBe("pets");
  });

  it("reuses an existing label (case-insensitive) without a network call", () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as never;
    render(
      <TadaProvider preload={{ labels: [{ id: "l1", name: "pets", colorHex: "#c8632e" }] }}>
        <Probe />
      </TadaProvider>,
    );
    fireEvent.click(screen.getByText("add"));
    // existing "pets" matched (input "Pets" lowercased) → no second label, no POST
    expect(screen.getByTestId("ids").textContent).toBe("l1");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
