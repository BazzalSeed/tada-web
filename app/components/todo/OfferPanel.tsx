"use client";

import { useState } from "react";
import type { ActionPayload, Attendee, Todo } from "@/lib/contracts";
import type { FinishResponse } from "@/app/lib/api";
import { MeetingOffer } from "./MeetingOffer";
import { doneEyebrow, offerEffect, offerSubject } from "@/app/lib/offer";
import styles from "./OfferPanel.module.css";

// FIX2 — the "do it for me" offer, the spec's headline differentiator #2: the
// offer shows the CONCRETE effect; the tap is the confirmation; we NEVER
// auto-execute. Renders the effect + a single do-it button, and resolves the two
// gated states the finish route can return:
//   • needsField  → one inline ask (e.g. a missing time), then re-attempt.
//   • needs_disambiguation → per-attendee candidate pickers, then send.
// Outcome states: done (executed confirmation) / failed (error + retry).
export interface OfferPanelProps {
  todo: Todo;
  // POST the finish; the parent reflects the persisted result into the store and
  // returns it so this panel can drive the inline-resolution UI.
  onFinish: () => Promise<FinishResponse>;
  // PATCH the actionPayload (resolve a field / pick an attendee) before re-finishing.
  onPatchPayload: (payload: ActionPayload) => Promise<void>;
  // todo-level patch (meeting due-date sync)
  onPatch?: (patch: Partial<Todo>) => void;
}

// datetime-local needs ISO without the trailing seconds/zone; our payloads are
// offset-less local already. "attendees" is a free-text name.
const DATE_FIELDS = new Set(["start", "remindAt"]);

