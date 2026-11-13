import type { QuestDisplay } from './hudView';
import { byId, clear, createResultsQuestRow } from './components';
import './intermission.css';

export interface ResultsData {
  shift: number;
  stars: number;
  title: string;
  served: number;
  lost: number;
  earned: number;
  stress: number;
  baseSalary: number;
  questBonus: number;
  quests: QuestDisplay[];
  failed: boolean;
}

export interface GameOverData {
  shift: number;
  served: number;
  money: number;
}

export interface ModalActions {
  onStart: () => void;
  onContinue: () => void;
  onOpenHelp: () => void;
  onCloseHelp: () => void;
  onTutorialNext: () => void;
  onTutorialSkip: () => void;
  onNextShift: () => void;
  onRestart: () => void;
  onClosePanels: () => void;
  onTutorialTarget: (target: 'scan' | 'cell' | null, cellId?: string) => void;
}

export class ModalView {
  private actions: ModalActions | null = null;

  private readonly startScreen = byId('start-screen');
  private readonly startBtn = byId('start-btn') as HTMLButtonElement;
  private readonly continueBtn = byId('continue-btn') as HTMLButtonElement;
  private readonly startBest = byId('start-best');
  private readonly helpBtn = byId('btn-help') as HTMLButtonElement;
  private readonly helpModal = byId('help-modal');
  private readonly helpClose = byId('help-close') as HTMLButtonElement;

  private readonly tutorial = byId('tutorial');
  private readonly tutorialKicker = byId('tutorial-kicker');
  private readonly tutorialProgress = byId('tutorial-progress');
  private readonly tutorialTitle = byId('tutorial-title');
  private readonly tutorialText = byId('tutorial-text');
  private readonly tutorialNext = byId('tutorial-next') as HTMLButtonElement;
  private readonly tutorialSkip = byId('tutorial-skip') as HTMLButtonElement;

  private readonly resultsIntro = byId('results-intro');
  private readonly resultsIntroClose = byId('results-intro-close') as HTMLButtonElement;
  private readonly resultsModal = byId('results-modal');
  private readonly resultsKicker = byId('results-kicker');
  private readonly resultsStars = byId('results-stars');
  private readonly resultsTitle = byId('results-title');
  private readonly resultsServed = byId('results-served');
  private readonly resultsLost = byId('results-lost');
  private readonly resultsEarned = byId('results-earned');
  private readonly resultsStress = byId('results-stress');
  private readonly resultsQuests = byId('results-quests');
  private readonly resultsQuestList = byId('results-quest-list');
  private readonly questBonus = byId('quest-bonus');
  private readonly resultsSalary = byId('results-salary');
  private readonly nextShift = byId('next-shift') as HTMLButtonElement;
  private readonly intermission = this.resultsModal.querySelector<HTMLElement>('.intermission')!;
  private readonly intermissionTitle = byId('intermission-title');
  private readonly resultsStage = byId('intermission-results');
  private readonly shopStage = byId('intermission-shop');
  private readonly resultsToShop = byId('results-to-shop');
  private readonly shopToResults = byId('shop-to-results');
  private readonly stepResults = byId('intermission-step-results');
  private readonly stepShop = byId('intermission-step-shop');
  private readonly portrait = byId('results-portrait') as HTMLImageElement;
  private stage: 'results' | 'shop' = 'results';
  private nextShiftUnlock: number | null = null;

  private readonly gameoverModal = byId('gameover-modal');
  private readonly gameoverShift = byId('gameover-shift');
  private readonly gameoverServed = byId('gameover-served');
  private readonly gameoverMoney = byId('gameover-money');
  private readonly restartBtn = byId('restart-btn') as HTMLButtonElement;

