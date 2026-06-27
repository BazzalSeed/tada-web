import { describe, expect, it } from "vitest";
import type { Todo } from "@/lib/contracts";
import { describeOffer } from "@/lib/core";
import {
  doneEyebrow,
  hasOffer,
  offerEffect,
  offerSubject,
  reflectFinish,
} from "../offer";

function todo(over: Partial<Todo>): Todo {
  return {
    id: "t1",
    createdAt: "2026-06-27T08:00:00",
    sourceCaptureId: "c1",
    title: "Book follow-up with Marcus",
    status: "open",
    actionType: "none",
    actionState: "none",
    sortIndex: 0,
    priority: "none",
    labelIds: [],
    ...over,
  };
}

// FIX11 — offer.ts is now a thin PRESENTATION adapter over the shared
// describeOffer (one source of truth for "what will happen"). These tests assert
// the adapter wires describeOffer through faithfully + the FE-only helpers.
describe("offer adapter (FIX11 — unified on describeOffer)", () => {
  it("hasOffer mirrors describeOffer != null", () => {
    expect(hasOffer(todo({ actionType: "reminder" }))).toBe(true);
    expect(hasOffer(todo({ actionType: "none" }))).toBe(false);
    expect(hasOffer(todo({ actionType: "meeting", actionState: "done" }))).toBe(false);
  });

  it("offerEffect wires describeOffer's effect/verb/needsField/state through", () => {
    const t = todo({
      actionType: "meeting",
      actionPayload: {
        kind: "meeting",
        title: "Follow-up with Marcus",
        attendees: ["Marcus"],
        start: "2026-06-30T14:00:00",
        durationMin: 30,
      },
    });
    const d = describeOffer(t)!;
    const eff = offerEffect(t)!;
    expect(eff.eyebrow).toBe("Send meeting invite");
    expect(eff.cta).toBe(d.verb); // single source of truth for the CTA
    expect(eff.lines).toEqual([d.effect]); // single source for the effect line
    expect(eff.needsField).toBe(d.needsField);
    expect(eff.state).toBe(d.state);
    // the effect carries the clock time (FIX10 intent preserved by describeOffer)
    expect(eff.lines[0]).toMatch(/2(:00)?\s*(pm|PM)/);
  });

  it("surfaces the attendees gate that the old FE-only check missed (drift fix)", () => {
    // meeting with a time but NO attendees → describeOffer gates on 'attendees'
    const eff = offerEffect(
      todo({
        actionType: "meeting",
        actionPayload: { kind: "meeting", title: "Sync", attendees: [], start: "2026-06-30T14:00:00" },
      }),
    )!;
    expect(eff.needsField).toBe("attendees");
  });

  it("flags a missing meeting time as needsField 'start'", () => {
    const eff = offerEffect(
      todo({
        actionType: "meeting",
        actionPayload: { kind: "meeting", title: "Sync", attendees: ["Sam"] },
      }),
    )!;
    expect(eff.needsField).toBe("start");
  });

  it("returns null for a plain todo and for a done action", () => {
    expect(offerEffect(todo({ actionType: "none" }))).toBeNull();
    expect(offerEffect(todo({ actionType: "meeting", actionState: "done" }))).toBeNull();
  });

  it("offerSubject reads the payload subject, falling back to the title", () => {
    expect(
      offerSubject(todo({ actionType: "research", actionPayload: { kind: "research", topic: "EV credits" } })),
    ).toBe("EV credits");
    expect(offerSubject(todo({ actionType: "none" }))).toBe("Book follow-up with Marcus");
  });

  it("doneEyebrow names the executed action", () => {
    expect(doneEyebrow(todo({ actionType: "meeting" }))).toBe("Invite sent");
    expect(doneEyebrow(todo({ actionType: "reminder" }))).toBe("Reminder set");
  });

  it("reflectFinish marks done with the external id on success", () => {
    expect(
      reflectFinish(todo({ actionType: "meeting" }), { ok: true, actionExternalId: "evt_123" }),
    ).toEqual({ actionState: "done", actionExternalId: "evt_123" });
  });

  it("reflectFinish writes research markdown into detail", () => {
    expect(
      reflectFinish(todo({ actionType: "research" }), { ok: true, markdown: "# Report" }),
    ).toMatchObject({ actionState: "done", detail: "# Report" });
  });

  it("reflectFinish parks unresolved attendees as needs_disambiguation", () => {
    const patch = reflectFinish(
      todo({
        actionType: "meeting",
        actionPayload: { kind: "meeting", title: "Sync", attendees: ["Marcus"] },
      }),
      {
        ok: false,
        needsDisambiguation: [
          { name: "Marcus", status: "unresolved", candidates: [{ name: "Marcus Lee", email: "marcus@acme.com" }] },
        ],
      },
    );
    expect(patch?.actionState).toBe("needs_disambiguation");
    expect(
      patch?.actionPayload?.kind === "meeting" && patch.actionPayload.resolvedAttendees?.[0].name,
    ).toBe("Marcus");
  });

  it("reflectFinish leaves state untouched on needsField (the inline ask)", () => {
    expect(
      reflectFinish(todo({ actionType: "meeting" }), { ok: false, needsField: "start" }),
    ).toBeNull();
  });

  it("reflectFinish marks failed on a plain error", () => {
    expect(
      reflectFinish(todo({ actionType: "reminder" }), { ok: false, error: "nope" }),
    ).toEqual({ actionState: "failed" });
  });
});
