import type { TodoLabel } from "@/lib/contracts";
import type { ChatCard } from "./cards";
import { Tile } from "./tiles/Tile";
import styles from "./MessageBlock.module.css";

// One chat message: user (right, plain) or assistant (left, with any generative
// tiles below the text). Offer callbacks are keyed by card index so the
// container can resolve them to the right tool call.
export interface MessageBlockProps {
  role: "user" | "assistant";
  text?: string;
  cards?: ChatCard[];
  labels: TodoLabel[];
  now?: Date;
  onApprove?: (cardIndex: number) => void;
  onDeny?: (cardIndex: number) => void;
  onResolveAttendee?: (cardIndex: number, name: string, email: string) => void;
  offerStatuses?: Record<number, "pending" | "running" | "approved" | "denied">;
}

export function MessageBlock({
  role,
  text,
  cards,
  labels,
  now,
  onApprove,
  onDeny,
  onResolveAttendee,
  offerStatuses,
}: MessageBlockProps) {
  return (
    <div className={styles.row} data-role={role}>
      <div className={styles.bubble}>
        {text ? <p className={styles.text}>{text}</p> : null}
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
                onResolveAttendee={
                  onResolveAttendee
                    ? (name, email) => onResolveAttendee(i, name, email)
                    : undefined
                }
                offerStatus={offerStatuses?.[i]}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
