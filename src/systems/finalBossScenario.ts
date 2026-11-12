import type { Client } from '../client';
import type { BossDialogueLine, Vec2 } from '../data';
import type { Order } from '../domain/orders';
import type { Sound } from '../sound';
import type { UI } from '../ui';
import type { FinalBossSystem } from './finalBossSystem';
import type { ServiceSession } from './serviceSystem';

export type FinalBossClientKind = 'galya' | 'valera';

/**
 * Game-facing operations for the final boss encounter. Game owns the shared
 * world, service, queue, UI and fitting rooms; the scenario owns the flow.
 */
export interface FinalBossScenarioHost {
  ui: UI;
  sound: Sound;
  points: { queueFront: Vec2; fitting: Vec2 };
  shift(): number;
  isGameOver(): boolean;
  prepareEncounter(): void;
  createClient(kind: FinalBossClientKind): Client;
  addClient(client: Client, queue: 'back' | 'none'): void;
  dequeue(client: Client): void;
  createBarcodeOrder(count: number): Order | null;
  releaseOrder(order: Order | null): void;
  patienceMultiplier(): number;
  applyDebuffEffects(): void;
  setFittingState(
    occupied: [boolean],
    full: boolean,
    resetTimers: boolean,
    active: boolean,
  ): void;
  dialogueLines(phase: 1 | 2 | 3): BossDialogueLine[];
  openDialogue(phase: string, lines: BossDialogueLine[], button: string): void;
  closeDialogue(): void;
  isDialogueOpen(): boolean;
  addStress(amount: number): void;
  addReputation(amount: number): void;
  markOutcome(success: boolean): void;
  completeDelivery(client: Client, order: Order): void;
  canTakeReturn(client: Client): boolean;
  beginReturnCarry(client: Client): void;
  clearReturnCarry(): void;
  nextTauntDelay(): number;
  shoutLine(): string;
  refreshUi(): void;
  finishShift(): void;
}

/**
 * Coordinates the final boss: Galya and Valera, the three barcodes, the fitting
 * walk, three returns and the exit. FinalBossSystem keeps stage/barcode/debuff
 * state; Game keeps the encounter boundary, service, orders and UI.
 */
export class FinalBossScenario {
  private readonly finalBoss: FinalBossSystem;
  private readonly host: FinalBossScenarioHost;
  private galyaValue: Client | null = null;
  private valeraValue: Client | null = null;
  private orderValue: Order | null = null;

  constructor(finalBoss: FinalBossSystem, host: FinalBossScenarioHost) {
    this.finalBoss = finalBoss;
    this.host = host;
  }

  get galya(): Client | null {
    return this.galyaValue;
  }

  get valera(): Client | null {
    return this.valeraValue;
  }

  get order(): Order | null {
    return this.orderValue;
  }

  spawn(): void {
    if (this.host.isGameOver() || this.host.shift() !== 5) return;
    this.host.prepareEncounter();
    this.finalBoss.begin();
    this.galyaValue = null;
    this.valeraValue = null;
    this.orderValue = null;
    this.host.ui.setFinalBossDebuff(false);
    this.host.ui.setFinalBossStatus(true, 1, 'скандал на входе');

    const galya = this.host.createClient('galya');
    galya.preplaceAtFront();
    this.galyaValue = galya;
    this.host.addClient(galya, 'back');

    const valera = this.host.createClient('valera');
    valera.label.element.classList.remove('boss');
    valera.placeAt({ x: 1.15, z: 1.85 });
    this.valeraValue = valera;
    this.host.addClient(valera, 'none');

    this.host.ui.closePanels();
    this.host.ui.setOrderChip(null);
    this.host.ui.banner(
      'Финальный босс',
      'Галя привела Валеру. Семейный спор начинается.',
      3,
    );
    this.host.sound.boss();
    this.host.refreshUi();
    this.openDialogue(1, 'Дальше');
  }

  onDialogueDone(): void {
    if (!this.finalBoss.active || !this.host.isDialogueOpen()) return;
    this.host.closeDialogue();

    if (this.finalBoss.stage === 'entrance') {
      this.startCollect();
      return;
    }
    if (this.finalBoss.stage === 'mid') {
      this.startBarcode(this.finalBoss.barcode);
      return;
    }
    if (this.finalBoss.stage === 'fittingTalk') {
      this.startReturns();
    }
  }

