// T2.5 — quick-add enrichment (client half). The add-card creates a plain todo
// instantly; this fires an async Gemini pass (POST /api/enrich, non-mutating) and
// folds the returned suggestions into TAPPABLE chips. Each chip names its concrete
// effect and applies only on an explicit tap (never auto-execute) via PATCH.

import type {
  ActionType,
  ExtractedTodo,
  Priority,
  RecurrenceRule,
} from "@/lib/contracts";
import { parseQuickAdd } from "@/lib/core";
import { formatDue } from "./format";

// One accept-or-dismiss offer. `kind` drives how the container turns it into a
// Todo patch; `label` is the concrete effect shown on the chip.
export type EnrichmentChip =
  | { key: string; kind: "priority"; label: string; priority: Priority }
  | { key: string; kind: "due"; label: string; dueAt: string }
  | { key: string; kind: "recurrence"; label: string; recurrence: RecurrenceRule }
  | { key: string; kind: "label"; label: string; labelName: string }
  | { key: string; kind: "action"; label: string; actionType: ActionType };

const ACTION_LABELS: Record<Exclude<ActionType, "none">, string> = {
  meeting: "Meeting",
  reminder: "Reminder",
  research: "Research",
};

// Pure: ExtractedTodo -> ordered chips. Skips fields that add nothing (null,
// "none", an unparseable recurrence phrase). `now` is injected for date labels.
export function enrichmentChips(
  s: ExtractedTodo,
  now: Date,
): EnrichmentChip[] {
  const chips: EnrichmentChip[] = [];

  if (s.suggestedPriority && s.suggestedPriority !== "none") {
    const p = s.suggestedPriority;
    chips.push({
      key: `priority:${p}`,
      kind: "priority",
      label: p.toUpperCase(),
      priority: p,
    });
  }

  if (s.suggestedDueAt) {
    chips.push({
      key: `due:${s.suggestedDueAt}`,
      kind: "due",
      label: formatDue(s.suggestedDueAt, now).label,
      dueAt: s.suggestedDueAt,
    });
  }

  for (const name of s.suggestedLabels ?? []) {
    chips.push({
      key: `label:${name}`,
      kind: "label",
      label: `@${name}`,
      labelName: name,
    });
  }

  if (s.recurrenceText) {
    // Reuse the frozen deterministic parser; drop phrases it can't resolve.
    const rule = parseQuickAdd(s.recurrenceText, now).recurrence;
    if (rule) {
      chips.push({
        key: `recurrence:${s.recurrenceText}`,
        kind: "recurrence",
        label: "Repeats",
        recurrence: rule,
      });
    }
  }

  if (s.actionType !== "none") {
    chips.push({
      key: `action:${s.actionType}`,
      kind: "action",
      label: ACTION_LABELS[s.actionType],
      actionType: s.actionType,
    });
  }

  return chips;
}
