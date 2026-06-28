import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TadaProvider, useTada } from "@/app/lib/store";

// Mock the capture seam — same pattern as CaptureZone.test.tsx
const captureImageFile = vi.fn();
vi.mock("@/app/lib/capture", () => ({
  captureImageFile: (f: File) => captureImageFile(f),
  captureText: vi.fn(),
}));

import { AddCardView } from "../AddCardView";

function Probe() {
  const { state } = useTada();
  return (
    <span data-testid="titles">{state.todos.map((t) => t.title).join("|")}</span>
  );
}

function renderAddCard() {
  return render(
    <TadaProvider>
      <Probe />
      <AddCardView />
    </TadaProvider>,
  );
}

function pngFile() {
  return new File([new Uint8Array([1, 2, 3])], "shot.png", { type: "image/png" });
}

afterEach(() => {
  captureImageFile.mockReset();
  vi.restoreAllMocks();
});

describe("AddCardView — screenshot upload button", () => {
  it("renders an 'Upload screenshot' button in the add bar", () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) })) as never;
    renderAddCard();
    expect(
      screen.getByRole("button", { name: /upload screenshot/i }),
    ).toBeInTheDocument();
  });

  it("calls captureImageFile and dispatches the returned todo when a file is chosen", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) })) as never;
    captureImageFile.mockResolvedValue({
      capture: { id: "cap1", createdAt: "x", kind: "image", blobPath: "b" },
      todos: [
        {
          id: "t1",
          createdAt: "x",
          sourceCaptureId: "cap1",
          title: "Screenshot todo",
          status: "open",
          actionType: "none",
          actionState: "none",
          sortIndex: 0,
          priority: "none",
          labelIds: [],
        },
      ],
    });
    renderAddCard();
    // The hidden file input is in the DOM; trigger a change event on it.
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).not.toBeNull();
    fireEvent.change(fileInput, { target: { files: [pngFile()] } });
    await waitFor(() =>
      expect(screen.getByTestId("titles")).toHaveTextContent("Screenshot todo"),
    );
    expect(captureImageFile).toHaveBeenCalledTimes(1);
  });

  it("shows an inline error alert if ingest fails — never silent", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) })) as never;
    const consoleErr = vi.spyOn(console, "error").mockImplementation(() => {});
    captureImageFile.mockRejectedValue(new Error("401"));
    renderAddCard();
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [pngFile()] } });
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/couldn't capture|try again/i),
    );
    expect(consoleErr).toHaveBeenCalled();
  });

  it("dismissing the error alert clears it", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) })) as never;
    vi.spyOn(console, "error").mockImplementation(() => {});
    captureImageFile.mockRejectedValue(new Error("401"));
    renderAddCard();
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [pngFile()] } });
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
