"use client";

import { useState } from "react";
import type { ActionPayload, Attendee, ContactCandidate } from "@/lib/contracts";
import { formatDue } from "@/app/lib/format";
import styles from "./OfferCard.module.css";

// Gated-write offer tile — the never-auto-execute invariant in the UI. Shows the
// CONCRETE effect (meeting / reminder / research) and fires only on an explicit
// Approve. For meetings, Send stays gated until every attendee is resolved; each
// unresolved attendee shows a candidate picker (T3.2 disambiguation).
export interface OfferCardProps {
  payload: ActionPayload;
  attendees?: Attendee[] | null;
  onApprove: () => void;
  onDeny: () => void;
  // Resolve an unresolved attendee to a concrete email (picked candidate or typed).
  onResolveAttendee?: (name: string, email: string) => void;
  status?: "pending" | "running" | "approved" | "denied";
  now?: Date;
}

function attendeeName(a: Attendee, i: number): string {
  return a.name ?? a.email ?? `attendee ${i + 1}`;
}

export function OfferCard({
  payload,
  attendees,
  onApprove,
  onDeny,
  onResolveAttendee,
  status = "pending",
  now = new Date(),
}: OfferCardProps) {
  const allResolved =
    payload.kind !== "meeting" ||
    !attendees ||
    attendees.every((a) => a.status === "resolved");
  const settled = status === "approved" || status === "denied";

  return (
    <div className={styles.card} data-status={status}>
      <span className={styles.eyebrow}>
        {payload.kind === "meeting"
          ? "Send meeting invite"
          : payload.kind === "reminder"
            ? "Set reminder"
            : "Run deep research"}
      </span>

      <OfferEffect payload={payload} now={now} />

      {payload.kind === "meeting" && attendees && attendees.length > 0 ? (
        <ul className={styles.attendees}>
          {attendees.map((a, i) => (
            <AttendeeRow
              key={attendeeName(a, i)}
              attendee={a}
              index={i}
              onResolve={onResolveAttendee}
            />
          ))}
        </ul>
      ) : null}

      {settled ? (
        <p className={styles.settled}>
          {status === "approved" ? "Approved." : "Dismissed."}
        </p>
      ) : (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.deny}
            onClick={onDeny}
          >
            Deny
          </button>
          <button
            type="button"
            className={styles.approve}
            disabled={!allResolved || status === "running"}
            onClick={onApprove}
          >
            {payload.kind === "meeting"
              ? "Approve & send"
              : payload.kind === "reminder"
                ? "Approve & set"
                : "Approve & run"}
          </button>
        </div>
      )}
    </div>
  );
}

function OfferEffect({ payload, now }: { payload: ActionPayload; now: Date }) {
  if (payload.kind === "meeting") {
    const when = payload.start ? formatDue(payload.start, now).label : "time TBD";
    return (
      <div className={styles.effect}>
        <p className={styles.title}>{payload.title}</p>
        <p className={styles.detail}>
          {when}
          {payload.durationMin ? ` · ${payload.durationMin} min` : ""}
        </p>
      </div>
    );
  }
  if (payload.kind === "reminder") {
    const when = payload.remindAt ? formatDue(payload.remindAt, now).label : null;
    return (
      <div className={styles.effect}>
        <p className={styles.title}>{payload.text}</p>
        {when ? <p className={styles.detail}>{when}</p> : null}
      </div>
    );
  }
  return (
    <div className={styles.effect}>
      <p className={styles.title}>{payload.topic}</p>
    </div>
  );
}

function AttendeeRow({
  attendee,
  index,
  onResolve,
}: {
  attendee: Attendee;
  index: number;
  onResolve?: (name: string, email: string) => void;
}) {
  const name = attendeeName(attendee, index);
  const [typed, setTyped] = useState("");

  if (attendee.status === "resolved") {
    return (
      <li className={styles.attendee} data-resolved="true">
        <span className={styles.aName}>{name}</span>
        <span className={styles.aEmail}>{attendee.email}</span>
      </li>
    );
  }

  return (
    <li className={styles.attendee} data-resolved="false">
      <span className={styles.aName}>{name} — pick one:</span>
      <div className={styles.candidates}>
        {(attendee.candidates ?? []).map((c: ContactCandidate) => (
          <button
            key={c.email}
            type="button"
            className={styles.candidate}
            onClick={() => onResolve?.(name, c.email)}
          >
            <span className={styles.cName}>{c.name}</span>
            <span className={styles.cEmail}>{c.email}</span>
            {c.org ? <span className={styles.cOrg}>{c.org}</span> : null}
          </button>
        ))}
        <form
          className={styles.enter}
          onSubmit={(e) => {
            e.preventDefault();
            if (typed.trim()) onResolve?.(name, typed.trim());
          }}
        >
          <input
            type="email"
            className={styles.enterInput}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="or enter an email"
            aria-label={`Email for ${name}`}
          />
        </form>
      </div>
    </li>
  );
}
