import { describe, expect, it } from "vitest";
import type { Todo } from "@/lib/contracts";
import { messageToView } from "../messageView";

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

describe("messageToView", () => {
  it("concatenates text parts", () => {
    const v = messageToView({
      id: "m1",
      role: "assistant",
      parts: [
        { type: "text", text: "Here's " },
        { type: "text", text: "what I found." },
      ],
    } as never);
    expect(v.role).toBe("assistant");
    expect(v.text).toBe("Here's what I found.");
    expect(v.cards).toEqual([]);
  });

  it("renders a tool part's output.card as a tile", () => {
    const v = messageToView({
      id: "m2",
      role: "assistant",
      parts: [
        {
          type: "tool-list_todos",
          toolCallId: "c1",
          state: "output-available",
          input: {},
          output: { output: "2 todos", card: { type: "todos", todos: [todo("A"), todo("B")] } },
        },
      ],
    } as never);
    expect(v.cards).toHaveLength(1);
    expect(v.cards[0]).toMatchObject({ type: "todos" });
    expect(v.offers).toEqual([]);
  });

  it("renders a gated meeting tool call (no output) as a pending offer from its input", () => {
    const v = messageToView({
      id: "m3",
      role: "assistant",
      parts: [
        {
          type: "tool-send_meeting_invite",
          toolCallId: "c9",
          state: "input-available",
          input: { title: "Sync with Dakota", start: "2026-06-30T14:00:00", durationMin: 30 },
        },
      ],
    } as never);
    expect(v.cards).toHaveLength(1);
    expect(v.cards[0]).toMatchObject({ type: "offer", payload: { kind: "meeting", title: "Sync with Dakota" } });
    expect(v.offers).toEqual([{ cardIndex: 0, toolCallId: "c9", toolName: "send_meeting_invite" }]);
  });

  it("maps a gated reminder tool call to a reminder offer", () => {
    const v = messageToView({
      id: "m4",
      role: "assistant",
      parts: [
        {
          type: "tool-set_reminder",
          toolCallId: "c10",
          state: "input-available",
          input: { text: "Call mom", remindAt: "2026-06-26T18:00:00" },
        },
      ],
    } as never);
    expect(v.cards[0]).toMatchObject({ type: "offer", payload: { kind: "reminder", text: "Call mom" } });
  });

  it("ignores input-streaming tool parts that have no usable input yet", () => {
    const v = messageToView({
      id: "m5",
      role: "assistant",
      parts: [{ type: "tool-deep_research", toolCallId: "c11", state: "input-streaming", input: undefined }],
    } as never);
    expect(v.cards).toEqual([]);
  });
});
