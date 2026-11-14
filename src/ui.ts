import type { BossDialogueLine, DecorOwnership } from './data';
import type { Game } from './game';
import type { Sound } from './sound';
import type { CellPanelModel } from './systems/scannerPanelSystem';
import type { BossActions, BossView } from './ui/bossView';
import { byId } from './ui/components';
import type { DevConsole } from './ui/devConsole';
import { HudView, type HudData, type QuestDisplay } from './ui/hudView';
import {
  ModalView,
  type GameOverData,
  type ResultsData,
} from './ui/modalView';
import { ScannerView } from './ui/scannerView';
import { ShopView, type CharacterStats, type Upgrades } from './ui/shopView';

export class UI {
  private game!: Game;
  private readonly sound: Sound;

  private readonly hud = new HudView();
  private readonly scanner = new ScannerView();
  private readonly shop: ShopView;
  private dev: DevConsole | null = null;
  private devLoading: Promise<void> | null = null;
  private devOpenRequested = false;
  private readonly modals = new ModalView();
  private boss: BossView | null = null;
  private bossActions!: BossActions;
  private bossLoading: Promise<void> | null = null;
  private pendingBossCalls: Array<(view: BossView) => void> = [];
  private readonly bossLoadError = byId('boss-load-error');
  private readonly bossLoadRetry = byId('boss-load-retry') as HTMLButtonElement;

  constructor(sound: Sound) {
    this.sound = sound;
    this.shop = new ShopView(sound);
    document.body.classList.add('in-menu');
  }

  bind(game: Game): void {
    this.game = game;

    this.hud.bind(this.sound);
    this.scanner.bind({
      onScanComplete: () => this.game.onScanComplete(),
      onScannerClosed: () => this.game.onScannerClosed(),
      onCellDismissed: () => this.game.dismissCellPanel(),
      onChooseCell: (cellId) => this.game.chooseCellById(cellId),
      onSoundInit: () => this.sound.init(),
      onSoundClick: () => this.sound.click(),
    });

    this.shop.bind(this.game);
    window.addEventListener('keydown', event => {
      if (event.code !== 'F2' && event.code !== 'Backquote') return;
      event.preventDefault();
      if (this.dev) {
        this.dev.toggle();
        return;
      }
      this.devOpenRequested = !this.devOpenRequested;
      this.devLoading ??= import('./ui/devConsole').then(({ DevConsole }) => {
        this.dev = new DevConsole();
        this.dev.bind(this.game);
        this.dev.toggle(this.devOpenRequested);
      }).catch(error => {
        // A failed optional chunk can be retried with the same shortcut.
        this.devLoading = null;
        this.devOpenRequested = false;
        console.error('Не удалось загрузить dev-консоль', error);
      });
    });
    this.modals.bind({
      onStart: () => {
        this.sound.init();
        this.sound.click();
        void this.preloadBoss();
        this.game.startNewGame();
      },
      onContinue: () => {
        this.sound.init();
        this.sound.click();
        void this.preloadBoss();
        this.game.continueGame();
      },
      onOpenHelp: () => this.game.openHelp(),
      onCloseHelp: () => this.game.closeHelp(),
      onTutorialNext: () => {
        this.sound.init();
        this.game.onTutorialNext();
      },
      onTutorialSkip: () => {
        this.sound.init();
        this.game.skipTutorial();
      },
      onNextShift: () => this.game.nextShift(),
      onRestart: () => this.game.restartGame(),
      onClosePanels: () => this.closePanels(),
      onTutorialTarget: (target, cellId) =>
        this.scanner.setTutorialTarget(target, cellId),
    });

    this.bossLoadRetry.addEventListener('click', () => this.retryBossLoad());

    this.bossActions = {
      onServe: () => this.game.onBossServe(),
      onArgue: () => this.game.onBossArgue(),
      onMash: () => this.game.mashBoss(),
      onDone: () => this.game.onBossDone(),
      onFinalDialogueDone: () => this.game.onFinalBossDialogueDone(),
      onZinaMove: (index) => this.game.zinaPuzzleMove(index),
      onSoundInit: () => this.sound.init(),
      onClosePanels: () => this.closePanels(),
    };
  }

