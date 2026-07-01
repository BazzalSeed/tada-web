import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TadaProvider, useTada } from "@/app/lib/store";

// Mock the capture seam so no real upload/fetch happens.
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

import { CaptureZone } from "../CaptureZone";

function Probe() {
  const { state } = useTada();
  return (
    <div>
      <span data-testid="todos">{state.todos.map((t) => t.title).join("|")}</span>
      <span data-testid="captures">{Object.keys(state.captures).join("|")}</span>
    </div>
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

describe("CaptureZone (store-wired)", () => {
  it("on image drop: opens the review card instead of capturing instantly", async () => {
    render(
      <TadaProvider>
        <Probe />
        <CaptureZone>
          <div>content</div>
        </CaptureZone>
      </TadaProvider>,
    );
    const file = pngFile();
    fireEvent.drop(screen.getByTestId("dropzone"), {
      dataTransfer: { files: [file], items: [] },
    });
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    expect(start).toHaveBeenCalledWith({ kind: "image", file });
    expect(captureImageFile).not.toHaveBeenCalled();
    expect(screen.getByTestId("todos")).toHaveTextContent("");
    expect(screen.getByTestId("captures")).toHaveTextContent("");
  });

  it("captures images pasted anywhere (global paste) by opening the review card", async () => {
    render(
      <TadaProvider>
        <Probe />
        <CaptureZone>
          <div>content</div>
        </CaptureZone>
      </TadaProvider>,
    );
    const file = pngFile();
    const paste = new Event("paste", { bubbles: true }) as Event & {
      clipboardData: unknown;
    };
    paste.clipboardData = {
      items: [{ kind: "file", type: "image/png", getAsFile: () => file }],
    };
    window.dispatchEvent(paste);
    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    expect(start).toHaveBeenCalledWith({ kind: "image", file });
  });
});
