// UI date formatting for due chips. Operates on the contract's offset-less local
// ISO strings ("yyyy-MM-dd'T'HH:mm:ss"); `now` is injected for testability.
// This is presentational formatting — distinct from the pure flow core.

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function dayDelta(a: Date, b: Date): number {
  const ms = startOfDay(a).getTime() - startOfDay(b).getTime();
  return Math.round(ms / 86_400_000);
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export interface DueLabel {
  label: string;
  overdue: boolean;
}

export function formatDue(iso: string, now: Date): DueLabel {
  // Parse the leading yyyy-MM-dd as local calendar fields (offset-less).
  const [y, m, d] = iso
    .slice(0, 10)
    .split("-")
    .map((n) => Number(n));
  const due = new Date(y, (m || 1) - 1, d || 1);
  const delta = dayDelta(due, now);
  const overdue = delta < 0;

  let label: string;
  if (delta === 0) label = "Today";
  else if (delta === 1) label = "Tomorrow";
  else {
    const base = `${MONTHS[due.getMonth()]} ${due.getDate()}`;
    label = due.getFullYear() === now.getFullYear()
      ? base
      : `${base}, ${due.getFullYear()}`;
  }
  return { label, overdue };
}
