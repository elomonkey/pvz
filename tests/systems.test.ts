import test from 'node:test';
import assert from 'node:assert/strict';

import { ShiftDirector } from '../src/systems/shiftDirector.ts';
import { ArgumentSystem } from '../src/systems/argumentSystem.ts';
import { ServiceSystem } from '../src/systems/serviceSystem.ts';
import {
  ScannerPanelSystem,
  buildCellPanelModel,
  cellPanelKeyFor,
} from '../src/systems/scannerPanelSystem.ts';
import { BossEncounter } from '../src/systems/bossEncounter.ts';
import { FinalBossSystem } from '../src/systems/finalBossSystem.ts';
import { QueenSystem } from '../src/systems/queenSystem.ts';
import { PlayerMovement } from '../src/systems/playerMovement.ts';
import { ZinaPuzzleSystem, isZinaSolved } from '../src/systems/zinaPuzzleSystem.ts';
import { bossKindForShift } from '../src/domain/bosses.ts';

test('shift director: старт, передышка и шаги', () => {
  const director = new ShiftDirector();
  director.begin(
    [
      { type: 'wave', wave: 1 },
      { type: 'wave', wave: 2 },
      { type: 'boss' },
      { type: 'wave', wave: 3 },
    ],
    1.2,
  );

  assert.equal(director.length, 4);
  assert.equal(director.currentIndex, -1);
  assert.equal(director.progress, 0);
  assert.equal(director.updateBreak(0.5), null);
  assert.ok(Math.abs(director.breakProgress - 0.7 / 1.2) < 1e-9);
  assert.equal(director.updateBreak(0.8), 0);

  const step = director.enterStep(0);
  assert.deepEqual(step, { type: 'wave', wave: 1 });
  assert.equal(director.currentIndex, 0);
  assert.equal(director.nextStepIndex, 1);
  assert.ok(Math.abs(director.progress - 0.05) < 1e-9);

  director.startBreak(5.2, 1);
  assert.equal(director.breakProgress, 1);
  assert.equal(director.updateBreak(2.6), null);
  assert.ok(Math.abs(director.breakProgress - 0.5) < 1e-9);
  assert.equal(director.updateBreak(2.6), 1);
});

test('shift director: босс, конец смены и сброс', () => {
  const director = new ShiftDirector();
  director.begin([
    { type: 'wave', wave: 1 },
    { type: 'boss' },
  ]);
  director.updateBreak(2);

  assert.equal(director.findBossIndex(), 1);
  director.jumpTo(1);
  assert.deepEqual(director.currentStep, { type: 'boss' });
  assert.equal(director.nextStepIndex, null);

  director.reset();
  assert.equal(director.length, 0);
  assert.equal(director.currentIndex, -1);
  assert.equal(director.currentStep, undefined);
});

test('argument system: клиентский спор и таймер', () => {
  const system = new ArgumentSystem();
  system.open('client');

  assert.equal(system.context, 'client');
  assert.equal(system.active, false);
  assert.equal(system.timeRatio, 0);

  const mash = system.startMash({
    startValue: 0.08,
    duration: 6,
    pushbackPerSecond: 0.05,
  });
  assert.equal(mash.mashTime, 6);
  assert.equal(mash.mashValue, 0.08);
  assert.equal(system.timeRatio, 1);

  const pressed = system.press();
  assert.equal(pressed?.mashTaps, 1);
  assert.ok(Math.abs((pressed?.mashValue ?? 0) - 0.14) < 1e-9);

  assert.equal(system.update(1), false);
  assert.ok(Math.abs((system.mashState?.mashValue ?? 0) - 0.09) < 1e-9);
  assert.ok(Math.abs(system.timeRatio - 5 / 6) < 1e-9);

  assert.equal(system.consumeFinished(), null);
  assert.equal(system.update(5), true);
  const finished = system.consumeFinished();
  assert.equal(finished?.kind, 'client');
  assert.equal(finished?.state.mashActive, false);
  assert.equal(system.active, false);

  system.resolve();
  assert.equal(system.isResolved, true);
});

test('argument system: босс, уступка и очистка', () => {
  const system = new ArgumentSystem();
  system.open('boss');
  system.startMash({
    startValue: 0,
    duration: 6,
    pushbackPerSecond: 0.04,
  });
  for (let index = 0; index < 20; index++) system.press();
  assert.equal(system.mashState?.mashValue, 1);
  assert.equal(system.mashState?.mashTaps, 20);

  system.resolve();
  assert.equal(system.isResolved, true);
  assert.equal(system.active, false);

  system.open('client');
  system.startMash({ startValue: 0, duration: 6, pushbackPerSecond: 0 });
  system.clear();
  assert.equal(system.context, null);
  assert.equal(system.active, false);
  assert.equal(system.isResolved, false);
});