  private preloadBoss(): Promise<void> {
    const loading = this.bossLoading ??= import('./ui/bossView').then(({ BossView }) => {
      const view = new BossView();
      view.bind(this.bossActions);
      this.boss = view;
      this.hideBossLoadError();
      const calls = this.pendingBossCalls;
      this.pendingBossCalls = [];
      for (const call of calls) call(view);
    }).catch(error => {
      this.bossLoading = null;
      if (this.pendingBossCalls.length > 0) this.showBossLoadError();
      console.error('Не удалось загрузить диалоги', error);
    });
    return loading;
  }

  private withBoss(call: (view: BossView) => void): void {
    if (this.boss) call(this.boss);
    else {
      this.pendingBossCalls.push(call);
      void this.preloadBoss();
    }
  }

  private retryBossLoad(): void {
    if (this.bossLoading) return;
    this.bossLoadRetry.disabled = true;
    this.bossLoadRetry.textContent = 'Загрузка…';
    void this.preloadBoss().finally(() => {
      this.bossLoadRetry.disabled = false;
      this.bossLoadRetry.textContent = 'Повторить';
    });
  }

  private showBossLoadError(): void {
    this.bossLoadError.classList.remove('hidden');
    this.bossLoadRetry.disabled = false;
    this.bossLoadRetry.textContent = 'Повторить';
    this.bossLoadRetry.focus({ preventScroll: true });
  }

  private hideBossLoadError(): void {
    this.bossLoadError.classList.add('hidden');
  }

  update(dt: number): void {
    this.scanner.update(dt);
  }

  setBest(best: number): void {
    this.modals.setBest(best);
  }

  updateHud(data: HudData): void {
    this.hud.updateHud(data);
  }

  setReputation(value: number): void {
    this.hud.setReputation(value);
  }

  setFittingRooms(occupied: number, total: number, active: boolean): void {
    this.hud.setFittingRooms(occupied, total, active);
  }

  setQueenStatus(active: boolean, remaining: number): void {
    this.hud.setQueenStatus(active, remaining);
  }

  setFinalBossStatus(active: boolean, phase: number, progress: string): void {
    this.hud.setFinalBossStatus(active, phase, progress);
  }

  setFinalBossDebuff(active: boolean): void {
    this.hud.setFinalBossDebuff(active);
  }

  setQuests(quests: QuestDisplay[], active = true): void {
    this.hud.setQuests(quests, active);
  }

  showFinalBossDialogue(
    phase: string,
    lines: BossDialogueLine[],
    button: string,
  ): void {
    this.withBoss(view => view.showFinalBossDialogue(phase, lines, button));
  }

  setToyRelief(used: number, cap = 30): void {
    this.hud.setToyRelief(used, cap);
  }

  updateStress(stress: number): void {
    this.hud.updateStress(stress);
  }

  setBuff(seconds: number): void {
    this.hud.setBuff(seconds);
  }

  setScanSpeed(speed: number): void {
    this.scanner.setScanSpeed(speed);
  }

  setPrompt(text: string): void {
    this.hud.setPrompt(text);
  }

  showTutorial(data: {
    mode: 'welcome' | 'coach' | 'done';
    kicker: string;
    title: string;
    text: string;
    progress?: string;
    nextLabel?: string;
    showNext: boolean;
  }): void {
    this.modals.showTutorial(data);
  }

  hideTutorial(): void {
    this.modals.hideTutorial();
  }

  setTutorialTarget(target: 'scan' | 'cell' | null, cellId?: string): void {
    this.scanner.setTutorialTarget(target, cellId);
  }

  setOrderChip(label: string | null, value = '', state = ''): void {
    this.hud.setOrderChip(label, value, state);
  }

  openScanner(clientName: string): void {
    this.scanner.openScanner(clientName);
  }

  showScanResult(cell: string): void {
    this.scanner.showScanResult(cell);
  }

