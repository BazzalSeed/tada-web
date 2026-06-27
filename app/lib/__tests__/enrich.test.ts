import { describe, expect, it } from "vitest";
import type { ExtractedTodo } from "@/lib/contracts";
import { enrichmentChips } from "../enrich";

const NOW = new Date(2026, 5, 26); // 2026-06-26 (local, offset-less domain)

function suggestion(over: Partial<ExtractedTodo> = {}): ExtractedTodo {
  return {
    title: "Plan offsite",
    actionType: "none",
    ...over,
  };
}

describe("enrichmentChips", () => {
  it("returns no chips when the suggestion adds nothing", () => {
    expect(enrichmentChips(suggestion(), NOW)).toEqual([]);
  });

  it("offers a priority chip with the concrete level", () => {
    const chips = enrichmentChips(suggestion({ suggestedPriority: "p1" }), NOW);
    expect(chips).toEqual([
      expect.objectContaining({ kind: "priority", label: "P1", priority: "p1" }),
    ]);
  });

  it("ignores a 'none' priority suggestion", () => {
    expect(enrichmentChips(suggestion({ suggestedPriority: "none" }), NOW)).toEqual([]);
  });

  it("offers a due chip with a friendly relative label", () => {
    const chips = enrichmentChips(
      suggestion({ suggestedDueAt: "2026-06-27T00:00:00" }),
      NOW,
    );
    expect(chips).toEqual([
      expect.objectContaining({
        kind: "due",
        label: "Tomorrow",
        dueAt: "2026-06-27T00:00:00",
      }),
    ]);
  });

  it("offers one label chip per suggested label, prefixed with @", () => {
    const chips = enrichmentChips(
      suggestion({ suggestedLabels: ["work", "urgent"] }),
      NOW,
    );
    expect(chips.map((c) => c.label)).toEqual(["@work", "@urgent"]);
    expect(chips.every((c) => c.kind === "label")).toBe(true);
  });

  it("parses a recurrence phrase into a concrete rule via the frozen core", () => {
    const chips = enrichmentChips(
      suggestion({ recurrenceText: "every monday" }),
      NOW,
    );
    expect(chips).toHaveLength(1);
    expect(chips[0]).toMatchObject({ kind: "recurrence" });
    // chip carries a real RecurrenceRule the patch can apply
    expect(chips[0]).toHaveProperty("recurrence.frequency");
  });

  it("drops a recurrence phrase the parser can't resolve", () => {
    expect(
      enrichmentChips(suggestion({ recurrenceText: "occasionally" }), NOW),
    ).toEqual([]);
  });

  it("offers an action-type chip for a 'do it for me' classification", () => {
    const chips = enrichmentChips(suggestion({ actionType: "meeting" }), NOW);
    expect(chips).toEqual([
      expect.objectContaining({
        kind: "action",
        label: "Meeting",
        actionType: "meeting",
      }),
    ]);
  });

  it("stacks every distinct enrichment into one ordered list", () => {
    const chips = enrichmentChips(
      suggestion({
        suggestedPriority: "p2",
        suggestedDueAt: "2026-06-26T00:00:00",
        suggestedLabels: ["home"],
        actionType: "reminder",
      }),
      NOW,
    );
    expect(chips.map((c) => c.kind)).toEqual([
      "priority",
      "due",
      "label",
      "action",
    ]);
  });
});
