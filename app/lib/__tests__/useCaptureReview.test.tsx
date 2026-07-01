import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { TadaProvider, useTada } from "../store";
import { useCaptureReview } from "../useCaptureReview";
import type { Todo } from "@/lib/contracts";

const { proposeCaptureMock, commitCaptureMock } = vi.hoisted(() => ({
  proposeCaptureMock: vi.fn(),
  commitCaptureMock: vi.fn(),
}));

vi.mock("@/app/lib/api", () => ({
  proposeCapture: proposeCaptureMock,
  commitCapture: commitCaptureMock,
}));

vi.mock("@/app/lib/capture", () => ({
  fileToCaptureRequest: vi.fn(async () => ({
    kind: "image",
    image: { base64: "abc", mimeType: "image/png" },
  })),
}));

afterEach(() => {
  vi.restoreAllMocks();
  proposeCaptureMock.mockReset();
  commitCaptureMock.mockReset();
});

// Probe renders the hook plus the surrounding store, so we can both drive the
// hook's methods and observe the reducer's post-dispatch state (UPSERT_TODO /
// UPSERT_CAPTURE) the same way useEnsureLabel's test does.
function Probe({ onReady }: { onReady: (review: ReturnType<typeof useCaptureReview>) => void }) {
  const review = useCaptureReview();
  const { state } = useTada();
  onReady(review);
  return (
    <div>
      <span data-testid="open">{String(review.open)}</span>
      <span data-testid="status">{review.status}</span>
      <span data-testid="captureId">{review.captureId ?? ""}</span>
      <span data-testid="proposals">{review.proposals.length}</span>
      <span data-testid="todos">{state.todos.map((t) => t.id).join(",")}</span>
      <span data-testid="captures">{Object.keys(state.captures).join(",")}</span>
    </div>
  );
}

function makeTodo(id: string): Todo {
  return {
    id,
    createdAt: new Date().toISOString(),
    sourceCaptureId: "c1",
    title: `todo ${id}`,
    status: "open",
    actionType: "plain",
    actionState: "none",
    sortIndex: 0,
    priority: "none",
    labelIds: [],
  } as unknown as Todo;
}