test('service system: сессия, сборка и сброс', () => {
  const service = new ServiceSystem();
  const order = {
    items: [
      { cellId: 'A-1-1', picked: false },
      { cellId: 'A-2-1', picked: false },
    ],
  };
  const client = { id: 1 };

  assert.equal(service.active, null);
  assert.equal(service.carrying, false);
  assert.equal(service.readyToDeliver, false);
  assert.equal(service.takeNextItem(), null);
  assert.equal(service.carrying, false);
  service.begin(client, order);
  assert.equal(service.active?.client, client);
  assert.equal(service.remainingItems().length, 2);

  const first = service.takeNextItem('#bc8875');
  assert.equal(first?.cellId, 'A-1-1');
  assert.equal(service.carrying, true);
  assert.equal(service.readyToDeliver, false);
  assert.deepEqual(service.carryColors, ['#bc8875']);
  assert.equal(service.remainingItems().length, 1);
  const second = service.takeNextItem('#8098a8');
  assert.equal(second?.cellId, 'A-2-1');
  assert.deepEqual(service.carryColors, ['#bc8875', '#8098a8']);
  assert.equal(service.remainingItems().length, 0);
  assert.equal(service.readyToDeliver, true);
  assert.equal(service.takeNextItem('#ffffff'), null);
  assert.deepEqual(service.carryColors, ['#bc8875', '#8098a8']);

  const previous = service.clear();
  assert.deepEqual(previous, { client, order, carried: true });
  assert.equal(previous?.order, order);
  assert.equal(service.active, null);
  assert.equal(service.carrying, false);
  assert.equal(service.readyToDeliver, false);
  assert.deepEqual(service.carryColors, []);
  assert.equal(service.clear(), null);
});

test('service system: clear snapshots partial and untouched orders without clearing a return', () => {
  for (const picked of [false, true]) {
    const service = new ServiceSystem();
    const client = { id: 1 };
    const order = { items: [{ picked: false }, { picked: false }] };
    service.begin(client, order);
    service.carryingReturn = true;
    if (picked) service.takeNextItem('#bc8875');
    assert.equal(service.readyToDeliver, false);
    assert.deepEqual(service.clear(), { client, order, carried: picked });
    assert.equal(order.items[0].picked, picked);
    assert.equal(service.active, null);
    assert.equal(service.carrying, false);
    assert.equal(service.readyToDeliver, false);
    assert.deepEqual(service.carryColors, []);
    assert.equal(service.carryingReturn, true);
    assert.equal(service.clear(), null);
  }
});

test('service system: readiness requires nonempty items and clear accounts for picked data', () => {
  const service = new ServiceSystem();
  service.begin('empty', { items: [] });
  assert.equal(service.readyToDeliver, false);
  assert.equal(service.takeNextItem(), null);
  assert.equal(service.carrying, false);
  assert.equal(service.clear()?.carried, false);
  const order = { items: [{ picked: true }] };
  service.begin('already-picked', order);
  assert.equal(service.carrying, false);
  assert.equal(service.readyToDeliver, true);
  assert.deepEqual(service.clear(), { client: 'already-picked', order, carried: true });
  assert.equal(service.readyToDeliver, false);
});

test('service system: a new session starts with no carried stack', () => {
  const service = new ServiceSystem();
  service.begin('first', { items: [{ picked: false }] });
  service.takeNextItem('#bc8875');
  service.begin('next', { items: [{ picked: false }] });
  assert.equal(service.carrying, false);
  assert.equal(service.readyToDeliver, false);
  assert.deepEqual(service.carryColors, []);
  assert.equal(service.remainingItems().length, 1);
});

test('service system: возврат и сигнал поиска', () => {
  const service = new ServiceSystem();
  assert.deepEqual(service.lastSignal, { text: 'Сканер не уверен', level: 0 });

  assert.equal(service.setSignalForDistance(1).text, 'Горячо!');
  assert.equal(service.setSignalForDistance(2).level, 3);
  assert.equal(service.setSignalForDistance(3).text, 'Прохладно');
  assert.equal(service.setSignalForDistance(4).text, 'Холодно');
  service.resetSignal();
  assert.equal(service.lastSignal.text, 'Сканер не уверен');

  service.carryingReturn = true;
  assert.equal(service.carryingReturn, true);
  service.begin('client', { items: [{ picked: false }] });
  service.takeNextItem('#bc8875');
  assert.equal(service.readyToDeliver, true);
  service.reset();
  assert.equal(service.active, null);
  assert.equal(service.carrying, false);
  assert.equal(service.readyToDeliver, false);
  assert.deepEqual(service.carryColors, []);
  assert.deepEqual(service.remainingItems(), []);
  assert.equal(service.carryingReturn, false);
  assert.equal(service.lastSignal.level, 0);
});

