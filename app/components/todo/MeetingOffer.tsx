"use client";

import { useEffect, useRef, useState } from "react";
import type { ActionPayload, Attendee, Todo } from "@/lib/contracts";
import { resolveContacts } from "@/app/lib/api";
import { formatDue, formatClock } from "@/app/lib/format";
import type { OfferPanelProps } from "./OfferPanel";
import styles from "./MeetingOffer.module.css";

type Meeting = Extract<ActionPayload, { kind: "meeting" }>;
const DURATIONS = [15, 30, 45, 60];

// Split/recombine an offset-less local ISO ("2026-06-30T09:00:00") <-> date+time.
function splitStart(iso?: string | null): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  return { date: iso.slice(0, 10), time: /^\d{2}:\d{2}/.test(iso.slice(11, 16)) ? iso.slice(11, 16) : "" };
}
function joinStart(date: string, time: string): string | null {
  if (!date) return null;
  return `${date}T${time || "00:00"}:00`;
}

export function MeetingOffer({ todo, onFinish, onPatchPayload, onPatch }: OfferPanelProps) {
  const p = (todo.actionPayload?.kind === "meeting" ? todo.actionPayload : null) as Meeting | null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resolvedOnce = useRef(false);

  // Always-confirm contact: resolve raw names on mount so the user SEES the email
  // before Send (no silent booking, even on a unique match). Runs once.
  useEffect(() => {
    if (!p || resolvedOnce.current) return;
    const raw = p.attendees ?? [];
    if (raw.length && !(p.resolvedAttendees?.length)) {
      resolvedOnce.current = true;
      resolveContacts(raw)
        .then((attendees) => onPatchPayload({ ...p, resolvedAttendees: attendees }))
        .catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!p) return null;

  const title = p.title?.trim() || todo.title;
  const { date, time } = splitStart(p.start);
  const duration = p.durationMin ?? 30;
  const attendees: Attendee[] =
    p.resolvedAttendees ??
    (p.attendees ?? []).map((a) =>
      a.includes("@")
        ? { name: a, email: a, status: "resolved" as const }
        : { name: a, status: "unresolved" as const },
    );
  const allResolved = attendees.length > 0 && attendees.every((a) => a.status === "resolved" && a.email);
  const canSend = !!title && !!date && !!time && allResolved && !busy;

  function patchPayload(next: Partial<Meeting>) {
    onPatchPayload({ ...p!, ...next });
  }
  // When the meeting's date changes, keep the todo's due date in sync (one source
  // of truth — spec: "due date = meeting date").
  function setStart(nextDate: string, nextTime: string) {
    const start = joinStart(nextDate, nextTime);
    patchPayload({ start });
    onPatch?.({ dueAt: nextDate ? `${nextDate}T00:00:00` : null });
  }

  // ---- DONE: booked details + calendar link ----
  if (todo.actionState === "done") {
    const when = p.start
      ? `${formatDue(p.start, new Date()).label}${formatClock(p.start) ? ` · ${formatClock(p.start)}` : ""}`
      : "";
    const emails = (p.resolvedAttendees ?? []).map((a) => a.email).filter(Boolean).join(", ");
    return (
      <div className={styles.panel} data-state="done">
        <p className={styles.eyebrow}>✓ Invite sent</p>
        <p className={styles.bookedTitle}>{title}</p>
        <dl className={styles.details}>
          {emails ? (<><dt>With</dt><dd>{emails}</dd></>) : null}
          {when ? (<><dt>When</dt><dd>{when}</dd></>) : null}
          <dt>Length</dt><dd>{duration} min</dd>
        </dl>
        {p.htmlLink ? (
          <a className={styles.calLink} href={p.htmlLink} target="_blank" rel="noreferrer">
            View in Google Calendar →
          </a>
        ) : null}
      </div>
    );
  }

  async function pickCandidate(index: number, email: string, name?: string) {
    const next = [...attendees];
    next[index] = { ...next[index], email, name: name ?? next[index].name, status: "resolved" };
    patchPayload({ resolvedAttendees: next });
  }

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const res = await onFinish();
      if (res.needsDisambiguation) {
        patchPayload({ resolvedAttendees: res.needsDisambiguation });
      } else if (!res.ok) {
        setError(res.error ?? "Couldn't send the invite.");
      }
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={styles.panel} data-state={todo.actionState}>
      <p className={styles.eyebrow}>Send meeting invite</p>

      <label className={styles.field}>
        <span className={styles.label}>Title</span>
        <input className={styles.text} value={title} onChange={(e) => patchPayload({ title: e.target.value })} />
      </label>

      <div className={styles.when}>
        <label className={styles.field}>
          <span className={styles.label}>Date</span>
          <input type="date" value={date} onChange={(e) => setStart(e.target.value, time)} aria-label="Date" />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Time</span>
          <input type="time" value={time} onChange={(e) => setStart(date, e.target.value)} aria-label="Time" />
        </label>
        <label className={styles.field}>
          <span className={styles.label}>Length</span>
          <select value={duration} onChange={(e) => patchPayload({ durationMin: Number(e.target.value) })}>
            {DURATIONS.map((d) => (<option key={d} value={d}>{d}m</option>))}
          </select>
        </label>
      </div>

      <div className={styles.attendees}>
        <span className={styles.label}>With</span>
        {attendees.map((a, i) =>
          a.status === "resolved" && a.email ? (
            <p key={i} className={styles.resolved}>✓ {a.name ?? a.email} &lt;{a.email}&gt;</p>
          ) : (
            <div key={i} className={styles.unresolved}>
              <span className={styles.who}>{a.name ?? "?"}</span>
              <div className={styles.candidates}>
                {(a.candidates ?? []).map((c) => (
                  <button key={c.email} type="button" className={styles.candidate}
                    disabled={busy} onClick={() => pickCandidate(i, c.email, c.name)}>
                    {c.name} &lt;{c.email}&gt;
                  </button>
                ))}
                {(a.candidates ?? []).length === 0 ? (
                  <>
                    <span className={styles.noMatch}>No match — type their email</span>
                    <input className={styles.emailInput} type="email" placeholder="name@email.com"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          const v = (e.target as HTMLInputElement).value.trim();
                          if (v) void pickCandidate(i, v);
                        }
                      }} />
                  </>
                ) : null}
              </div>
            </div>
          ),
        )}
      </div>

      <button type="button" className={styles.send} disabled={!canSend} onClick={send}>
        {busy ? "Sending…" : "Send invite"}
      </button>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <p className={styles.guarantee}>You confirm before anything is sent.</p>
    </div>
  );
}
