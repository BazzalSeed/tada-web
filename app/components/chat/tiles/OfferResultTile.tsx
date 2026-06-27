import type { ExecResult } from "@/lib/contracts";
import styles from "./ResultTile.module.css";

// Executed gated-write result — what actually happened after the user approved a
// reminder/meeting. Booked/set shows the confirmation; an unresolved attendee or
// missing field shows the honest "couldn't confirm" so we never imply a write
// that didn't land (matches /api/todos/:id/finish's ExecResult handling).
export interface OfferResultTileProps {
  kind: "reminder" | "meeting";
  result: ExecResult;
}

const NOUN: Record<OfferResultTileProps["kind"], string> = {
  reminder: "Reminder",
  meeting: "Meeting",
};

export function OfferResultTile({ kind, result }: OfferResultTileProps) {
  if (result.ok) {
    return (
      <div className={styles.tile} data-ok="true">
        <span className={styles.mark} aria-hidden="true">
          ✓
        </span>
        <p className={styles.line}>
          {kind === "meeting" ? "Meeting booked" : "Reminder set"}
          {result.actionExternalId ? ` · ${result.actionExternalId}` : ""}
        </p>
      </div>
    );
  }

  const names = result.needsDisambiguation
    ?.filter((a) => a.status !== "resolved")
    .map((a) => a.name ?? a.email ?? "someone")
    .join(", ");

  const reason = result.needsDisambiguation
    ? `Couldn't confirm who: ${names}. Tell me their email and I'll send it.`
    : result.needsField
      ? `I need the ${result.needsField} to ${kind === "meeting" ? "book it" : "set it"}.`
      : `Couldn't ${kind === "meeting" ? "book the meeting" : "set the reminder"}${result.error ? `: ${result.error}` : "."}`;

  return (
    <div className={styles.tile} data-ok="false">
      <span className={styles.eyebrow}>{NOUN[kind]} — needs a detail</span>
      <p className={styles.line}>{reason}</p>
    </div>
  );
}
