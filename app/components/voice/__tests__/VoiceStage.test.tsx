import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { VoiceSessionState } from "@/app/lib/voice/useVoiceSession";

// Mock the session hook so the stage can be driven through each state without
// WebRTC/mic. The orb is a canvas (jsdom stubs getContext → null, renders calm).
const hook = {
  state: {
    active: true,
    status: "connecting",
    transcript: { user: "", assistant: "" },
    approval: null,
    error: null,
  } as VoiceSessionState,
  start: vi.fn(),
  stop: vi.fn(),
  setMicEnabled: vi.fn(),
  getLevel: vi.fn(() => 0),
};
vi.mock("@/app/lib/voice/useVoiceSession", () => ({
  useVoiceSession: () => hook,
}));

import { VoiceStage } from "../VoiceStage";

afterEach(() => {
  vi.clearAllMocks();
  hook.state = {
    active: true,
    status: "connecting",
    transcript: { user: "", assistant: "" },
    approval: null,
    error: null,
  };
});

describe("VoiceStage", () => {
  it("opens the session on mount and shows the connecting cue", () => {
    render(<VoiceStage onClose={vi.fn()} />);
    expect(hook.start).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Connecting…")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: /voice call with tada/i })).toBeInTheDocument();
  });

  it("shows mute + end controls and toggles mute", () => {
    render(<VoiceStage onClose={vi.fn()} />);
    const mute = screen.getByRole("button", { name: "Mute" });
    fireEvent.click(mute);
    expect(hook.setMicEnabled).toHaveBeenCalledWith(false);
    expect(screen.getByRole("button", { name: "Unmute" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /end call/i })).toBeInTheDocument();
  });

  it("hangs up: stops the session and closes", () => {
    const onClose = vi.fn();
    render(<VoiceStage onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: /end call/i }));
    expect(hook.stop).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("surfaces a gated write as an Approve/Deny confirm — and never auto-executes", () => {
    const approve = vi.fn();
    const deny = vi.fn();
    hook.state = {
      active: true,
      status: "thinking",
      transcript: { user: "set a reminder to call mom at 6pm", assistant: "" },
      approval: { name: "set_reminder", args: { text: "Call mom", remindAt: "2026-06-27T18:00:00" }, approve, deny },
      error: null,
    };
    render(<VoiceStage onClose={vi.fn()} />);
    // The proposed effect is shown; nothing has run yet.
    expect(screen.getByText("Call mom")).toBeInTheDocument();
    expect(approve).not.toHaveBeenCalled();
    // Approve fires only on the explicit tap.
    fireEvent.click(screen.getByRole("button", { name: /approve & set/i }));
    expect(approve).toHaveBeenCalledTimes(1);
  });
});
