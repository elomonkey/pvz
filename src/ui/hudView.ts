import type { Sound } from '../sound';
import { byId, clear, createQuestRow, setProgressFill } from './components';
import './bossEntrance.css';

// Presentation for the existing Queen banners; titles, text and timing stay in Game.
const QUEEN_EXPRESSIONS = new Map<string, 'demanding' | 'annoyed' | 'satisfied'>([
  ['Королева примерочной', 'demanding'],
  ['Королева вернулась', 'demanding'],
  ['Королева вернулась с возвратом', 'annoyed'],
  ['Королева ушла', 'satisfied'],
]);

export interface HudData {
  shift: number;
  waveLabel: string;
  progress: number;
  money: number;
  served: number;
  lost: number;
}

export interface QuestDisplay {
  title: string;
  progress: string;
  completed: boolean;
  failed: boolean;
  reward: number;
}

export class HudView {
  private readonly shift = byId('hud-shift');
  private readonly wave = byId('hud-wave');
  private readonly money = byId('hud-money');
  private readonly served = byId('hud-served');
  private readonly lost = byId('hud-lost');
  private readonly reputation = byId('hud-rep');
  private readonly fittings = byId('hud-fittings');
  private readonly fittingsValue = byId('hud-fittings-value');
  private readonly progress = byId('hud-progress-fill');
  private readonly questPanel = byId('quest-panel');
  private readonly questList = byId('quest-list');
  private readonly queenStatus = byId('queen-status');
  private readonly queenRemaining = byId('queen-remaining');
  private readonly finalBossStatus = byId('final-boss-status');
  private readonly finalBossPhase = byId('final-boss-phase');
  private readonly finalBossProgress = byId('final-boss-progress');
  private readonly finalBossDebuff = byId('final-boss-debuff');
  private readonly stressCard = byId('stress-card');
  private readonly stressValue = byId('stress-value');
  private readonly stressFill = byId('stress-fill');
  private readonly stressStatus = byId('stress-status');
  private readonly stressToy = byId('stress-toy');
  private readonly buffChip = byId('debuff-chip');
  private readonly buffTime = byId('debuff-time');
  private readonly prompt = byId('prompt');
  private readonly orderChip = byId('order-chip');
  private readonly orderLabel = byId('order-label');
  private readonly orderValue = byId('order-value');
  private readonly toasts = byId('toasts');
  private readonly bannerEl = byId('banner');
  private readonly bannerTitle = byId('banner-title');
  private readonly bannerSub = byId('banner-sub');
  private readonly muteBtn = byId('btn-mute') as HTMLButtonElement;
  private bannerTimer: number | null = null;

  constructor() {
    for (const source of [
      new URL('../assets/sanya-portrait.webp', import.meta.url).href,
      new URL('../assets/queen-expressions.webp', import.meta.url).href,
    ]) {
      const portrait = new Image();
      portrait.src = source;
    }
  }

  bind(sound: Sound): void {
    this.muteBtn.addEventListener('click', () => {
      sound.init();
      const muted = sound.toggleMute();
      this.updateMute(muted);
      if (!muted) sound.click();
    });
    this.updateMute(sound.muted);
  }

  updateHud(data: HudData): void {
    this.shift.textContent = String(data.shift);
    this.wave.textContent = data.waveLabel;
    this.money.textContent = String(Math.round(data.money));
    this.served.textContent = String(data.served);
    this.lost.textContent = String(data.lost);
    setProgressFill(this.progress, data.progress);
  }

  setReputation(value: number): void {
    this.reputation.textContent = `${value.toFixed(1).replace('.', ',')}`;
  }

  setFittingRooms(occupied: number, total: number, active: boolean): void {
    this.fittings.classList.toggle('hidden', !active);
    this.fittingsValue.textContent = `${occupied}/${total}`;
    this.fittings.classList.toggle('busy', active && occupied >= total);
  }

  setQueenStatus(active: boolean, remaining: number): void {
    this.queenStatus.classList.toggle('hidden', !active);
    this.queenRemaining.textContent = String(Math.max(0, remaining));
    this.queenStatus.classList.toggle('danger', active && remaining <= 5);
  }