  update(dt: number): void {
    if (!this.finalBoss.active) return;

    if (this.finalBoss.stage === 'collect' && this.galyaValue) {
      if (!this.orderValue) {
        this.startBarcode(this.finalBoss.barcode);
        if (!this.orderValue) return;
      }
      if (this.finalBoss.tickTaunt(dt)) {
        const line = this.host.shoutLine();
        this.galyaValue.showBubble(line, 2.2);
        this.host.ui.toast(`Галя: ${line}`, 'boss');
        this.host.addStress(2);
        this.host.sound.shout();
        if (this.host.isGameOver()) return;
      }
    }

    if (this.finalBoss.stage !== 'fittingWalk' || !this.valeraValue) return;
    const valera = this.valeraValue;
    if (
      !valera.isAt(this.host.points.fitting, 0.4) ||
      valera.state !== 'waiting'
    ) {
      return;
    }

    this.finalBoss.enterFitting();
    this.host.setFittingState([true], true, false, true);
    this.host.ui.setFinalBossStatus(true, 3, 'Валера в примерочной');
    this.openDialogue(3, 'Забрать возврат');
  }

  handleDelivery(active: ServiceSession<Client>): void {
    const client = active.client;
    this.host.completeDelivery(client, active.order);
    this.orderValue = null;
    const outcome = this.finalBoss.completeBarcodeDelivery();

    if (outcome === 'fitting') {
      client.maxPatience = 999;
      client.setPatience(999);
      client.patienceDrainMultiplier = 1;
      this.host.ui.setFinalBossStatus(true, 3, 'Валера идёт в примерочную');
      this.host.ui.banner('Галя', 'ВАЛЕРА! ПОМЕРЬ! Я СКАЗАЛА, ПОМЕРЬ!', 3);
      client.showBubble('ВАЛЕРА! ПОМЕРЬ!', 3);
      const valera = this.valeraValue;
      if (valera) {
        valera.walkTo(this.host.points.fitting);
        valera.showBubble('ДА НОРМАЛЬНАЯ ОНА!', 2);
      }
    } else if (outcome === 'mid') {
      this.showMidDialogue();
    } else {
      this.startBarcode(this.finalBoss.barcode);
    }

    this.host.refreshUi();
  }

  takeReturn(): void {
    const galya = this.galyaValue;
    if (!galya || !this.finalBoss.returnPending) return;
    if (!this.host.canTakeReturn(galya)) return;

    this.finalBoss.takeReturn();
    this.host.beginReturnCarry(galya);
  }

  handleReturnDeposited(left: number): void {
    if (left <= 0) {
      this.finish(true);
      return;
    }

    const galya = this.galyaValue;
    if (galya) {
      galya.rig.setCarry(true, '#d95d5d');
      galya.showBubble(`Возврат ${4 - left}/3`, 3);
    }
    this.host.ui.setFinalBossStatus(true, 3, `возвраты: ${left}`);
    this.host.ui.toast(
      `Возврат сдан. Осталось ${left}. Заберите следующий у Гали.`,
      'success',
    );
    this.host.refreshUi();
  }

  finish(success: boolean): void {
    if (this.host.isGameOver()) return;
    if (!this.finalBoss.active) return;
    this.host.markOutcome(success);
    this.finalBoss.finish();
    this.host.clearReturnCarry();
    this.host.ui.setFinalBossDebuff(false);
    this.host.ui.setFinalBossStatus(false, 0, '');
    this.host.ui.setOrderChip(null);
    this.host.setFittingState([false], false, true, false);

    const galya = this.galyaValue;
    const valera = this.valeraValue;
    if (galya) {
      this.host.dequeue(galya);
      galya.leave(0);
    }
    if (valera) valera.leave(0);
    this.galyaValue = null;
    this.valeraValue = null;
    this.orderValue = null;

    if (success) {
      this.host.addReputation(0.5);
      this.host.sound.win();
      this.host.ui.banner('Финал', 'Галя и Валера уходят. ПВЗ выстоял!', 3);
    }
    this.host.refreshUi();
    this.host.finishShift();
  }

