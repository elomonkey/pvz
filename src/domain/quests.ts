export type QuestId =
  | 'no_lost'
  | 'stress_30'
  | 'streak_3'
  | 'no_highlight_2'
  | 'return_1'
  | 'return_2'
  | 'boss';

export interface QuestDefinition {
  id: QuestId;
  title: string;
  target: number;
}

export interface ShiftQuest extends QuestDefinition {
  progress: number;
  completed: boolean;
  failed: boolean;
}

const BASE_QUESTS: QuestDefinition[] = [
  { id: 'no_lost', title: 'Без ушедших клиентов', target: 1 },
  { id: 'stress_30', title: 'Стресс ниже 30% в конце', target: 1 },
  { id: 'streak_3', title: '3 выдачи без ошибок', target: 3 },
];

function makeQuest(definition: QuestDefinition): ShiftQuest {
  return {
    ...definition,
    progress: 0,
    completed: false,
    failed: false,
  };
}

export function buildQuestPool(shift: number, scannerWorks: boolean): ShiftQuest[] {
  const pool = BASE_QUESTS.map(makeQuest);
  if (shift >= 2 && !scannerWorks) {
    pool.push(makeQuest({ id: 'no_highlight_2', title: '2 посылки без подсветки', target: 2 }));
  }
  if (shift === 4) {
    pool.push(makeQuest({ id: 'return_1', title: 'Сдать 1 возврат', target: 1 }));
  }
  if (shift >= 5) {
    pool.push(makeQuest({ id: 'return_2', title: 'Сдать 2 возврата', target: 2 }));
  }
  if ([1, 2, 3, 5].includes(shift)) {
    pool.push(makeQuest({ id: 'boss', title: 'Победить босса', target: 1 }));
  }
  return pool;
}

export function selectQuests(
  pool: ShiftQuest[],
  count: number,
  random: () => number = Math.random,
): ShiftQuest[] {
  const remaining = [...pool];
  const selected: ShiftQuest[] = [];
  while (selected.length < count && remaining.length > 0) {
    const index = Math.floor(random() * remaining.length);
    selected.push(remaining.splice(index, 1)[0]);
  }
  return selected;
}

/**
 * Доменный журнал квестов смены: без Three.js, DOM и Game.
 * Хранит прогресс и умеет применять события смены.
 */
export class QuestLog {
  private entries: ShiftQuest[] = [];
  private serveStreak = 0;
  private unhighlightedCount = 0;
  private returnsCount = 0;

  get items(): readonly ShiftQuest[] {
    return this.entries;
  }

  get active(): boolean {
    return this.entries.length > 0;
  }

  get completedCount(): number {
    return this.entries.filter((quest) => quest.completed).length;
  }

  getQuest(id: QuestId): ShiftQuest | undefined {
    return this.entries.find((quest) => quest.id === id);
  }

  clear(): void {
    this.entries = [];
    this.serveStreak = 0;
    this.unhighlightedCount = 0;
    this.returnsCount = 0;
  }

  generate(shift: number, scannerWorks: boolean, random: () => number = Math.random): void {
    this.entries = selectQuests(buildQuestPool(shift, scannerWorks), 2, random);
    this.serveStreak = 0;
    this.unhighlightedCount = 0;
    this.returnsCount = 0;
  }

  onClientLost(): void {
    this.fail('no_lost');
    this.resetStreak();
  }

  onDelivery(): void {
    this.serveStreak += 1;
    const quest = this.getQuest('streak_3');
    if (!quest || quest.completed) return;
    quest.progress = Math.min(quest.target, this.serveStreak);
    if (quest.progress >= quest.target) this.complete('streak_3');
  }

  onParcelFound(highlightEnabled: boolean): void {
    if (highlightEnabled) return;
    const quest = this.getQuest('no_highlight_2');
    if (!quest || quest.completed) return;
    this.unhighlightedCount += 1;
    quest.progress = Math.min(quest.target, this.unhighlightedCount);
    if (quest.progress >= quest.target) this.complete('no_highlight_2');
  }

  onReturnDeposited(): void {
    this.returnsCount += 1;
    const quest = this.entries.find(
      (value) => value.id === 'return_1' || value.id === 'return_2',
    );
    if (!quest || quest.completed) return;
    quest.progress = Math.min(quest.target, this.returnsCount);
    if (quest.progress >= quest.target) this.complete(quest.id);
  }

  onBossDefeated(): void {
    this.complete('boss');
  }

  resetStreak(): void {
    this.serveStreak = 0;
    const quest = this.getQuest('streak_3');
    if (!quest || quest.completed) return;
    quest.progress = 0;
  }

  finalize(lost: number, stress: number): void {
    const noLost = this.getQuest('no_lost');
    if (noLost && !noLost.completed) {
      if (lost === 0) this.complete('no_lost');
      else this.fail('no_lost');
    }
    const stressQuest = this.getQuest('stress_30');
    if (stressQuest && !stressQuest.completed) {
      if (stress < 30) this.complete('stress_30');
      else this.fail('stress_30');
    }
    for (const quest of this.entries) {
      if (!quest.completed) quest.failed = true;
    }
  }

  private complete(id: QuestId): void {
    const quest = this.getQuest(id);
    if (!quest || quest.completed) return;
    quest.completed = true;
    quest.failed = false;
    quest.progress = quest.target;
  }

  private fail(id: QuestId): void {
    const quest = this.getQuest(id);
    if (!quest || quest.completed) return;
    quest.failed = true;
  }
}
