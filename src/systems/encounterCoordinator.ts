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
  private tutorial = false;
  private mechanicCard = false;
  private scannerBreakCard = false;

  get phase(): EncounterPhase {
    return this.phaseValue;
  }

  get modalOpen(): boolean {
    return this.modal;
  }

  get helpOpen(): boolean {
    return this.help;
  }

  get tutorialOpen(): boolean {
    return this.tutorial;
  }

  get mechanicCardOpen(): boolean {
    return this.mechanicCard;
  }

  get scannerBreakCardOpen(): boolean {
    return this.scannerBreakCard;
  }

  get overlayOpen(): boolean {
    return this.tutorial || this.mechanicCard || this.scannerBreakCard;
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

  openTutorial(): void {
    this.tutorial = true;
  }

  closeTutorial(): void {
    this.tutorial = false;
  }

  openMechanicCard(): void {
    this.mechanicCard = true;
  }

  closeMechanicCard(): void {
    this.mechanicCard = false;
  }

  openScannerBreakCard(): void {
    this.scannerBreakCard = true;
  }

  closeScannerBreakCard(): void {
    this.scannerBreakCard = false;
  }

  reset(): void {
    this.phaseValue = 'menu';
    this.modal = false;
    this.help = false;
    this.tutorial = false;
    this.mechanicCard = false;
    this.scannerBreakCard = false;
  }
}
