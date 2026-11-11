type Emotion = 'stern' | 'angry' | 'surprised';
type Mode = 'choice' | 'argue' | 'result' | 'final';

// View-only profiles: new bosses can add an atlas without changing encounter rules.
const PROFILES = {
  galya: {
    atlas: new URL('../assets/galya-expressions.webp', import.meta.url).href,
    frames: { stern: '0%', angry: '50%', surprised: '100%' },
  },
} as const;

/** Stages the existing BossView DOM; never owns dialogue text or game callbacks. */
export class BossDialogueScene {
  private profile: keyof typeof PROFILES | null = null;
  private emotion: Emotion | null = null;
  private previousFocus: HTMLElement | null = null;
  private readonly motion = matchMedia('(prefers-reduced-motion: reduce)');
  private readonly portrait: HTMLElement;
  private readonly card: HTMLElement;
  private readonly effect: HTMLElement;
  private animations: Animation[] = [];

  constructor(private readonly modal: HTMLElement) {
    this.portrait = modal.querySelector('.dialogue-portrait-art')!;
    this.card = modal.querySelector('.boss-modal')!;
    this.effect = modal.querySelector('.dialogue-impact')!;
    // One shared atlas; start loading before the first dramatic entrance.
    const preload = new Image();
    preload.src = PROFILES.galya.atlas;
    modal.addEventListener('keydown', (event) => {
      if (!this.active || event.key !== 'Tab') return;
      const controls = this.controls();
      const index = controls.indexOf(document.activeElement as HTMLElement);
      if (
        controls.length &&
        (index < 0 || (!event.shiftKey && index === controls.length - 1) || (event.shiftKey && index === 0))
      ) {
        event.preventDefault();
        controls[event.shiftKey ? controls.length - 1 : 0].focus({ preventScroll: true });
      }
    });
    this.motion.addEventListener('change', () => {
      if (this.motion.matches) this.cancelAnimations();
    });
  }

  get active(): boolean {
    return this.profile !== null;
  }

  open(profile: keyof typeof PROFILES, mode: Mode, emotion: Emotion): void {
    if (!this.active) this.previousFocus = document.activeElement as HTMLElement;
    this.profile = profile;
    this.modal.classList.add('dialogue-scene');
    document.body.classList.add('in-boss-dialogue');
    this.modal.dataset.portraitCharacter = profile;
    this.portrait.style.backgroundImage = `url("${PROFILES[profile].atlas}")`;
    this.setMode(mode);
    this.setEmotion(emotion, false);
    this.focusControl();
  }

  setMode(mode: Mode): void {
    if (!this.active) return;
    this.modal.dataset.dialogueMode = mode;
    this.modal.setAttribute('aria-describedby', mode === 'final' ? 'final-boss-dialogue' : 'boss-quote');
    this.focusControl();
  }

  setEmotion(emotion: Emotion, pulse = true): void {
    if (!this.profile || this.emotion === emotion) return;
    this.emotion = emotion;
    this.modal.dataset.emotion = emotion;
    this.portrait.style.backgroundPosition = `${PROFILES[this.profile].frames[emotion]} 50%`;
    if (pulse) this.pulse();
  }

  reactToAdvantage(value: number): void {
    if (!this.active || this.modal.dataset.dialogueMode !== 'argue') return;
    // Hysteresis avoids expression flicker around a single threshold during pushback.
    const surprised = value > (this.emotion === 'surprised' ? 0.35 : 0.55);
    this.setEmotion(surprised ? 'surprised' : 'angry');
  }

  pulse(): void {
    if (!this.active || this.motion.matches) return;
    this.cancelAnimations();
    this.animations = [
      this.card.animate(
        [
          { transform: 'translateX(0)' },
          { transform: 'translateX(-3px)', offset: 0.28 },
          { transform: 'translateX(2px)', offset: 0.55 },
          { transform: 'translateX(0)' },
        ],
        { duration: 210, easing: 'ease-out' },
      ),
      this.effect.animate(
        [
          { opacity: 0, transform: 'scale(.7) rotate(-10deg)' },
          { opacity: 1, offset: 0.25 },
          { opacity: 0, transform: 'scale(1.12) rotate(0)' },
        ],
        { duration: 340 },
      ),
    ];
  }

  focusControl(): void {
    if (this.active) this.controls()[0]?.focus({ preventScroll: true });
  }

  close(): void {
    const wasActive = this.active;
    this.cancelAnimations();
    this.profile = null;
    this.emotion = null;
    this.modal.classList.remove('dialogue-scene');
    document.body.classList.remove('in-boss-dialogue');
    delete this.modal.dataset.portraitCharacter;
    delete this.modal.dataset.dialogueMode;
    delete this.modal.dataset.emotion;
    this.modal.setAttribute('aria-describedby', 'boss-quote');
    if (wasActive) {
      if (this.modal.contains(document.activeElement)) (document.activeElement as HTMLElement)?.blur();
      if (
        this.previousFocus?.isConnected &&
        this.previousFocus !== document.body &&
        this.previousFocus.getClientRects().length
      ) {
        this.previousFocus.focus({ preventScroll: true });
      }
    }
    this.previousFocus = null;
  }

  private controls(): HTMLElement[] {
    return [...this.modal.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"]')].filter(
      (button) => button.getClientRects().length > 0,
    );
  }

  private cancelAnimations(): void {
    for (const animation of this.animations) animation.cancel();
    this.animations = [];
  }
}
