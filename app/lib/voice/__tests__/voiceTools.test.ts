import { describe, expect, it } from "vitest";
import {
  buildToolRequest,
  interpretToolResponse,
  proposedActionFromCall,
  DENIED_OUTPUT,
} from "../voiceTools";
import { deriveVoiceStatus } from "../voiceStatus";

describe("buildToolRequest", () => {
  it("parses the Realtime arguments string into args", () => {
    const req = buildToolRequest({
      name: "set_reminder",
      arguments: '{"text":"Call mom","remindAt":"2026-06-27T18:00:00"}',
      call_id: "rc1",
    });
    expect(req).toEqual({
      name: "set_reminder",
      args: { text: "Call mom", remindAt: "2026-06-27T18:00:00" },
      call_id: "rc1",
    });
  });

  it("falls back to {} on malformed arguments", () => {
    const req = buildToolRequest({ name: "list_todos", arguments: "not json" });
    expect(req.args).toEqual({});
  });
});

describe("interpretToolResponse (the never-auto-execute gate)", () => {
  it("surfaces a gated write as an approval (nothing executes yet)", () => {
    const outcome = interpretToolResponse({
      status: "approval_required",
      name: "send_meeting_invite",
      args: { title: "Sync", attendees: ["Dakota"] },
    });
    expect(outcome).toEqual({
      kind: "approval",
      name: "send_meeting_invite",
      args: { title: "Sync", attendees: ["Dakota"] },
    });
  });

  it("returns an executed result's output + card to feed back to the model", () => {
    const outcome = interpretToolResponse({
      status: "ok",
      output: "2 todos",
      card: { type: "todos", todos: [] },
    });
    expect(outcome).toEqual({ kind: "result", output: "2 todos", card: { type: "todos", todos: [] } });
  });

  it("coerces a missing/non-string output to an honest error string (never undefined)", () => {
    const outcome = interpretToolResponse({ status: "ok" });
    expect(outcome.kind).toBe("result");
    if (outcome.kind === "result") {
      expect(typeof outcome.output).toBe("string");
      expect(outcome.output).toContain("tool unavailable");
      expect(outcome.card).toBeNull();
    }
  });

  it("DENIED_OUTPUT is a JSON string signalling nothing ran", () => {
    expect(JSON.parse(DENIED_OUTPUT)).toMatchObject({ status: "declined" });
  });
});

describe("proposedActionFromCall", () => {
  it("maps a meeting call to a meeting action", () => {
    expect(
      proposedActionFromCall("send_meeting_invite", { title: "Sync", attendees: ["Dakota"], start: "2026-06-30T14:00:00" }),
    ).toMatchObject({ kind: "meeting", title: "Sync", attendees: ["Dakota"] });
  });

  it("maps reminder / create_todo / research calls", () => {
    expect(proposedActionFromCall("set_reminder", { text: "Call mom" })).toMatchObject({ kind: "reminder", text: "Call mom" });
    expect(proposedActionFromCall("create_todo", { title: "Buy milk", priority: "p2" })).toMatchObject({ kind: "todo", title: "Buy milk", priority: "p2" });
    expect(proposedActionFromCall("deep_research", { topic: "CRMs" })).toMatchObject({ kind: "research", topic: "CRMs" });
  });

  it("returns null for an unknown tool", () => {
    expect(proposedActionFromCall("list_todos", {})).toBeNull();
  });
});

describe("deriveVoiceStatus", () => {
  it("maps call-boundary phases first", () => {
    expect(deriveVoiceStatus({ phase: "connecting", awaitingResponse: false, toolPending: false, audioPlaying: false })).toBe("connecting");
    expect(deriveVoiceStatus({ phase: "error", awaitingResponse: false, toolPending: false, audioPlaying: false })).toBe("error");
    expect(deriveVoiceStatus({ phase: "ended", awaitingResponse: false, toolPending: false, audioPlaying: false })).toBe("ended");
  });

  it("thinking wins over speaking when a tool is in flight", () => {
    expect(deriveVoiceStatus({ phase: "live", awaitingResponse: false, toolPending: true, audioPlaying: true })).toBe("thinking");
  });

  it("speaking when audio plays with nothing pending; listening at rest", () => {
    expect(deriveVoiceStatus({ phase: "live", awaitingResponse: false, toolPending: false, audioPlaying: true })).toBe("speaking");
    expect(deriveVoiceStatus({ phase: "live", awaitingResponse: false, toolPending: false, audioPlaying: false })).toBe("listening");
  });
});
