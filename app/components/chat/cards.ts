import type { ActionPayload, Attendee, Todo } from "@/lib/contracts";

// Presentational contract for chat/voice generative-UI tiles. The agent runtime
// returns a tool `card` ({type, ...}); the container maps that wire shape onto
// this union, and the tile components render purely from it. Gated-write offers
// carry the concrete effect + (for meetings) the attendee disambiguation set —
// the offer only fires on an explicit Approve (never auto-execute).
export type ChatCard =
  | { type: "todo"; todo: Todo }
  | { type: "todos"; todos: Todo[] }
  | {
      type: "offer";
      payload: ActionPayload;
      attendees?: Attendee[] | null;
    }
  | { type: "research"; status: "running" | "done"; markdown?: string | null };
