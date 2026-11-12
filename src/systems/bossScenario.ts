import type { Client } from '../client';
import type { Vec2 } from '../data';
import type { Order } from '../domain/orders';
import type { Sound } from '../sound';
import type { UI } from '../ui';
import type { BossEncounter } from './bossEncounter';
import type { EncounterPhase } from './encounterCoordinator';
import type { WarehouseCell } from './warehouseSystem';
import type { ZinaPuzzleSystem } from './zinaPuzzleSystem';

export type OrdinaryBossKind = 'galya' | 'zina' | 'sanya';
export type BossDialogueContext = 'client' | 'boss' | null;

/**
 * Game-facing operations for ordinary bosses. Game owns service, queue,
 * warehouse, rewards and shift boundaries; the scenario owns the boss flow.
 */
export interface BossScenarioHost {
  ui: UI;
  sound: Sound;
  points: { queueFront: Vec2 };
  phase(): EncounterPhase;
  shift(): number;
  isGameOver(): boolean;
  isModalOpen(): boolean;
  prepareEncounter(kind: OrdinaryBossKind): Order | null;
  createClient(kind: OrdinaryBossKind, order: Order | null): Client;
  addClient(client: Client): void;
  dequeue(client: Client): void;
  updateQueue(): void;
  patienceMultiplier(): number;
  bossLine(): string;
  zinaIntroLine(): string;
  zinaSegments(): number[];
  zinaFiller(): number;
  zinaPuzzleTime(): number;
  zinaWinLine(): string;
  zinaLoseLine(): string;
  expectedServeStress(): number;
  openBossModal(): void;
  closeBossDialogue(): { context: BossDialogueContext; client: Client | null };
  consumePendingGameOver(): boolean;
  gameOver(): void;
  scannerBreakPending(): boolean;
  clearScannerBreak(): void;
  scannerBreakSeen(): boolean;
  showScannerBreakCard(): void;
  toastScannerBreak(): void;
  resumeClientService(client: Client): void;
  restockCells(): void;
  findAvailableCell(id: string): WarehouseCell | null;
  pickZinaCell(): WarehouseCell | null;
  createZinaOrder(cell: WarehouseCell): Order;
  reserveCell(id: string): void;
  beginService(client: Client, order: Order): void;
  scannerWorks(): boolean;
  highlightOrder(order: Order): void;
  nextStepIndex(): number | null;
  startBreak(seconds: number, next: number): void;
  endShift(): void;
  addStress(amount: number, deferGameOver?: boolean): void;
  addReputation(amount: number): void;
  emitBossDefeated(): void;
  updateHud(): void;
  updateStressUi(): void;
  updatePrompt(): void;
}

/**
 * Coordinates ordinary boss encounters: Galya, Sanya and Zina. It owns the
 * boss client and Zina's pending order. Argument/mash flow remains in Game.
 */
export class BossScenario {
  private readonly boss: BossEncounter;
  private readonly zina: ZinaPuzzleSystem;
  private readonly host: BossScenarioHost;
  private clientValue: Client | null = null;
  private zinaOrderPendingValue = false;
  private zinaPendingCellIdValue: string | null = null;

  constructor(
    boss: BossEncounter,
    zina: ZinaPuzzleSystem,
    host: BossScenarioHost,
  ) {
    this.boss = boss;
    this.zina = zina;
    this.host = host;
  }

  get bossClient(): Client | null {
    return this.clientValue;
  }

  get zinaOrderPending(): boolean {
    return this.zinaOrderPendingValue;
  }

  get zinaPendingCellId(): string | null {
    return this.zinaPendingCellIdValue;
  }