  setFinalBossStatus(active: boolean, phase: number, progress: string): void {
    this.finalBossStatus.classList.toggle('hidden', !active);
    if (!active) return;
    this.finalBossPhase.textContent = `${phase}/3`;
    this.finalBossProgress.textContent = progress ? ` · ${progress}` : '';
  }

  setFinalBossDebuff(active: boolean): void {
    this.finalBossDebuff.classList.toggle('hidden', !active);
  }

  setQuests(quests: QuestDisplay[], active = true): void {
    this.questPanel.classList.toggle('hidden', !active || quests.length === 0);
    if (!active || quests.length === 0) return;
    clear(this.questList);
    for (const quest of quests) {
      this.questList.appendChild(createQuestRow(quest));
    }
  }

  setToyRelief(used: number, cap = 30): void {
    this.stressToy.textContent = `🧸 антистресс: ${used.toFixed(1).replace('.', ',')} / ${cap}`;
  }

  updateStress(stress: number): void {
    const value = Number.isInteger(stress)
      ? String(stress)
      : stress.toFixed(1).replace('.', ',');
    this.stressValue.textContent = `${value}%`;
    setProgressFill(this.stressFill, stress / 100);
    this.stressCard.classList.toggle('high', stress >= 60);
    this.stressCard.classList.toggle('critical', stress >= 85);
    this.stressStatus.textContent =
      stress >= 100
        ? 'Заявление подписано'
        : stress >= 85
          ? 'На грани'
          : stress >= 60
            ? 'На взводе'
            : stress >= 30
              ? 'Раздражён'
              : 'Спокоен';
  }

  setBuff(seconds: number): void {
    if (seconds <= 0) {
      this.buffChip.classList.add('hidden');
      return;
    }
    this.buffChip.classList.remove('hidden');
    this.buffChip.classList.add('buff');
    this.buffTime.textContent = String(Math.ceil(seconds));
  }

  setPrompt(text: string): void {
    if (!text) {
      this.prompt.classList.add('hidden');
      return;
    }
    if (this.prompt.textContent !== text) this.prompt.textContent = text;
    this.prompt.classList.remove('hidden');
  }

  setOrderChip(label: string | null, value = '', state = ''): void {
    if (!label) {
      this.orderChip.classList.add('hidden');
      return;
    }
    this.orderChip.classList.remove('hidden');
    this.orderLabel.textContent = label;
    this.orderValue.textContent = value;
    this.orderChip.classList.toggle('carry', state === 'carry');
    this.orderChip.classList.toggle('search', state === 'search');
    this.orderChip.classList.toggle('return', state === 'return');
  }

  toast(text: string, type: 'info' | 'success' | 'error' | 'boss' = 'info'): void {
    const element = document.createElement('div');
    element.className = `toast ${type}`;
    element.textContent = text;
    this.toasts.appendChild(element);
    while (this.toasts.children.length > 4) {
      this.toasts.firstElementChild?.remove();
    }
    window.setTimeout(() => {
      element.classList.add('out');
      window.setTimeout(() => element.remove(), 280);
    }, 2600);
  }

  banner(title: string, sub = '', duration = 2.2): void {
    if (this.bannerTimer !== null) {
      window.clearTimeout(this.bannerTimer);
      this.bannerTimer = null;
    }
    this.bannerTitle.textContent = title;
    this.bannerSub.textContent = sub;
    const queenEmotion = QUEEN_EXPRESSIONS.get(title);
    const character = queenEmotion ? 'queen' : title === 'Курьер Саня' ? 'sanya' : null;
    this.bannerEl.classList.toggle('boss-entrance', character !== null);
    if (character) this.bannerEl.dataset.entranceCharacter = character;
    else delete this.bannerEl.dataset.entranceCharacter;
    if (queenEmotion) this.bannerEl.dataset.entranceEmotion = queenEmotion;
    else delete this.bannerEl.dataset.entranceEmotion;
    this.bannerEl.classList.remove('hidden');
    this.bannerEl.classList.remove('pop');
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('pop');
    this.bannerTimer = window.setTimeout(() => {
      this.bannerEl.classList.add('hidden');
      this.bannerTimer = null;
    }, duration * 1000);
  }

  private updateMute(muted: boolean): void {
    this.muteBtn.textContent = muted ? '🔇' : '🔊';
    this.muteBtn.classList.toggle('muted', muted);
  }
}