  bind(actions: ModalActions): void {
    this.actions = actions;
    this.startBtn.addEventListener('click', () => {
      this.hideStart();
      actions.onStart();
    });
    this.continueBtn.addEventListener('click', () => {
      this.hideStart();
      actions.onContinue();
    });
    this.helpBtn.addEventListener('click', () => actions.onOpenHelp());
    this.helpClose.addEventListener('click', () => actions.onCloseHelp());
    this.tutorialNext.addEventListener('click', () => actions.onTutorialNext());
    this.tutorialSkip.addEventListener('click', () => actions.onTutorialSkip());
    this.resultsIntroClose.addEventListener('click', () => this.hideResultsIntro());
    this.resultsToShop.addEventListener('click', () => this.setResultsStage('shop'));
    this.shopToResults.addEventListener('click', () => this.setResultsStage('results'));
    this.stepResults.addEventListener('click', () => { if (this.stage !== 'results') this.setResultsStage('results'); });
    this.stepShop.addEventListener('click', () => { if (this.stage !== 'shop') this.setResultsStage('shop'); });
    this.nextShift.addEventListener('click', () => {
      if (this.stage !== 'shop' || this.nextShift.disabled) return;
      this.nextShift.disabled = true;
      actions.onNextShift();
    });
    document.addEventListener('keydown', event => {
      if (this.resultsModal.classList.contains('hidden') || !this.helpModal.classList.contains('hidden')) return;
      if (event.key === 'Escape' && this.stage === 'shop') {
        event.preventDefault();
        event.stopPropagation();
        this.setResultsStage('results');
      }
      if (event.key !== 'Tab') return;
      const buttons = [...this.resultsModal.querySelectorAll<HTMLElement>('button:not(:disabled), summary')]
        .filter(button => button.getClientRects().length > 0);
      const first = buttons[0], last = buttons.at(-1);
      if (!this.resultsModal.contains(document.activeElement)) {
        event.preventDefault(); first?.focus();
      } else if (event.shiftKey && (document.activeElement === first || document.activeElement === this.intermissionTitle)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    }, true);
    this.restartBtn.addEventListener('click', () => actions.onRestart());
  }

  setBest(best: number): void {
    this.startBest.textContent = String(Math.max(0, Math.round(best)));
  }

  showStart(best: number, continueLabel: string | null = null): void {
    this.setBest(best);
    const canContinue = Boolean(continueLabel);
    this.continueBtn.textContent = continueLabel ?? '';
    this.continueBtn.classList.toggle('hidden', !canContinue);
    this.startBtn.classList.toggle('primary', !canContinue);
    this.startBtn.classList.toggle('ghost', canContinue);
    document.body.classList.add('in-menu');
    this.startScreen.classList.remove('hidden');
    this.actions?.onClosePanels();
  }

  hideStart(): void {
    this.startScreen.classList.add('hidden');
    document.body.classList.remove('in-menu');
  }

  showHelp(): void {
    this.helpModal.classList.remove('hidden');
  }

  hideHelp(): void {
    this.helpModal.classList.add('hidden');
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
    this.tutorial.classList.remove('hidden');
    this.tutorial.classList.toggle('welcome', data.mode !== 'coach');
    this.tutorial.classList.toggle('coach', data.mode === 'coach');
    this.tutorialKicker.textContent = data.kicker;
    this.tutorialProgress.textContent = data.progress ?? '';
    this.tutorialTitle.textContent = data.title;
    this.tutorialText.textContent = data.text;
    this.tutorialNext.textContent = data.nextLabel ?? 'Понятно';
    this.tutorialNext.classList.toggle('hidden', !data.showNext);
    this.tutorialSkip.classList.toggle('hidden', data.mode === 'done');
  }

  hideTutorial(): void {
    this.tutorial.classList.add('hidden');
    this.tutorial.classList.remove('welcome', 'coach');
    this.actions?.onTutorialTarget(null);
  }

  renderResults(data: ResultsData): void {
    this.resultsModal.classList.toggle('failed-shift', data.failed);
    byId('shop-next-label').textContent = data.shift >= 5 ? 'ЗАБЕГ ЗАВЕРШЁН' : `ПОДГОТОВКА К СМЕНЕ ${data.shift + 1}`;
    this.resultsKicker.textContent = `СМЕНА ${data.shift} ЗАВЕРШЕНА`;
    this.resultsStars.setAttribute('aria-label', `Звёзды за смену: ${data.stars} из 3`);
    this.resultsStars.innerHTML = Array.from({ length: 3 }, (_, index) => `<svg class="results-star${index < data.stars ? '' : ' empty'}" viewBox="0 0 100 100" aria-hidden="true"><path class="star-depth" d="m50 9 14 28 31 5-23 23 5 32-27-15-28 15 5-32L4 42l32-5Z"/><path d="m50 3 14 28 31 5-23 23 5 32-27-15-28 15 5-32L4 36l32-5Z"/><path class="star-light" d="m50 3 14 28 31 5-33 1-12-26-12 26-34-1 32-5Z"/></svg>`).join('');
    this.resultsTitle.textContent = data.title;
    this.resultsServed.textContent = String(data.served);
    this.resultsLost.textContent = String(data.lost);
    this.resultsEarned.textContent = `${Math.round(data.earned)} ₽`;
    this.resultsStress.textContent = `${Math.round(data.stress)}%`;
    this.questBonus.textContent = `+${Math.round(data.questBonus)} ₽`;
    this.resultsSalary.textContent = data.failed
      ? `Провал: база ${Math.round(data.baseSalary)} ₽ · бонусы квестов не начислены`
      : `База: ${Math.round(data.baseSalary)} ₽ · Квесты: ${Math.round(data.questBonus)} ₽`;
    this.resultsQuests.classList.toggle('hidden', data.quests.length === 0);
    this.resultsQuests.classList.toggle('failed-shift', data.failed);
    clear(this.resultsQuestList);
    for (const quest of data.quests) {
      this.resultsQuestList.appendChild(
        createResultsQuestRow({
          label: `${quest.completed ? '✓' : quest.failed ? '✕' : '○'} ${quest.title}`,
          detail: quest.completed
            ? data.failed
              ? 'бонус не начислен'
              : `+${quest.reward} ₽`
            : quest.progress,
          completed: quest.completed,
          failed: quest.failed,
        }),
      );
    }
  }

  showResults(): void {
    this.hideResultsIntro();
    this.setResultsStage('results', false);
    this.resultsModal.querySelectorAll('.intermission-scroll').forEach(panel => { panel.scrollTop = 0; });
    this.resultsModal.querySelectorAll<HTMLDetailsElement>('details').forEach(panel => { panel.open = false; });
    if (!this.portrait.getAttribute('src')) this.portrait.src = new URL('../assets/intermission/employee.webp', import.meta.url).href;
    this.resultsModal.classList.remove('hidden');
    this.intermissionTitle.focus({ preventScroll: true });
  }

  showResultsIntro(): void {
    this.resultsIntro.classList.remove('hidden');
  }

  hideResultsIntro(): void {
    this.resultsIntro.classList.add('hidden');
  }

  hideResults(): void {
    if (this.nextShiftUnlock !== null) window.clearTimeout(this.nextShiftUnlock);
    this.nextShiftUnlock = null;
    this.hideResultsIntro();
    this.resultsModal.classList.add('hidden');
  }

  private setResultsStage(stage: 'results' | 'shop', focus = true): void {
    if (this.nextShiftUnlock !== null) window.clearTimeout(this.nextShiftUnlock);
    this.nextShiftUnlock = null;
    this.stage = stage;
    this.intermission.dataset.stage = stage;
    this.resultsStage.classList.toggle('hidden', stage !== 'results');
    this.shopStage.classList.toggle('hidden', stage !== 'shop');
    this.intermissionTitle.textContent = stage === 'results' ? 'Итоги смены' : 'Магазин между сменами';
    this.stepResults.removeAttribute('aria-current');
    this.stepShop.removeAttribute('aria-current');
    (stage === 'results' ? this.stepResults : this.stepShop).setAttribute('aria-current', 'step');
    // Prevent a double tap on the same corner from skipping the shop.
    this.nextShift.disabled = true;
    if (stage === 'shop') this.nextShiftUnlock = window.setTimeout(() => {
      this.nextShift.disabled = false;
      this.nextShiftUnlock = null;
    }, 350);
    if (focus) this.intermissionTitle.focus({ preventScroll: true });
  }

  setNextShiftFinal(final: boolean): void {
    this.nextShift.textContent = final ? 'В меню' : 'Следующая смена →';
  }

  showGameOver(data: GameOverData): void {
    this.gameoverShift.textContent = String(data.shift);
    this.gameoverServed.textContent = String(data.served);
    this.gameoverMoney.textContent = `${Math.round(data.money)} ₽`;
    this.gameoverModal.classList.remove('hidden');
    this.actions?.onClosePanels();
  }

  hideGameOver(): void {
    this.gameoverModal.classList.add('hidden');
  }

  hideAll(): void {
    this.hideStart();
    this.hideHelp();
    this.hideResults();
    this.hideGameOver();
    this.hideTutorial();
    this.hideResultsIntro();
  }
}
