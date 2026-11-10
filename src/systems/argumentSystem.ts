export type ArgumentKind = 'boss' | 'client';

export interface MashState {
  mashActive: boolean;
  mashTime: number;
  mashValue: number;
  mashTaps: number;
  startValue: number;
  tauntIndex: number;
}

export interface MashOptions {
  startValue: number;
  duration: number;
  pushbackPerSecond: number;
}

export interface FinishedArgument {
  kind: ArgumentKind;
  state: MashState;
}

/**
 * Состояние спора: кто спорит и механика «перетапай шкалу».
 * Без UI, звука и Three.js — только числа и переходы состояния.
 */
export class ArgumentSystem {
  private kind: ArgumentKind | null = null;
  private mash: MashState | null = null;
  private resolved = false;
  private duration = 6;
  private pushback = 0;

  get context(): ArgumentKind | null {
    return this.kind;
  }

  get mashState(): Readonly<MashState> | null {
    return this.mash;
  }

  get active(): boolean {
    return this.mash !== null;
  }

  get isResolved(): boolean {
    return this.resolved;
  }

  get timeRatio(): number {
    if (!this.mash || this.duration <= 0) return 0;
    return Math.max(0, Math.min(1, this.mash.mashTime / this.duration));
  }

  open(kind: ArgumentKind): void {
    this.kind = kind;
    this.mash = null;
    this.resolved = false;
  }

  startMash(options: MashOptions): MashState {
    this.duration = Math.max(0.1, options.duration);
    this.pushback = Math.max(0, options.pushbackPerSecond);
    this.mash = {
      mashActive: true,
      mashTime: this.duration,
      mashValue: options.startValue,
      mashTaps: 0,
      startValue: options.startValue,
      tauntIndex: 1,
    };
    return this.mash;
  }

  press(): MashState | null {
    if (!this.mash || !this.mash.mashActive) return null;
    this.mash.mashTaps += 1;
    this.mash.mashValue = Math.max(-1, Math.min(1, this.mash.mashValue + 0.06));
    return this.mash;
  }

  /** Возвращает true, когда время спора закончилось. */
  update(dt: number): boolean {
    if (!this.mash) return false;
    this.mash.mashTime -= dt;
    this.mash.mashValue = Math.max(
      -1,
      Math.min(1, this.mash.mashValue - dt * this.pushback),
    );
    if (this.mash.mashTime > 0) return false;
    this.mash.mashTime = 0;
    this.mash.mashActive = false;
    return true;
  }

  /** Забрать результат завершённого спора. */
  consumeFinished(): FinishedArgument | null {
    if (!this.mash || !this.kind || this.mash.mashTime > 0) return null;
    const result = { kind: this.kind, state: this.mash };
    this.mash = null;
    return result;
  }

  resolve(): void {
    this.resolved = true;
    this.mash = null;
  }

  clear(): void {
    this.kind = null;
    this.mash = null;
    this.resolved = false;
  }
}
