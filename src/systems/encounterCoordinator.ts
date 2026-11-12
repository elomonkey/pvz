export type EncounterPhase =
  | 'menu'
  | 'playing'
  | 'break'
  | 'boss'
  | 'results'
  | 'gameover';

/**
 * Owns the top-level encounter phase and the shared pause overlays.
 * UI, scene, tutorial and boss-specific state stay outside this system.
 */
export class EncounterCoordinator {
  private phaseValue: EncounterPhase = 'menu';
  private modal = false;
  private help = false;

  get phase(): EncounterPhase {
    return this.phaseValue;
  }

  get modalOpen(): boolean {
    return this.modal;
  }

  get helpOpen(): boolean {
    return this.help;
  }

  get paused(): boolean {
    return this.modal || this.help;
  }

  get inputBlocked(): boolean {
    return (
      this.paused ||
      this.phaseValue === 'menu' ||
      this.phaseValue === 'results' ||
      this.phaseValue === 'gameover'
    );
  }

  enterMenu(): void {
    this.phaseValue = 'menu';
  }

  enterBreak(): void {
    this.phaseValue = 'break';
  }

  enterPlaying(): void {
    this.phaseValue = 'playing';
  }

  enterBoss(): void {
    this.phaseValue = 'boss';
  }

  enterResults(): void {
    this.phaseValue = 'results';
  }

  enterGameOver(): void {
    this.phaseValue = 'gameover';
  }

  openModal(): void {
    this.modal = true;
  }

  closeModal(): void {
    this.modal = false;
  }

  openHelp(): void {
    this.modal = true;
    this.help = true;
  }

  closeHelp(): void {
    this.help = false;
    this.modal = false;
  }

  reset(): void {
    this.phaseValue = 'menu';
    this.modal = false;
    this.help = false;
  }
}