  spawn(kind: OrdinaryBossKind): void {
    if (this.host.isGameOver()) return;
    this.reset();
    const order = this.host.prepareEncounter(kind);
    if (kind === 'sanya' && !order) return;

    const client = this.host.createClient(kind, order);
    if (kind === 'sanya') {
      client.patienceDrainMultiplier = this.host.patienceMultiplier();
    } else {
      client.showBubble('!', 999);
    }
    this.clientValue = client;
    this.host.addClient(client);

    this.host.ui.closePanels();
    if (kind === 'sanya') {
      this.host.ui.banner(
        'Курьер Саня',
        'Четыре заказа сразу. Он очень спешит — не заставляйте ждать.',
        3,
      );
    } else {
      this.host.ui.banner(
        'Босс',
        kind === 'zina'
          ? 'Баба Зина идёт к стойке: помогите ей собрать штрихкод в пятнашках.'
          : 'Галя идёт к стойке. Приготовьтесь к скандалу.',
        2.4,
      );
    }
    this.host.sound.boss();
    this.host.updateHud();
    this.host.updatePrompt();
  }

  updateApproach(): void {
    if (this.host.phase() !== 'boss' || !this.clientValue || this.boss.triggered) return;
    if (this.clientValue.state !== 'waiting') return;
    if (!this.clientValue.isAt(this.host.points.queueFront, 0.24)) return;
    this.triggerModal();
  }

  zinaPuzzleMove(index: number): void {
    if (!this.zina.active || !this.host.isModalOpen()) return;
    const result = this.zina.move(index);
    if (result === 'invalid') {
      this.host.ui.setZinaFeedback(
        'Плитку можно двигать только рядом с пустой клеткой.',
        false,
      );
      this.host.sound.error();
      return;
    }
    if (result === 'inactive') return;

    this.host.ui.renderZinaPuzzle(this.zina.board, this.zina.target);
    this.host.ui.setZinaFeedback('', true);
    this.host.sound.click();
    if (result === 'solved') this.finishZinaGame(true);
  }

  updateZinaGame(dt: number): void {
    if (!this.zina.active || !this.host.isModalOpen()) return;
    const result = this.zina.tick(dt);
    this.host.ui.updateZinaTimer(this.zina.timeRatio);
    if (result === 'timeout') this.finishZinaGame(false);
  }

  finishZinaGame(success: boolean): void {
    if (this.host.isGameOver()) return;
    if (!this.zina.active) return;
    this.zina.resolve();
    this.boss.resolve();

    if (success) {
      const cell = this.host.pickZinaCell();
      this.zinaPendingCellIdValue = cell?.id ?? null;
      this.host.addStress(-8);
      this.host.addReputation(0.2);
      this.zinaOrderPendingValue = true;
      this.host.ui.showBossResult(
        'Штрихкод собран!',
        cell
          ? `Баба Зина прикладывает штрихкод к телефону. Заберите посылку из ячейки ${cell.id} и отдайте ей.`
          : 'Баба Зина прикладывает штрихкод к телефону и ждёт заказ у стойки.',
        true,
        this.host.zinaWinLine(),
      );
      this.host.sound.win();
    } else {
      this.host.addStress(15, true);
      this.host.addReputation(-0.5);
      this.host.ui.showBossResult(
        'Штрихкод не собран',
        'Баба Зина так и не смогла разобраться с телефоном. Она уходит жаловаться.',
        false,
        this.host.zinaLoseLine(),
      );
      this.host.sound.lose();
    }
    this.host.updateHud();
    this.host.updateStressUi();
  }

  onBossDone(): void {
    if (this.host.isGameOver() || !this.host.isModalOpen()) return;
    const { context, client } = this.host.closeBossDialogue();

    if (this.host.consumePendingGameOver()) {
      this.host.gameOver();
      return;
    }
    if (this.host.scannerBreakPending()) {
      this.host.clearScannerBreak();
      if (!this.host.scannerBreakSeen()) {
        this.finishStep();
        this.host.showScannerBreakCard();
        return;
      }
      this.host.toastScannerBreak();
    }
    if (context === 'client') {
      if (client) this.host.resumeClientService(client);
      return;
    }
    if (this.zinaOrderPendingValue) {
      this.startZinaOrder();
      return;
    }
    this.finishStep();
  }

