/**
 * Состояние королевы примерочной: бюджет товаров, примерки, возвраты
 * и раздражение. Клиент, заказы и UI остаются в Game.
 */
export class QueenSystem {
  private spawnedFlag = false;
  private activeFlag = false;
  private budgetValue = 0;
  private deliveredValue = 0;
  private cooldownValue = 0;
  private irritationValue = 1;
  private inFittingFlag = false;
  private hasReturnFlag = false;
  private returnInHandFlag = false;
  private fittingsValue = 0;
  private nextReturnFlag = false;

  get spawned(): boolean {
    return this.spawnedFlag;
  }

  get active(): boolean {
    return this.activeFlag;
  }

  get budget(): number {
    return this.budgetValue;
  }

  get delivered(): number {
    return this.deliveredValue;
  }

  get cooldown(): number {
    return this.cooldownValue;
  }

  get irritation(): number {
    return this.irritationValue;
  }

  get inFitting(): boolean {
    return this.inFittingFlag;
  }

  get hasReturn(): boolean {
    return this.hasReturnFlag;
  }

  get returnInHand(): boolean {
    return this.returnInHandFlag;
  }

  get fittings(): number {
    return this.fittingsValue;
  }

  get nextReturn(): boolean {
    return this.nextReturnFlag;
  }

  get readyToReturn(): boolean {
    return this.inFittingFlag && this.cooldownValue <= 0 && this.budgetValue > 0;
  }

  spawn(budget: number): void {
    this.spawnedFlag = true;
    this.activeFlag = true;
    this.budgetValue = budget;
    this.deliveredValue = 0;
    this.cooldownValue = 0;
    this.irritationValue = 1.15;
    this.inFittingFlag = false;
    this.hasReturnFlag = false;
    this.returnInHandFlag = false;
    this.fittingsValue = 0;
    this.nextReturnFlag = false;
  }

  deliver(count: number): number {
    this.deliveredValue += count;
    this.budgetValue = Math.max(0, this.budgetValue - count);
    return this.budgetValue;
  }

  startFitting(delay = 6, random: () => number = Math.random): void {
    this.inFittingFlag = true;
    this.cooldownValue = delay;
    this.fittingsValue += 1;
    this.nextReturnFlag = this.fittingsValue === 1 || random() < 0.5;
    this.hasReturnFlag = false;
    this.returnInHandFlag = false;
    this.irritationValue = Math.min(1.4, this.irritationValue + 0.02);
  }

  tickCooldown(dt: number): void {
    this.cooldownValue = Math.max(0, this.cooldownValue - dt);
  }

  beginReturn(withReturn: boolean): void {
    this.inFittingFlag = false;
    this.irritationValue = Math.min(1.4, this.irritationValue + 0.02);
    this.nextReturnFlag = false;
    this.hasReturnFlag = withReturn;
    this.returnInHandFlag = false;
  }

  takeReturn(): void {
    this.hasReturnFlag = false;
    this.returnInHandFlag = true;
    this.cooldownValue = 0;
    this.nextReturnFlag = false;
  }

  deliverReturn(): number {
    this.returnInHandFlag = false;
    if (this.activeFlag && this.budgetValue > 0) {
      // The Queen goes back to the fitting room for a short cooldown,
      // then Game.updateQueen() brings her back with a new order.
      this.inFittingFlag = true;
      this.cooldownValue = 2;
      this.nextReturnFlag = false;
    }
    return this.cooldownValue;
  }

  finish(): void {
    this.activeFlag = false;
    this.irritationValue = 1;
    this.inFittingFlag = false;
    this.hasReturnFlag = false;
    this.returnInHandFlag = false;
    this.nextReturnFlag = false;
    this.budgetValue = 0;
  }

  reset(): void {
    this.spawnedFlag = false;
    this.activeFlag = false;
    this.budgetValue = 0;
    this.deliveredValue = 0;
    this.cooldownValue = 0;
    this.irritationValue = 1;
    this.inFittingFlag = false;
    this.hasReturnFlag = false;
    this.returnInHandFlag = false;
    this.fittingsValue = 0;
    this.nextReturnFlag = false;
  }
}
