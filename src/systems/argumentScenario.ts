import type { Client } from '../client';
import type { Sound } from '../sound';
import type { UI } from '../ui';
import type {
  ArgumentKind,
  ArgumentSystem,
  MashState,
} from './argumentSystem';
import type { EncounterPhase } from './encounterCoordinator';

export interface ArgumentRules {
  mashDuration: number;
  winThreshold: number;
  startValue(charm: number): number;
  serveStress(charm: number): number;
  concedeStress(charm: number): number;
  pushback(charm: number): number;
}

export interface ArgumentLines {
  client(): string;
  clientConcede(): string;
  clientWin(): string;
  clientLose(): string;
  clientTaunts: readonly string[];
  bossTaunts: readonly string[];
  bossServed: string;
  bossWin: string;
  bossLose: string;
}

/**
 * Game-facing operations for arguments. Game owns service, queue, rewards,
 * scanner break and the boss encounter; ArgumentScenario owns the flow.
 */
export interface ArgumentScenarioHost {
  ui: UI;
  sound: Sound;
  shift(): number;
  charm(): number;
  phase(): EncounterPhase;
  isModalOpen(): boolean;
  isGameOver(): boolean;
  bossResolved(): boolean;
  resolveBoss(): void;
  resetZina(): void;
  bossClient(): Client | null;
  queueFront(): Client | null;
  serviceActive(): boolean;
  carryingReturn(): boolean;
  isExcludedClient(client: Client): boolean;
  openDialogue(): void;
  breakScanner(): void;
  setPendingGameOver(): void;
  stress(): number;
  setStress(value: number): void;
  addStress(amount: number, deferGameOver?: boolean): void;
  addReputation(amount: number): void;
  setBuff(seconds: number): void;
  setScanSpeed(value: number): void;
  emitBossDefeated(): void;
  emitArgumentResolved(kind: ArgumentKind, won: boolean): void;
  updateHud(): void;
  updateStressUi(): void;
  updatePrompt(): void;
}

/**
 * Coordinates client arguments and the argument with Galya. ArgumentSystem
 * keeps the numeric mash state; Game keeps rewards, UI, service and boss state.
 */
export class ArgumentScenario {
  private readonly system: ArgumentSystem;
  private readonly host: ArgumentScenarioHost;
  private readonly rules: ArgumentRules;
  private readonly lines: ArgumentLines;
  private argueClientValue: Client | null = null;

  constructor(
    system: ArgumentSystem,
    host: ArgumentScenarioHost,
    rules: ArgumentRules,
    lines: ArgumentLines,
  ) {
    this.system = system;
    this.host = host;
    this.rules = rules;
    this.lines = lines;
  }

  get argueClient(): Client | null {
    return this.argueClientValue;
  }

  tryStartClientArgument(client: Client): boolean {
    if (
      this.host.shift() < 2 ||
      !client.willArgue ||
      client.argueTriggered
    ) {
      return false;
    }
    if (
      client.isBoss ||
      client.isMenu ||
      this.host.isExcludedClient(client)
    ) {
      return false;
    }
    if (client.state !== 'waiting' || this.host.queueFront() !== client) return false;
    if (this.host.serviceActive() || this.host.carryingReturn()) return false;

    client.argueTriggered = true;
    this.system.open('client');
    this.argueClientValue = client;
    this.host.openDialogue();

    const line = this.lines.client();
    client.showBubble(line, 999);
    this.host.ui.showClientArgue(
      client.archetype.name,
      line,
      this.rules.concedeStress(this.host.charm()),
    );
    this.host.sound.boss();
    this.host.updatePrompt();
    return true;
  }

  onBossServe(): void {
    if (!this.host.isModalOpen()) return;
    if (this.system.context === 'client') {
      this.resolveClientConcede();
      return;
    }
    if (this.host.phase() !== 'boss' || this.host.bossResolved()) return;
    this.host.resolveBoss();
    if (this.host.shift() === 1) this.host.breakScanner();
    const before = this.host.stress();
    this.host.addStress(this.rules.serveStress(this.host.charm()), true);
    const actual = Math.round(this.host.stress() - before);
    this.host.ui.showBossResult(
      'Обслужили',
      `Тётка довольна, но вы выгорели. Желание уволиться +${actual}.${
        this.host.shift() === 1
          ? ' Напоследок Галя разбила сканер: подсветка ячеек отключена.'
          : ''
      }`,
      false,
      this.lines.bossServed,
    );
    this.host.sound.lose();
    this.host.updateHud();
    this.host.updateStressUi();
  }

  onBossArgue(): void {
    if (!this.host.isModalOpen()) return;
    if (this.system.context === 'client') {
      this.startClientMash();
      return;
    }
    if (this.host.phase() !== 'boss' || this.host.bossResolved()) return;
    this.system.open('boss');
    this.startMash(this.lines.bossTaunts[0], this.host.bossClient());
  }

  mash(): void {
    if (!this.host.isModalOpen()) return;
    const argue = this.system.press();
    if (!argue) return;
    this.host.ui.setBossMarker(argue.mashValue);
    this.maybeShowTaunt(argue);
    this.host.sound.click();
    if (argue.mashTaps % 5 === 0) this.host.sound.win();
  }

  update(dt: number): void {
    if (!this.host.isModalOpen()) return;
    const finished = this.system.update(dt);
    this.host.ui.updateBossTimer(this.system.timeRatio);
    const argue = this.system.mashState;
    if (argue) this.host.ui.setBossMarker(argue.mashValue);
    if (finished) this.finishMash();
  }

