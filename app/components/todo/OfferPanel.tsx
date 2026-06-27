"use client";

import { useState } from "react";
import type { ActionPayload, Attendee, Todo } from "@/lib/contracts";
import type { FinishResponse } from "@/app/lib/api";
import { offerEffect } from "@/app/lib/offer";
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
  now?: Date;
  // POST the finish; the parent reflects the persisted result into the store and
  // returns it so this panel can drive the inline-resolution UI.
  onFinish: () => Promise<FinishResponse>;
  // PATCH the actionPayload (resolve a field / pick an attendee) before re-finishing.
  onPatchPayload: (payload: ActionPayload) => Promise<void>;
}

// datetime-local needs ISO without the trailing seconds/zone; our payloads are
// offset-less local already.
const DATE_FIELDS = new Set(["start", "remindAt"]);

export function OfferPanel({
  todo,
  now = new Date(),
  onFinish,
  onPatchPayload,
}: OfferPanelProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsField, setNeedsField] = useState<string | null>(null);
  const [fieldValue, setFieldValue] = useState("");

  const effect = offerEffect(todo, now);
  if (!effect) return null;

  // A required field we can detect up-front (so we ask BEFORE the tap, not only
  // after the server bounces it back).
  const proactiveMissing = requiredField(todo);
  const ask = needsField ?? proactiveMissing;

  // Executed — show the calm confirmation, not the offer.
  if (todo.actionState === "done") {
    return (
      <div className={styles.panel} data-state="done">
        <span className={styles.doneMark} aria-hidden="true">
          ✓
        </span>
        <div className={styles.body}>
          <p className={styles.eyebrow}>{doneEyebrow(todo)}</p>
          <p className={styles.title}>{effect.title}</p>
        </div>
      </div>
    );
  }

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
      <p className={styles.title}>{effect.title}</p>
      {effect.lines.map((l, i) => (
        <p key={i} className={styles.detail}>
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

function doneEyebrow(todo: Todo): string {
  switch (todo.actionType) {
    case "meeting":
      return "Invite sent";
    case "reminder":
      return "Reminder set";
    case "research":
      return "Research written into notes";
    default:
      return "Done";
  }
}

// Essential field we can detect missing up-front (the deterministic "one inline
// question" the spec calls for). Meetings need a time; reminders need a time.
function requiredField(todo: Todo): string | null {
  const p = todo.actionPayload;
  if (todo.actionType === "meeting" && !(p?.kind === "meeting" && p.start))
    return "start";
  if (todo.actionType === "reminder" && !(p?.kind === "reminder" && p.remindAt))
    return "remindAt";
  return null;
}

function fieldPrompt(field: string): string {
  switch (field) {
    case "start":
      return "When should the meeting be?";
    case "remindAt":
      return "When should I remind you?";
    default:
      return `Need ${field} to continue`;
  }
}

// Immutably set a single missing field on the payload (the needsField ask).
function withField(
  payload: ActionPayload | null | undefined,
  field: string,
  value: string,
): ActionPayload | null {
  if (!payload) return null;
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