test('scanner panel: ключ и режимы панели', () => {
  const order = {
    shelf: 1,
    column: 0,
    cellId: 'B-1-2',
    searchMode: false,
    checkedCells: [],
  };
  assert.equal(cellPanelKeyFor(order, true), 'cells:B-1-2:focus');
  assert.equal(cellPanelKeyFor(order, false), 'cells:B-1-2:all');

  order.searchMode = true;
  order.checkedCells.push('B-2-1');
  assert.equal(cellPanelKeyFor(order, true), 'search:1:1');

  const cells = [
    { id: 'B-1-1', column: 0, level: 3, color: '#fff' },
    { id: 'B-2-1', column: 1, level: 2, color: '#ddd' },
    { id: 'B-1-2', column: 0, level: 1, color: '#bbb' },
  ];
  const signal = { text: 'Тепло', level: 3 };
  order.cellId = 'B-1-2';
  order.column = 0;
  order.searchMode = false;
  const focus = buildCellPanelModel({
    order,
    shelfLetter: 'B',
    cells,
    columns: 3,
    highlightEnabled: true,
    signal,
  });
  assert.equal(focus.search, false);
  assert.equal(focus.kicker, 'Стеллаж B · колонка 1');
  assert.deepEqual(focus.cells.map((cell) => cell.id), ['B-1-1', 'B-1-2']);

  const all = buildCellPanelModel({
    order,
    shelfLetter: 'B',
    cells,
    columns: 3,
    highlightEnabled: false,
    signal,
  });
  assert.equal(all.columns, 3);
  assert.deepEqual(all.cells.map((cell) => cell.id), ['B-1-1', 'B-2-1', 'B-1-2']);

  order.searchMode = true;
  order.checkedCells = ['B-2-1'];
  const search = buildCellPanelModel({
    order,
    shelfLetter: 'B',
    cells,
    columns: 3,
    highlightEnabled: false,
    signal,
  });
  assert.equal(search.search, true);
  assert.equal(search.signal?.text, 'Тепло');
  assert.equal(search.cells.find((cell) => cell.id === 'B-2-1')?.checked, true);
});

test('scanner panel: состояние и закрытие', () => {
  const panel = new ScannerPanelSystem();
  const client = { id: 1 };
  panel.openScanner(client);
  assert.equal(panel.scanTarget, client);
  panel.focusShelf(2);
  panel.showPanel('cells:A-1-1:focus');
  assert.equal(panel.nearShelf, 2);
  assert.equal(panel.panelKey, 'cells:A-1-1:focus');
  assert.equal(panel.shouldOpenPanel('cells:A-1-1:focus'), false);
  assert.equal(panel.shouldOpenPanel('cells:A-2-1:focus'), true);

  panel.dismissFor('A-1-1');
  assert.equal(panel.panelKey, null);
  assert.equal(panel.isDismissed('A-1-1'), true);
  panel.showPanel('cells:A-2-1:focus');
  assert.equal(panel.dismissedFor, null);

  panel.clearPanel();
  assert.equal(panel.nearShelf, null);
  assert.equal(panel.panelKey, null);
  assert.equal(panel.dismissedFor, null);
  assert.equal(panel.scanTarget, client);
  panel.reset();
  assert.equal(panel.scanTarget, null);
});

test('bosse: выбор босса по смене', () => {
  assert.equal(bossKindForShift(1), 'galya');
  assert.equal(bossKindForShift(2), 'zina');
  assert.equal(bossKindForShift(3), 'sanya');
  assert.equal(bossKindForShift(4), 'galya');
  assert.equal(bossKindForShift(5), 'final');
});

test('boss encounter: жизненный цикл', () => {
  const boss = new BossEncounter();
  assert.equal(boss.kind, null);
  assert.equal(boss.triggered, false);
  boss.begin('zina');
  assert.equal(boss.kind, 'zina');
  boss.trigger();
  assert.equal(boss.triggered, true);
  assert.equal(boss.resolved, false);
  boss.resolve();
  assert.equal(boss.resolved, true);
  boss.reset();
  assert.equal(boss.kind, null);
  assert.equal(boss.triggered, false);
  assert.equal(boss.resolved, false);
});

