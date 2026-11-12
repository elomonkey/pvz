import type { Game } from '../game';
import { byId } from './components';

export class DevConsole {
  private game: Game | null = null;
  private readonly panel = byId('dev-console');
  private readonly close = byId('dev-close') as HTMLButtonElement;
  private readonly boss = byId('dev-boss') as HTMLButtonElement;
  private readonly money = byId('dev-money') as HTMLButtonElement;
  private readonly reset = byId('dev-reset') as HTMLButtonElement;
  private readonly tutorialOn = byId('dev-tutorial-on') as HTMLButtonElement;
  private readonly tutorialOff = byId('dev-tutorial-off') as HTMLButtonElement;
  private readonly tutorialStatus = byId('dev-tutorial-status');
  private readonly shifts = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-dev-shift]'),
  );

  bind(game: Game): void {
    this.game = game;
    this.close.addEventListener('click', () => this.toggle(false));
    this.boss.addEventListener('click', () => this.game?.debugBoss());
    this.money.addEventListener('click', () => this.game?.debugAddMoney(500));
    this.reset.addEventListener('click', () => {
      this.game?.debugShowMenu();
      this.toggle(false);
    });
    this.tutorialOn.addEventListener('click', () => {
      this.game?.debugEnableTutorial();
      this.refreshTutorialStatus();
      this.toggle(false);
    });
    this.tutorialOff.addEventListener('click', () => {
      this.game?.debugDisableTutorial();
      this.refreshTutorialStatus();
    });
    for (const button of this.shifts) {
      button.addEventListener('click', () => {
        this.game?.debugSetShift(Number(button.dataset.devShift));
      });
    }
  }

  toggle(force?: boolean): void {
    const open = force ?? this.panel.classList.contains('hidden');
    this.panel.classList.toggle('hidden', !open);
    if (open) this.refreshTutorialStatus();
  }

  private refreshTutorialStatus(): void {
    if (!this.game) return;
    const enabled = this.game.debugTutorialEnabled();
    this.tutorialStatus.textContent = `Обучение: ${enabled ? 'включено' : 'выключено'}`;
    this.tutorialStatus.classList.toggle('on', enabled);
  }
}
