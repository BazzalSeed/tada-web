import type { ActionPayload } from "@/lib/contracts";
import type { ChatCard } from "./cards";

// Maps an AI SDK v5 UIMessage → the props MessageBlock renders. Two card sources:
// (1) any tool part whose output carries a `card` (read tools + post-approval
// results), and (2) a GATED write tool call paused without output → a pending
// OfferCard built from its input (the never-auto-execute offer). `offers` lets
// the container wire Approve/Deny back to the right tool call.

interface UIPartLike {
  type: string;
  text?: string;
  toolCallId?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
}
interface UIMessageLike {
  id: string;
  role: "user" | "assistant" | "system";
  parts: UIPartLike[];
}

export interface OfferRef {
  cardIndex: number;
  toolCallId: string;
  toolName: string;
}
export interface MessageView {
  id: string;
  role: "user" | "assistant";
  text?: string;
  cards: ChatCard[];
  offers: OfferRef[];
}

// The side-effect tools rendered as gated offers (never auto-executed).
const GATED_OFFER_TOOLS = new Set([
  "send_meeting_invite",
  "set_reminder",
  "deep_research",
]);

function toolNameOf(partType: string): string | null {
  return partType.startsWith("tool-") ? partType.slice("tool-".length) : null;
}

// Best-effort map a gated tool's input args → an offer payload. Tolerant of
// missing fields; the exact arg shapes are the chat seam (see backend).
function inputToOffer(toolName: string, input: unknown): ActionPayload | null {
  const a = (input ?? {}) as Record<string, unknown>;
  if (toolName === "send_meeting_invite") {
    return {
      kind: "meeting",
      title: typeof a.title === "string" ? a.title : "New meeting",
      start: typeof a.start === "string" ? a.start : null,
      durationMin: typeof a.durationMin === "number" ? a.durationMin : 30,
    };
  }
  if (toolName === "set_reminder") {
    return {
      kind: "reminder",
      text: typeof a.text === "string" ? a.text : "Reminder",
      remindAt: typeof a.remindAt === "string" ? a.remindAt : null,
    };
  }
  if (toolName === "deep_research") {
    return {
      kind: "research",
      topic: typeof a.topic === "string" ? a.topic : "Research",
    };
  }
  return null;
}

function cardFromOutput(output: unknown): ChatCard | null {
  const card = (output as { card?: unknown } | null)?.card;
  if (card && typeof card === "object" && "type" in card) {
    return card as ChatCard;
  }
  return null;
}

export function messageToView(message: UIMessageLike): MessageView {
  const cards: ChatCard[] = [];
  const offers: OfferRef[] = [];
  let text = "";

  for (const part of message.parts) {
    if (part.type === "text") {
      text += part.text ?? "";
      continue;
    }
    const toolName = toolNameOf(part.type);
    if (!toolName) continue;

    // Post-run result (read tools, or a gated write after approval).
    if (part.state === "output-available") {
      const card = cardFromOutput(part.output);
      if (card) cards.push(card);
      continue;
    }

    // Gated write paused for approval → pending offer from its input.
    if (
      part.state === "input-available" &&
      GATED_OFFER_TOOLS.has(toolName) &&
      part.input != null
    ) {
      const payload = inputToOffer(toolName, part.input);
      if (payload && part.toolCallId) {
        offers.push({ cardIndex: cards.length, toolCallId: part.toolCallId, toolName });
        cards.push({ type: "offer", payload });
      }
    }
  }

  return {
    id: message.id,
    role: message.role === "user" ? "user" : "assistant",
    text: text || undefined,
    cards,
    offers,
  };
}
