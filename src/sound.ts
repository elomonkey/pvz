type Wave = OscillatorType;

export class Sound {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem('pvz_muted') === '1';
    } catch {
      this.muted = false;
    }
  }

  init(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AudioCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    this.ctx = new AudioCtor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);
    void this.ctx.resume();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    try {
      localStorage.setItem('pvz_muted', this.muted ? '1' : '0');
    } catch {
      /* noop */
    }
    return this.muted;
  }

  private tone(
    freq: number,
    duration: number,
    type: Wave = 'sine',
    gain = 0.06,
    slideTo?: number,
    delay = 0,
  ): void {
    if (this.muted || !this.ctx || !this.master) return;
    const now = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), now);
    if (slideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), now + duration);
    }
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(gain, now + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(env);
    env.connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  click(): void {
    this.tone(520, 0.06, 'square', 0.025);
  }

  scanStart(): void {
    this.tone(740, 0.08, 'square', 0.035);
    this.tone(980, 0.06, 'square', 0.025, undefined, 0.07);
  }

  scanSuccess(): void {
    this.tone(780, 0.09, 'sine', 0.06);
    this.tone(1180, 0.16, 'sine', 0.05, undefined, 0.09);
  }

  error(): void {
    this.tone(170, 0.18, 'sawtooth', 0.045, 120);
  }

  pickup(): void {
    this.tone(420, 0.08, 'triangle', 0.05, 620);
  }

  deliver(): void {
    this.tone(660, 0.09, 'sine', 0.06);
    this.tone(880, 0.09, 'sine', 0.06, undefined, 0.08);
    this.tone(1320, 0.14, 'sine', 0.045, undefined, 0.16);
  }

  cash(): void {
    this.tone(980, 0.06, 'square', 0.03);
    this.tone(1240, 0.1, 'square', 0.028, undefined, 0.06);
  }

  shout(): void {
    this.tone(210, 0.22, 'sawtooth', 0.04, 145);
    this.tone(260, 0.18, 'square', 0.022, 180, 0.04);
  }

  boss(): void {
    this.tone(110, 0.5, 'sawtooth', 0.05, 82);
    this.tone(165, 0.5, 'triangle', 0.035, 110, 0.08);
    this.tone(220, 0.4, 'sine', 0.025, 160, 0.16);
  }

  win(): void {
    this.tone(523, 0.1, 'sine', 0.06);
    this.tone(659, 0.1, 'sine', 0.06, undefined, 0.1);
    this.tone(784, 0.18, 'sine', 0.06, undefined, 0.2);
  }

  lose(): void {
    this.tone(330, 0.18, 'triangle', 0.05, 220);
    this.tone(220, 0.32, 'triangle', 0.05, 140, 0.16);
  }

  toy(): void {
    this.tone(520, 0.07, 'triangle', 0.04, 760);
    this.tone(900, 0.09, 'sine', 0.03, 600, 0.05);
  }

  coffee(): void {
    this.tone(600, 0.08, 'sine', 0.035, 900);
    this.tone(300, 0.18, 'triangle', 0.03, 500, 0.08);
  }

  meow(): void {
    this.tone(620, 0.14, 'triangle', 0.05, 920);
    this.tone(900, 0.2, 'triangle', 0.04, 540, 0.12);
  }

  gameOver(): void {
    this.tone(260, 0.3, 'sawtooth', 0.045, 180);
    this.tone(180, 0.4, 'sawtooth', 0.04, 90, 0.25);
    this.tone(120, 0.6, 'sine', 0.05, 60, 0.5);
  }
}
