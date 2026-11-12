export interface OrderItem {
  shelf: number;
  column: number;
  level: number;
  cellId: string;
  actualShelf: number;
  actualColumn: number;
  actualLevel: number;
  actualCellId: string;
  mixed: boolean;
  picked: boolean;
}

export interface Order {
  items: OrderItem[];
  readonly currentItem?: OrderItem;
  readonly shelf: number;
  readonly column: number;
  readonly level: number;
  readonly cellId: string;
  readonly actualShelf: number;
  readonly actualColumn: number;
  readonly actualLevel: number;
  readonly actualCellId: string;
  readonly mixed: boolean;
  scanned: boolean;
  searchMode: boolean;
  mixedTriggered: boolean;
  checkedCells: string[];
  released?: boolean;
}

export interface OrderFlags {
  scanned: boolean;
  searchMode?: boolean;
  mixedTriggered?: boolean;
  checkedCells?: string[];
}

/** The first item still waiting to be picked. */
export function currentOrderItem(order: Order): OrderItem | undefined {
  return order.items.find((item) => !item.picked);
}

/** Current item, or the last item after the order was fully collected. */
export function targetOrderItem(order: Order): OrderItem | undefined {
  return currentOrderItem(order) ?? order.items[order.items.length - 1];
}

/**
 * Builds an Order whose target fields are getters over items.
 * There is no second mutable copy of the current position.
 */
export function createOrderRecord(items: OrderItem[], flags: OrderFlags): Order {
  const first = items[0];
  const order = {
    items,
    shelf: first?.shelf ?? 0,
    column: first?.column ?? 0,
    level: first?.level ?? 0,
    cellId: first?.cellId ?? '',
    actualShelf: first?.actualShelf ?? 0,
    actualColumn: first?.actualColumn ?? 0,
    actualLevel: first?.actualLevel ?? 0,
    actualCellId: first?.actualCellId ?? '',
    mixed: first?.mixed ?? false,
    scanned: flags.scanned,
    searchMode: flags.searchMode ?? false,
    mixedTriggered: flags.mixedTriggered ?? false,
    checkedCells: flags.checkedCells ?? [],
  } as Order;
  return withDerivedOrderTarget(order);
}

/** Keeps fixture-created Orders compatible with derived target fields. */
export function withDerivedOrderTarget<T extends Order>(order: T): T {
  Object.defineProperties(order, {
    currentItem: {
      get: () => currentOrderItem(order),
      enumerable: true,
      configurable: true,
    },
    shelf: { get: () => targetOrderItem(order)?.shelf ?? 0, enumerable: true, configurable: true },
    column: { get: () => targetOrderItem(order)?.column ?? 0, enumerable: true, configurable: true },
    level: { get: () => targetOrderItem(order)?.level ?? 0, enumerable: true, configurable: true },
    cellId: { get: () => targetOrderItem(order)?.cellId ?? '', enumerable: true, configurable: true },
    actualShelf: {
      get: () => targetOrderItem(order)?.actualShelf ?? 0,
      enumerable: true,
      configurable: true,
    },
    actualColumn: {
      get: () => targetOrderItem(order)?.actualColumn ?? 0,
      enumerable: true,
      configurable: true,
    },
    actualLevel: {
      get: () => targetOrderItem(order)?.actualLevel ?? 0,
      enumerable: true,
      configurable: true,
    },
    actualCellId: {
      get: () => targetOrderItem(order)?.actualCellId ?? '',
      enumerable: true,
      configurable: true,
    },
    mixed: { get: () => targetOrderItem(order)?.mixed ?? false, enumerable: true, configurable: true },
  });
  return order;
}
