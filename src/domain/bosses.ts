export type BossKind = 'zina' | 'galya' | 'sanya' | 'final';

export function bossKindForShift(shift: number): BossKind {
  if (shift >= 5) return 'final';
  if (shift === 3) return 'sanya';
  if (shift === 2) return 'zina';
  return 'galya';
}
