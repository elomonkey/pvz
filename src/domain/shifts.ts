export type ShiftStep = { type: 'wave'; wave: number } | { type: 'boss' };
export type DayPhase = 1 | 2 | 3;

export interface WavePlan {
  count: number;
  patience: number;
  spawnDelay: number;
  spawnInterval: number;
  dayPhase: DayPhase;
}

export function getShiftSteps(shift: number): ShiftStep[] {
  if (shift === 5) {
    return [
      { type: 'wave', wave: 1 },
      { type: 'wave', wave: 2 },
      { type: 'boss' },
    ];
  }
  if (shift >= 4) {
    return [
      { type: 'wave', wave: 1 },
      { type: 'wave', wave: 2 },
      { type: 'wave', wave: 3 },
    ];
  }
  return [
    { type: 'wave', wave: 1 },
    { type: 'wave', wave: 2 },
    { type: 'boss' },
    { type: 'wave', wave: 3 },
  ];
}

export function getWavePlan(
  shift: number,
  wave: number,
  maxQueue: number,
): WavePlan {
  const baseCount = wave === 1 ? 2 : 3;
  const count = Math.min(maxQueue, baseCount + Math.min(2, Math.floor((shift - 1) / 2)));
  const basePatience = (wave === 3 ? 30 : 35) - (shift - 1) * 2;
  return {
    count,
    patience: Math.max(18, basePatience),
    spawnDelay: wave === 1 && shift === 1 ? 0.1 : 0.6,
    spawnInterval: wave === 3 ? 1.7 : 2.1,
    dayPhase: wave === 1 ? 1 : wave === 2 ? 2 : 3,
  };
}

export function areMultiOrdersEnabled(shift: number): boolean {
  return shift >= 4;
}

export function isFittingActive(shift: number): boolean {
  return shift >= 4;
}
