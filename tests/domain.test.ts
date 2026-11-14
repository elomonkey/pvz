import test from 'node:test';
import assert from 'node:assert/strict';

import {
  QUEST_REWARD,
  calculateBaseSalary,
  calculateStars,
  evaluateShift,
  shiftTitle,
  upgradeCost,
} from '../src/domain/economy.ts';
import {
  ShiftProgression,
  shelfCountForShift,
} from '../src/domain/progression.ts';
import { RunState } from '../src/domain/run.ts';
import {
  PROGRESS_VERSION,
  createProgressSnapshot,
  parseProgressSnapshot,
  progressResumeShift,
} from '../src/domain/save.ts';
import {
  CLIENT_ARGUE_CHANCE,
  calculateArgueStartValue,
  calculateConcedeStress,
  calculateExpectedServeStress,
  calculateServeStress,
  rollsClientArgument,
} from '../src/domain/arguments.ts';
import {
  areMultiOrdersEnabled,
  getShiftSteps,
  getWavePlan,
  isFittingActive,
} from '../src/domain/shifts.ts';
import {
  QuestLog,
  buildQuestPool,
  selectQuests,
} from '../src/domain/quests.ts';
import {
  createOrderRecord,
  currentOrderItem,
  targetOrderItem,
  type OrderItem,
} from '../src/domain/orders.ts';
import { UPGRADE_IDS, UPGRADE_MAX, UPGRADES } from '../src/data.ts';

test('экономика: идеальная смена', () => {
  const result = evaluateShift({
    served: 8,
    lost: 0,
    questsCompleted: 2,
    shiftFailed: false,
    stress: 40,
  });

  assert.equal(result.baseSalary, 2000);
  assert.equal(result.questBonus, 2 * QUEST_REWARD);
  assert.equal(result.salary, 2500);
  assert.equal(result.stars, 3);
  assert.equal(result.title, 'Идеальная смена!');
  assert.equal(result.reputationBonus, 0.2);
});

test('экономика: проваленная смена', () => {
  const result = evaluateShift({
    served: 1,
    lost: 3,
    questsCompleted: 2,
    shiftFailed: true,
    stress: 20,
  });

  assert.equal(result.baseSalary, 775);
  assert.equal(result.questBonus, 0);
  assert.equal(result.salary, 775);
  assert.equal(result.stars, 0);
  assert.equal(result.title, 'Смена провалена');
  assert.equal(result.reputationBonus, 0);
});

test('экономика: звёзды и зарплата без провала', () => {
  assert.equal(calculateBaseSalary({ served: 3, lost: 1, shiftFailed: false }), 2000);
  assert.equal(calculateStars({ served: 3, lost: 1, stress: 60, shiftFailed: false }), 2);
  assert.equal(calculateStars({ served: 3, lost: 1, stress: 30, shiftFailed: false }), 2);
  assert.equal(shiftTitle(false, 2), 'Неплохая смена');
  assert.equal(shiftTitle(false, 1), 'Смена выжила');
});

test('экономика: стоимость улучшений', () => {
  const definition = { max: 2, costs: [850, 1350] };
  assert.equal(upgradeCost(definition, 0), 850);
  assert.equal(upgradeCost(definition, 1), 1350);
  assert.equal(upgradeCost(definition, 2), null);
});

test('улучшения: магазин и сохранение используют один источник максимумов', () => {
  assert.deepEqual([...UPGRADE_IDS], Object.keys(UPGRADE_MAX));
  for (const definition of UPGRADES) {
    assert.equal(definition.max, UPGRADE_MAX[definition.id]);
    assert.equal(definition.costs.length, definition.max);
  }
});

test('споры: формулы стресса и шанс старта', () => {
  assert.equal(calculateServeStress(0), 30);
  assert.equal(calculateServeStress(3), 15);
  assert.equal(calculateServeStress(5), 10);
  assert.equal(calculateExpectedServeStress(5, 3), 7);
  assert.equal(calculateConcedeStress(0), 6);
  assert.equal(calculateConcedeStress(4), 2);
  assert.equal(calculateArgueStartValue(0), 0);
  assert.equal(calculateArgueStartValue(2), 0.08);
  assert.equal(calculateArgueStartValue(9), 0.2);
  assert.equal(CLIENT_ARGUE_CHANCE, 0.1);
  assert.equal(rollsClientArgument(1, () => 0), false);
  assert.equal(rollsClientArgument(2, () => 0.05), true);
  assert.equal(rollsClientArgument(2, () => 0.5), false);
});

