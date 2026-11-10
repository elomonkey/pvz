import type { ShiftStep } from '../domain/shifts';

/**
 * Ведёт смену по шагам: волна → волна → босс → финальная волна.
 * Не знает про Three.js, клиентов и UI — только таймер передышки
 * и индекс текущего шага.
 */
export class ShiftDirector {
  private steps: ShiftStep[] = [];
  private current = -1;
  private pending: number | null = null;
  private breakRemaining = 0;
  private breakDuration = 0;

  get allSteps(): readonly ShiftStep[] {
    return this.steps;
  }

  get length(): number {
    return this.steps.length;
  }

  get currentIndex(): number {
    return this.current;
  }

  get currentStep(): ShiftStep | undefined {
    return this.steps[this.current];
  }

  get nextStepIndex(): number | null {
    const next = this.current + 1;
    return next < this.steps.length ? next : null;
  }

  get progress(): number {
    if (this.steps.length === 0) return 0;
    return Math.max(0, Math.min(1, (this.current + 0.2) / this.steps.length));
  }

  get breakProgress(): number {
    if (this.breakDuration <= 0) return 0;
    return Math.max(0, Math.min(1, this.breakRemaining / this.breakDuration));
  }

  begin(steps: ShiftStep[], initialBreak = 1.2): void {
    this.steps = [...steps];
    this.current = -1;
    this.pending = 0;
    this.breakRemaining = initialBreak;
    this.breakDuration = initialBreak;
  }

  enterStep(index: number): ShiftStep | undefined {
    const step = this.steps[index];
    if (!step) return undefined;
    this.current = index;
    this.pending = null;
    this.breakRemaining = 0;
    return step;
  }

  jumpTo(index: number): void {
    if (index >= 0 && index < this.steps.length) {
      this.current = index;
      this.pending = null;
      this.breakRemaining = 0;
    }
  }

  findBossIndex(): number {
    return this.steps.findIndex((step) => step.type === 'boss');
  }

  startBreak(seconds: number, nextStepIndex: number): void {
    this.pending = nextStepIndex;
    this.breakRemaining = seconds;
    this.breakDuration = seconds;
  }

  /** Возвращает индекс шага, когда передышка закончилась. */
  updateBreak(dt: number): number | null {
    if (this.pending === null) return null;
    this.breakRemaining = Math.max(0, this.breakRemaining - dt);
    if (this.breakRemaining > 0) return null;
    const index = this.pending;
    this.pending = null;
    return index;
  }

  reset(): void {
    this.steps = [];
    this.current = -1;
    this.pending = null;
    this.breakRemaining = 0;
    this.breakDuration = 0;
  }
}
