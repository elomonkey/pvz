import type { UpgradeId } from '../data';
import type { UpgradeLevels } from './run';

export type ProgressStage = 'shift' | 'results';

export const PROGRESS_VERSION = 1;
const MAX_SHIFT = 5;
const UPGRADE_IDS: readonly UpgradeId[] = [
  'speed',
  'charm',
  'tolerance',
  'toy',
  'scanner',
];

export interface ProgressSnapshot {
  version: 1;
  stage: ProgressStage;
  shift: number;
  money: number;
  totalServed: number;
  totalEarned: number;
  reputation: number;
  upgrades: UpgradeLevels;
  scannerBroken: boolean;
  decor: string[];
  savedAt: number;
}

export interface ProgressSnapshotInput {
  stage: ProgressStage;
  shift: number;
  money: number;
  totalServed: number;
  totalEarned: number;
  reputation: number;
  upgrades: UpgradeLevels;
  scannerBroken: boolean;
  decor: readonly string[];
}

function finite(value: unknown, fallback = 0): number {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nonNegative(value: unknown): number {
  return Math.max(0, finite(value));
}

function nonNegativeInt(value: unknown): number {
  return Math.floor(nonNegative(value));
}

function validShift(value: unknown): number {
  const shift = nonNegativeInt(value);
  return shift >= 1 && shift <= MAX_SHIFT ? shift : 0;
}

function normalizeReputation(value: unknown): number {
  return Math.min(5, nonNegative(value));
}

function normalizeUpgrades(value: unknown): UpgradeLevels {
  const raw =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  const result = {} as UpgradeLevels;
  for (const id of UPGRADE_IDS) result[id] = nonNegativeInt(raw[id]);
  return result;
}

function normalizeDecor(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.filter((item): item is string => typeof item === 'string')),
  );
}

export function createProgressSnapshot(
  input: ProgressSnapshotInput,
  savedAt = Date.now(),
): ProgressSnapshot {
  return {
    version: PROGRESS_VERSION,
    stage: input.stage === 'results' ? 'results' : 'shift',
    shift: Math.min(MAX_SHIFT, Math.max(1, nonNegativeInt(input.shift) || 1)),
    money: nonNegative(input.money),
    totalServed: nonNegativeInt(input.totalServed),
    totalEarned: nonNegative(input.totalEarned),
    reputation: normalizeReputation(input.reputation),
    upgrades: normalizeUpgrades(input.upgrades),
    scannerBroken: input.scannerBroken === true,
    decor: normalizeDecor(input.decor),
    savedAt: nonNegativeInt(savedAt),
  };
}

export function parseProgressSnapshot(value: unknown): ProgressSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (raw.version !== PROGRESS_VERSION) return null;
  if (raw.stage !== 'shift' && raw.stage !== 'results') return null;
  const shift = validShift(raw.shift);
  if (shift === 0) return null;

  return createProgressSnapshot(
    {
      stage: raw.stage,
      shift,
      money: raw.money as number,
      totalServed: raw.totalServed as number,
      totalEarned: raw.totalEarned as number,
      reputation: raw.reputation as number,
      upgrades: raw.upgrades as UpgradeLevels,
      scannerBroken: raw.scannerBroken as boolean,
      decor: raw.decor as string[],
    },
    finite(raw.savedAt, 0),
  );
}

/** Shift that should be started when the player continues, or null at the end. */
export function progressResumeShift(snapshot: ProgressSnapshot): number | null {
  if (snapshot.stage === 'shift') return snapshot.shift;
  const next = snapshot.shift + 1;
  return next <= MAX_SHIFT ? next : null;
}
