import type { TodoLabel } from "@/lib/contracts";
import type { ChatCard } from "../cards";
import { TodoTile } from "./TodoTile";
import { OfferCard } from "./OfferCard";
import { ResearchProgressTile } from "./ResearchProgressTile";
import styles from "./Tile.module.css";

// Dispatches a ChatCard to its tile. Offer actions (Approve/Deny/resolve) are
// threaded through so the message layer can wire them to the agent runtime.
export interface TileProps {
  card: ChatCard;
  labels: TodoLabel[];
  now?: Date;
  onApprove?: () => void;
  onDeny?: () => void;
  onResolveAttendee?: (name: string, email: string) => void;
  offerStatus?: "pending" | "running" | "approved" | "denied";
}

export function Tile({
  card,
  labels,
  now,
  onApprove,
  onDeny,
  onResolveAttendee,
  offerStatus,
}: TileProps) {
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
    case "offer":
      return (
        <OfferCard
          payload={card.payload}
          attendees={card.attendees}
          onApprove={onApprove ?? (() => {})}
          onDeny={onDeny ?? (() => {})}
          onResolveAttendee={onResolveAttendee}
          status={offerStatus}
          now={now}
        />
      );
    case "research":
      return <ResearchProgressTile status={card.status} markdown={card.markdown} />;
  }
}