test('zina puzzle: старт, ходы и таймер', () => {
  const puzzle = new ZinaPuzzleSystem();
  puzzle.start([1, 2, 3, 4], 0, () => 0.5);
  assert.equal(puzzle.active, true);
  assert.equal(puzzle.finished, false);
  assert.equal(puzzle.target.length, 4);
  assert.equal(puzzle.board.length, 9);
  assert.equal(puzzle.board.filter((cell) => cell === null).length, 1);
  assert.equal(puzzle.time, 75);
  assert.equal(puzzle.timeRatio, 1);

  const empty = puzzle.board.indexOf(null);
  assert.equal(puzzle.move(empty), 'invalid');
  assert.equal(puzzle.tick(80), 'timeout');
  assert.equal(puzzle.active, true);
  puzzle.resolve();
  assert.equal(puzzle.active, false);
  assert.equal(puzzle.finished, true);
  assert.equal(puzzle.tick(1), 'inactive');
  assert.equal(puzzle.move(0), 'inactive');

  puzzle.reset();
  assert.equal(puzzle.active, false);
  assert.equal(puzzle.time, 0);
});

test('zina puzzle: проверка решения', () => {
  const target = [7, 3, 9, 1];
  const solved = [7, 3, 0, 9, 1, 0, 0, 0, null];
  const unsolved = [7, 3, 0, 9, 2, 0, 0, 0, null];
  assert.equal(isZinaSolved(solved, target), true);
  assert.equal(isZinaSolved(unsolved, target), false);
});

test('final boss: фазы, штрихкоды и дебафф', () => {
  const boss = new FinalBossSystem();
  boss.begin();
  assert.equal(boss.active, true);
  assert.equal(boss.stage, 'entrance');
  assert.equal(boss.phase, 1);

  boss.applyDebuff();
  assert.equal(boss.debuff, true);

  boss.startCollect();
  assert.equal(boss.stage, 'collect');
  assert.equal(boss.phase, 2);
  assert.equal(boss.startBarcode(0), 2);
  assert.equal(boss.startBarcode(1), 3);
  assert.equal(boss.startBarcode(2), 4);

  boss.startBarcode(0);
  assert.equal(boss.completeBarcodeDelivery(), 'next');
  assert.equal(boss.barcode, 1);
  assert.equal(boss.completeBarcodeDelivery(), 'mid');
  assert.equal(boss.stage, 'mid');
  boss.startBarcode(2);
  assert.equal(boss.completeBarcodeDelivery(), 'fitting');
  assert.equal(boss.stage, 'fittingWalk');
  assert.equal(boss.phase, 3);
});

test('final boss: примерочная и возвраты', () => {
  const boss = new FinalBossSystem();
  boss.begin();
  boss.startCollect();
  boss.startBarcode(0);
  boss.completeBarcodeDelivery();
  boss.completeBarcodeDelivery();
  boss.startBarcode(2);
  boss.completeBarcodeDelivery();

  boss.enterFitting();
  assert.equal(boss.stage, 'fittingTalk');
  assert.equal(boss.valeraInFitting, true);

  boss.startReturns();
  assert.equal(boss.stage, 'returns');
  assert.equal(boss.returnsLeft, 3);
  assert.equal(boss.returnPending, true);
  boss.takeReturn();
  assert.equal(boss.returnPending, false);
  assert.equal(boss.returnInHand, true);

  assert.equal(boss.depositReturn(), 2);
  assert.equal(boss.returnPending, true);
  assert.equal(boss.depositReturn(), 1);
  assert.equal(boss.depositReturn(), 0);
  assert.equal(boss.returnPending, false);

  boss.finish();
  assert.equal(boss.active, false);
  assert.equal(boss.stage, 'done');
  assert.equal(boss.debuff, false);
  assert.equal(boss.valeraInFitting, false);

  boss.reset();
  assert.equal(boss.stage, 'idle');
  assert.equal(boss.returnsLeft, 0);
});

test('final boss: таймер реплик', () => {
  const boss = new FinalBossSystem();
  boss.begin();
  boss.startCollect();
  boss.startBarcode(0);
  boss.setTauntSeconds(0.5);
  assert.equal(boss.tickTaunt(0.4, () => 0.5), false);
  assert.equal(boss.tickTaunt(0.2, () => 0.5), true);
  assert.equal(boss.tickTaunt(0.5, () => 0.5), false);
  boss.finish();
  assert.equal(boss.tickTaunt(10, () => 0.5), false);
});

