"use client";

import { useEffect, useState } from "react";
import type { ActionPayload, Todo, TodoLabel } from "@/lib/contracts";
import { finishTodo as finishTodoApi, listTodos, patchTodo } from "@/app/lib/api";
import { reflectFinish } from "@/app/lib/offer";
import { useTada } from "@/app/lib/store";
import { OfferPanel } from "@/app/components/todo/OfferPanel";
import { TodoTile } from "./TodoTile";
import styles from "./ChatActionTodo.module.css";

// Interactive chat tile for a created todo that carries an action and/or
// action-bearing subtasks. Renders the SAME OfferPanel the pool uses (do-it +
// inline ask + disambiguation picker), wired to the same /api endpoints. The
// agent only CAPTURED — the side effect fires here, on the user's explicit tap.
export interface ChatActionTodoProps {
  parent: Todo;
  subtasks: Todo[];
  labels: TodoLabel[];
  now?: Date;
}

export function ChatActionTodo({ parent, subtasks, labels, now }: ChatActionTodoProps) {
  const { dispatch } = useTada();
  const ids = [parent.id, ...subtasks.map((s) => s.id)];
  const [todos, setTodos] = useState<Record<string, Todo>>(() => {
    const m: Record<string, Todo> = {};
    for (const t of [parent, ...subtasks]) m[t.id] = t;
    return m;
  });

  // Seed the global pool immediately so All/Today (and the parent's subtask
  // section) reflect chat-created todos without a reload — then reconcile with
  // live state (the card is a snapshot from when the tool ran).
  useEffect(() => {
    for (const t of [parent, ...subtasks]) dispatch({ type: "UPSERT_TODO", todo: t });
    void refresh(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh(which: string[]) {
    const all = await listTodos().catch(() => null);
    if (!all) return;
    const live = which
      .map((id) => all.find((t) => t.id === id))
      .filter((t): t is Todo => Boolean(t));
    for (const t of live) dispatch({ type: "UPSERT_TODO", todo: t });
    setTodos((prev) => {
      const next = { ...prev };
      for (const t of live) next[t.id] = t;
      return next;
    });
  }

  function offerFor(todo: Todo) {
    return (
      <OfferPanel
        todo={todo}
        onFinish={async () => {
          const res = await finishTodoApi(todo.id);
          const reflected = reflectFinish(todo, res);
          if (reflected) {
            const merged = { ...todos[todo.id], ...reflected };
            setTodos((p) => ({ ...p, [todo.id]: merged }));
            dispatch({ type: "UPSERT_TODO", todo: merged });
          }
          // A subtask reports its result up to the parent's notes → refresh both.
          await refresh([todo.id, parent.id]);
          return res;
        }}
        onPatchPayload={async (payload: ActionPayload) => {
          const saved = await patchTodo(todo.id, { actionPayload: payload });
          if (saved) {
            setTodos((p) => ({ ...p, [todo.id]: saved }));
            dispatch({ type: "UPSERT_TODO", todo: saved });
          }
        }}
        onPatch={async (p: Partial<Todo>) => {
          const saved = await patchTodo(todo.id, p);
          if (saved) {
            setTodos((prev) => ({ ...prev, [todo.id]: saved }));
            dispatch({ type: "UPSERT_TODO", todo: saved });
          }
        }}
        onComplete={async () => {
          const saved = await patchTodo(todo.id, { status: "done" });
          if (saved) {
            setTodos((p) => ({ ...p, [todo.id]: saved }));
            dispatch({ type: "UPSERT_TODO", todo: saved });
          }
        }}
      />
    );
  }

  const p = todos[parent.id] ?? parent;
  const subs = subtasks.map((s) => todos[s.id] ?? s);

  return (
    <div className={styles.tile}>
      <TodoTile todo={p} labels={labels} now={now} />
      {p.actionType !== "none" ? offerFor(p) : null}
      {subs.length ? (
        <ul className={styles.subtasks}>
          {subs.map((s) => (
            <li key={s.id} className={styles.subtask}>
              <span className={styles.subtaskTitle}>{s.title}</span>
              {s.actionType !== "none" ? offerFor(s) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