  /** Drop client/order references for a new shift or the menu. */
  reset(): void {
    this.galyaValue = null;
    this.valeraValue = null;
    this.orderValue = null;
  }

  /** Hide the final clients and reset boss state on game over. */
  clearForGameOver(): void {
    this.finalBoss.reset();
    if (this.galyaValue) {
      this.galyaValue.root.visible = false;
      this.galyaValue.label.visible = false;
    }
    if (this.valeraValue) {
      this.valeraValue.root.visible = false;
      this.valeraValue.label.visible = false;
    }
    this.reset();
  }

  private openDialogue(phase: 1 | 2 | 3, button: string): void {
    const label = `ФАЗА ${phase} / 3`;
    this.host.openDialogue(label, this.host.dialogueLines(phase), button);
  }

  private startCollect(): void {
    const galya = this.galyaValue;
    if (!galya) {
      this.finish(false);
      return;
    }
    this.finalBoss.applyDebuff();
    this.host.applyDebuffEffects();
    galya.isBoss = false;
    galya.label.element.classList.remove('boss');
    galya.maxPatience = 120;
    galya.setPatience(120);
    galya.hasShouted = false;
    galya.state = 'waiting';
    galya.root.position.set(this.host.points.queueFront.x, 0, this.host.points.queueFront.z);
    galya.setQueueIndex(0);
    galya.patienceDrainMultiplier = this.host.patienceMultiplier();
    this.finalBoss.startCollect();
    this.host.ui.banner(
      'Фаза 2',
      'Галя бросает на стойку три штрихкода: 2, 3 и 4 ячейки. Успейте всё.',
      3,
    );
    this.startBarcode(0);
  }

  private startBarcode(index: number): void {
    const galya = this.galyaValue;
    if (!galya) {
      this.finish(false);
      return;
    }
    const count = this.finalBoss.startBarcode(index);
    const order = this.host.createBarcodeOrder(count);
    if (!order) return; // collect + no order is retried by update().
    this.orderValue = order;
    galya.order = order;
    galya.state = 'waiting';
    galya.root.position.set(this.host.points.queueFront.x, 0, this.host.points.queueFront.z);
    galya.setQueueIndex(0);
    galya.maxPatience = Math.max(galya.maxPatience, 120);
    galya.patienceDrainMultiplier = this.host.patienceMultiplier();
    galya.showBubble(`Штрихкод ${index + 1}/3: ${count} ячеек. Быстрее!`, 3);
    this.finalBoss.setTauntSeconds(this.host.nextTauntDelay());
    this.host.ui.setFinalBossStatus(
      true,
      2,
      `штрихкод ${index + 1}/3 · ${count} ячейки`,
    );
    this.host.ui.toast(`Галя: штрихкод ${index + 1}/3, ${count} ячеек!`, 'boss');
    this.host.sound.boss();
    this.host.refreshUi();
  }

  private showMidDialogue(): void {
    this.finalBoss.showMidDialogue();
    this.host.ui.setFinalBossStatus(true, 2, 'штрихкод 2/3 · третий — Валерин');
    this.openDialogue(2, 'Дальше');
  }

  private startReturns(): void {
    const galya = this.galyaValue;
    this.finalBoss.startReturns();
    this.host.setFittingState([true], true, false, true);
    if (galya) {
      galya.state = 'waiting';
      galya.order = null;
      galya.maxPatience = 999;
      galya.setPatience(999);
      galya.patienceDrainMultiplier = 1;
      galya.root.position.set(this.host.points.queueFront.x, 0, this.host.points.queueFront.z);
      galya.setQueueIndex(0);
      galya.root.visible = true;
      galya.label.visible = true;
      galya.rig.setCarry(true, '#d95d5d');
      galya.showBubble('ВОЗВРАТ ВСЕГО! Возврат 1/3', 999);
    }
    this.host.ui.setFinalBossStatus(true, 3, 'возврат 1/3');
    this.host.ui.banner(
      'Возврат всего',
      'Галя отдаёт первый возврат. Отнесите его в шкафчик «Возврат».',
      3,
    );
    this.host.ui.toast('Галя: ВОЗВРАТ ВСЕГО!', 'boss');
    this.host.refreshUi();
  }
}