test('смены: последовательность шагов', () => {
  assert.deepEqual(getShiftSteps(1), [
    { type: 'wave', wave: 1 },
    { type: 'wave', wave: 2 },
    { type: 'boss' },
    { type: 'wave', wave: 3 },
  ]);
  assert.deepEqual(getShiftSteps(4), [
    { type: 'wave', wave: 1 },
    { type: 'wave', wave: 2 },
    { type: 'wave', wave: 3 },
  ]);
  assert.deepEqual(getShiftSteps(5), [
    { type: 'wave', wave: 1 },
    { type: 'wave', wave: 2 },
    { type: 'boss' },
  ]);
  assert.equal(areMultiOrdersEnabled(3), false);
  assert.equal(areMultiOrdersEnabled(4), true);
  assert.equal(isFittingActive(3), false);
  assert.equal(isFittingActive(4), true);
});

test('смены: параметры волн', () => {
  assert.deepEqual(getWavePlan(1, 1, 4), {
    count: 2,
    patience: 35,
    spawnDelay: 0.1,
    spawnInterval: 2.1,
    dayPhase: 1,
  });
  assert.deepEqual(getWavePlan(5, 3, 4), {
    count: 4,
    patience: 22,
    spawnDelay: 0.6,
    spawnInterval: 1.7,
    dayPhase: 3,
  });
  assert.deepEqual(getWavePlan(3, 2, 3), {
    count: 3,
    patience: 31,
    spawnDelay: 0.6,
    spawnInterval: 2.1,
    dayPhase: 2,
  });
});

test('квесты: доступность по сменам и сканеру', () => {
  assert.deepEqual(
    buildQuestPool(1, true).map((quest) => quest.id),
    ['no_lost', 'stress_30', 'streak_3', 'boss'],
  );
  assert.deepEqual(
    buildQuestPool(2, false).map((quest) => quest.id),
    ['no_lost', 'stress_30', 'streak_3', 'no_highlight_2', 'boss'],
  );
  assert.deepEqual(
    buildQuestPool(4, true).map((quest) => quest.id),
    ['no_lost', 'stress_30', 'streak_3', 'return_1'],
  );
  assert.deepEqual(
    buildQuestPool(5, true).map((quest) => quest.id),
    ['no_lost', 'stress_30', 'streak_3', 'return_2', 'boss'],
  );
});

test('квесты: выбор без дублей', () => {
  const pool = buildQuestPool(1, true);
  const selected = selectQuests(pool, 2, () => 0);
  assert.equal(selected.length, 2);
  assert.notEqual(selected[0].id, selected[1].id);
  assert.equal(pool.length, 4);
});

test('квесты: серия выдач и потеря клиента', () => {
  const log = new QuestLog();
  let picks = 0;
  log.generate(1, true, () => (picks++ === 0 ? 0.6 : 0));
  assert.equal(log.items.length, 2);

  const streak = log.getQuest('streak_3');
  assert.ok(streak);
  log.onDelivery();
  log.onDelivery();
  assert.equal(streak?.completed, false);
  log.onDelivery();
  assert.equal(streak?.completed, true);
  assert.equal(log.completedCount, 1);

  const noLost = log.getQuest('no_lost');
  log.onClientLost();
  assert.equal(noLost?.failed, true);
});

test('квесты: поиск без подсветки и возвраты', () => {
  const noHighlight = new QuestLog();
  noHighlight.generate(2, false, () => 0.7);
  noHighlight.onParcelFound(false);
  noHighlight.onParcelFound(true);
  assert.equal(noHighlight.getQuest('no_highlight_2')?.progress, 1);
  noHighlight.onParcelFound(false);
  assert.equal(noHighlight.getQuest('no_highlight_2')?.completed, true);

  const returns = new QuestLog();
  returns.generate(4, true, () => 0.95);
  returns.onReturnDeposited();
  assert.equal(returns.getQuest('return_1')?.completed, true);
});

test('квесты: финализация и босс', () => {
  const success = new QuestLog();
  success.generate(1, true, () => 0);
  success.finalize(0, 20);
  assert.equal(success.getQuest('no_lost')?.completed, true);
  assert.equal(success.getQuest('stress_30')?.completed, true);

  const failure = new QuestLog();
  failure.generate(1, true, () => 0);
  failure.finalize(2, 60);
  assert.equal(failure.getQuest('no_lost')?.failed, true);
  assert.equal(failure.getQuest('stress_30')?.failed, true);

  const boss = new QuestLog();
  boss.generate(1, true, () => 0.95);
  boss.onBossDefeated();
  assert.equal(boss.getQuest('boss')?.completed, true);
});

