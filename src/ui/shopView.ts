import {
  DECOR_ITEMS,
  UPGRADES,
  type DecorOwnership,
  type UpgradeId,
} from '../data';
import type { Game } from '../game';
import type { Sound } from '../sound';
import { byId, clear, createOfferCard } from './components';

export type Upgrades = Record<UpgradeId, number>;

export interface CharacterStats {
  shift: number;
  totalServed: number;
  totalEarned: number;
  best: number;
  reputation: number;
}

export class ShopView {
  private readonly sound: Sound;
  private game: Game | null = null;
  private character: CharacterStats | null = null;

  private readonly shopMoney = byId('shop-money');
  private readonly shopMoneyDecor = byId('shop-money-decor');
  private readonly tabs = Array.from(
    document.querySelectorAll<HTMLButtonElement>('.shop-tab'),
  );
  private readonly upgradesPanel = byId('shop-upgrades-panel');
  private readonly decorPanel = byId('shop-decor-panel');
  private readonly upgradesGrid = byId('shop-grid');
  private readonly decorGrid = byId('decor-grid');

  private readonly charShift = byId('char-shift');
  private readonly charServed = byId('char-served');
  private readonly charEarned = byId('char-earned');
  private readonly charRep = byId('char-rep');
  private readonly charSpeed = byId('char-speed');
  private readonly charCharm = byId('char-charm');
  private readonly charTolerance = byId('char-tolerance');
  private readonly charToy = byId('char-toy');
  private readonly charTv = byId('char-tv');
  private readonly charScanner = byId('char-scanner');
  private readonly charBest = byId('char-best');

  constructor(sound: Sound) {
    this.sound = sound;
  }

  bind(game: Game): void {
    this.game = game;
    for (const tab of this.tabs) {
      tab.addEventListener('click', () => {
        this.setTab(tab.dataset.tab === 'decor' ? 'decor' : 'upgrades');
      });
    }
  }

  show(
    upgrades: Upgrades,
    money: number,
    ownedDecor: DecorOwnership,
    character: CharacterStats,
    scannerBroken = false,
  ): void {
    this.character = character;
    this.renderShop(upgrades, money, ownedDecor, scannerBroken);
    this.renderCharacterCard(upgrades, ownedDecor, scannerBroken);
    this.setTab('upgrades');
  }

  update(
    upgrades: Upgrades,
    money: number,
    ownedDecor: DecorOwnership,
    scannerBroken = false,
  ): void {
    this.renderShop(upgrades, money, ownedDecor, scannerBroken);
    this.renderCharacterCard(upgrades, ownedDecor, scannerBroken);
  }

  setTab(tab: 'upgrades' | 'decor'): void {
    const decor = tab === 'decor';
    this.upgradesPanel.classList.toggle('hidden', decor);
    this.decorPanel.classList.toggle('hidden', !decor);
    for (const button of this.tabs) {
      button.classList.toggle('active', (button.dataset.tab === 'decor') === decor);
    }
  }

  private renderCharacterCard(
    upgrades: Upgrades,
    ownedDecor: DecorOwnership,
    scannerBroken: boolean,
  ): void {
    if (!this.character) return;
    const character = this.character;
    this.charShift.textContent = String(character.shift);
    this.charServed.textContent = String(character.totalServed);
    this.charEarned.textContent = `${Math.round(character.totalEarned)} ₽`;
    this.charRep.textContent = `${character.reputation.toFixed(1).replace('.', ',')} / 5`;
    this.charSpeed.textContent = `+${upgrades.speed * 8}%`;
    this.charCharm.textContent = upgrades.charm > 0 ? `−${upgrades.charm * 5} к стрессу` : '—';
    this.charTolerance.textContent = upgrades.tolerance > 0 ? `−${upgrades.tolerance * 10}%` : '0%';
    this.charToy.textContent = `+${(0.2 + upgrades.toy * 0.1).toFixed(1).replace('.', ',')} за тап`;
    this.charTv.textContent = ownedDecor.tv ? 'куплен' : 'нет';
    this.charScanner.textContent = scannerBroken
      ? upgrades.scanner > 0
        ? 'заменён'
        : 'разбит'
      : 'исправен';
    this.charBest.textContent = `${Math.round(character.best)} ₽`;
  }

  private renderShop(
    upgrades: Upgrades,
    money: number,
    ownedDecor: DecorOwnership,
    scannerBroken: boolean,
  ): void {
    this.shopMoney.textContent = String(Math.round(money));
    this.shopMoneyDecor.textContent = String(Math.round(money));
    clear(this.upgradesGrid);
    clear(this.decorGrid);

    for (const definition of UPGRADES) {
      if (definition.id === 'scanner' && !scannerBroken) continue;
      const level = upgrades[definition.id] ?? 0;
      const maxed = level >= definition.max;
      const cost = definition.costs[Math.min(level, definition.costs.length - 1)];
      const affordable = !maxed && money >= cost;

      this.upgradesGrid.appendChild(
        createOfferCard({
          icon: definition.icon,
          name: definition.name,
          description: definition.desc,
          status:
            definition.id === 'scanner'
              ? maxed
                ? 'Заменён'
                : 'Разбит'
              : '●'.repeat(level) + '○'.repeat(definition.max - level),
          maxed,
          buttonTone: maxed || !affordable ? 'ghost' : 'gold',
          buttonDisabled: maxed || !affordable,
          buttonLabel: maxed
            ? definition.id === 'scanner'
              ? 'КУПЛЕНО'
              : 'МАКС'
            : `${cost} ₽`,
          onClick: () => {
            this.sound.init();
            this.game?.buyUpgrade(definition.id);
          },
        }),
      );
    }

    for (const definition of DECOR_ITEMS) {
      const owned = ownedDecor[definition.id];
      const affordable = !owned && money >= definition.cost;

      this.decorGrid.appendChild(
        createOfferCard({
          cardClass: 'decor-card',
          icon: definition.icon,
          name: definition.name,
          description: definition.desc,
          status: owned ? 'В ПВЗ' : definition.permanent ? 'Навсегда' : 'До конца забега',
          maxed: owned,
          buttonTone: owned || !affordable ? 'ghost' : 'gold',
          buttonDisabled: owned || !affordable,
          buttonLabel: owned ? 'КУПЛЕНО' : `${definition.cost} ₽`,
          onClick: () => {
            this.sound.init();
            this.game?.buyDecor(definition.id);
          },
        }),
      );
    }
  }
}
