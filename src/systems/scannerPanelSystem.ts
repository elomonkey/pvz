import type { Order } from '../domain/orders';

export interface PanelSignal {
  text: string;
  level: number;
}

export interface PanelCell {
  id: string;
  column: number;
  level: number;
  color: string;
  checked?: boolean;
}

export interface CellPanelModel {
  kicker: string;
  sub: string;
  cells: PanelCell[];
  search: boolean;
  columns?: number;
  signal?: PanelSignal;
}

export function cellPanelKeyFor(order: Order, highlightEnabled: boolean): string {
  return order.searchMode
    ? `search:${order.shelf}:${order.checkedCells.length}`
    : `cells:${order.cellId}:${highlightEnabled ? 'focus' : 'all'}`;
}

/**
 * Собирает данные для DOM-панели ячеек.
 * Не знает ни про Three.js, ни про конкретный UI.
 */
export function buildCellPanelModel(options: {
  order: Order;
  shelfLetter: string;
  cells: readonly PanelCell[];
  columns: number;
  highlightEnabled: boolean;
  signal: PanelSignal;
}): CellPanelModel {
  const { order, shelfLetter, cells, columns, highlightEnabled, signal } = options;

  if (order.searchMode) {
    return {
      kicker: `Стеллаж ${shelfLetter} · ПОИСК`,
      sub: 'Прошлая смена перепутала ячейки. Ищите по сигналу сканера.',
      cells: cells
        .slice()
        .sort((a, b) => b.level - a.level || a.column - b.column)
        .map((cell) => ({
          id: cell.id,
          column: cell.column,
          level: cell.level,
          color: cell.color,
          checked: order.checkedCells.includes(cell.id),
        })),
      search: true,
      columns,
      signal,
    };
  }

  if (highlightEnabled) {
    return {
      kicker: `Стеллаж ${shelfLetter} · колонка ${order.column + 1}`,
      sub: `Выберите ячейку с номером ${order.cellId}`,
      cells: cells
        .filter((cell) => cell.column === order.column)
        .sort((a, b) => b.level - a.level)
        .map((cell) => ({
          id: cell.id,
          column: cell.column,
          level: cell.level,
          color: cell.color,
        })),
      search: false,
    };
  }

  return {
    kicker: `Стеллаж ${shelfLetter} · все колонки`,
    sub: `Найдите ячейку ${order.cellId} среди всех ячеек.`,
    cells: cells
      .slice()
      .sort((a, b) => b.level - a.level || a.column - b.column)
      .map((cell) => ({
        id: cell.id,
        column: cell.column,
        level: cell.level,
        color: cell.color,
      })),
    search: false,
    columns,
  };
}

/**
 * Состояние сканера и панели ячеек: выбранный клиент, близкий стеллаж,
 * открытая панель и ячейка, для которой панель закрыли вручную.
 */
export class ScannerPanelSystem<TClient = unknown> {
  private target: TClient | null = null;
  private shelf: number | null = null;
  private key: string | null = null;
  private dismissed: string | null = null;

  get scanTarget(): TClient | null {
    return this.target;
  }

  get nearShelf(): number | null {
    return this.shelf;
  }

  get panelKey(): string | null {
    return this.key;
  }

  get dismissedFor(): string | null {
    return this.dismissed;
  }

  openScanner(target: TClient): void {
    this.target = target;
  }

  closeScanner(): void {
    this.target = null;
  }

  focusShelf(index: number): void {
    this.shelf = index;
  }

  clearFocus(): void {
    this.shelf = null;
  }

  showPanel(key: string): void {
    this.key = key;
    this.dismissed = null;
  }

  hidePanel(): void {
    this.key = null;
  }

  clearDismissed(): void {
    this.dismissed = null;
  }

  dismissFor(cellId: string): void {
    this.dismissed = cellId;
    this.key = null;
  }

  isDismissed(cellId: string): boolean {
    return this.dismissed === cellId;
  }

  shouldOpenPanel(key: string): boolean {
    return key !== this.key;
  }

  clearPanel(): void {
    this.shelf = null;
    this.key = null;
    this.dismissed = null;
  }

  reset(): void {
    this.target = null;
    this.clearPanel();
  }
}
