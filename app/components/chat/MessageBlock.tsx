import type { TodoLabel } from "@/lib/contracts";
import type { ChatCard } from "./cards";
import { Tile } from "./tiles/Tile";
import styles from "./MessageBlock.module.css";

// One chat message: user (right, plain) or assistant (left, with any generative
// tiles below the text). A pending offer's Approve/Deny is keyed by card index so
// the container can resolve it to the right tool approval.
export interface MessageBlockProps {
  role: "user" | "assistant";
  text?: string;
  cards?: ChatCard[];
  labels: TodoLabel[];
  now?: Date;
  streaming?: boolean; // this assistant turn is actively streaming → show a caret
  onApprove?: (cardIndex: number) => void;
  onDeny?: (cardIndex: number) => void;
  offerStatuses?: Record<number, "pending" | "running" | "denied">;
}

export function MessageBlock({
  role,
  text,
  cards,
  labels,
  now,
  streaming,
  onApprove,
  onDeny,
  offerStatuses,
}: MessageBlockProps) {
  return (
    <div className={styles.row} data-role={role}>
      <div className={styles.bubble}>
        {text ? (
          <p className={styles.text}>
            {text}
            {streaming ? (
              <span className={styles.cursor} aria-hidden="true" />
            ) : null}
          </p>
        ) : null}
        {cards && cards.length > 0 ? (
          <div className={styles.cards}>
            {cards.map((card, i) => (
              <Tile
                key={i}
                card={card}
                labels={labels}
                now={now}
                onApprove={onApprove ? () => onApprove(i) : undefined}
                onDeny={onDeny ? () => onDeny(i) : undefined}
                offerStatus={offerStatuses?.[i]}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
