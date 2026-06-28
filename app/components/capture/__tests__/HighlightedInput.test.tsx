import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { ParseToken } from "@/lib/contracts";
import { HighlightedInput } from "../HighlightedInput";

describe("HighlightedInput", () => {
  it("renders token spans at the correct offsets with their kind", () => {
    const value = "Plan offsite p1 #home";
    const tokens: ParseToken[] = [
      { kind: "priority", start: 13, length: 2 }, // "p1"
      { kind: "label", start: 16, length: 5 }, // "#home"
    ];
    render(
      <HighlightedInput
        value={value}
        tokens={tokens}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    const prio = screen.getByText("p1");
    expect(prio).toHaveAttribute("data-kind", "priority");
    const label = screen.getByText("#home");
    expect(label).toHaveAttribute("data-kind", "label");
  });

  it("surfaces the current value in the editable input", () => {
    render(
      <HighlightedInput
        value="Buy milk"
        tokens={[]}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByRole("textbox")).toHaveValue("Buy milk");
  });

  it("emits onChange as the user types", () => {
    const onChange = vi.fn();
    render(
      <HighlightedInput value="" tokens={[]} onChange={onChange} onSubmit={vi.fn()} />,
    );
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "x" } });
    expect(onChange).toHaveBeenCalledWith("x");
  });

  it("renders a textarea, submits on Enter, newlines on Shift+Enter", () => {
    const onSubmit = vi.fn();
    render(<HighlightedInput value="buy milk" tokens={[]} onChange={vi.fn()} onSubmit={onSubmit} />);
    const field = screen.getByRole("textbox");
    expect(field.tagName).toBe("TEXTAREA");
    fireEvent.keyDown(field, { key: "Enter", shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(field, { key: "Enter", shiftKey: false });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("submits on Enter (not Shift+Enter)", () => {
    const onSubmit = vi.fn();
    render(
      <HighlightedInput value="task" tokens={[]} onChange={vi.fn()} onSubmit={onSubmit} />,
    );
    const box = screen.getByRole("textbox");
    fireEvent.keyDown(box, { key: "Enter", shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