test('прогрессия: стеллажи и размер заказа', () => {
  assert.equal(shelfCountForShift(1, [1, 1, 2]), 2);
  assert.equal(shelfCountForShift(2, [1, 1, 2]), 3);

  const progression = new ShiftProgression();
  progression.begin(1, [1, 1, 2], false);
  assert.equal(progression.activeShelfCount, 2);
  assert.equal(progression.multiOrdersEnabled, false);
  assert.equal(progression.orderSize(1, () => 0.4), 1);

  progression.begin(2, [1, 1, 2], true);
  assert.equal(progression.activeShelfCount, 3);
  assert.equal(progression.multiOrdersEnabled, true);
  assert.equal(progression.orderSize(3, () => 0), 2);
  assert.equal(progression.orderSize(3, () => 0.99), 3);
  assert.equal(progression.orderSize(4, () => 0.54), 2);
  assert.equal(progression.orderSize(4, () => 0.56), 1);

  progression.setMultiOrders(false);
  assert.equal(progression.orderSize(4, () => 0), 1);
});

test('забег: стартовые значения и независимые улучшения', () => {
  const run = new RunState();
  const other = new RunState();

  assert.equal(run.shift, 1);
  assert.equal(run.money, 0);
  assert.equal(run.reputation, 3);
  assert.deepEqual(run.upgrades, {
    speed: 0,
    charm: 0,
    tolerance: 0,
    toy: 0,
    scanner: 0,
  });

  run.upgrades.speed = 2;
  assert.equal(other.upgrades.speed, 0);
});

test('забег: reset возвращает к стартовым значениям', () => {
  const run = new RunState();
  run.shift = 4;
  run.money = 1234;
  run.totalServed = 12;
  run.totalEarned = 5000;
  run.reputation = 4.5;
  run.stress = 70;
  run.upgrades.scanner = 1;

  run.reset();

  assert.equal(run.shift, 1);
  assert.equal(run.money, 0);
  assert.equal(run.totalServed, 0);
  assert.equal(run.totalEarned, 0);
  assert.equal(run.reputation, 3);
  assert.equal(run.stress, 0);
  assert.equal(run.upgrades.scanner, 0);
});

test('забег: beginShift сбрасывает смену и сохраняет прогресс', () => {
  const run = new RunState();
  run.money = 500;
  run.totalServed = 4;
  run.totalEarned = 2500;
  run.reputation = 4;
  run.upgrades.speed = 2;
  run.served = 3;
  run.lost = 1;
  run.combo = 2;
  run.stress = 45;
  run.shiftEarnings = 800;
  run.toySquish = 3;
  run.toyReliefUsed = 1.5;
  run.buffTimer = 8;

  run.beginShift(3);

  assert.equal(run.shift, 3);
  assert.equal(run.served, 0);
  assert.equal(run.lost, 0);
  assert.equal(run.combo, 0);
  assert.equal(run.stress, 0);
  assert.equal(run.shiftEarnings, 0);
  assert.equal(run.toySquish, 0);
  assert.equal(run.toyReliefUsed, 0);
  assert.equal(run.buffTimer, 0);
  assert.equal(run.money, 500);
  assert.equal(run.totalServed, 4);
  assert.equal(run.totalEarned, 2500);
  assert.equal(run.reputation, 4);
  assert.equal(run.upgrades.speed, 2);
});

test('progress save: shift и results корректно продолжают смену', () => {
  const input = {
    money: 1234,
    totalServed: 10,
    totalEarned: 5600,
    reputation: 4.2,
    upgrades: { speed: 2, charm: 1, tolerance: 3, toy: 1, scanner: 1 },
    scannerBroken: true,
    decor: ['cat-clock', 'cat-clock', 'rug'],
  };
  const shift = createProgressSnapshot(
    { ...input, stage: 'shift', shift: 2 },
    111,
  );
  assert.equal(shift.version, PROGRESS_VERSION);
  assert.equal(shift.stage, 'shift');
  assert.deepEqual(shift.decor, ['cat-clock', 'rug']);
  assert.equal(progressResumeShift(shift), 2);

  const parsed = parseProgressSnapshot(JSON.parse(JSON.stringify(shift)));
  assert.deepEqual(parsed, shift);

  const results = createProgressSnapshot(
    { ...input, stage: 'results', shift: 4 },
    222,
  );
  assert.equal(progressResumeShift(results), 5);

  const final = createProgressSnapshot(
    { ...input, stage: 'results', shift: 5 },
    333,
  );
  assert.equal(progressResumeShift(final), null);
});

