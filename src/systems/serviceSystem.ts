import type { Order, OrderItem } from '../domain/orders';

export interface ServiceSession<TClient> {
  client: TClient;
  order: Order;
}

export interface ScannerSignal {
  text: string;
  level: number;
}

/**
 * Состояние обслуживания клиента: активный заказ, переносимая посылка,
 * возврат и сигнал поиска ячейки.
 * Не знает про DOM, Three.js и конкретный UI.
 */
export class ServiceSystem<TClient = unknown> {
  private session: ServiceSession<TClient> | null = null;
  private carried = false;
  private carriedColors: string[] = [];
  private carriedReturn = false;
  private signal: ScannerSignal = { text: 'Сканер не уверен', level: 0 };

  get active(): ServiceSession<TClient> | null {
    return this.session;
  }

  get hasActive(): boolean {
    return this.session !== null;
  }

  get carrying(): boolean {
    return this.carried;
  }

  set carrying(value: boolean) {
    this.carried = value;
    if (!value) this.carriedColors.length = 0;
  }

  get carryColors(): readonly string[] {
    return this.carriedColors;
  }

  get carryingReturn(): boolean {
    return this.carriedReturn;
  }

  set carryingReturn(value: boolean) {
    this.carriedReturn = value;
  }

  get lastSignal(): ScannerSignal {
    return this.signal;
  }

  set lastSignal(value: ScannerSignal) {
    this.signal = { ...value };
  }

  begin(client: TClient, order: Order): ServiceSession<TClient> {
    this.session = { client, order };
    this.carriedColors.length = 0;
    return this.session;
  }

  clear(): ServiceSession<TClient> | null {
    const previous = this.session;
    this.session = null;
    this.carried = false;
    this.carriedColors.length = 0;
    return previous;
  }

  reset(): void {
    this.session = null;
    this.carried = false;
    this.carriedColors.length = 0;
    this.carriedReturn = false;
    this.resetSignal();
  }

  takeNextItem(color?: string): OrderItem | null {
    const remaining = this.remainingItems();
    const item = remaining[0] ?? null;
    if (item) {
      item.picked = true;
      if (color) this.carriedColors.push(color);
    }
    this.carried = true;
    return item;
  }

  remainingItems(): OrderItem[] {
    return this.session?.order.items.filter((item) => !item.picked) ?? [];
  }

  resetSignal(): void {
    this.signal = { text: 'Сканер не уверен', level: 0 };
  }

  setSignalForDistance(distance: number): ScannerSignal {
    this.signal =
      distance <= 1
        ? { text: 'Горячо!', level: 4 }
        : distance === 2
          ? { text: 'Тепло', level: 3 }
          : distance === 3
            ? { text: 'Прохладно', level: 2 }
            : { text: 'Холодно', level: 1 };
    return this.signal;
  }
}
