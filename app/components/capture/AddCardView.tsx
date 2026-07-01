"use client";

import { useMemo, useRef, useState } from "react";
import type { Todo } from "@/lib/contracts";
import { parseQuickAdd } from "@/lib/core";
import { createTodo, enrichText } from "@/app/lib/api";
import { enrichmentChips, type EnrichmentChip } from "@/app/lib/enrich";
import { useEnsureLabel, useTada } from "@/app/lib/store";
import { useImageCapture } from "@/app/lib/useImageCapture";
import { useCaptureReviewContext } from "@/app/lib/useCaptureReview";
import { HighlightedInput } from "./HighlightedInput";
import { MicButton } from "./MicButton";
import styles from "./AddCardView.module.css";

// A single short line stays INSTANT (unchanged path below); anything longer
// or multi-line is a capture worth reviewing — route it to the propose/
// approve modal instead of guessing at one todo.
const MULTI_CAPTURE_MIN = 140;
function isMultiCapture(t: string) {
  return /\n/.test(t) || t.trim().length > MULTI_CAPTURE_MIN;
}

// Quick-add card (rendered only in All). Deterministic parseQuickAdd drives the
// live highlight; submit creates a plain todo INSTANTLY (model never in the hot
// path) and snaps selection back to All. AI enrichment is layered later (T2.5).
export function AddCardView() {
  const { state, dispatch } = useTada();
  const ensureLabel = useEnsureLabel();
  const [text, setText] = useState("");
  const parsed = useMemo(() => parseQuickAdd(text), [text]);
  const { ingest: ingestImage } = useImageCapture();
  const review = useCaptureReviewContext();
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Resolve #labels to persisted ids, creating unknown labels inline via
  // /api/labels (optimistic id now, reconciled in the background).
  function resolveLabelIds(names: string[]): string[] {
    return names.map((name) => ensureLabel(name).id);
  }

  async function submit() {
    const rawText = text;
    if (!rawText.trim()) return;
    if (isMultiCapture(rawText)) {
      review.start({ kind: "text", text: rawText });
      setText("");
      return;
    }

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
    dispatch({ type: "CLEAR_ENRICHMENT" });
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
    dispatch({ type: "SET_ENRICHING", id: persisted.id });
    enrichText(rawText)
      .then((suggestions) => {
        const first = suggestions[0];
        if (!first) return;
        const offered = novelChips(enrichmentChips(first, new Date()), persisted);
        if (offered.length) dispatch({ type: "SET_ENRICHMENT", todoId: persisted.id, chips: offered });
      })
      .catch(() => {
        // enrichment is best-effort; silence failures (quota / offline / pre-auth).
      })
      .finally(() => dispatch({ type: "SET_ENRICHING", id: null }));
  }

  return (
    <div className={styles.card}>
      <div className={styles.row}>
        <span className={styles.plus} aria-hidden="true">
          +
        </span>
        <HighlightedInput
          value={text}
          tokens={parsed.tokens}
          onChange={setText}
          onSubmit={submit}
          placeholder="Add task — try “Plan offsite tomorrow p1 #work”"
        />
        <MicButton
          onTranscript={(spoken) =>
            setText((prev) => (prev.trim() ? `${prev} ${spoken}` : spoken))
          }
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className={styles.screenshotInput}
          aria-hidden="true"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []).filter((f) =>
              f.type.startsWith("image/"),
            );
            if (files.length) void ingestImage(files);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          className={styles.screenshotBtn}
          title="Add a screenshot — Tada turns it into todos"
          aria-label="Add a screenshot — Tada turns it into todos"
          onClick={() => fileInputRef.current?.click()}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 16V4M7 9l5-5 5 5" />
            <path d="M5 20h14" />
          </svg>
          <span className={styles.screenshotLabel}>Screenshot → todos</span>
        </button>
      </div>
      {!text.trim() ? (
        <p className={styles.hint}>
          Paste or upload a screenshot, or type a paragraph — Tada makes todos.
        </p>
      ) : null}
    </div>
  );
}
