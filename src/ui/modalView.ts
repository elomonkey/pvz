import type { QuestDisplay } from './hudView';
import { byId, clear, createResultsQuestRow } from './components';

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
    this.helpBtn.addEventListener('click', () => actions.onOpenHelp());
    this.helpClose.addEventListener('click', () => actions.onCloseHelp());
    this.tutorialNext.addEventListener('click', () => actions.onTutorialNext());
    this.tutorialSkip.addEventListener('click', () => actions.onTutorialSkip());
    this.resultsIntroClose.addEventListener('click', () => this.hideResultsIntro());
    this.nextShift.addEventListener('click', () => actions.onNextShift());
    this.restartBtn.addEventListener('click', () => actions.onRestart());
  }

  setBest(best: number): void {
    this.startBest.textContent = String(Math.max(0, Math.round(best)));
  }

  showStart(best: number): void {
    this.setBest(best);
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
    this.resultsKicker.textContent = `СМЕНА ${data.shift} ЗАВЕРШЕНА`;
    this.resultsStars.textContent = '★'.repeat(data.stars) + '☆'.repeat(3 - data.stars);
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
    this.resultsModal.classList.remove('hidden');
  }

  showResultsIntro(): void {
    this.resultsIntro.classList.remove('hidden');
  }

  hideResultsIntro(): void {
    this.resultsIntro.classList.add('hidden');
  }

  hideResults(): void {
    this.hideResultsIntro();
    this.resultsModal.classList.add('hidden');
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
