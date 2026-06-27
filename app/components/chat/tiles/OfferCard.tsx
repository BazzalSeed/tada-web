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
};

const APPROVE_LABEL: Record<ProposedAction["kind"], string> = {
  todo: "Approve & add",
  meeting: "Approve & send",
  reminder: "Approve & set",
  research: "Approve & run",
};

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
    const when = action.dueAt ? formatDue(action.dueAt, now).label : null;
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
    const when = action.start ? formatDue(action.start, now).label : "time TBD";
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
    const when = action.remindAt ? formatDue(action.remindAt, now).label : null;
    return (
      <div className={styles.effect}>
        <p className={styles.title}>{action.text}</p>
        {when ? <p className={styles.detail}>{when}</p> : null}
      </div>
    );
  }
  return (
    <div className={styles.effect}>
      <p className={styles.title}>{action.topic}</p>
    </div>
  );
}
