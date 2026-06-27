// ============================================================================
// T1.2 — Prisma-backed TadaStore (the persistence seam from @/lib/contracts).
// Every method is scoped by userId (the ownership boundary). DB columns are
// snake_case (@map in prisma/schema.prisma); the Prisma client speaks camelCase,
// which matches the contract field names 1:1. Dates are DateTime in the DB and
// ISO8601 strings in the contract — mapped at this boundary. JSON columns hold
// actionPayload / recurrence / criteria verbatim.
// ============================================================================

import { Prisma, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "./db";
import { between } from "./core";
import type {
  ActionPayload,
  Capture,
  FilterCriteria,
  RecurrenceRule,
  SavedView,
  TadaStore,
  Todo,
  TodoLabel,
} from "./contracts";

// ---- row → contract mappers (Date → ISO string; JSON cast) ----
type TodoRow = Prisma.TodoGetPayload<object>;
type CaptureRow = Prisma.CaptureGetPayload<object>;
type LabelRow = Prisma.TodoLabelGetPayload<object>;
type ViewRow = Prisma.SavedViewGetPayload<object>;

const iso = (d: Date | null | undefined): string | null =>
  d == null ? null : d.toISOString();

// Accepts the contract's ISO strings (or a Date) → Date for Prisma. Guards
// against UNPARSEABLE input: a relative/garbage date string (e.g. an extractor
// that emitted "Friday" instead of ISO) coerces to NULL rather than producing an
// `Invalid Date` that Prisma rejects (which would throw mid-persist and — under
// the capture-first fallback — silently collapse the todo to a generic capture).
// A missing/empty date is null; a real date passes through. Exported for tests.
export const toNullableDate = (
  v: string | Date | null | undefined,
): Date | null => {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const toDate = toNullableDate;

function toTodo(r: TodoRow): Todo {
  return {
    id: r.id,
    createdAt: r.createdAt.toISOString(),
    sourceCaptureId: r.sourceCaptureId,
    title: r.title,
    detail: r.detail,
    status: r.status as Todo["status"],
    actionType: r.actionType as Todo["actionType"],
    actionPayload: (r.actionPayload as ActionPayload | null) ?? null,
    actionState: r.actionState as Todo["actionState"],
    actionExternalId: r.actionExternalId,
    dueAt: iso(r.dueAt),
    sortIndex: r.sortIndex,
    priority: r.priority as Todo["priority"],
    listId: r.listId,
    labelIds: r.labelIds,
    recurrence: (r.recurrence as RecurrenceRule | null) ?? null,
    parentId: r.parentId,
    reminderAt: iso(r.reminderAt),
  };
}

const toCapture = (r: CaptureRow): Capture => ({
  id: r.id,
  createdAt: r.createdAt.toISOString(),
  kind: r.kind as Capture["kind"],
  blobPath: r.blobPath,
  note: r.note,
});

const toLabel = (r: LabelRow): TodoLabel => ({
  id: r.id,
  name: r.name,
  colorHex: r.colorHex,
});

const toView = (r: ViewRow): SavedView => ({
  id: r.id,
  name: r.name,
  colorHex: r.colorHex,
  icon: r.icon,
  sortIndex: r.sortIndex,
  criteria: r.criteria as unknown as FilterCriteria,
});

// JSON column setter: omit when undefined, SQL-null when explicitly null.
const jsonField = (v: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull =>
  v == null ? Prisma.JsonNull : (v as Prisma.InputJsonValue);

// Builds the Prisma write payload from a Partial<Todo> (camelCase → columns,
// strings → Date, objects → Json). `userId`/`id`/`createdAt` are handled by callers.
function todoWrite(patch: Partial<Todo>): Prisma.TodoUncheckedUpdateInput {
  const data: Prisma.TodoUncheckedUpdateInput = {};
  if (patch.title !== undefined) data.title = patch.title;
  if (patch.detail !== undefined) data.detail = patch.detail;
  if (patch.status !== undefined) data.status = patch.status;
  if (patch.actionType !== undefined) data.actionType = patch.actionType;
  if (patch.actionState !== undefined) data.actionState = patch.actionState;
  if (patch.actionExternalId !== undefined)
    data.actionExternalId = patch.actionExternalId;
  if (patch.priority !== undefined) data.priority = patch.priority;
  if (patch.listId !== undefined) data.listId = patch.listId;
  if (patch.labelIds !== undefined) data.labelIds = patch.labelIds;
  if (patch.parentId !== undefined) data.parentId = patch.parentId;
  if (patch.sortIndex !== undefined) data.sortIndex = patch.sortIndex;
  if (patch.sourceCaptureId !== undefined)
    data.sourceCaptureId = patch.sourceCaptureId;
  if (patch.dueAt !== undefined) data.dueAt = toDate(patch.dueAt);
  if (patch.reminderAt !== undefined) data.reminderAt = toDate(patch.reminderAt);
  if (patch.actionPayload !== undefined)
    data.actionPayload = jsonField(patch.actionPayload);
  if (patch.recurrence !== undefined)
    data.recurrence = jsonField(patch.recurrence);
  return data;
}

export class PrismaTadaStore implements TadaStore {
  constructor(private readonly db: PrismaClient = defaultPrisma) {}

  async listTodos(userId: string): Promise<Todo[]> {
    const rows = await this.db.todo.findMany({
      where: { userId },
      orderBy: { sortIndex: "asc" }, // lower sorts higher (native semantics)
    });
    return rows.map(toTodo);
  }

  async createTodo(userId: string, t: Partial<Todo>): Promise<Todo> {
    if (!t.sourceCaptureId) {
      // Capture-first invariant: every todo references a Capture (FK NOT NULL).
      throw new Error("createTodo requires sourceCaptureId");
    }
    const write = todoWrite(t);
    const row = await this.db.todo.create({
      data: {
        ...(write as Prisma.TodoUncheckedCreateInput),
        userId,
        sourceCaptureId: t.sourceCaptureId,
        title: t.title ?? "",
        // native default: lower sorts higher; newest first => -createdAt epoch.
        sortIndex: t.sortIndex ?? -Date.now(),
        labelIds: t.labelIds ?? [],
      },
    });
    return toTodo(row);
  }

  async updateTodo(
    userId: string,
    id: string,
    patch: Partial<Todo>,
  ): Promise<Todo> {
    // Scoped update: updateMany enforces ownership; count 0 => not theirs / missing.
    const res = await this.db.todo.updateMany({
      where: { id, userId },
      data: todoWrite(patch),
    });
    if (res.count === 0) throw new Error("todo not found");
    return toTodo(await this.db.todo.findUniqueOrThrow({ where: { id } }));
  }

  async reorderTodo(
    userId: string,
    id: string,
    beforeId?: string | null,
    afterId?: string | null,
  ): Promise<Todo> {
    const neighborIndex = async (
      nid?: string | null,
    ): Promise<number | null> => {
      if (!nid) return null;
      const n = await this.db.todo.findFirst({
        where: { id: nid, userId },
        select: { sortIndex: true },
      });
      return n?.sortIndex ?? null;
    };
    const [before, after] = await Promise.all([
      neighborIndex(beforeId),
      neighborIndex(afterId),
    ]);
    return this.updateTodo(userId, id, { sortIndex: between(before, after) });
  }

  async subtasks(userId: string, parentId: string): Promise<Todo[]> {
    const rows = await this.db.todo.findMany({
      where: { userId, parentId },
      orderBy: { sortIndex: "asc" },
    });
    return rows.map(toTodo);
  }

  async createCapture(userId: string, c: Partial<Capture>): Promise<Capture> {
    const row = await this.db.capture.create({
      data: {
        userId,
        kind: c.kind ?? "text",
        blobPath: c.blobPath ?? null,
        note: c.note ?? null,
      },
    });
    return toCapture(row);
  }

  async listCaptures(userId: string): Promise<Capture[]> {
    const rows = await this.db.capture.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return rows.map(toCapture);
  }

  async labels(userId: string): Promise<TodoLabel[]> {
    const rows = await this.db.todoLabel.findMany({ where: { userId } });
    return rows.map(toLabel);
  }

  async upsertLabelByName(userId: string, name: string): Promise<TodoLabel> {
    const lower = name.trim().toLowerCase();
    const row = await this.db.todoLabel.upsert({
      where: { userId_name: { userId, name: lower } },
      create: { userId, name: lower, colorHex: "#c8632e" },
      update: {},
    });
    return toLabel(row);
  }

  async views(userId: string): Promise<SavedView[]> {
    const rows = await this.db.savedView.findMany({
      where: { userId },
      orderBy: { sortIndex: "asc" },
    });
    return rows.map(toView);
  }

  async saveView(userId: string, v: Partial<SavedView>): Promise<SavedView> {
    const criteria = jsonField(v.criteria);
    if (v.id) {
      const res = await this.db.savedView.updateMany({
        where: { id: v.id, userId },
        data: {
          ...(v.name !== undefined && { name: v.name }),
          ...(v.colorHex !== undefined && { colorHex: v.colorHex }),
          ...(v.icon !== undefined && { icon: v.icon }),
          ...(v.sortIndex !== undefined && { sortIndex: v.sortIndex }),
          ...(v.criteria !== undefined && { criteria }),
        },
      });
      if (res.count === 0) throw new Error("view not found");
      return toView(
        await this.db.savedView.findUniqueOrThrow({ where: { id: v.id } }),
      );
    }
    const row = await this.db.savedView.create({
      data: {
        userId,
        name: v.name ?? "Untitled",
        colorHex: v.colorHex ?? "#c8632e",
        icon: v.icon ?? "filter",
        sortIndex: v.sortIndex ?? 0,
        criteria: criteria as Prisma.InputJsonValue,
      },
    });
    return toView(row);
  }
}

// Default singleton for route handlers (prod DATABASE_URL via lib/db.ts).
export const store = new PrismaTadaStore();
