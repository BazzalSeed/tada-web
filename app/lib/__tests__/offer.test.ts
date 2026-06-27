import { describe, expect, it } from "vitest";
import type { Todo } from "@/lib/contracts";
import { hasOffer, offerEffect, reflectFinish } from "../offer";

const NOW = new Date("2026-06-27T09:00:00");

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

describe("offer model (FIX2)", () => {
  it("hasOffer is true for an actionable, not-yet-done todo", () => {
    expect(hasOffer(todo({ actionType: "reminder" }))).toBe(true);
    expect(hasOffer(todo({ actionType: "none" }))).toBe(false);
    expect(
      hasOffer(todo({ actionType: "meeting", actionState: "done" })),
    ).toBe(false);
  });

  it("describes a meeting's concrete effect", () => {
    const eff = offerEffect(
      todo({
        actionType: "meeting",
        actionPayload: {
          kind: "meeting",
          title: "Follow-up with Marcus",
          attendees: ["Marcus"],
          start: "2026-06-30T14:00:00",
          durationMin: 30,
        },
      }),
      NOW,
    );
    expect(eff?.eyebrow).toBe("Send meeting invite");
    expect(eff?.title).toBe("Follow-up with Marcus");
    expect(eff?.lines[0]).toContain("30 min");
    expect(eff?.lines.some((l) => l.includes("Marcus"))).toBe(true);
    expect(eff?.cta).toBe("Send invite");
  });

  it("describes a reminder and a research effect", () => {
    expect(
      offerEffect(
        todo({
          actionType: "reminder",
          actionPayload: { kind: "reminder", text: "Email Priya", remindAt: "2026-06-28T09:00:00" },
        }),
        NOW,
      )?.eyebrow,
    ).toBe("Set reminder");
    expect(
      offerEffect(
        todo({ actionType: "research", actionPayload: { kind: "research", topic: "EV tax credits" } }),
        NOW,
      )?.title,
    ).toBe("EV tax credits");
  });

  it("returns null effect for a plain todo", () => {
    expect(offerEffect(todo({ actionType: "none" }), NOW)).toBeNull();
  });

  it("reflectFinish marks done with the external id on success", () => {
    const patch = reflectFinish(todo({ actionType: "meeting" }), {
      ok: true,
      actionExternalId: "evt_123",
    });
    expect(patch).toEqual({ actionState: "done", actionExternalId: "evt_123" });
  });

  it("reflectFinish writes research markdown into detail", () => {
    const patch = reflectFinish(todo({ actionType: "research" }), {
      ok: true,
      markdown: "# Report",
    });
    expect(patch).toMatchObject({ actionState: "done", detail: "# Report" });
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
          {
            name: "Marcus",
            status: "unresolved",
            candidates: [{ name: "Marcus Lee", email: "marcus@acme.com" }],
          },
        ],
      },
    );
    expect(patch?.actionState).toBe("needs_disambiguation");
    expect(
      patch?.actionPayload?.kind === "meeting" &&
        patch.actionPayload.resolvedAttendees?.[0].name,
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
