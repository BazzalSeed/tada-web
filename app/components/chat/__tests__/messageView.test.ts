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

  it("renders an executed tool's output.card as a tile", () => {
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

  it("renders a gated meeting awaiting approval as a pending offer + approval ref", () => {
    const v = messageToView({
      id: "m3",
      role: "assistant",
      parts: [
        {
          type: "tool-send_meeting_invite",
          toolCallId: "c9",
          state: "approval-requested",
          input: { title: "Sync with Dakota", start: "2026-06-30T14:00:00", durationMin: 30, attendees: ["Dakota"] },
          approval: { id: "appr-1" },
        },
      ],
    } as never);
    expect(v.cards).toHaveLength(1);
    expect(v.cards[0]).toMatchObject({
      type: "pending",
      toolName: "send_meeting_invite",
      action: { kind: "meeting", title: "Sync with Dakota" },
    });
    expect(v.offers).toEqual([
      { cardIndex: 0, approvalId: "appr-1", toolName: "send_meeting_invite" },
    ]);
  });

  it("maps a gated reminder awaiting approval to a reminder pending offer", () => {
    const v = messageToView({
      id: "m4",
      role: "assistant",
      parts: [
        {
          type: "tool-set_reminder",
          toolCallId: "c10",
          state: "approval-requested",
          input: { text: "Call mom", remindAt: "2026-06-26T18:00:00" },
          approval: { id: "appr-2" },
        },
      ],
    } as never);
    expect(v.cards[0]).toMatchObject({
      type: "pending",
      action: { kind: "reminder", text: "Call mom" },
    });
    expect(v.offers[0].approvalId).toBe("appr-2");
  });

  it("maps a gated create_todo awaiting approval to a todo pending offer", () => {
    const v = messageToView({
      id: "m5",
      role: "assistant",
      parts: [
        {
          type: "tool-create_todo",
          toolCallId: "c11",
          state: "approval-requested",
          input: { title: "Buy oat milk", priority: "p2" },
          approval: { id: "appr-3" },
        },
      ],
    } as never);
    expect(v.cards[0]).toMatchObject({
      type: "pending",
      action: { kind: "todo", title: "Buy oat milk", priority: "p2" },
    });
  });

  it("renders an executed meeting result (offer card) from output.card", () => {
    const v = messageToView({
      id: "m6",
      role: "assistant",
      parts: [
        {
          type: "tool-send_meeting_invite",
          toolCallId: "c9",
          state: "output-available",
          input: { title: "Sync" },
          output: { output: "Meeting booked.", card: { type: "offer", kind: "meeting", result: { ok: true, actionExternalId: "evt_1" } } },
        },
      ],
    } as never);
    expect(v.cards[0]).toMatchObject({ type: "offer", kind: "meeting", result: { ok: true } });
    expect(v.offers).toEqual([]);
  });

  it("shows a research-running tile while a gated research executes (approval-responded)", () => {
    const v = messageToView({
      id: "m7",
      role: "assistant",
      parts: [
        {
          type: "tool-deep_research",
          toolCallId: "c12",
          state: "approval-responded",
          input: { topic: "best CRMs" },
          approval: { id: "appr-4", approved: true },
        },
      ],
    } as never);
    expect(v.cards[0]).toMatchObject({ type: "research", status: "running" });
    expect(v.offers).toEqual([]);
  });

  it("renders a denied gated write (approval-responded, not approved) as a denied note", () => {
    const v = messageToView({
      id: "m8b",
      role: "assistant",
      parts: [
        {
          type: "tool-deep_research",
          toolCallId: "c12",
          state: "approval-responded",
          input: { topic: "best CRMs" },
          approval: { id: "appr-4", approved: false },
        },
      ],
    } as never);
    expect(v.cards[0]).toMatchObject({ type: "denied", toolName: "deep_research" });
  });

  it("renders a denied gated write as a denied note", () => {
    const v = messageToView({
      id: "m8",
      role: "assistant",
      parts: [
        {
          type: "tool-set_reminder",
          toolCallId: "c10",
          state: "output-denied",
          input: { text: "Call mom" },
          approval: { id: "appr-2", approved: false },
        },
      ],
    } as never);
    expect(v.cards[0]).toMatchObject({ type: "denied", toolName: "set_reminder" });
    expect(v.offers).toEqual([]);
  });

  it("ignores input-streaming tool parts that have no usable input yet", () => {
    const v = messageToView({
      id: "m9",
      role: "assistant",
      parts: [{ type: "tool-deep_research", toolCallId: "c11", state: "input-streaming", input: undefined }],
    } as never);
    expect(v.cards).toEqual([]);
  });
});
