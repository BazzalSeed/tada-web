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
import { applyFilter } from "./core";
import { executors } from "./executors";
import { contactResolverFor } from "./contacts";
import type {
  AgentTool,
  AgentToolRegistry,
  DateWindow,
  FilterCriteria,
  Priority,
  Todo,
  UserCtx,
} from "./contracts";

// Compact wire shape for a todo (what the model reads back to chain follow-ups).
function briefTodo(t: Todo) {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    dueAt: t.dueAt ?? null,
    priority: t.priority,
    labelIds: t.labelIds,
    actionType: t.actionType,
  };
}

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
      output: JSON.stringify(todos.map(briefTodo)),
      card: { type: "todos", todos },
    };
  },
};

// query_todos — the agent's read mirror of the app's Views. Filters the flat
// pool through the SAME pure core (applyFilter/FilterCriteria) the UI uses, so
// "what's due today" returns exactly what the Today View shows. Adds a text
// quick-find (the ⌘K capability) and an explicit due range on top.
const query_todos: AgentTool = {
  name: "query_todos",
  gated: false,
  inputSchema: z.object({
    dateWindow: z.enum(["any", "today", "overdue", "next7", "noDate"]).optional(),
    labelNames: z.array(z.string()).optional(),
    minPriority: z.enum(["p1", "p2", "p3"]).optional(),
    status: z.enum(["open", "done", "all"]).optional(),
    text: z.string().optional(),
    dueFrom: z.string().nullish(),
    dueTo: z.string().nullish(),
  }),
  run: async (args, user: UserCtx) => {
    const a = (args ?? {}) as {
      dateWindow?: DateWindow;
      labelNames?: string[];
      minPriority?: Priority;
      status?: "open" | "done" | "all";
      text?: string;
      dueFrom?: string | null;
      dueTo?: string | null;
    };
    const [all, labelRows] = await Promise.all([
      store.listTodos(user.userId),
      store.labels(user.userId),
    ]);
    // names → existing ids (read tool never creates labels; unknown names drop).
    const byName = new Map(labelRows.map((l) => [l.name.toLowerCase(), l.id]));
    const labelIds = (a.labelNames ?? [])
      .map((n) => byName.get(n.trim().toLowerCase()))
      .filter((id): id is string => !!id);

    const status = a.status ?? "open";
    const criteria: FilterCriteria = {
      labelIds,
      minPriority: a.minPriority ?? null,
      dateWindow: a.dateWindow ?? "any",
      includeCompleted: status !== "open",
    };
    let todos = applyFilter(criteria, all, new Date());
    if (status === "done") todos = todos.filter((t) => t.status === "done");

    // ⌘K-style text quick-find over title + detail.
    if (a.text && a.text.trim()) {
      const q = a.text.trim().toLowerCase();
      todos = todos.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.detail ?? "").toLowerCase().includes(q),
      );
    }
    // Explicit due range (the "range" query) — refines on top of dateWindow.
    if (a.dueFrom) todos = todos.filter((t) => t.dueAt && t.dueAt >= a.dueFrom!);
    if (a.dueTo) todos = todos.filter((t) => t.dueAt && t.dueAt <= a.dueTo!);

    return {
      output: JSON.stringify({ count: todos.length, todos: todos.map(briefTodo) }),
      card: { type: "todos", todos },
    };
  },
};

// Resolve a todo by id within the user's pool (ownership + existence in one).
async function ownedTodo(userId: string, todoId: string): Promise<Todo | null> {
  const all = await store.listTodos(userId);
  return all.find((t) => t.id === todoId) ?? null;
}

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
    const output = r.ok
      ? `Meeting booked (${r.actionExternalId}).`
      : r.needsDisambiguation
        ? `Need to confirm who: ${r.needsDisambiguation.filter((x) => x.status !== "resolved").map((x) => x.name ?? "?").join(", ")}.`
        : r.needsField
          ? `Need ${r.needsField} to book.`
          : `Couldn't book: ${r.error}`;
    return { output, card: { type: "offer", kind: "meeting", result: r } };
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

// complete_todo / uncomplete_todo — toggle status. Gated (mutates user data).
const complete_todo: AgentTool = {
  name: "complete_todo",
  gated: true,
  inputSchema: z.object({ todoId: z.string() }),
  run: async (args, user: UserCtx) => {
    const { todoId } = args as { todoId: string };
    const existing = await ownedTodo(user.userId, todoId);
    if (!existing) return { output: "That todo wasn't found." };
    const todo = await store.updateTodo(user.userId, todoId, { status: "done" });
    return { output: `Completed “${todo.title}”.`, card: { type: "todo", todo } };
  },
};

