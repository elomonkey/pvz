import type { BossDialogueLine, DecorOwnership } from './data';
import type { Game } from './game';
import type { Sound } from './sound';
import type { CellPanelModel } from './systems/scannerPanelSystem';
import { BossView } from './ui/bossView';
import { DevConsole } from './ui/devConsole';
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
  private readonly dev = new DevConsole();
  private readonly modals = new ModalView();
  private readonly boss = new BossView();

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
    this.dev.bind(this.game);
    this.modals.bind({
      onStart: () => {
        this.sound.init();
        this.sound.click();
        this.game.startNewGame();
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

    this.boss.bind({
      onServe: () => this.game.onBossServe(),
      onArgue: () => this.game.onBossArgue(),
      onMash: () => this.game.mashBoss(),
      onDone: () => this.game.onBossDone(),
      onFinalDialogueDone: () => this.game.onFinalBossDialogueDone(),
      onZinaMove: (index) => this.game.zinaPuzzleMove(index),
      onSoundInit: () => this.sound.init(),
      onClosePanels: () => this.closePanels(),
    });
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
    this.boss.showFinalBossDialogue(phase, lines, button);
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

  showStart(best: number): void {
    this.modals.showStart(best);
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
    this.boss.showBoss(serveStress, line, name);
  }

  showClientArgue(name: string, line: string, concedeStress: number): void {
    this.boss.showClientArgue(name, line, concedeStress);
  }

  showBossArgue(): void {
    this.boss.showBossArgue();
  }

  pushBossTaunt(text: string): void {
    this.boss.pushBossTaunt(text);
  }

  showZinaGame(
    name: string,
    line: string,
    target: number[],
    board: (number | null)[],
    time: number,
    total: number,
  ): void {
    this.boss.showZinaGame(name, line, target, board, time, total);
  }

  renderZinaPuzzle(board: (number | null)[], target: number[]): void {
    this.boss.renderZinaPuzzle(board, target);
  }

  updateZinaTimer(ratio: number): void {
    this.boss.updateZinaTimer(ratio);
  }

  setZinaFeedback(text: string, good: boolean): void {
    this.boss.setZinaFeedback(text, good);
  }

  startBossMash(): void {
    this.boss.startBossMash();
  }

  setBossMarker(value: number): void {
    this.boss.setBossMarker(value);
  }

  updateBossTimer(ratio: number): void {
    this.boss.updateBossTimer(ratio);
  }

  showBossResult(
    title: string,
    detail: string,
    success: boolean,
    finalQuote = '',
  ): void {
    this.boss.showBossResult(title, detail, success, finalQuote);
  }

  hideBoss(): void {
    this.boss.hideBoss();
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
