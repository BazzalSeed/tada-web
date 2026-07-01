import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TadaProvider, useTada } from "@/app/lib/store";

// Mock the capture seam — same pattern as CaptureZone.test.tsx
const captureImageFile = vi.fn();
vi.mock("@/app/lib/capture", () => ({
  captureImageFile: (f: File) => captureImageFile(f),
  captureText: vi.fn(),
}));

// Image ingest now opens the shared review card instead of capturing
// instantly (Task 6) — mock the review context and assert start() is called.
const start = vi.fn();
vi.mock("@/app/lib/useCaptureReview", () => ({
  useCaptureReviewContext: () => ({
    open: false,
    source: null,
    note: "",
    status: "describing",
    captureId: null,
    proposals: [],
    start,
    setNote: vi.fn(),
    extract: vi.fn(),
    editProposal: vi.fn(),
    removeProposal: vi.fn(),
    commit: vi.fn(),
    cancel: vi.fn(),
  }),
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
  start.mockReset();
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

  it("opens the review card (does not capture instantly) when a file is chosen", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({}) })) as never;
    renderAddCard();
    // The hidden file input is in the DOM; trigger a change event on it.
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).not.toBeNull();
    const file = pngFile();
    fireEvent.change(fileInput, { target: { files: [file] } });
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    expect(start).toHaveBeenCalledWith({ kind: "image", file });
    expect(captureImageFile).not.toHaveBeenCalled();
    expect(screen.getByTestId("titles")).toHaveTextContent("");
  });
});
