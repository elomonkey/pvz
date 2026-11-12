import type { OrderItem } from './orders';

/** Structural view of a cell; no Three.js objects or resource ownership. */
export interface AllocationCell {
  id: string;
  shelfIndex: number;
  column: number;
  level: number;
  parcel: { visible: boolean };
}

export function availableOrderCells<T extends AllocationCell>(
  cells: readonly T[],
  activeShelfCount: number,
  reserved: ReadonlySet<string>,
  selected: ReadonlySet<string> = new Set(),
): T[] {
  return cells.filter(cell =>
    cell.shelfIndex < activeShelfCount && cell.parcel.visible === true &&
    !reserved.has(cell.id) && !selected.has(cell.id),
  );
}

export function allocateOrderItems(
  candidates: readonly AllocationCell[],
  desired: number,
  options: {
    mixed?: boolean;
    preferredShelf?: (index: number) => number;
    random?: () => number;
  } = {},
): OrderItem[] {
  const random = options.random ?? Math.random;
  const remaining = [...candidates];
  const items: OrderItem[] = [];
  while (items.length < desired && remaining.length > 0) {
    // Keep ordinary orders' equal shelf probability, including shorter shelf C.
    const shelves = [...new Set(remaining.map(cell => cell.shelfIndex))];
    const preferred = options.preferredShelf
      ? options.preferredShelf(items.length)
      : shelves[Math.floor(random() * shelves.length)];
    const onShelf = remaining.filter(cell => cell.shelfIndex === preferred);
    const pool = onShelf.length > 0 ? onShelf : remaining;
    const cell = pool[Math.floor(random() * pool.length)];
    remaining.splice(remaining.indexOf(cell), 1);
    items.push({
      shelf: cell.shelfIndex, column: cell.column, level: cell.level, cellId: cell.id,
      actualShelf: cell.shelfIndex, actualColumn: cell.column, actualLevel: cell.level,
      actualCellId: cell.id, mixed: false, picked: false,
    });
  }

  if (options.mixed && items.length === 1) {
    const first = items[0];
    const alternatives = remaining.filter(cell => cell.shelfIndex === first.shelf);
    if (alternatives.length > 0) {
      const actual = alternatives[Math.floor(random() * alternatives.length)];
      first.actualShelf = actual.shelfIndex;
      first.actualColumn = actual.column;
      first.actualLevel = actual.level;
      first.actualCellId = actual.id;
      first.mixed = true;
    }
  }
  return items;
}
