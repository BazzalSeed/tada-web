import type { TodoLabel } from "@/lib/contracts";
import type { ChatCard } from "../cards";
import { TodoTile } from "./TodoTile";
import { OfferCard } from "./OfferCard";
import { OfferResultTile } from "./OfferResultTile";
import { ContactsTile } from "./ContactsTile";
import { ResearchProgressTile } from "./ResearchProgressTile";
import styles from "./Tile.module.css";

// Dispatches a ChatCard to its tile. A gated write's pending offer threads
// Approve/Deny up to the message layer (wired to addToolApprovalResponse).
export interface TileProps {
  card: ChatCard;
  labels: TodoLabel[];
  now?: Date;
  onApprove?: () => void;
  onDeny?: () => void;
  offerStatus?: "pending" | "running" | "denied";
}

export function Tile({ card, labels, now, onApprove, onDeny, offerStatus }: TileProps) {
  switch (card.type) {
    case "todo":
      return <TodoTile todo={card.todo} labels={labels} now={now} />;
    case "todos":
      return (
        <div className={styles.stack}>
          {card.todos.map((t) => (
            <TodoTile key={t.id} todo={t} labels={labels} now={now} />
          ))}
        </div>
      );
    case "contacts":
      return <ContactsTile query={card.query} candidates={card.candidates} />;
    case "offer":
      return <OfferResultTile kind={card.kind} result={card.result} />;
    case "research":
      return (
        <ResearchProgressTile
          status={card.status ?? (card.markdown ? "done" : "running")}
          markdown={card.markdown}
        />
      );
    case "pending":
      return (
        <OfferCard
          action={card.action}
          onApprove={onApprove ?? (() => {})}
          onDeny={onDeny ?? (() => {})}
          status={offerStatus}
          now={now}
        />
      );
    case "denied":
      return <p className={styles.denied}>Dismissed — nothing was run.</p>;
  }
}
