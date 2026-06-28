// @vitest-environment node
// Integration test for the Prisma-backed TadaStore (T1.2) — runs against the
// isolated Postgres container the harness provisions (see
// vitest.integration.config.ts).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { PrismaTadaStore } from "@/lib/store";
import type { ActionPayload, RecurrenceRule } from "@/lib/contracts";

const prisma = new PrismaClient();
const store = new PrismaTadaStore(prisma);

// Unique owner per run so parallel/repeat runs never collide.
const stamp = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
const userId = `u-${stamp}`;
const otherUserId = `other-${stamp}`;

async function makeUser(id: string) {
  await prisma.user.create({
    data: { id, email: `${id}@test.local`, plan: "free" },
  });
}

describe("PrismaTadaStore", () => {
  beforeAll(async () => {
    await makeUser(userId);
    await makeUser(otherUserId);
  });

  afterAll(async () => {
    // Cascades clean up captures/todos/labels/views via FK onDelete: Cascade.
    await prisma.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    await prisma.$disconnect();
  });

  it("createCapture returns a Capture with id + ISO createdAt", async () => {
    const cap = await store.createCapture(userId, { kind: "text", note: "hi" });
    expect(cap.id).toBeTruthy();
    expect(cap.kind).toBe("text");
    expect(cap.note).toBe("hi");
    expect(typeof cap.createdAt).toBe("string");
    expect(new Date(cap.createdAt).toString()).not.toBe("Invalid Date");
  });

  it("createTodo applies frozen defaults + returns ISO dates", async () => {
    const cap = await store.createCapture(userId, { kind: "text" });
    const todo = await store.createTodo(userId, {
      sourceCaptureId: cap.id,
      title: "buy milk",
    });
    expect(todo.id).toBeTruthy();
    expect(todo.title).toBe("buy milk");
    expect(todo.status).toBe("open");
    expect(todo.actionType).toBe("none");
    expect(todo.actionState).toBe("none");
    expect(todo.priority).toBe("none");
    expect(todo.labelIds).toEqual([]);
    expect(typeof todo.sortIndex).toBe("number");
    expect(typeof todo.createdAt).toBe("string");
  });

  it("listTodos is scoped to the owner", async () => {
    const cap = await store.createCapture(userId, { kind: "text" });
    const mine = await store.createTodo(userId, {
      sourceCaptureId: cap.id,
      title: "mine only",
    });
    const otherCap = await store.createCapture(otherUserId, { kind: "text" });
    await store.createTodo(otherUserId, {
      sourceCaptureId: otherCap.id,
      title: "not mine",
    });

    const mineList = await store.listTodos(userId);
    expect(mineList.some((t) => t.id === mine.id)).toBe(true);
    expect(mineList.some((t) => t.title === "not mine")).toBe(false);
  });

  it("updateTodo round-trips JSON actionPayload + recurrence", async () => {
    const cap = await store.createCapture(userId, { kind: "text" });
    const todo = await store.createTodo(userId, {
      sourceCaptureId: cap.id,
      title: "meet dakota",
    });
    const payload: ActionPayload = {
      kind: "meeting",
      title: "Sync with Dakota",
      attendees: ["dakota@example.com"],
      start: "2026-06-30T14:00:00",
      durationMin: 30,
    };
    const recurrence: RecurrenceRule = { frequency: "weekly", interval: 1, weekday: 3 };
    const updated = await store.updateTodo(userId, todo.id, {
      priority: "p1",
      status: "open",
      actionType: "meeting",
      actionState: "proposed",
      actionPayload: payload,
      recurrence,
      dueAt: "2026-06-30T00:00:00",
    });
    expect(updated.priority).toBe("p1");
    expect(updated.actionType).toBe("meeting");
    expect(updated.actionState).toBe("proposed");
    expect(updated.actionPayload).toEqual(payload);
    expect(updated.recurrence).toEqual(recurrence);
    expect(typeof updated.dueAt).toBe("string");
  });

  it("updateTodo cannot touch another owner's todo", async () => {
    const otherCap = await store.createCapture(otherUserId, { kind: "text" });
    const otherTodo = await store.createTodo(otherUserId, {
      sourceCaptureId: otherCap.id,
      title: "theirs",
    });
    await expect(
      store.updateTodo(userId, otherTodo.id, { title: "hijack" }),
    ).rejects.toThrow();
  });

  it("subtasks returns one-level children by parentId", async () => {
    const cap = await store.createCapture(userId, { kind: "text" });
    const parent = await store.createTodo(userId, {
      sourceCaptureId: cap.id,
      title: "parent",
    });
    const childA = await store.createTodo(userId, {
      sourceCaptureId: cap.id,
      title: "child a",
      parentId: parent.id,
    });
    const childB = await store.createTodo(userId, {
      sourceCaptureId: cap.id,
      title: "child b",
      parentId: parent.id,
    });
    const kids = await store.subtasks(userId, parent.id);
    const ids = kids.map((k) => k.id).sort();
    expect(ids).toEqual([childA.id, childB.id].sort());
  });

  it("upsertLabelByName is idempotent + lowercases", async () => {
    const a = await store.upsertLabelByName(userId, "Errand");
    const b = await store.upsertLabelByName(userId, "errand");
    expect(a.id).toBe(b.id);
    expect(a.name).toBe("errand");
    const all = await store.labels(userId);
    expect(all.filter((l) => l.name === "errand").length).toBe(1);
  });

  it("saveView round-trips FilterCriteria + views lists it", async () => {
    const view = await store.saveView(userId, {
      name: "Today",
      colorHex: "#c8632e",
      icon: "calendar",
      sortIndex: 0,
      criteria: {
        labelIds: [],
        minPriority: null,
        dateWindow: "today",
        includeCompleted: false,
      },
    });
    expect(view.id).toBeTruthy();
    expect(view.criteria.dateWindow).toBe("today");
    const all = await store.views(userId);
    expect(all.some((v) => v.id === view.id)).toBe(true);
  });

  it("deleteLabel removes the label and strips it from todos", async () => {
    // Arrange: a label and a todo tagged with it.
    const label = await store.upsertLabelByName(userId, "to-delete");
    const cap = await store.createCapture(userId, { kind: "text" });
    const todo = await store.createTodo(userId, {
      sourceCaptureId: cap.id,
      title: "tagged todo",
      labelIds: [label.id],
    });
    // Confirm the todo starts with the label.
    const before = await store.labels(userId);
    expect(before.some((l) => l.id === label.id)).toBe(true);

    // Act.
    await store.deleteLabel(userId, label.id);

    // Assert: label is gone.
    const afterLabels = await store.labels(userId);
    expect(afterLabels.some((l) => l.id === label.id)).toBe(false);

    // Assert: todo's labelIds no longer contains the deleted label id.
    const afterTodos = await store.listTodos(userId);
    const updated = afterTodos.find((t) => t.id === todo.id)!;
    expect(updated.labelIds).not.toContain(label.id);
  });

  it("reorderTodo places a todo between two neighbors (fractional)", async () => {
    const cap = await store.createCapture(userId, { kind: "text" });
    const first = await store.createTodo(userId, {
      sourceCaptureId: cap.id,
      title: "first",
      sortIndex: 0,
    });
    const second = await store.createTodo(userId, {
      sourceCaptureId: cap.id,
      title: "second",
      sortIndex: 10,
    });
    const mover = await store.createTodo(userId, {
      sourceCaptureId: cap.id,
      title: "mover",
      sortIndex: 999,
    });
    const moved = await store.reorderTodo(userId, mover.id, first.id, second.id);
    expect(moved.sortIndex).toBeGreaterThan(0);
    expect(moved.sortIndex).toBeLessThan(10);
  });
});
