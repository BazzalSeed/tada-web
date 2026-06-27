// ============================================================================
// T3.3 — AgentTool registry (shared by chat + voice). Each tool maps to an AI SDK
// tool(); read tools auto-run, write tools are GATED (human-in-the-loop approval
// before run()). One executor fn per capability — the SAME fns the tap path uses
// (never auto-execute a side effect). NO Claude/Anthropic.
// ============================================================================

import { z } from "zod";
import { tool } from "ai";
import type { ToolSet } from "ai";
import type { ZodTypeAny } from "zod";
import { store } from "./store";
import { executors } from "./executors";
import { contactResolverFor } from "./contacts";
import type { AgentTool, AgentToolRegistry, UserCtx } from "./contracts";

// ---- read (auto) ----
const list_todos: AgentTool = {
  name: "list_todos",
  gated: false,
  inputSchema: z.object({
    status: z.enum(["open", "done", "dismissed"]).optional(),
  }),
  run: async (args, user: UserCtx) => {
    const { status } = (args ?? {}) as { status?: string };
    let todos = await store.listTodos(user.userId);
    if (status) todos = todos.filter((t) => t.status === status);
    return {
      output: JSON.stringify(
        todos.map((t) => ({ id: t.id, title: t.title, status: t.status, dueAt: t.dueAt, priority: t.priority })),
      ),
      card: { type: "todos", todos },
    };
  },
};

const search_contacts: AgentTool = {
  name: "search_contacts",
  gated: false,
  inputSchema: z.object({ query: z.string() }),
  run: async (args, user: UserCtx) => {
    const { query } = (args ?? {}) as { query?: string };
    const candidates = await contactResolverFor(user).resolve(query ?? "");
    return {
      output: candidates.length
        ? candidates.map((c) => `${c.name} <${c.email}>`).join("; ")
        : "No matching contacts.",
      card: { type: "contacts", query: query ?? "", candidates },
    };
  },
};

// ---- writes (gated) ----
const create_todo: AgentTool = {
  name: "create_todo",
  gated: true,
  inputSchema: z.object({
    title: z.string(),
    dueAt: z.string().nullish(),
    priority: z.enum(["none", "p1", "p2", "p3"]).optional(),
  }),
  run: async (args, user: UserCtx) => {
    const { title, dueAt, priority } = args as { title: string; dueAt?: string | null; priority?: "none" | "p1" | "p2" | "p3" };
    // Capture-first: every todo references a Capture.
    const capture = await store.createCapture(user.userId, { kind: "text", note: title });
    const todo = await store.createTodo(user.userId, {
      sourceCaptureId: capture.id,
      title,
      dueAt: dueAt ?? null,
      priority: priority ?? "none",
    });
    return { output: `Created todo “${todo.title}”.`, card: { type: "todo", todo } };
  },
};

const set_reminder: AgentTool = {
  name: "set_reminder",
  gated: true,
  inputSchema: z.object({ text: z.string(), remindAt: z.string().nullish() }),
  run: async (args, user: UserCtx) => {
    void user;
    const { text, remindAt } = args as { text: string; remindAt?: string | null };
    const r = await executors.setReminder({ kind: "reminder", text, remindAt: remindAt ?? null });
    return {
      output: r.ok ? `Reminder set: ${text}` : `Need a time for the reminder.`,
      card: { type: "offer", kind: "reminder", result: r },
    };
  },
};

const send_meeting_invite: AgentTool = {
  name: "send_meeting_invite",
  gated: true,
  inputSchema: z.object({
    title: z.string(),
    attendees: z.array(z.string()),
    start: z.string().nullish(),
    durationMin: z.number().optional(),
    notes: z.string().nullish(),
  }),
  run: async (args, user: UserCtx) => {
    const a = args as { title: string; attendees: string[]; start?: string | null; durationMin?: number; notes?: string | null };
    const r = await executors.sendMeetingInvite(
      { kind: "meeting", title: a.title, attendees: a.attendees, start: a.start ?? null, durationMin: a.durationMin, notes: a.notes ?? null },
      user,
    );
    return {
      output: r.ok ? `Meeting booked (${r.actionExternalId}).` : r.needsField ? `Need ${r.needsField} to book.` : `Couldn't book: ${r.error}`,
      card: { type: "offer", kind: "meeting", result: r },
    };
  },
};

const deep_research: AgentTool = {
  name: "deep_research",
  gated: true,
  inputSchema: z.object({ topic: z.string() }),
  run: async (args, user: UserCtx) => {
    void user;
    const { topic } = args as { topic: string };
    const { markdown } = await executors.deepResearch({ kind: "research", topic });
    return { output: markdown, card: { type: "research", topic, markdown } };
  },
};

export const agentTools: AgentToolRegistry = {
  list_todos,
  search_contacts,
  create_todo,
  set_reminder,
  send_meeting_invite,
  deep_research,
};

const DESCRIPTIONS: Record<string, string> = {
  list_todos: "List the user's todos. Optionally filter by status.",
  search_contacts: "Search the user's Google contacts by name to find an email for a meeting attendee.",
  create_todo: "Create a new todo (the user must approve).",
  set_reminder: "Set a reminder with text and a time (the user must approve).",
  send_meeting_invite: "Book a meeting and send a Google Calendar invite (the user must approve).",
  deep_research: "Run deep research on a topic and write a report (the user must approve).",
};

// Maps the registry → AI SDK tools for a given user. Read tools include an
// `execute` (auto-run); GATED write tools OMIT `execute` so the AI SDK pauses for
// human-in-the-loop approval (Approve/Deny) before run() — no auto side effects.
export function toAiSdkTools(user: UserCtx): ToolSet {
  const out: ToolSet = {};
  for (const [name, t] of Object.entries(agentTools)) {
    const description = DESCRIPTIONS[name] ?? name;
    const inputSchema = t.inputSchema as ZodTypeAny;
    // GATED write tools omit `execute` → AI SDK pauses for approval (HITL).
    out[name] = t.gated
      ? tool({ description, inputSchema })
      : tool({
          description,
          inputSchema,
          execute: async (args: unknown) => (await t.run(args, user)).output,
        });
  }
  return out;
}

// OpenAI Realtime function-tool defs (embedded in the voice session). Gated-ness
// is enforced server-side in /api/voice/tool, not in the schema.
export function toOpenAIToolDefs(): Array<{
  type: "function";
  name: string;
  description: string;
  parameters: unknown;
}> {
  return Object.entries(agentTools).map(([name, t]) => ({
    type: "function",
    name,
    description: DESCRIPTIONS[name] ?? name,
    parameters: z.toJSONSchema(t.inputSchema as ZodTypeAny),
  }));
}

// Runs a gated tool after the user approves it (called by the chat/voice approval
// path). Centralizes "execute only on explicit approval".
export async function runApprovedTool(
  name: string,
  args: unknown,
  user: UserCtx,
): Promise<{ output: string; card?: unknown }> {
  const t = agentTools[name];
  if (!t) throw new Error(`unknown tool: ${name}`);
  return t.run(args, user);
}
