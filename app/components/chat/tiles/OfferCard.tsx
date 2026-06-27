"use client";

import { formatDue } from "@/app/lib/format";
import type { ProposedAction } from "../cards";
import styles from "./OfferCard.module.css";

// Gated-write offer tile — the never-auto-execute invariant in the UI. Shows the
// CONCRETE proposed effect (create todo / meeting / reminder / research) and
// fires only on an explicit Approve. Approval runs the executor SERVER-SIDE
// (native AI SDK HITL); contact disambiguation, if any, surfaces in the result.
export interface OfferCardProps {
  action: ProposedAction;
  onApprove: () => void;
  onDeny: () => void;
  status?: "pending" | "running" | "denied";
  now?: Date;
}

const EYEBROW: Record<ProposedAction["kind"], string> = {
  todo: "Create todo",
  meeting: "Send meeting invite",
  reminder: "Set reminder",
  research: "Run deep research",
  complete: "Complete todo",
  uncomplete: "Reopen todo",
  edit: "Update todo",
};

const APPROVE_LABEL: Record<ProposedAction["kind"], string> = {
  todo: "Approve & add",
  meeting: "Approve & send",
  reminder: "Approve & set",
  research: "Approve & run",
  complete: "Approve & complete",
  uncomplete: "Approve & reopen",
  edit: "Approve & update",
};

const PRIORITY_LABEL: Record<string, string> = {
  none: "No priority",
  p1: "P1",
  p2: "P2",
  p3: "P3",
};

// The agent should emit offset-less ISO, but sometimes hands back a natural
// phrase ("6pm today"). Format ISO dates; show anything else verbatim (never
// "undefined NaN, NaN").
function whenLabel(iso: string | null | undefined, now: Date): string | null {
  if (!iso) return null;
  return /^\d{4}-\d{2}-\d{2}/.test(iso) ? formatDue(iso, now).label : iso;
}

export function OfferCard({
  action,
  onApprove,
  onDeny,
  status = "pending",
  now = new Date(),
}: OfferCardProps) {
  const settled = status === "denied";

  return (
    <div className={styles.card} data-status={status}>
      <span className={styles.eyebrow}>{EYEBROW[action.kind]}</span>

      <OfferEffect action={action} now={now} />

      {settled ? (
        <p className={styles.settled}>Dismissed.</p>
      ) : (
        <div className={styles.actions}>
          <button type="button" className={styles.deny} onClick={onDeny}>
            Deny
          </button>
          <button
            type="button"
            className={styles.approve}
            disabled={status === "running"}
            onClick={onApprove}
          >
            {APPROVE_LABEL[action.kind]}
          </button>
        </div>
      )}
    </div>
  );
}

function OfferEffect({ action, now }: { action: ProposedAction; now: Date }) {
  if (action.kind === "todo") {
    const when = whenLabel(action.dueAt, now);
    return (
      <div className={styles.effect}>
        <p className={styles.title}>{action.title}</p>
        {when || action.priority ? (
          <p className={styles.detail}>
            {when ?? ""}
            {when && action.priority ? " · " : ""}
            {action.priority ? action.priority.toUpperCase() : ""}
          </p>
        ) : null}
      </div>
    );
  }
  if (action.kind === "meeting") {
    const when = whenLabel(action.start, now) ?? "time TBD";
    const who = action.attendees?.length ? action.attendees.join(", ") : null;
    return (
      <div className={styles.effect}>
        <p className={styles.title}>{action.title}</p>
        <p className={styles.detail}>
          {when}
          {action.durationMin ? ` · ${action.durationMin} min` : ""}
        </p>
        {who ? <p className={styles.detail}>{`with ${who}`}</p> : null}
      </div>
    );
  }
  if (action.kind === "reminder") {
    const when = whenLabel(action.remindAt, now);
    return (
      <div className={styles.effect}>
        <p className={styles.title}>{action.text}</p>
        {when ? <p className={styles.detail}>{when}</p> : null}
      </div>
    );
  }
  if (action.kind === "complete") {
    return (
      <div className={styles.effect}>
        <p className={styles.title}>Mark the todo done</p>
      </div>
    );
  }
  if (action.kind === "uncomplete") {
    return (
      <div className={styles.effect}>
        <p className={styles.title}>Reopen the todo</p>
      </div>
    );
  }
  if (action.kind === "edit") {
    const changes: string[] = [];
    if (action.title) changes.push(`Rename to “${action.title}”`);
    const when = whenLabel(action.dueAt, now);
    if (action.dueAt !== undefined && action.dueAt !== null && when)
      changes.push(`Due ${when}`);
    if (action.priority) changes.push(PRIORITY_LABEL[action.priority] ?? action.priority);
    if (action.labels && action.labels.length)
      changes.push(action.labels.map((l) => `@${l}`).join(" "));
    return (
      <div className={styles.effect}>
        <p className={styles.title}>
          {changes.length ? changes[0] : "Update the todo"}
        </p>
        {changes.slice(1).map((c, i) => (
          <p key={i} className={styles.detail}>
            {c}
          </p>
        ))}
      </div>
    );
  }
  return (
    <div className={styles.effect}>
      <p className={styles.title}>{action.topic}</p>
    </div>
  );
}