test('queen: бюджет, примерки и возвраты', () => {
  const queen = new QueenSystem();
  queen.spawn(25);
  assert.equal(queen.spawned, true);
  assert.equal(queen.active, true);
  assert.equal(queen.budget, 25);
  assert.equal(queen.irritation, 1.15);

  assert.equal(queen.deliver(5), 20);
  assert.equal(queen.delivered, 5);
  queen.startFitting(6, () => 1);
  assert.equal(queen.inFitting, true);
  assert.equal(queen.cooldown, 6);
  assert.equal(queen.nextReturn, true);
  assert.equal(queen.readyToReturn, false);
  queen.tickCooldown(6);
  assert.equal(queen.readyToReturn, true);

  queen.beginReturn(true);
  assert.equal(queen.inFitting, false);
  assert.equal(queen.hasReturn, true);
  assert.equal(queen.nextReturn, false);
  queen.takeReturn();
  assert.equal(queen.hasReturn, false);
  assert.equal(queen.returnInHand, true);
  assert.equal(queen.deliverReturn(), 2);
  assert.equal(queen.cooldown, 2);
  assert.equal(queen.inFitting, true);
  assert.equal(queen.readyToReturn, false);
  queen.tickCooldown(2.1);
  assert.equal(queen.readyToReturn, true);

  queen.finish();
  assert.equal(queen.active, false);
  assert.equal(queen.budget, 0);
  assert.equal(queen.irritation, 1);
});

test('queen: повторная примерка и сброс', () => {
  const queen = new QueenSystem();
  queen.spawn(10);
  queen.startFitting(6, () => 1);
  assert.equal(queen.fittings, 1);
  assert.equal(queen.nextReturn, true);
  queen.beginReturn(false);
  assert.equal(queen.hasReturn, false);
  queen.startFitting(6, () => 1);
  assert.equal(queen.fittings, 2);
  assert.equal(queen.nextReturn, false);
  assert.equal(queen.irritation, 1.21);

  queen.reset();
  assert.equal(queen.spawned, false);
  assert.equal(queen.active, false);
  assert.equal(queen.inFitting, false);
  assert.equal(queen.fittings, 0);
  assert.equal(queen.irritation, 1);
});

test('движение: путь, прибытие и сохранение направления', () => {
  const movement = new PlayerMovement({ x: 0, z: 0 });
  movement.setPath([{ x: 2, z: 0 }]);

  let step = movement.update(0.5, 1);
  assert.equal(step.moving, true);
  assert.equal(step.arrived, false);
  assert.equal(movement.position.x, 0.5);
  assert.equal(movement.position.z, 0);
  assert.ok(Math.abs(step.facing - Math.PI / 2) < 1e-9);

  step = movement.update(1.5, 1);
  assert.equal(step.moving, true);
  assert.equal(step.arrived, true);
  assert.equal(movement.position.x, 2);
  assert.equal(movement.hasPath, false);

  step = movement.update(1, 1);
  assert.equal(step.moving, false);
  assert.equal(step.arrived, false);
  assert.ok(Math.abs(step.facing - Math.PI / 2) < 1e-9);
});

test('движение: несколько точек, телепорт и сброс', () => {
  const movement = new PlayerMovement({ x: 0, z: 0 });
  movement.setPath([
    { x: 0, z: 1 },
    { x: 1, z: 1 },
  ]);

  movement.update(0.5, 1);
  assert.equal(movement.position.z, 0.5);

  const step = movement.update(2, 1);
  assert.equal(step.arrived, true);
  assert.equal(movement.position.x, 1);
  assert.equal(movement.position.z, 1);

  movement.snapTo({ x: 5, z: -2 });
  assert.equal(movement.hasPath, false);
  assert.equal(movement.position.x, 5);

  movement.facing = 1.2;
  movement.reset({ x: 0, z: 0 });
  assert.equal(movement.position.x, 0);
  assert.equal(movement.position.z, 0);
  assert.equal(movement.facing, 0);
});

test('движение: расстояние до цели и очистка пути', () => {
  const movement = new PlayerMovement({ x: 1, z: 2 });
  assert.equal(movement.distanceTo({ x: 4, z: 6 }), 5);

  movement.setPath([{ x: 4, z: 6 }]);
  assert.equal(movement.pathLength, 1);
  movement.clearPath();
  assert.equal(movement.hasPath, false);
});
