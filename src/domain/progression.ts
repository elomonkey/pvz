export function shelfCountForShift(
  shift: number,
  activeFromShifts: readonly number[],
): number {
  return activeFromShifts.filter((activeFrom) => activeFrom <= shift).length;
}

export class ShiftProgression {
  private shelfCount = 2;
  private multiOrders = false;

  get activeShelfCount(): number {
    return this.shelfCount;
  }

  get multiOrdersEnabled(): boolean {
    return this.multiOrders;
  }

  begin(
    shift: number,
    activeFromShifts: readonly number[],
    multiOrdersEnabled: boolean,
  ): void {
    this.shelfCount = shelfCountForShift(shift, activeFromShifts);
    this.multiOrders = multiOrdersEnabled;
  }

  setMultiOrders(enabled: boolean): void {
    this.multiOrders = enabled;
  }

  orderSize(shift: number, random: () => number = Math.random): number {
    if (!this.multiOrders) return 1;
    if (shift === 3) return 2 + Math.floor(random() * 2);
    if (shift >= 4) return random() < 0.55 ? 2 : 1;
    return random() < 0.5 ? 2 : 1;
  }
}
