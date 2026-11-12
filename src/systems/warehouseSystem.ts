export interface WarehouseCell {
  id: string;
  shelfIndex: number;
  column: number;
  level: number;
  color: string;
}

interface WarehouseEntry {
  cell: WarehouseCell;
  stock: boolean;
}

/**
 * Warehouse availability and reservations without Three.js/DOM.
 * Stock means a parcel exists in the cell; reservations belong to orders.
 */
export class WarehouseState {
  private readonly entries: WarehouseEntry[];
  private readonly byId = new Map<string, WarehouseEntry>();
  /** Kept public for debug/e2e fixtures; production mutations go through methods. */
  readonly reserved = new Set<string>();

  constructor(cells: readonly WarehouseCell[], stocked = true) {
    this.entries = cells.map((cell) => ({ cell: { ...cell }, stock: stocked }));
    for (const entry of this.entries) this.byId.set(entry.cell.id, entry);
  }

  available(activeShelfCount: number): WarehouseCell[] {
    return this.entries
      .filter(
        (entry) =>
          entry.stock &&
          !this.reserved.has(entry.cell.id) &&
          entry.cell.shelfIndex < activeShelfCount,
      )
      .map((entry) => entry.cell);
  }

  isAvailable(id: string, activeShelfCount: number): boolean {
    const entry = this.byId.get(id);
    return Boolean(
      entry &&
        entry.stock &&
        !this.reserved.has(id) &&
        entry.cell.shelfIndex < activeShelfCount,
    );
  }

  hasStock(id: string): boolean {
    return this.byId.get(id)?.stock === true;
  }

  isReserved(id: string): boolean {
    return this.reserved.has(id);
  }

  reserve(ids: Iterable<string>): void {
    for (const id of ids) this.reserved.add(id);
  }

  release(ids: Iterable<string>): void {
    for (const id of ids) this.reserved.delete(id);
  }

  clearReservations(): void {
    this.reserved.clear();
  }

  consume(id: string): void {
    const entry = this.byId.get(id);
    if (entry) entry.stock = false;
  }

  setStock(id: string, stocked: boolean): void {
    const entry = this.byId.get(id);
    if (entry) entry.stock = stocked;
  }

  restock(keepEmpty: ReadonlySet<string> = new Set()): void {
    for (const entry of this.entries) {
      entry.stock = !keepEmpty.has(entry.cell.id);
    }
  }

  reset(stocked = true): void {
    this.reserved.clear();
    for (const entry of this.entries) entry.stock = stocked;
  }
}