  startZinaOrder(): void {
    if (this.host.isGameOver()) return;
    const zina = this.clientValue;
    if (!zina) {
      this.zinaOrderPendingValue = false;
      this.finishStep();
      return;
    }

    this.host.restockCells();
    const pendingCell = this.zinaPendingCellIdValue;
    const cell =
      (pendingCell ? this.host.findAvailableCell(pendingCell) : null) ??
      this.host.pickZinaCell();
    if (!cell) {
      this.zinaOrderPendingValue = false;
      this.zinaPendingCellIdValue = null;
      this.finishStep();
      return;
    }

    const order = this.host.createZinaOrder(cell);
    this.host.reserveCell(cell.id);
    this.zinaPendingCellIdValue = null;
    this.zinaOrderPendingValue = false;
    zina.isBoss = false;
    zina.label.element.classList.remove('boss');
    zina.order = order;
    zina.maxPatience = 30;
    zina.setPatience(30);
    zina.hasShouted = false;
    zina.state = 'waiting';
    zina.root.position.set(this.host.points.queueFront.x, 0, this.host.points.queueFront.z);
    zina.setQueueIndex(0);
    zina.setTarget(true);
    zina.rig.setCarry(false);
    zina.patienceDrainMultiplier = this.host.patienceMultiplier();
    zina.showBubble('Забери мою посылку, милок!', 3);
    this.host.beginService(zina, order);
    this.boss.trigger();
    this.host.updateQueue();
    this.host.ui.closePanels();
    this.host.ui.setOrderChip('Ячейка', order.cellId, 'cell');
    this.host.highlightOrder(order);
    this.host.ui.banner(
      'Заказ Бабы Зины',
      `Ячейка ${order.cellId}. Заберите посылку и отдайте Зине.`,
      3,
    );
    this.host.updateHud();
    this.host.updatePrompt();
  }

  finishStep(): void {
    if (this.host.isGameOver()) return;
    if (this.clientValue) {
      this.clientValue.leave(0);
      this.host.dequeue(this.clientValue);
      this.clientValue = null;
    }

    const next = this.host.nextStepIndex();
    if (next === null) {
      this.host.endShift();
      return;
    }
    this.host.startBreak(5.2, next);
    this.host.updatePrompt();
  }

  handleBossDelivery(client: Client): void {
    if (client !== this.clientValue) return;
    const shift = this.host.shift();
    if (shift !== 2 && shift !== 3) return;
    this.host.emitBossDefeated();
    this.clientValue = null;
    this.finishStep();
  }

  handlePatienceZero(client: Client): boolean {
    if (client !== this.clientValue) return false;
    const shift = this.host.shift();
    if (shift !== 2 && shift !== 3) return false;
    this.clientValue = null;
    this.finishStep();
    return true;
  }

  clearClient(client: Client): void {
    if (client === this.clientValue) this.clientValue = null;
  }

  reset(): void {
    this.clientValue = null;
    this.zinaOrderPendingValue = false;
    this.zinaPendingCellIdValue = null;
  }

  private triggerModal(): void {
    if (!this.clientValue) return;
    this.boss.trigger();
    this.host.openBossModal();

    if (this.boss.kind === 'zina') {
      this.startZinaMiniGame();
      this.host.updatePrompt();
      return;
    }

    const line = this.host.bossLine();
    this.clientValue.showBubble(line, 999);
    this.host.ui.showBoss(
      this.host.expectedServeStress(),
      line,
      'Галя',
    );
    this.host.sound.boss();
    this.host.updatePrompt();
  }

  private startZinaMiniGame(): void {
    this.zina.start(this.host.zinaSegments(), this.host.zinaFiller());
    this.zinaPendingCellIdValue = null;
    const line = this.host.zinaIntroLine();
    this.clientValue?.showBubble(line, 999);
    this.host.ui.showZinaGame(
      'Баба Зина',
      line,
      this.zina.target,
      this.zina.board,
      this.host.zinaPuzzleTime(),
      this.host.zinaPuzzleTime(),
    );
    this.host.sound.boss();
  }
}
