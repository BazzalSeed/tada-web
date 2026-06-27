import type { Todo, TodoLabel } from "@/lib/contracts";
import { formatDue } from "@/app/lib/format";
import styles from "./TodoTile.module.css";

// Generative-UI tile for a single todo the agent created/updated. Read-only
// preview (title + due + priority + labels); actions live on the row/detail.
export interface TodoTileProps {
  todo: Todo;
  labels: TodoLabel[];
  now?: Date;
}

export function TodoTile({ todo, labels, now = new Date() }: TodoTileProps) {
  const due = todo.dueAt ? formatDue(todo.dueAt, now) : null;
  const labelNames = todo.labelIds
    .map((id) => labels.find((l) => l.id === id)?.name)
    .filter((n): n is string => Boolean(n));

  return (
    <div className={styles.tile}>
      <span className={styles.mark} aria-hidden="true" />
      <div className={styles.body}>
        <p className={styles.title}>{todo.title}</p>
        <div className={styles.meta}>
          {due ? (
            <span className={styles.chip} data-overdue={due.overdue}>
              {due.label}
            </span>
          ) : null}
          {todo.priority !== "none" ? (
            <span className={styles.prio} data-priority={todo.priority}>
              {todo.priority.toUpperCase()}
            </span>
          ) : null}
          {labelNames.map((name) => (
            <span key={name} className={styles.label}>
              @{name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
