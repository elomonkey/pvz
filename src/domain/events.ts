import type { QuestId } from './quests';

export type ServedKind = 'regular' | 'queen' | 'finalBoss';

/**
 * Уведомления между Game, квестами, звуком и UI.
 * Это не замена прямым вызовам правил: только события о том, что уже произошло.
 */
export interface GameEvents {
  clientServed: { clientId: number; kind: ServedKind };
  clientLost: { clientId: number; reason: 'patience' };
  orderScanned: { clientId: number; cellId: string };
  returnDeposited: { kind: 'queen' | 'finalBoss' };
  questCompleted: { questId: QuestId };
  argumentResolved: { kind: 'client' | 'boss'; won: boolean };
  bossDefeated: { kind: 'boss' | 'final' };
  shiftStarted: { shift: number };
  shiftEnded: {
    shift: number;
    money: number;
    served: number;
    lost: number;
    failed: boolean;
  };
}
