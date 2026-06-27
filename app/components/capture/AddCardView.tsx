"use client";

import { useMemo, useState } from "react";
import type { Todo } from "@/lib/contracts";
import { parseQuickAdd } from "@/lib/core";
import { createTodo, enrichText, patchTodo } from "@/app/lib/api";
import { enrichmentChips, type EnrichmentChip } from "@/app/lib/enrich";
import { useEnsureLabel, useTada } from "@/app/lib/store";
import { HighlightedInput } from "./HighlightedInput";
import { MicButton } from "./MicButton";
import { EnrichmentBar } from "./EnrichmentBar";
import styles from "./AddCardView.module.css";

// Quick-add card (rendered only in All). Deterministic parseQuickAdd drives the
// live highlight; submit creates a plain todo INSTANTLY (model never in the hot
// path) and snaps selection back to All. AI enrichment is layered later (T2.5).
export function AddCardView() {
  const { state, dispatch } = useTada();
  const ensureLabel = useEnsureLabel();
  const [text, setText] = useState("");
  const parsed = useMemo(() => parseQuickAdd(text), [text]);
  // Async enrichment offers for the most-recently-added todo (T2.5).
  const [enrichTarget, setEnrichTarget] = useState<Todo | null>(null);
  const [chips, setChips] = useState<EnrichmentChip[]>([]);

  // Keep only chips that ADD something the deterministic parse didn't already
  // capture — no point re-offering a priority/label/date the user already typed.
  function novelChips(all: EnrichmentChip[], todo: Todo): EnrichmentChip[] {
    const labelNames = new Set(
      todo.labelIds
        .map((id) => state.labels.find((l) => l.id === id)?.name)
        .filter(Boolean),
    );
    return all.filter((c) => {
      switch (c.kind) {
        case "priority":
          return todo.priority === "none";
        case "due":
          return !todo.dueAt;
        case "recurrence":
          return !todo.recurrence;
        case "label":
          return !labelNames.has(c.labelName);
        case "action":
          return todo.actionType === "none";
        case "note":
          return !todo.detail?.trim();
      }
    });
  }

  // Apply one accepted suggestion: merge a concrete patch into the target todo,
  // reflect it optimistically, persist via PATCH, and consume the chip. Nothing
  // here runs without the explicit tap that calls it.
  function acceptChip(chip: EnrichmentChip) {
    if (!enrichTarget) return;
    let patch: Partial<Todo>;
    switch (chip.kind) {
      case "priority":
        patch = { priority: chip.priority };
        break;
      case "due":
        patch = { dueAt: chip.dueAt };
        break;
      case "recurrence":
        patch = { recurrence: chip.recurrence };
        break;
      case "action":
        // Apply the type AND the pre-classified payload so the offer is ready (FIX4).
        patch = chip.actionPayload
          ? { actionType: chip.actionType, actionPayload: chip.actionPayload }
          : { actionType: chip.actionType };
        break;
      case "note":
        patch = { detail: chip.detail };
        break;
      case "label":
        patch = { labelIds: [...enrichTarget.labelIds, ...resolveLabelIds([chip.labelName])] };
        break;
    }
    const merged = { ...enrichTarget, ...patch };
    setEnrichTarget(merged);
    dispatch({ type: "UPSERT_TODO", todo: merged });
    setChips((cs) => cs.filter((c) => c.key !== chip.key));
    patchTodo(merged.id, patch).catch(() => {
      // interim: keep the optimistic merge until persistence is authed.
    });
  }

  // Resolve @labels to persisted ids, creating unknown labels inline via
  // /api/labels (optimistic id now, reconciled in the background).
  function resolveLabelIds(names: string[]): string[] {
    return names.map((name) => ensureLabel(name).id);
  }

  async function submit() {
    const title = parsed.title.trim();
    if (!title) return;

    const labelIds = resolveLabelIds(parsed.labelNames);
    // New todos sort to the top of All (lowest sortIndex sorts highest).
    const minSort = state.todos.reduce(
      (m, t) => Math.min(m, t.sortIndex),
      0,
    );
    const optimistic: Todo = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      sourceCaptureId: "",
      title,
      status: "open",
      actionType: "none",
      actionState: "none",
      sortIndex: minSort - 1,
      priority: parsed.priority,
      labelIds,
      dueAt: parsed.dueAt ?? undefined,
      recurrence: parsed.recurrence ?? undefined,
    };
    dispatch({ type: "UPSERT_TODO", todo: optimistic });
    dispatch({ type: "SELECT_NAV", selection: { kind: "all" } });
    // Clear any prior suggestions; new capture, fresh offers.
    setChips([]);
    setEnrichTarget(null);
    const rawText = text;
    setText("");

    // The row the enrichment pass targets — the server todo once it lands (so
    // accepted chips PATCH the real cuid), falling back to the optimistic row.
    let persisted: Todo = optimistic;
    try {
      const saved = await createTodo({
        title,
        priority: parsed.priority,
        labelIds,
        dueAt: parsed.dueAt ?? undefined,
        recurrence: parsed.recurrence ?? undefined,
        sortIndex: optimistic.sortIndex,
      });
      if (saved) {
        persisted = saved;
        // Replace the optimistic temp row in place — never append (FIX3: no dup row).
        dispatch({ type: "RECONCILE_TODO", tempId: optimistic.id, todo: saved });
      }
    } catch {
      // interim: keep the optimistic todo until persistence is authed.
    }

    // Fire the async AI pass over the ORIGINAL text (full context) and fold any
    // novel suggestions into tappable chips. Never auto-applies.
    enrichText(rawText)
      .then((suggestions) => {
        const first = suggestions[0];
        if (!first) return;
        const offered = novelChips(enrichmentChips(first, new Date()), persisted);
        if (offered.length === 0) return;
        setEnrichTarget(persisted);
        setChips(offered);
      })
      .catch(() => {
        // enrichment is best-effort; silence failures (quota / offline / pre-auth).
      });
  }

  return (
    <div className={styles.card}>
      <span className={styles.plus} aria-hidden="true">
        +
      </span>
      <HighlightedInput
        value={text}
        tokens={parsed.tokens}
        onChange={setText}
        onSubmit={submit}
        placeholder="Add task — try “Plan offsite tomorrow p1 @work”"
      />
      <MicButton
        onTranscript={(spoken) =>
          setText((prev) => (prev.trim() ? `${prev} ${spoken}` : spoken))
        }
      />
      <EnrichmentBar
        chips={chips}
        onAccept={acceptChip}
        onDismiss={() => {
          setChips([]);
          setEnrichTarget(null);
        }}
      />
    </div>
  );
}
