export type FinalBossStage =
  | 'idle'
  | 'entrance'
  | 'collect'
  | 'mid'
  | 'fittingWalk'
  | 'fittingTalk'
  | 'returns'
  | 'done';

export type BarcodeDeliveryOutcome = 'next' | 'mid' | 'fitting';

const BARCODE_COUNTS = [2, 3, 4];

export function barcodeCount(index: number): number {
  return BARCODE_COUNTS[index] ?? BARCODE_COUNTS[0];
}

/**
 * Сценарная state-машина финального босса.
 * Клиенты, диалоги, UI и награды остаются в Game.
 */
export class FinalBossSystem {
  private activeFlag = false;
  private stageValue: FinalBossStage = 'idle';
  private phaseValue = 0;
  private barcodeIndex = 0;
  private tauntSeconds = 0;
  private debuffFlag = false;
  private valeraFitting = false;
  private returnPendingFlag = false;
  private returnInHandFlag = false;
  private returnsLeftValue = 0;

  get active(): boolean {
    return this.activeFlag;
  }

  get stage(): FinalBossStage {
    return this.stageValue;
  }

  get phase(): number {
    return this.phaseValue;
  }

  get barcode(): number {
    return this.barcodeIndex;
  }

  get debuff(): boolean {
    return this.debuffFlag;
  }

  get valeraInFitting(): boolean {
    return this.valeraFitting;
  }

  get returnPending(): boolean {
    return this.returnPendingFlag;
  }

  get returnInHand(): boolean {
    return this.returnInHandFlag;
  }

  get returnsLeft(): number {
    return this.returnsLeftValue;
  }

  begin(): void {
    this.activeFlag = true;
    this.stageValue = 'entrance';
    this.phaseValue = 1;
    this.barcodeIndex = 0;
    this.tauntSeconds = 0;
    this.debuffFlag = false;
    this.valeraFitting = false;
    this.returnPendingFlag = false;
    this.returnInHandFlag = false;
    this.returnsLeftValue = 0;
  }

  applyDebuff(): void {
    this.debuffFlag = true;
  }

  startCollect(): void {
    this.stageValue = 'collect';
    this.phaseValue = 2;
    this.barcodeIndex = 0;
  }

  startBarcode(index: number): number {
    this.barcodeIndex = index;
    this.stageValue = 'collect';
    return barcodeCount(index);
  }

  setTauntSeconds(seconds: number): void {
    this.tauntSeconds = Math.max(0, seconds);
  }

  showMidDialogue(): void {
    this.stageValue = 'mid';
  }

  completeBarcodeDelivery(): BarcodeDeliveryOutcome {
    this.barcodeIndex += 1;
    if (this.barcodeIndex >= BARCODE_COUNTS.length) {
      this.stageValue = 'fittingWalk';
      this.phaseValue = 3;
      this.tauntSeconds = 0;
      return 'fitting';
    }
    if (this.barcodeIndex === 2) {
      this.stageValue = 'mid';
      return 'mid';
    }
    return 'next';
  }

  enterFitting(): void {
    this.valeraFitting = true;
    this.stageValue = 'fittingTalk';
  }

  startReturns(): void {
    this.stageValue = 'returns';
    this.phaseValue = 3;
    this.returnsLeftValue = 3;
    this.returnPendingFlag = true;
    this.returnInHandFlag = false;
    this.valeraFitting = true;
  }

  takeReturn(): void {
    this.returnPendingFlag = false;
    this.returnInHandFlag = true;
  }

  depositReturn(): number {
    this.returnInHandFlag = false;
    this.returnsLeftValue = Math.max(0, this.returnsLeftValue - 1);
    this.returnPendingFlag = this.returnsLeftValue > 0;
    return this.returnsLeftValue;
  }

  /** Возвращает true, если пора показать очередную реплику Гали. */
  tickTaunt(dt: number, random: () => number = Math.random): boolean {
    if (this.stageValue !== 'collect') return false;
    this.tauntSeconds -= dt;
    if (this.tauntSeconds > 0) return false;
    this.tauntSeconds = 4 + Math.floor(random() * 4);
    return true;
  }

  finish(): void {
    this.activeFlag = false;
    this.stageValue = 'done';
    this.returnPendingFlag = false;
    this.returnInHandFlag = false;
    this.debuffFlag = false;
    this.valeraFitting = false;
    this.returnsLeftValue = 0;
  }

  reset(): void {
    this.activeFlag = false;
    this.stageValue = 'idle';
    this.phaseValue = 0;
    this.barcodeIndex = 0;
    this.tauntSeconds = 0;
    this.debuffFlag = false;
    this.valeraFitting = false;
    this.returnPendingFlag = false;
    this.returnInHandFlag = false;
    this.returnsLeftValue = 0;
  }
}
