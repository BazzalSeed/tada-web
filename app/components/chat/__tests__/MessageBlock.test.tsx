import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Todo } from "@/lib/contracts";
import { MessageBlock } from "../MessageBlock";

const NOW = new Date(2026, 5, 26);

function todo(title: string): Todo {
  return {
    id: title,
    createdAt: "x",
    sourceCaptureId: "",
    title,
    status: "open",
    actionType: "none",
    actionState: "none",
    sortIndex: 0,
    priority: "none",
    labelIds: [],
  };
}

describe("MessageBlock", () => {
  it("renders a user message's text with a user role", () => {
    render(<MessageBlock role="user" text="what's due today?" labels={[]} now={NOW} />);
    const block = screen.getByText("what's due today?").closest("[data-role]");
    expect(block).toHaveAttribute("data-role", "user");
  });

  it("renders assistant text and its tiles", () => {
    render(
      <MessageBlock
        role="assistant"
        text="Here's what I found:"
        cards={[{ type: "todo", todo: todo("Email Dakota") }]}
        labels={[]}
        now={NOW}
      />,
    );
    expect(screen.getByText("Here's what I found:")).toBeInTheDocument();
    expect(screen.getByText("Email Dakota")).toBeInTheDocument();
  });

  it("shows a streaming caret on an actively streaming assistant turn (FIX8)", () => {
    const { container, rerender } = render(
      <MessageBlock role="assistant" text="Looking" labels={[]} now={NOW} streaming />,
    );
    expect(container.querySelector("[class*='cursor']")).toBeInTheDocument();
    // once the stream settles the caret is gone
    rerender(
      <MessageBlock role="assistant" text="Looking it up." labels={[]} now={NOW} />,
    );
    expect(container.querySelector("[class*='cursor']")).toBeNull();
  });

  it("wires an offer tile's Approve to onApprove with the card index", () => {
    const onApprove = vi.fn();
    render(
      <MessageBlock
        role="assistant"
        cards={[{ type: "pending", toolName: "set_reminder", action: { kind: "reminder", text: "Stretch" } }]}
        labels={[]}
        now={NOW}
        onApprove={onApprove}
        onDeny={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /approve/i }));
    expect(onApprove).toHaveBeenCalledWith(0);
  });
});
