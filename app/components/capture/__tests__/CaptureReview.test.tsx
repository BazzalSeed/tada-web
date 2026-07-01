import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CaptureReview } from "../CaptureReview";
import type { CaptureReview as CaptureReviewState } from "@/app/lib/useCaptureReview";
import type { ExtractedTodo } from "@/lib/contracts/extractor";

function makeReview(overrides: Partial<CaptureReviewState> = {}): CaptureReviewState {
  return {
    open: true,
    source: { kind: "text", text: "Buy milk and call the plumber" },
    note: "",
    status: "describing",
    failReason: null,
    captureId: null,
    proposals: [],
    start: vi.fn(),
    setNote: vi.fn(),
    extract: vi.fn(),
    editProposal: vi.fn(),
    removeProposal: vi.fn(),
    commit: vi.fn(),
    cancel: vi.fn(),
    ...overrides,
  };
}

const proposal = (title: string): ExtractedTodo => ({
  title,
  actionType: "none",
});

describe("CaptureReview", () => {
  it("describing (text source): shows text preview + note textarea; Extract calls extract()", () => {
    const review = makeReview();
    render(<CaptureReview review={review} />);

    expect(screen.getByText("Buy milk and call the plumber")).toBeInTheDocument();
    const textarea = screen.getByPlaceholderText(/describe what to do/i);
    expect(textarea).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Extract" }));
    expect(review.extract).toHaveBeenCalled();
  });

  it("extracting: shows the branded ViewLoading state", () => {
    const review = makeReview({ status: "extracting" });
    render(<CaptureReview review={review} />);
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
  });

  it("proposals: renders title inputs, correct CTA label, commit + removeProposal wiring", () => {
    const review = makeReview({
      status: "proposals",
      proposals: [proposal("Buy milk"), proposal("Call plumber")],
    });
    const { rerender } = render(<CaptureReview review={review} />);

    const titleInputs = screen.getAllByDisplayValue(/Buy milk|Call plumber/);
    expect(titleInputs).toHaveLength(2);

    const addButton = screen.getByRole("button", { name: "Add 2 todos" });
    fireEvent.click(addButton);
    expect(review.commit).toHaveBeenCalled();

    const removeButtons = screen.getAllByRole("button", { name: "Remove proposal" });
    fireEvent.click(removeButtons[0]);
    expect(review.removeProposal).toHaveBeenCalledWith(0);

    const singular = makeReview({ status: "proposals", proposals: [proposal("Buy milk")] });
    rerender(<CaptureReview review={singular} />);
    expect(screen.getByRole("button", { name: "Add 1 todo" })).toBeInTheDocument();
  });

  it("proposals with 0 proposals: primary CTA is disabled", () => {
    const review = makeReview({ status: "proposals", proposals: [] });
    render(<CaptureReview review={review} />);
    expect(screen.getByRole("button", { name: "Add 0 todos" })).toBeDisabled();
  });

  it("failed (empty): shows a friendly message + note field to add context; Try again calls extract()", () => {
    const review = makeReview({ status: "failed", failReason: "empty" });
    render(<CaptureReview review={review} />);
    expect(screen.getByText(/couldn't find/i)).toBeInTheDocument();
    expect(screen.getByText(/add a note describing what to do/i)).toBeInTheDocument();

    const textarea = screen.getByPlaceholderText(/describe what to do/i);
    expect(textarea).toBeInTheDocument();
    fireEvent.change(textarea, { target: { value: "it's about the plumber" } });
    expect(review.setNote).toHaveBeenCalledWith("it's about the plumber");

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(review.extract).toHaveBeenCalled();
  });

  it("failed (error): shows a transport/auth-specific message, not the empty-extraction copy", () => {
    const review = makeReview({ status: "failed", failReason: "error" });
    render(<CaptureReview review={review} />);
    expect(screen.getByText(/couldn't reach the extractor/i)).toBeInTheDocument();
    expect(screen.queryByText(/couldn't find any tasks/i)).not.toBeInTheDocument();
  });

  it("failed (no failReason): falls back to the empty-extraction copy", () => {
    const review = makeReview({ status: "failed", failReason: null });
    render(<CaptureReview review={review} />);
    expect(screen.getByText(/couldn't find any tasks/i)).toBeInTheDocument();
  });
});
