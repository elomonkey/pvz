export const CLIENT_ARGUE_CHANCE = 0.1;
export const CLIENT_ARGUE_MASH_TIME = 6;
export const CLIENT_ARGUE_WIN_THRESHOLD = 0.03;

export function calculateServeStress(charmLevel: number): number {
  return Math.max(10, 30 - 5 * charmLevel);
}

export function calculateExpectedServeStress(
  charmLevel: number,
  toleranceLevel: number,
): number {
  return Math.round(calculateServeStress(charmLevel) * (1 - 0.1 * toleranceLevel));
}

export function calculateConcedeStress(charmLevel: number): number {
  return Math.max(2, 6 - charmLevel);
}

export function calculateArgueStartValue(charmLevel: number): number {
  return Math.min(0.2, 0.04 * charmLevel);
}

export function rollsClientArgument(shift: number, random: () => number = Math.random): boolean {
  return shift >= 2 && random() < CLIENT_ARGUE_CHANCE;
}
