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
  shelf: number;
  column: number;
  level: number;
  cellId: string;
  actualShelf: number;
  actualColumn: number;
  actualLevel: number;
  actualCellId: string;
  mixed: boolean;
  scanned: boolean;
  carrying: boolean;
  searchMode: boolean;
  mixedTriggered: boolean;
  checkedCells: string[];
  released?: boolean;
}
