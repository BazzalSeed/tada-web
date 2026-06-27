import type { Priority } from "@/lib/contracts";
import type { ChatCard, ProposedAction } from "./cards";

// Maps an AI SDK v7 UIMessage → the props MessageBlock renders. A tool part's
// card depends on its STATE (native HITL, Option A):
//  • output-available  → its executed result `output.card` (read tools + gated
//    writes after approval run server-side).
//  • approval-requested → a client-built `pending` offer from the tool input +
//    an OfferRef carrying the approval id (Approve/Deny via addToolApprovalResponse).
//  • approval-responded (approved) for deep_research → a `research` running tile
//    while it executes (~10-30s, synchronous in the POST).
//  • output-denied     → a `denied` note (nothing ran).
// `offers` lets the container wire Approve/Deny back to the right approval.

interface UIPartLike {
  type: string;
  text?: string;
  toolCallId?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  approval?: { id?: string; approved?: boolean };
}
interface UIMessageLike {
  id: string;
  role: "user" | "assistant" | "system";
  parts: UIPartLike[];
}

export interface OfferRef {
  cardIndex: number;
  approvalId: string;
  toolName: string;
}
export interface MessageView {
  id: string;
  role: "user" | "assistant";
  text?: string;
  cards: ChatCard[];
  offers: OfferRef[];
}

// The side-effect tools that pause for approval (never auto-executed).
const GATED_OFFER_TOOLS = new Set([
  "create_todo",
  "set_reminder",
  "send_meeting_invite",
  "deep_research",
]);

const PRIORITIES = new Set<Priority>(["none", "p1", "p2", "p3"]);

function toolNameOf(partType: string): string | null {
  return partType.startsWith("tool-") ? partType.slice("tool-".length) : null;
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function priorityOf(v: unknown): Priority | undefined {
  return typeof v === "string" && PRIORITIES.has(v as Priority) ? (v as Priority) : undefined;
}

// Best-effort map a gated tool's input args → the proposed action shown in the
// offer. Tolerant of missing fields; the exact arg shapes are the chat seam.
function actionFromInput(toolName: string, input: unknown): ProposedAction | null {
  const a = (input ?? {}) as Record<string, unknown>;
  if (toolName === "create_todo") {
    return {
      kind: "todo",
      title: str(a.title) ?? "New todo",
      dueAt: str(a.dueAt) ?? null,
      priority: priorityOf(a.priority),
    };
  }
  if (toolName === "send_meeting_invite") {
    return {
      kind: "meeting",
      title: str(a.title) ?? "New meeting",
      attendees: Array.isArray(a.attendees)
        ? (a.attendees.filter((x) => typeof x === "string") as string[])
        : [],
      start: str(a.start) ?? null,
      durationMin: typeof a.durationMin === "number" ? a.durationMin : 30,
      notes: str(a.notes) ?? null,
    };
  }
  if (toolName === "set_reminder") {
    return { kind: "reminder", text: str(a.text) ?? "Reminder", remindAt: str(a.remindAt) ?? null };
  }
  if (toolName === "deep_research") {
    return { kind: "research", topic: str(a.topic) ?? "Research" };
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

    // Executed result (read tools, or a gated write after approval ran server-side).
    if (part.state === "output-available") {
      const card = cardFromOutput(part.output);
      if (card) cards.push(card);
      continue;
    }

    // Gated write paused for approval → pending offer from its input.
    if (
      part.state === "approval-requested" &&
      GATED_OFFER_TOOLS.has(toolName) &&
      part.input != null &&
      part.approval?.id
    ) {
      const action = actionFromInput(toolName, part.input);
      if (action) {
        offers.push({ cardIndex: cards.length, approvalId: part.approval.id, toolName });
        cards.push({ type: "pending", toolName, action });
      }
      continue;
    }

    // Approval recorded but not yet executed. Approved → the executor is running
    // (research is the slow one, ~10-30s; show a pulse). Denied → a quiet note.
    if (part.state === "approval-responded") {
      if (part.approval?.approved === false) {
        cards.push({ type: "denied", toolName });
      } else if (toolName === "deep_research") {
        cards.push({ type: "research", status: "running" });
      }
      continue;
    }

    // Denied result → nothing ran; a quiet note.
    if (part.state === "output-denied") {
      cards.push({ type: "denied", toolName });
      continue;
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