  /** Close the argument UI and return the context/client for boss teardown. */
  closeDialogue(): {
    context: ArgumentKind | null;
    client: Client | null;
  } {
    const context = this.system.context;
    const client = this.argueClientValue;
    client?.hideBubble();
    this.reset();
    return { context, client };
  }

  reset(): void {
    this.system.clear();
    this.argueClientValue = null;
  }

  private startClientMash(): void {
    if (this.system.isResolved) return;
    this.startMash(this.lines.clientTaunts[0], this.argueClientValue);
  }

  private startMash(firstTaunt: string, bubbleClient: Client | null): void {
    const startValue = this.rules.startValue(this.host.charm());
    const mash = this.system.startMash({
      startValue,
      duration: this.rules.mashDuration,
      pushbackPerSecond: this.rules.pushback(this.host.charm()),
    });
    this.host.ui.showBossArgue();
    this.host.ui.startBossMash();
    this.host.ui.setBossMarker(mash.mashValue);
    this.host.ui.pushBossTaunt(firstTaunt);
    this.host.ui.updateBossTimer(1);
    bubbleClient?.showBubble('Вы меня не переспорите!', 999);
    this.host.sound.boss();
  }

  private resolveClientConcede(): void {
    if (this.system.isResolved) return;
    this.system.resolve();
    const client = this.argueClientValue;
    const before = this.host.stress();
    this.host.addStress(this.rules.concedeStress(this.host.charm()), true);
    const gained = Math.max(0, Math.round(this.host.stress() - before));
    const line = this.lines.clientConcede();
    client?.showBubble(line, 4);
    this.host.ui.showBossResult(
      'Вы уступили',
      `Спор улажен. Стресс +${gained}. Клиент ждёт свой заказ.`,
      false,
      line,
    );
    this.host.emitArgumentResolved('client', false);
    this.host.updateHud();
    this.host.updateStressUi();
  }

  private finishClientMash(argue: MashState): void {
    if (this.system.isResolved) return;
    this.system.resolve();
    const client = this.argueClientValue;
    const won = argue.mashValue > this.rules.winThreshold;

    if (won) {
      const before = this.host.stress();
      this.host.addStress(-8, true);
      const drop = Math.max(0, Math.round(before - this.host.stress()));
      this.host.addReputation(0.1);
      if (client) {
        client.setPatience(Math.min(client.maxPatience, client.patience + 5));
      }
      this.host.ui.showBossResult(
        'Вы победили в споре!',
        `Клиент признал вашу правоту. Стресс −${drop}, репутация +0,1.`,
        true,
        this.lines.clientWin(),
      );
    } else {
      const before = this.host.stress();
      this.host.addStress(10, true);
      const gained = Math.max(0, Math.round(this.host.stress() - before));
      this.host.addReputation(-0.2);
      if (client) {
        client.setPatience(Math.max(3, client.patience - 4));
      }
      this.host.ui.showBossResult(
        'Клиент настоял на своём',
        `Спор проигран. Стресс +${gained}, репутация −0,2. Придётся обслужить.`,
        false,
        this.lines.clientLose(),
      );
    }
    this.host.emitArgumentResolved('client', won);
    this.host.updateHud();
    this.host.updateStressUi();
  }

  private maybeShowTaunt(argue: MashState): void {
    // Стартовая реплика и далее каждые 15% пути от старта до победы.
    const lines =
      this.system.context === 'client'
        ? this.lines.clientTaunts
        : this.lines.bossTaunts;
    const span = Math.max(0.1, 1 - argue.startValue);
    const progress = Math.max(
      0,
      Math.min(1, (argue.mashValue - argue.startValue) / span),
    );
    const target = Math.min(lines.length - 1, Math.floor(progress / 0.15));
    while (argue.tauntIndex <= target) {
      this.host.ui.pushBossTaunt(lines[argue.tauntIndex]);
      argue.tauntIndex++;
    }
  }

  private finishMash(): void {
    const finished = this.system.consumeFinished();
    if (!finished) return;
    const { kind, state: argue } = finished;

    if (kind === 'client') {
      this.finishClientMash(argue);
      return;
    }

    this.host.resolveBoss();
    this.host.resetZina();
    if (this.host.shift() === 1) this.host.breakScanner();
    const scannerNote =
      this.host.shift() === 1
        ? ' Галя разбила сканер: подсветка ячеек отключена.'
        : '';
    const won = argue.mashValue > this.rules.winThreshold;

    if (won) {
      const beforeWin = this.host.stress();
      this.host.addStress(-30);
      const drop = Math.max(0, Math.round(beforeWin - this.host.stress()));
      this.host.setBuff(20);
      this.host.setScanSpeed(1.5);
      this.host.ui.showBossResult(
        'Вы победили в споре!',
        `Тётка отступила. Желание уволиться −${drop}, скорость и обслуживание ускорены на 20 секунд.${scannerNote}`,
        true,
        this.lines.bossWin,
      );
      this.host.emitBossDefeated();
    } else {
      const before = this.host.stress();
      if (before >= 50) {
        this.host.setStress(100);
        this.host.setPendingGameOver();
        this.host.ui.showBossResult(
          'Тётка победила',
          `Вы проиграли спор. Желание уволиться было слишком высоким — заявление подписано.${scannerNote}`,
          false,
          this.lines.bossLose,
        );
      } else {
        this.host.setStress(85);
        this.host.ui.showBossResult(
          'Тётка победила',
          `Вы проиграли спор. Желание уволиться достигло критического уровня.${scannerNote}`,
          false,
          this.lines.bossLose,
        );
      }
    }

    this.host.emitArgumentResolved('boss', won);
    this.host.updateHud();
    this.host.updateStressUi();
  }
}
