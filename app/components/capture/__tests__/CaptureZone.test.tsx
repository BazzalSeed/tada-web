import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { TadaProvider, useTada } from "@/app/lib/store";

// Mock the capture seam so no real upload/fetch happens.
const captureImageFile = vi.fn();
vi.mock("@/app/lib/capture", () => ({
  captureImageFile: (f: File) => captureImageFile(f),
  captureText: vi.fn(),
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
  vi.restoreAllMocks();
});

describe("CaptureZone (store-wired)", () => {
  it("on image drop: captures and dispatches the returned capture + todos", async () => {
    captureImageFile.mockResolvedValue({
      capture: { id: "cap1", createdAt: "x", kind: "image", blobPath: "https://blob/s.png" },
      todos: [
        {
          id: "t1",
          createdAt: "x",
          sourceCaptureId: "cap1",
          title: "Reply to Dakota",
          status: "open",
          actionType: "none",
          actionState: "none",
          sortIndex: 0,
          priority: "none",
          labelIds: [],
        },
      ],
    });
    render(
      <TadaProvider>
        <Probe />
        <CaptureZone>
          <div>content</div>
        </CaptureZone>
      </TadaProvider>,
    );
    fireEvent.drop(screen.getByTestId("dropzone"), {
      dataTransfer: { files: [pngFile()], items: [] },
    });
    await waitFor(() =>
      expect(screen.getByTestId("todos")).toHaveTextContent("Reply to Dakota"),
    );
    expect(screen.getByTestId("captures")).toHaveTextContent("cap1");
    expect(captureImageFile).toHaveBeenCalledTimes(1);
  });

  it("captures images pasted anywhere (global paste)", async () => {
    captureImageFile.mockResolvedValue({
      capture: { id: "cap2", createdAt: "x", kind: "image", blobPath: "b" },
      todos: [
        {
          id: "t2",
          createdAt: "x",
          sourceCaptureId: "cap2",
          title: "From paste",
          status: "open",
          actionType: "none",
          actionState: "none",
          sortIndex: 0,
          priority: "none",
          labelIds: [],
        },
      ],
    });
    render(
      <TadaProvider>
        <Probe />
        <CaptureZone>
          <div>content</div>
        </CaptureZone>
      </TadaProvider>,
    );
    const paste = new Event("paste", { bubbles: true }) as Event & {
      clipboardData: unknown;
    };
    paste.clipboardData = {
      items: [{ kind: "file", type: "image/png", getAsFile: () => pngFile() }],
    };
    window.dispatchEvent(paste);
    await waitFor(() =>
      expect(screen.getByTestId("todos")).toHaveTextContent("From paste"),
    );
  });
});
