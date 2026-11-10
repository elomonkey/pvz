export const QUEST_REWARD = 250;

export interface ShiftEconomyInput {
  served: number;
  lost: number;
  questsCompleted: number;
  shiftFailed: boolean;
  stress: number;
}

export interface ShiftEconomyResult {
  baseSalary: number;
  questBonus: number;
  salary: number;
  stars: number;
  title: string;
  reputationBonus: number;
}

export interface UpgradeCostDefinition {
  max: number;
  costs: number[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function calculateBaseSalary(input: Pick<ShiftEconomyInput, 'served' | 'lost' | 'shiftFailed'>): number {
  if (!input.shiftFailed) return 2000;
  const total = Math.max(1, input.served + input.lost);
  return Math.round(700 + 300 * clamp(input.served / total, 0, 1));
}

export function calculateStars(input: Pick<ShiftEconomyInput, 'served' | 'lost' | 'stress' | 'shiftFailed'>): number {
  if (input.shiftFailed) return 0;
  const total = input.served + input.lost;
  const ratio = total > 0 ? input.served / total : 0;
  if (ratio >= 0.9 && input.stress < 55) return 3;
  if (ratio >= 0.7) return 2;
  return 1;
}

export function shiftTitle(shiftFailed: boolean, stars: number): string {
  if (shiftFailed) return 'Смена провалена';
  if (stars === 3) return 'Идеальная смена!';
  if (stars === 2) return 'Неплохая смена';
  return 'Смена выжила';
}

export function evaluateShift(input: ShiftEconomyInput): ShiftEconomyResult {
  const baseSalary = calculateBaseSalary(input);
  const questBonus = input.shiftFailed ? 0 : input.questsCompleted * QUEST_REWARD;
  const stars = calculateStars(input);
  return {
    baseSalary,
    questBonus,
    salary: baseSalary + questBonus,
    stars,
    title: shiftTitle(input.shiftFailed, stars),
    reputationBonus: !input.shiftFailed && input.lost === 0 && input.served > 0 ? 0.2 : 0,
  };
}

export function upgradeCost(
  definition: UpgradeCostDefinition,
  currentLevel: number,
): number | null {
  if (currentLevel >= definition.max) return null;
  return definition.costs[Math.min(currentLevel, definition.costs.length - 1)] ?? null;
}