export function OfferPanel({ todo, onFinish, onPatchPayload, onPatch }: OfferPanelProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsField, setNeedsField] = useState<string | null>(null);
  const [fieldValue, setFieldValue] = useState("");

  // Delegate meetings to the focused MeetingOffer review card (must come before
  // the done-state check so meetings get their own done rendering too).
  if (todo.actionType === "meeting") {
    return (
      <MeetingOffer todo={todo} onFinish={onFinish} onPatchPayload={onPatchPayload} onPatch={onPatch} />
    );
  }

  // Executed — show the calm confirmation, not the offer. (describeOffer returns
  // null for a done action, so handle it before deriving the effect.)
  if (todo.actionState === "done") {
    return (
      <div className={styles.panel} data-state="done">
        <span className={styles.doneMark} aria-hidden="true">
          ✓
        </span>
        <div className={styles.body}>
          <p className={styles.eyebrow}>{doneEyebrow(todo)}</p>
          <p className={styles.title}>{offerSubject(todo)}</p>
        </div>
      </div>
    );
  }

  // The offer's concrete effect + the never-auto-execute gate, from the single
  // source of truth (describeOffer). null → nothing to offer.
  const effect = offerEffect(todo);
  if (!effect) return null;

  // The inline ask: a server-bounced needsField overrides the up-front one that
  // describeOffer flags (missing start / attendees / remindAt).
  const ask = needsField ?? effect.needsField;

  async function runFinish() {
    setBusy(true);
    setError(null);
    try {
      const res = await onFinish();
      if (res.needsField) {
        setNeedsField(res.needsField);
      } else if (res.needsDisambiguation) {
        setNeedsField(null); // the panel re-renders into the picker via todo state
      } else if (!res.ok) {
        setError(res.error ?? "Couldn't complete that.");
      } else {
        setNeedsField(null);
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  // Save the asked-for field onto the payload, then surface the Do-it button so
  // the tap stays the explicit confirmation (never auto-execute after a fill).
  async function submitField() {
    if (!ask) return;
    const value = fieldValue.trim();
    if (!value) return;
    const payload = withField(todo.actionPayload, ask, value);
    if (!payload) return;
    setBusy(true);
    setError(null);
    try {
      await onPatchPayload(payload);
      setNeedsField(null);
      setFieldValue("");
    } catch {
      setError("Couldn't save that. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function pickAttendee(index: number, email: string, name?: string) {
    const payload = withResolvedAttendee(todo.actionPayload, index, email, name);
    if (!payload) return;
    setBusy(true);
    setError(null);
    try {
      await onPatchPayload(payload);
    } finally {
      setBusy(false);
    }
  }

  // Disambiguation picker — render whenever the meeting has unresolved attendees
  // with candidates (the parked state the finish route returns).
  const meeting =
    todo.actionPayload?.kind === "meeting" ? todo.actionPayload : null;
  const resolved = meeting?.resolvedAttendees ?? [];
  const unresolved = resolved.filter((a) => a.status !== "resolved");
  const showPicker =
    todo.actionState === "needs_disambiguation" && resolved.length > 0;

  return (
    <div className={styles.panel} data-state={todo.actionState}>
      <p className={styles.eyebrow}>{effect.eyebrow}</p>
      {effect.lines.map((l, i) => (
        <p key={i} className={styles.title}>
          {l}
        </p>
      ))}

      {showPicker ? (
        <div className={styles.picker}>
          <p className={styles.askLabel}>
            {unresolved.length > 0
              ? "Who do you mean?"
              : "Everyone's confirmed."}
          </p>
          {resolved.map((a, i) =>
            a.status === "resolved" ? (
              <p key={i} className={styles.resolved}>
                ✓ {a.name ?? a.email} &lt;{a.email}&gt;
              </p>
            ) : (
              <div key={i} className={styles.attendee}>
                <span className={styles.attendeeName}>{a.name ?? "?"}</span>
                <div className={styles.candidates}>
                  {(a.candidates ?? []).map((c) => (
                    <button
                      key={c.email}
                      type="button"
                      className={styles.candidate}
                      disabled={busy}
                      onClick={() => pickAttendee(i, c.email, c.name)}
                    >
                      {c.name} &lt;{c.email}&gt;
                    </button>
                  ))}
                  {(a.candidates ?? []).length === 0 ? (
                    <span className={styles.detail}>No matches found.</span>
                  ) : null}
                </div>
              </div>
            ),
          )}
          {unresolved.length === 0 ? (
            <button
              type="button"
              className={styles.doIt}
              disabled={busy}
              onClick={runFinish}
            >
              {busy ? "Sending…" : effect.cta}
            </button>
          ) : null}
        </div>
      ) : ask ? (
        <div className={styles.ask}>
          <label className={styles.askLabel}>
            {fieldPrompt(ask)}
            <input
              className={styles.askInput}
              type={DATE_FIELDS.has(ask) ? "datetime-local" : "text"}
              value={fieldValue}
              autoFocus
              onChange={(e) => setFieldValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void submitField();
                }
              }}
            />
          </label>
          <button
            type="button"
            className={styles.doIt}
            disabled={busy || !fieldValue.trim()}
            onClick={submitField}
          >
            Save
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={styles.doIt}
          disabled={busy}
          onClick={runFinish}
        >
          {busy ? "Working…" : effect.cta}
        </button>
      )}

      {error ? (
        <p className={styles.error} role="alert">
          {error}{" "}
          <button type="button" className={styles.retry} onClick={runFinish}>
            Retry
          </button>
        </p>
      ) : null}

      <p className={styles.guarantee}>You confirm before anything is sent.</p>
    </div>
  );
}

function fieldPrompt(field: string): string {
  switch (field) {
    case "start":
      return "When should the meeting be?";
    case "remindAt":
      return "When should I remind you?";
    case "attendees":
      return "Who's the meeting with?";
    default:
      return `Need ${field} to continue`;
  }
}

// Immutably set a single missing field on the payload (the needsField ask).
// attendees is a string[] (a typed name); the rest are scalar fields.
function withField(
  payload: ActionPayload | null | undefined,
  field: string,
  value: string,
): ActionPayload | null {
  if (!payload) return null;
  if (field === "attendees") {
    return { ...payload, attendees: [value] } as ActionPayload;
  }
  return { ...payload, [field]: value } as ActionPayload;
}

// Resolve one attendee to a chosen candidate (the disambiguation pick).
function withResolvedAttendee(
  payload: ActionPayload | null | undefined,
  index: number,
  email: string,
  name?: string,
): ActionPayload | null {
  if (!payload || payload.kind !== "meeting") return null;
  const resolved = [...(payload.resolvedAttendees ?? [])];
  const prev = resolved[index];
  const next: Attendee = {
    ...prev,
    name: name ?? prev?.name,
    email,
    status: "resolved",
  };
  resolved[index] = next;
  return { ...payload, resolvedAttendees: resolved };
}
