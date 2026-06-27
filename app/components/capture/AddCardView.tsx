"use client";

import { useMemo, useState } from "react";
import type { Todo, TodoLabel } from "@/lib/contracts";
import { parseQuickAdd } from "@/lib/core";
import { createTodo } from "@/app/lib/api";
import { useTada } from "@/app/lib/store";
import { HighlightedInput } from "./HighlightedInput";
import styles from "./AddCardView.module.css";

const ACCENT = "#c8632e";

// Quick-add card (rendered only in All). Deterministic parseQuickAdd drives the
// live highlight; submit creates a plain todo INSTANTLY (model never in the hot
// path) and snaps selection back to All. AI enrichment is layered later (T2.5).
export function AddCardView() {
  const { state, dispatch } = useTada();
  const [text, setText] = useState("");
  const parsed = useMemo(() => parseQuickAdd(text), [text]);

  // Resolve @labels to ids, creating any unknown label inline (lowercased).
  function resolveLabelIds(names: string[]): string[] {
    const ids: string[] = [];
    for (const name of names) {
      const existing = state.labels.find((l) => l.name === name);
      if (existing) {
        ids.push(existing.id);
        continue;
      }
      const label: TodoLabel = {
        id: crypto.randomUUID(),
        name,
        colorHex: ACCENT,
      };
      dispatch({ type: "UPSERT_LABEL", label });
      ids.push(label.id);
    }
    return ids;
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
    setText("");

    try {
      const saved = await createTodo({
        title,
        priority: parsed.priority,
        labelIds,
        dueAt: parsed.dueAt ?? undefined,
        recurrence: parsed.recurrence ?? undefined,
        sortIndex: optimistic.sortIndex,
      });
      if (saved) dispatch({ type: "UPSERT_TODO", todo: saved });
    } catch {
      // interim: keep the optimistic todo until persistence is authed.
    }
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
    </div>
  );
}