describe("useCaptureReview", () => {
  it("start() opens the modal in describing status", () => {
    let review!: ReturnType<typeof useCaptureReview>;
    render(
      <TadaProvider>
        <Probe onReady={(r) => (review = r)} />
      </TadaProvider>,
    );

    act(() => {
      review.start({ kind: "text", text: "buy milk" });
    });

    expect(screen.getByTestId("open").textContent).toBe("true");
    expect(screen.getByTestId("status").textContent).toBe("describing");
  });

  it("extract() populates proposals and captureId on success", async () => {
    proposeCaptureMock.mockResolvedValue({
      capture: { id: "c1", createdAt: new Date().toISOString(), kind: "text" },
      proposals: [{ title: "A" }, { title: "B" }],
      failed: false,
    });

    let review!: ReturnType<typeof useCaptureReview>;
    render(
      <TadaProvider>
        <Probe onReady={(r) => (review = r)} />
      </TadaProvider>,
    );

    act(() => {
      review.start({ kind: "text", text: "buy milk and eggs" });
    });

    await act(async () => {
      await review.extract();
    });

    expect(screen.getByTestId("status").textContent).toBe("proposals");
    expect(screen.getByTestId("proposals").textContent).toBe("2");
    expect(screen.getByTestId("captureId").textContent).toBe("c1");
    expect(proposeCaptureMock).toHaveBeenCalledWith({
      kind: "text",
      text: "buy milk and eggs",
      note: null,
    });
  });

  it("extract() sets status failed when proposeCapture reports failed:true", async () => {
    proposeCaptureMock.mockResolvedValue({
      capture: { id: "c1", createdAt: new Date().toISOString(), kind: "text" },
      proposals: [],
      failed: true,
    });

    let review!: ReturnType<typeof useCaptureReview>;
    render(
      <TadaProvider>
        <Probe onReady={(r) => (review = r)} />
      </TadaProvider>,
    );

    act(() => {
      review.start({ kind: "text", text: "" });
    });

    await act(async () => {
      await review.extract();
    });

    expect(screen.getByTestId("status").textContent).toBe("failed");
  });

  it("extract() sets status failed when proposeCapture rejects", async () => {
    proposeCaptureMock.mockRejectedValue(new Error("network down"));

    let review!: ReturnType<typeof useCaptureReview>;
    render(
      <TadaProvider>
        <Probe onReady={(r) => (review = r)} />
      </TadaProvider>,
    );

    act(() => {
      review.start({ kind: "text", text: "buy milk" });
    });

    await act(async () => {
      await review.extract();
    });

    expect(screen.getByTestId("status").textContent).toBe("failed");
  });

  it("commit() calls commitCapture, dispatches UPSERT_CAPTURE + UPSERT_TODO, and closes", async () => {
    proposeCaptureMock.mockResolvedValue({
      capture: { id: "c1", createdAt: new Date().toISOString(), kind: "text" },
      proposals: [{ title: "A" }, { title: "B" }],
      failed: false,
    });
    commitCaptureMock.mockResolvedValue([makeTodo("t1"), makeTodo("t2")]);

    let review!: ReturnType<typeof useCaptureReview>;
    render(
      <TadaProvider>
        <Probe onReady={(r) => (review = r)} />
      </TadaProvider>,
    );

    act(() => {
      review.start({ kind: "text", text: "buy milk and eggs" });
    });
    await act(async () => {
      await review.extract();
    });

    let committed: Todo[] = [];
    await act(async () => {
      committed = await review.commit();
    });

    expect(commitCaptureMock).toHaveBeenCalledWith("c1", [{ title: "A" }, { title: "B" }]);
    expect(committed.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(screen.getByTestId("todos").textContent).toBe("t1,t2");
    expect(screen.getByTestId("captures").textContent).toBe("c1");
    expect(screen.getByTestId("open").textContent).toBe("false");
  });

  it("editProposal patches a proposal immutably and removeProposal drops one", async () => {
    proposeCaptureMock.mockResolvedValue({
      capture: { id: "c1", createdAt: new Date().toISOString(), kind: "text" },
      proposals: [{ title: "A" }, { title: "B" }],
      failed: false,
    });

    let review!: ReturnType<typeof useCaptureReview>;
    render(
      <TadaProvider>
        <Probe onReady={(r) => (review = r)} />
      </TadaProvider>,
    );

    act(() => {
      review.start({ kind: "text", text: "buy milk and eggs" });
    });
    await act(async () => {
      await review.extract();
    });

    act(() => {
      review.editProposal(0, { title: "A edited" });
    });
    expect(review.proposals[0].title).toBe("A edited");
    expect(review.proposals[1].title).toBe("B");

    act(() => {
      review.removeProposal(0);
    });
    expect(screen.getByTestId("proposals").textContent).toBe("1");
    expect(review.proposals[0].title).toBe("B");
  });

  it("cancel() resets to the initial closed state", async () => {
    proposeCaptureMock.mockResolvedValue({
      capture: { id: "c1", createdAt: new Date().toISOString(), kind: "text" },
      proposals: [{ title: "A" }],
      failed: false,
    });

    let review!: ReturnType<typeof useCaptureReview>;
    render(
      <TadaProvider>
        <Probe onReady={(r) => (review = r)} />
      </TadaProvider>,
    );

    act(() => {
      review.start({ kind: "text", text: "buy milk" });
    });
    await act(async () => {
      await review.extract();
    });

    act(() => {
      review.cancel();
    });

    expect(screen.getByTestId("open").textContent).toBe("false");
    expect(screen.getByTestId("status").textContent).toBe("describing");
    expect(screen.getByTestId("proposals").textContent).toBe("0");
    expect(screen.getByTestId("captureId").textContent).toBe("");
  });
});
