import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, screen } from "@testing-library/react";
import { TadaProvider, useTada } from "@/app/lib/store";

// The instant-capture seam must NOT be called anymore — image ingest opens
// the review card instead (Task 6).
const captureImageFile = vi.fn();
vi.mock("@/app/lib/capture", () => ({
  captureImageFile: (f: File) => captureImageFile(f),
  captureText: vi.fn(),
}));

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

import { useImageCapture } from "@/app/lib/useImageCapture";

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

describe("useImageCapture", () => {
  it("opens the review card against the first image — does not capture instantly", async () => {
    const { result } = renderHook(() => useImageCapture(), {
      wrapper: ({ children }) => (
        <TadaProvider>
          <Probe />
          {children}
        </TadaProvider>
      ),
    });
    const file = pngFile();
    await act(async () => {
      await result.current.ingest([file]);
    });
    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith({ kind: "image", file });
    expect(captureImageFile).not.toHaveBeenCalled();
    expect(screen.getByTestId("todos")).toHaveTextContent("");
    expect(screen.getByTestId("captures")).toHaveTextContent("");
  });

  it("does nothing when given an empty file list", async () => {
    const { result } = renderHook(() => useImageCapture(), {
      wrapper: ({ children }) => <TadaProvider>{children}</TadaProvider>,
    });
    await act(async () => {
      await result.current.ingest([]);
    });
    expect(start).not.toHaveBeenCalled();
  });

  it("v1 only reviews the first file when multiple are given", async () => {
    const { result } = renderHook(() => useImageCapture(), {
      wrapper: ({ children }) => <TadaProvider>{children}</TadaProvider>,
    });
    const first = pngFile();
    const second = pngFile();
    await act(async () => {
      await result.current.ingest([first, second]);
    });
    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith({ kind: "image", file: first });
  });
});
