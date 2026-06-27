// Given the visible open-list order and a drag from→to, compute the drop
// neighbors the reorder route needs. The store turns these into a fractional
// sortIndex via the pure `between(before, after)`; the UI only names the slot.

export interface DropNeighbors {
  beforeId: string | null; // the id that ends up directly above (sorts higher)
  afterId: string | null; // the id that ends up directly below
}

export function neighborsForDrop(
  ids: string[],
  from: number,
  to: number,
): DropNeighbors {
  const arr = [...ids];
  const [moved] = arr.splice(from, 1);
  const insertAt = Math.max(0, Math.min(to, arr.length));
  arr.splice(insertAt, 0, moved);
  const pos = arr.indexOf(moved);
  return {
    beforeId: pos > 0 ? arr[pos - 1] : null,
    afterId: pos < arr.length - 1 ? arr[pos + 1] : null,
  };
}
