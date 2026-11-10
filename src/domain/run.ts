import type { UpgradeId } from '../data';

export type UpgradeLevels = Record<UpgradeId, number>;

export function createUpgradeLevels(): UpgradeLevels {
  return { speed: 0, charm: 0, tolerance: 0, toy: 0, scanner: 0 };
}

/**
 * Состояние забега: деньги, статистика смены, стресс и улучшения.
 * Не знает о Three.js, DOM и конкретных экранах.
 */
export class RunState {
  shift = 1;
  money = 0;
  served = 0;
  lost = 0;
  totalServed = 0;
  totalEarned = 0;
  reputation = 3;
  stress = 0;
  combo = 0;
  shiftEarnings = 0;
  toySquish = 0;
  toyReliefUsed = 0;
  buffTimer = 0;
  upgrades = createUpgradeLevels();

  reset(): void {
    this.shift = 1;
    this.money = 0;
    this.served = 0;
    this.lost = 0;
    this.totalServed = 0;
    this.totalEarned = 0;
    this.reputation = 3;
    this.stress = 0;
    this.combo = 0;
    this.shiftEarnings = 0;
    this.toySquish = 0;
    this.toyReliefUsed = 0;
    this.buffTimer = 0;
    this.upgrades = createUpgradeLevels();
  }

  beginShift(shift: number): void {
    this.shift = shift;
    this.served = 0;
    this.lost = 0;
    this.combo = 0;
    this.shiftEarnings = 0;
    this.stress = 0;
    this.toySquish = 0;
    this.toyReliefUsed = 0;
    this.buffTimer = 0;
  }
}
