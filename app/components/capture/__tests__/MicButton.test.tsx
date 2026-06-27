import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MicButton } from "../MicButton";

// Minimal fake of the Web Speech API SpeechRecognition.
class FakeRecognition {
  lang = "";
  interimResults = false;
  continuous = false;
  onresult: ((e: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn(() => this.onend?.());
}

function resultEvent(transcript: string, isFinal = true) {
  return { resultIndex: 0, results: [[{ transcript }], { isFinal }] } as never;
}

describe("MicButton", () => {
  it("is disabled when dictation is unsupported", () => {
    render(<MicButton onTranscript={vi.fn()} getRecognition={() => null} />);
    expect(screen.getByRole("button", { name: /dictation unavailable/i })).toBeDisabled();
  });

  it("starts listening on click and reflects the pressed state", () => {
    let instance: FakeRecognition | null = null;
    const ctor = function () {
      instance = new FakeRecognition();
      return instance;
    } as unknown as new () => FakeRecognition;
    render(<MicButton onTranscript={vi.fn()} getRecognition={() => ctor} />);
    const btn = screen.getByRole("button", { name: /dictate/i });
    fireEvent.click(btn);
    expect(instance!.start).toHaveBeenCalledTimes(1);
    expect(btn).toHaveAttribute("aria-pressed", "true");
  });

  it("emits the final transcript", () => {
    let instance: FakeRecognition | null = null;
    const ctor = function () {
      instance = new FakeRecognition();
      return instance;
    } as unknown as new () => FakeRecognition;
    const onTranscript = vi.fn();
    render(<MicButton onTranscript={onTranscript} getRecognition={() => ctor} />);
    fireEvent.click(screen.getByRole("button", { name: /dictate/i }));
    // the recognition fires a final result
    instance!.onresult?.({ resultIndex: 0, results: [[{ transcript: "buy milk" }]] } as never);
    expect(onTranscript).toHaveBeenCalledWith("buy milk");
  });

  it("stops on a second click", () => {
    let instance: FakeRecognition | null = null;
    const ctor = function () {
      instance = new FakeRecognition();
      return instance;
    } as unknown as new () => FakeRecognition;
    render(<MicButton onTranscript={vi.fn()} getRecognition={() => ctor} />);
    const btn = screen.getByRole("button", { name: /dictate/i });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(instance!.stop).toHaveBeenCalledTimes(1);
    expect(btn).toHaveAttribute("aria-pressed", "false");
  });
});
