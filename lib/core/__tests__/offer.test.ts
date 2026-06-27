// @vitest-environment node
// FIX2 — describeOffer: pure offer-preview descriptor for the tap-path row.
import { describe, expect, it } from "vitest";
import { describeOffer } from "@/lib/core";
import type { Todo } from "@/lib/contracts";

function todo(p: Partial<Todo>): Todo {
  return {
    id: "t",
    createdAt: "2026-06-01T00:00:00",
    sourceCaptureId: "c",
    title: "x",
    status: "open",
    actionType: "none",
    actionState: "none",
    sortIndex: 0,
    priority: "none",
    labelIds: [],
    dueAt: null,
    ...p,
  } as Todo;
}

describe("describeOffer", () => {
  it("returns null for a plain (actionType=none) todo", () => {
    expect(describeOffer(todo({}))).toBeNull();
  });

  it("returns null once the action is done", () => {
    expect(
      describeOffer(
        todo({ actionType: "research", actionState: "done", actionPayload: { kind: "research", topic: "x" } }),
      ),
    ).toBeNull();
  });

  it("meeting: concrete effect with attendees, time, duration; armed (no needsField)", () => {
    const o = describeOffer(
      todo({
        actionType: "meeting",
        actionState: "proposed",
        actionPayload: {
          kind: "meeting",
          title: "Sync",
          attendees: ["dakota@acme.com"],
          start: "2026-07-01T14:00:00",
          durationMin: 30,
        },
      }),
    )!;
    expect(o.verb).toBe("Send invite");
    expect(o.effect).toBe("Invite dakota@acme.com · Jul 1, 2:00 PM · 30m");
    expect(o.needsField).toBeNull();
  });

  it("meeting: missing start → single inline ask (needsField=start)", () => {
    const o = describeOffer(
      todo({
        actionType: "meeting",
        actionState: "proposed",
        actionPayload: { kind: "meeting", title: "Sync", attendees: ["a@b.com"], start: null },
      }),
    )!;
    expect(o.needsField).toBe("start");
  });

  it("meeting: prefers resolved attendee emails over raw names", () => {
    const o = describeOffer(
      todo({
        actionType: "meeting",
        actionState: "proposed",
        actionPayload: {
          kind: "meeting",
          title: "Sync",
          attendees: ["Dakota"],
          resolvedAttendees: [{ name: "Dakota", email: "dakota@acme.com", status: "resolved" }],
          start: "2026-07-01T09:30:00",
          durationMin: 60,
        },
      }),
    )!;
    expect(o.effect).toContain("dakota@acme.com");
    expect(o.effect).toContain("1h");
  });

  it("reminder: with a time is armed; without a time asks remindAt", () => {
    const armed = describeOffer(
      todo({
        actionType: "reminder",
        actionState: "proposed",
        actionPayload: { kind: "reminder", text: "Renew passport", remindAt: "2026-07-03T00:00:00" },
      }),
    )!;
    expect(armed.verb).toBe("Set reminder");
    expect(armed.effect).toContain("Renew passport");
    expect(armed.needsField).toBeNull();

    const blocked = describeOffer(
      todo({
        actionType: "reminder",
        actionState: "proposed",
        actionPayload: { kind: "reminder", text: "Renew passport", remindAt: null },
      }),
    )!;
    expect(blocked.needsField).toBe("remindAt");
  });

  it("research: always armed (zero auth)", () => {
    const o = describeOffer(
      todo({
        actionType: "research",
        actionState: "proposed",
        actionPayload: { kind: "research", topic: "best CRM for 5 people" },
      }),
    )!;
    expect(o.verb).toBe("Research");
    expect(o.effect).toBe("Research: best CRM for 5 people");
    expect(o.needsField).toBeNull();
  });

  it("never emits NaN for a non-ISO start — shows the raw value", () => {
    const o = describeOffer(
      todo({
        actionType: "meeting",
        actionState: "proposed",
        actionPayload: { kind: "meeting", title: "Sync", attendees: ["a@b.com"], start: "next tuesday" },
      }),
    )!;
    expect(o.effect).not.toMatch(/NaN/);
  });
});
