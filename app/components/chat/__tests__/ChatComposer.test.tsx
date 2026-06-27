import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ChatComposer } from "../ChatComposer";

describe("ChatComposer", () => {
  it("sends the typed message on submit and clears", () => {
    const onSend = vi.fn();
    render(<ChatComposer onSend={onSend} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "what's due today?" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    expect(onSend).toHaveBeenCalledWith("what's due today?");
    expect(input).toHaveValue("");
  });

  it("does not send an empty/whitespace message", () => {
    const onSend = vi.fn();
    render(<ChatComposer onSend={onSend} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    expect(onSend).not.toHaveBeenCalled();
  });

  it("sends on Enter (without Shift)", () => {
    const onSend = vi.fn();
    render(<ChatComposer onSend={onSend} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: "hi" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onSend).toHaveBeenCalledWith("hi");
  });

  it("offers a voice-mode entry button when onVoice is provided", () => {
    const onVoice = vi.fn();
    render(<ChatComposer onSend={vi.fn()} onVoice={onVoice} />);
    fireEvent.click(screen.getByRole("button", { name: /voice|talk/i }));
    expect(onVoice).toHaveBeenCalledTimes(1);
  });

  it("disables send while the assistant is responding", () => {
    render(<ChatComposer onSend={vi.fn()} busy />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "hi" } });
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
  });
});