  closeScanner(): void {
    this.scanner.closeScanner();
  }

  openCellPanel(options: CellPanelModel): void {
    this.scanner.openCellPanel(options);
  }

  closeCellPanel(): void {
    this.scanner.closeCellPanel();
  }

  setSignal(text: string, level: number): void {
    this.scanner.setSignal(text, level);
  }

  shakeCell(cellId: string): void {
    this.scanner.shakeCell(cellId);
  }

  toast(text: string, type: 'info' | 'success' | 'error' | 'boss' = 'info'): void {
    this.hud.toast(text, type);
  }

  banner(title: string, sub = '', duration = 2.2): void {
    this.hud.banner(title, sub, duration);
  }

  showStart(best: number, continueLabel: string | null = null): void {
    this.modals.showStart(best, continueLabel);
  }

  hideStart(): void {
    this.modals.hideStart();
  }

  showHelp(): void {
    this.modals.showHelp();
  }

  hideHelp(): void {
    this.modals.hideHelp();
  }

  showBoss(serveStress: number, line: string, name = 'Галя'): void {
    this.withBoss(view => view.showBoss(serveStress, line, name));
  }

  showClientArgue(name: string, line: string, concedeStress: number): void {
    this.withBoss(view => view.showClientArgue(name, line, concedeStress));
  }

  showBossArgue(): void {
    this.withBoss(view => view.showBossArgue());
  }

  pushBossTaunt(text: string): void {
    this.withBoss(view => view.pushBossTaunt(text));
  }

  showZinaGame(
    name: string,
    line: string,
    target: number[],
    board: (number | null)[],
    time: number,
    total: number,
  ): void {
    this.withBoss(view => view.showZinaGame(name, line, target, board, time, total));
  }

  renderZinaPuzzle(board: (number | null)[], target: number[]): void {
    this.withBoss(view => view.renderZinaPuzzle(board, target));
  }

  updateZinaTimer(ratio: number): void {
    this.withBoss(view => view.updateZinaTimer(ratio));
  }

  setZinaFeedback(text: string, good: boolean): void {
    this.withBoss(view => view.setZinaFeedback(text, good));
  }

  startBossMash(): void {
    this.withBoss(view => view.startBossMash());
  }

  setBossMarker(value: number): void {
    this.withBoss(view => view.setBossMarker(value));
  }

  updateBossTimer(ratio: number): void {
    this.withBoss(view => view.updateBossTimer(ratio));
  }

  showBossResult(
    title: string,
    detail: string,
    success: boolean,
    finalQuote = '',
  ): void {
    this.withBoss(view => view.showBossResult(title, detail, success, finalQuote));
  }

  hideBoss(): void {
    this.pendingBossCalls = [];
    this.hideBossLoadError();
    this.boss?.hideBoss();
  }

  showResults(
    data: ResultsData,
    upgrades: Upgrades,
    money: number,
    character: CharacterStats,
    ownedDecor: DecorOwnership,
    scannerBroken = false,
  ): void {
    this.modals.renderResults(data);
    this.shop.show(upgrades, money, ownedDecor, character, scannerBroken);
    this.modals.showResults();
    this.closePanels();
  }

  showResultsIntro(): void {
    this.modals.showResultsIntro();
  }

  setNextShiftFinal(final: boolean): void {
    this.modals.setNextShiftFinal(final);
  }

  updateShop(
    upgrades: Upgrades,
    money: number,
    ownedDecor: DecorOwnership,
    scannerBroken = false,
  ): void {
    this.shop.update(upgrades, money, ownedDecor, scannerBroken);
  }

  hideResults(): void {
    this.modals.hideResults();
  }

  showGameOver(data: GameOverData): void {
    this.modals.showGameOver(data);
  }

  hideGameOver(): void {
    this.modals.hideGameOver();
  }

  hideAllModals(): void {
    this.modals.hideAll();
    this.hideBoss();
  }

  closePanels(): void {
    this.closeScanner();
    this.closeCellPanel();
    this.setOrderChip(null);
    this.setPrompt('');
  }

}