test('progress save: невалидные данные отклоняются, поля нормализуются', () => {
  assert.equal(parseProgressSnapshot(null), null);
  assert.equal(parseProgressSnapshot({ version: 2, stage: 'shift', shift: 1 }), null);
  assert.equal(parseProgressSnapshot({ version: 1, stage: 'other', shift: 1 }), null);
  assert.equal(parseProgressSnapshot({ version: 1, stage: 'shift', shift: 0 }), null);
  assert.equal(parseProgressSnapshot({ version: 1, stage: 'shift', shift: 6 }), null);

  const sanitized = parseProgressSnapshot({
    version: 1,
    stage: 'shift',
    shift: 3,
    money: -50,
    totalServed: Number.NaN,
    totalEarned: '120',
    reputation: 99,
    upgrades: { speed: -1, charm: '3', tolerance: 11, toy: Number.POSITIVE_INFINITY, scanner: 4 },
    scannerBroken: 1,
    decor: ['x', 2, 'x'],
    savedAt: -1,
  });
  assert.ok(sanitized);
  assert.equal(sanitized.money, 0);
  assert.equal(sanitized.totalServed, 0);
  assert.equal(sanitized.totalEarned, 120);
  assert.equal(sanitized.reputation, 5);
  assert.deepEqual(sanitized.upgrades, {
    speed: 0,
    charm: 3,
    tolerance: 3,
    toy: 0,
    scanner: 1,
  });
  assert.equal(sanitized.scannerBroken, false);
  assert.deepEqual(sanitized.decor, ['x']);
  assert.equal(sanitized.savedAt, 0);
});

test('progress save: upgrades ограничиваются максимумами и при чтении, и при записи', () => {
  const parsed = parseProgressSnapshot({
    version: 1,
    stage: 'shift',
    shift: 2,
    money: 100,
    totalServed: 1,
    totalEarned: 250,
    reputation: 3,
    upgrades: {
      speed: Number.NaN,
      charm: 99,
      tolerance: Number.NEGATIVE_INFINITY,
      toy: '7',
      scanner: 2,
    },
    scannerBroken: false,
    decor: [],
    savedAt: 0,
  });
  assert.ok(parsed);
  assert.deepEqual(parsed.upgrades, {
    speed: 0,
    charm: 3,
    tolerance: 0,
    toy: 3,
    scanner: 1,
  });

  const created = createProgressSnapshot({
    stage: 'results',
    shift: 2,
    money: 0,
    totalServed: 0,
    totalEarned: 0,
    reputation: 3,
    upgrades: { speed: 99, charm: 4, tolerance: -2, toy: 7, scanner: 2 },
    scannerBroken: false,
    decor: [],
  });
  assert.deepEqual(created.upgrades, {
    speed: 3,
    charm: 3,
    tolerance: 0,
    toy: 3,
    scanner: 1,
  });
});

function orderItem(id: string, shelf: number, column: number, level = 0): OrderItem {
  return {
    shelf,
    column,
    level,
    cellId: id,
    actualShelf: shelf,
    actualColumn: column,
    actualLevel: level,
    actualCellId: id,
    mixed: false,
    picked: false,
  };
}

test('order target: derives current item and keeps the last target after full pickup', () => {
  const first = orderItem('A-1-1', 0, 0);
  const second = orderItem('B-2-1', 1, 1);
  const order = createOrderRecord([first, second], { scanned: true });

  assert.equal(order.currentItem, first);
  assert.equal(currentOrderItem(order), first);
  assert.equal(targetOrderItem(order), first);
  assert.equal(order.shelf, 0);
  assert.equal(order.cellId, 'A-1-1');

  first.picked = true;
  assert.equal(order.currentItem, second);
  assert.equal(currentOrderItem(order), second);
  assert.equal(order.shelf, 1);
  assert.equal(order.column, 1);
  assert.equal(order.cellId, 'B-2-1');

  second.picked = true;
  assert.equal(order.currentItem, undefined);
  assert.equal(currentOrderItem(order), undefined);
  assert.equal(targetOrderItem(order), second);
  assert.equal(order.shelf, 1);
  assert.equal(order.cellId, 'B-2-1');
});

test('order target: derives mixed actual fields and handles an empty order', () => {
  const item = orderItem('A-1-1', 0, 0);
  item.actualShelf = 0;
  item.actualColumn = 1;
  item.actualLevel = 0;
  item.actualCellId = 'A-2-1';
  item.mixed = true;
  const order = createOrderRecord([item], { scanned: false, searchMode: true });

  assert.equal(order.mixed, true);
  assert.equal(order.actualCellId, 'A-2-1');
  assert.equal(order.actualColumn, 1);
  assert.equal(order.searchMode, true);

  const empty = createOrderRecord([], { scanned: false });
  assert.equal(empty.currentItem, undefined);
  assert.equal(targetOrderItem(empty), undefined);
  assert.equal(empty.cellId, '');
  assert.equal(empty.shelf, 0);
  assert.equal(empty.mixed, false);
});