const uncomplete_todo: AgentTool = {
  name: "uncomplete_todo",
  gated: true,
  inputSchema: z.object({ todoId: z.string() }),
  run: async (args, user: UserCtx) => {
    const { todoId } = args as { todoId: string };
    const existing = await ownedTodo(user.userId, todoId);
    if (!existing) return { output: "That todo wasn't found." };
    const todo = await store.updateTodo(user.userId, todoId, { status: "open" });
    return { output: `Reopened “${todo.title}”.`, card: { type: "todo", todo } };
  },
};

// update_todo — one flexible mutate covering edit-title / set-due / set-priority
// / set-labels (labelNames REPLACES the label set; names are upserted to ids).
const update_todo: AgentTool = {
  name: "update_todo",
  gated: true,
  inputSchema: z.object({
    todoId: z.string(),
    title: z.string().optional(),
    dueAt: z.string().nullish(),
    priority: z.enum(["none", "p1", "p2", "p3"]).optional(),
    labelNames: z.array(z.string()).nullish(),
  }),
  run: async (args, user: UserCtx) => {
    const a = args as {
      todoId: string;
      title?: string;
      dueAt?: string | null;
      priority?: Priority;
      labelNames?: string[] | null;
    };
    const existing = await ownedTodo(user.userId, a.todoId);
    if (!existing) return { output: "That todo wasn't found." };

    const patch: Partial<Todo> = {};
    if (a.title !== undefined) patch.title = a.title;
    if (a.dueAt !== undefined) patch.dueAt = a.dueAt;
    if (a.priority !== undefined) patch.priority = a.priority;
    if (a.labelNames !== undefined && a.labelNames !== null) {
      const ids: string[] = [];
      for (const name of a.labelNames) {
        const lbl = await store.upsertLabelByName(user.userId, name);
        ids.push(lbl.id);
      }
      patch.labelIds = ids;
    }
    const todo = await store.updateTodo(user.userId, a.todoId, patch);
    return { output: `Updated “${todo.title}”.`, card: { type: "todo", todo } };
  },
};

export const agentTools: AgentToolRegistry = {
  list_todos,
  query_todos,
  search_contacts,
  create_todo,
  complete_todo,
  uncomplete_todo,
  update_todo,
  set_reminder,
  send_meeting_invite,
  deep_research,
};

const DESCRIPTIONS: Record<string, string> = {
  list_todos: "List the user's todos (everything, optionally by status). For anything more specific (due today/overdue/this week, a label, a priority, or a text search) use query_todos instead.",
  query_todos:
    "Query/filter the user's todos like the app's Views do. dateWindow: today | overdue | next7 (this week / upcoming) | noDate | any. labelNames: any-of tag filter. minPriority: p1|p2|p3 threshold. status: open (default) | done | all. text: substring quick-find over title/notes. dueFrom/dueTo: explicit ISO due range. Returns matching todos with their ids — use these ids for complete_todo/uncomplete_todo/update_todo.",
  search_contacts: "Search the user's Google contacts by name to find an email for a meeting attendee.",
  create_todo: "Create a new todo (the user must approve).",
  complete_todo: "Mark a todo done by its id — get the id from list_todos/query_todos first (the user must approve).",
  uncomplete_todo: "Reopen a completed todo by its id (the user must approve).",
  update_todo: "Edit a todo by its id: change its title, set/clear dueAt, set priority, and/or replace its labels (labelNames replaces the whole set). Get the id from list_todos/query_todos first (the user must approve).",
  set_reminder: "Set a reminder with text and a time (the user must approve).",
  send_meeting_invite: "Book a meeting and send a Google Calendar invite (the user must approve).",
  deep_research: "Run deep research on a topic and write a report (the user must approve).",
};

// Maps the registry → AI SDK tools for a given user. Both read and write tools
// have an `execute` returning the full { output, card } (so the client renders a
// tile from part.output.card). GATED writes add `needsApproval: true` → the AI SDK
// pauses in `approval-requested` and runs `execute` SERVER-SIDE only after the user
// approves (addToolApprovalResponse). The real executor runs server-side post-
// approval — never auto-executes, and the client can't fabricate the result.
export function toAiSdkTools(user: UserCtx): ToolSet {
  const out: ToolSet = {};
  for (const [name, t] of Object.entries(agentTools)) {
    const description = DESCRIPTIONS[name] ?? name;
    const inputSchema = t.inputSchema as ZodTypeAny;
    const execute = async (args: unknown) => t.run(args, user);
    out[name] = t.gated
      ? tool({ description, inputSchema, execute, needsApproval: true })
      : tool({ description, inputSchema, execute });
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
