import test from 'node:test';
import assert from 'node:assert/strict';

import { ShiftDirector } from '../src/systems/shiftDirector.ts';
import { ArgumentSystem } from '../src/systems/argumentSystem.ts';
import {
  ArgumentScenario,
  type ArgumentScenarioHost,
} from '../src/systems/argumentScenario.ts';
import { ServiceSystem } from '../src/systems/serviceSystem.ts';
import {
  ScannerPanelSystem,
  buildCellPanelModel,
  cellPanelKeyFor,
} from '../src/systems/scannerPanelSystem.ts';
import { BossEncounter } from '../src/systems/bossEncounter.ts';
import {
  BossScenario,
  type BossScenarioHost,
  type OrdinaryBossKind,
} from '../src/systems/bossScenario.ts';
import { FinalBossSystem } from '../src/systems/finalBossSystem.ts';
import { FinalBossScenario, type FinalBossScenarioHost } from '../src/systems/finalBossScenario.ts';
import { QueenSystem } from '../src/systems/queenSystem.ts';
import { QueenScenario, type QueenScenarioHost } from '../src/systems/queenScenario.ts';
import { EncounterCoordinator } from '../src/systems/encounterCoordinator.ts';
import { PlayerMovement } from '../src/systems/playerMovement.ts';
import { ZinaPuzzleSystem, isZinaSolved } from '../src/systems/zinaPuzzleSystem.ts';
import { WarehouseState } from '../src/systems/warehouseSystem.ts';
import { bossKindForShift } from '../src/domain/bosses.ts';
import { allocateOrderItems, availableOrderCells } from '../src/domain/orderAllocation.ts';

function allocationCells() {
  return Array.from({ length: 9 }, (_, index) => ({
    id: `${index / 3 | 0}-${index % 3}`, shelfIndex: index / 3 | 0,
    column: index % 3, level: 0, available: true,
  }));
}

test('allocator: one visible active unreserved cell is the only possible item, even with constant RNG', () => {
  const cells = allocationCells();
  for (const cell of cells) cell.available = cell.shelfIndex === 2 || cell.id === '1-2';
  const candidates = availableOrderCells(cells, 2, new Set());
  const items = allocateOrderItems(candidates, 1, { random: () => 0 });
  assert.deepEqual(items.map(item => item.cellId), ['1-2']);
});

for (const desired of [2, 3]) {
  test(`allocator: deficit for ${desired} items never duplicates or invents stock`, () => {
    const cells = allocationCells();
    cells[0].available = false;
    const candidates = availableOrderCells(cells, 1, new Set(['0-1']));
    const items = allocateOrderItems(candidates, desired, { random: () => 0 });
    assert.deepEqual(items.map(item => item.cellId), ['0-2']);
    assert.equal(new Set(items.map(item => item.cellId)).size, items.length);
  });
}

test('allocator: restocking visible flags does not make reserved cells available', () => {
  const cells = allocationCells();
  const reserved = new Set(cells.map(cell => cell.id));
  for (const cell of cells) cell.available = false;
  assert.deepEqual(availableOrderCells(cells, 2, reserved), []);
  for (const cell of cells) cell.available = true;
  assert.deepEqual(allocateOrderItems(availableOrderCells(cells, 2, reserved), 3), []);
  reserved.delete('1-2');
  assert.deepEqual(allocateOrderItems(availableOrderCells(cells, 2, reserved), 3).map(item => item.cellId), ['1-2']);
});

test('allocator: already selected cells are excluded without mutating inputs', () => {
  const cells = allocationCells();
  const selected = new Set(['0-0', '0-1']);
  assert.deepEqual(availableOrderCells(cells, 1, new Set(), selected).map(cell => cell.id), ['0-2']);
  assert.equal(cells.length, 9);
  assert.equal(selected.size, 2);
});

test('allocator: mixed actual cell comes from the same available shelf only', () => {
  const cells = allocationCells();
  cells[1].available = false;
  const reserved = new Set(['1-1']);
  const candidates = availableOrderCells(cells, 2, reserved);
  const [item] = allocateOrderItems(candidates, 1, { mixed: true, random: () => 0 });
  assert.equal(item.cellId, '0-0');
  assert.equal(item.actualCellId, '0-2');
  assert.equal(item.actualShelf, item.shelf);
  assert.equal(item.mixed, true);
  assert.equal(reserved.size, 1);
  const [single] = allocateOrderItems([cells[0], cells[3]], 1, { mixed: true, random: () => 0 });
  assert.equal(single.actualCellId, single.cellId);
  assert.equal(single.mixed, false);
});

for (const desired of [2, 3, 4]) {
  test(`allocator: final barcode keeps ${desired} items and preferred shelves`, () => {
    const cells = allocationCells();
    const items = allocateOrderItems(cells, desired, { preferredShelf: index => index % 3, random: () => 0 });
    assert.equal(items.length, desired);
    assert.deepEqual(items.map(item => item.shelf), Array.from({ length: desired }, (_, index) => index % 3));
    assert.equal(new Set(items.map(item => item.cellId)).size, desired);
    assert.ok(cells.every(cell => cell.available));
  });
}

test('allocator: an exhausted preferred shelf falls back to other active candidates', () => {
  const cells = allocationCells();
  const candidates = availableOrderCells(cells, 2, new Set(['0-0', '0-1', '0-2']));
  const items = allocateOrderItems(candidates, 4, { preferredShelf: () => 0, random: () => 0 });
  assert.equal(items.length, 3);
  assert.ok(items.every(item => item.shelf === 1));
});

test('allocator: ordinary shelf choice is not biased towards longer shelves', () => {
  const cells = allocationCells().slice(0, 7);
  const values = [0.8, 0];
  const [item] = allocateOrderItems(cells, 1, { random: () => values.shift()! });
  assert.equal(item.shelf, 2);
});

function warehouseCells() {
  return [
    { id: 'A-1-1', shelfIndex: 0, column: 0, level: 0, color: '#aaa' },
    { id: 'A-1-2', shelfIndex: 0, column: 0, level: 1, color: '#bbb' },
    { id: 'B-1-1', shelfIndex: 1, column: 0, level: 0, color: '#ccc' },
    { id: 'C-1-1', shelfIndex: 2, column: 0, level: 0, color: '#ddd' },
  ];
}

test('warehouse: stock, reservations and active shelves', () => {
  const warehouse = new WarehouseState(warehouseCells());

  assert.deepEqual(warehouse.available(2).map((cell) => cell.id), ['A-1-1', 'A-1-2', 'B-1-1']);
  assert.equal(warehouse.isAvailable('C-1-1', 2), false);
  assert.equal(warehouse.isAvailable('C-1-1', 3), true);

  warehouse.consume('A-1-1');
  assert.equal(warehouse.hasStock('A-1-1'), false);
  assert.equal(warehouse.isAvailable('A-1-1', 3), false);
  warehouse.setStock('A-1-1', true);
  assert.equal(warehouse.hasStock('A-1-1'), true);

  warehouse.reserve(['A-1-2', 'B-1-1']);
  assert.equal(warehouse.isReserved('A-1-2'), true);
  assert.deepEqual(warehouse.available(2).map((cell) => cell.id), ['A-1-1']);
  warehouse.release(['A-1-2']);
  assert.deepEqual(warehouse.available(2).map((cell) => cell.id), ['A-1-1', 'A-1-2']);

  warehouse.clearReservations();
  assert.equal(warehouse.isReserved('B-1-1'), false);
});

test('warehouse: restock keeps carried cells empty and reset clears all state', () => {
  const warehouse = new WarehouseState(warehouseCells());
  warehouse.consume('A-1-1');
  warehouse.consume('B-1-1');
  warehouse.reserve(['A-1-1']);

  warehouse.restock(new Set(['A-1-1']));
  assert.equal(warehouse.hasStock('A-1-1'), false);
  assert.equal(warehouse.hasStock('B-1-1'), true);
  assert.equal(warehouse.isReserved('A-1-1'), true);

  warehouse.reset();
  assert.equal(warehouse.hasStock('A-1-1'), true);
  assert.equal(warehouse.isReserved('A-1-1'), false);
  assert.deepEqual(warehouse.available(3).map((cell) => cell.id), [
    'A-1-1',
    'A-1-2',
    'B-1-1',
    'C-1-1',
  ]);
});

test('encounter coordinator: phase transitions and input blocking', () => {
  const encounter = new EncounterCoordinator();
  assert.equal(encounter.phase, 'menu');
  assert.equal(encounter.inputBlocked, true);

  encounter.enterPlaying();
  assert.equal(encounter.phase, 'playing');
  assert.equal(encounter.inputBlocked, false);

  encounter.enterBreak();
  assert.equal(encounter.phase, 'break');
  assert.equal(encounter.inputBlocked, false);

  encounter.enterBoss();
  assert.equal(encounter.phase, 'boss');
  encounter.enterResults();
  assert.equal(encounter.phase, 'results');
  assert.equal(encounter.inputBlocked, true);
  encounter.enterGameOver();
  assert.equal(encounter.phase, 'gameover');
  assert.equal(encounter.inputBlocked, true);
  encounter.enterMenu();
  assert.equal(encounter.phase, 'menu');
});

test('encounter coordinator: modal/help pause and reset', () => {
  const encounter = new EncounterCoordinator();
  encounter.enterPlaying();

  encounter.openModal();
  assert.equal(encounter.modalOpen, true);
  assert.equal(encounter.paused, true);
  assert.equal(encounter.inputBlocked, true);
  encounter.closeModal();
  assert.equal(encounter.paused, false);

  encounter.openHelp();
  assert.equal(encounter.modalOpen, true);
  assert.equal(encounter.helpOpen, true);
  encounter.closeHelp();
  assert.equal(encounter.modalOpen, false);
  assert.equal(encounter.helpOpen, false);

  encounter.openModal();
  encounter.openHelp();
  encounter.reset();
  assert.equal(encounter.phase, 'menu');
  assert.equal(encounter.modalOpen, false);
  assert.equal(encounter.helpOpen, false);
  assert.equal(encounter.inputBlocked, true);
});

test('encounter coordinator: tutorial, mechanic and scanner overlays', () => {
  const encounter = new EncounterCoordinator();
  encounter.enterPlaying();

  encounter.openTutorial();
  assert.equal(encounter.tutorialOpen, true);
  assert.equal(encounter.overlayOpen, true);
  encounter.closeTutorial();
  assert.equal(encounter.tutorialOpen, false);

  encounter.openMechanicCard();
  assert.equal(encounter.mechanicCardOpen, true);
  assert.equal(encounter.overlayOpen, true);
  encounter.closeMechanicCard();
  assert.equal(encounter.mechanicCardOpen, false);

  encounter.openScannerBreakCard();
  assert.equal(encounter.scannerBreakCardOpen, true);
  assert.equal(encounter.overlayOpen, true);
  encounter.closeScannerBreakCard();
  assert.equal(encounter.scannerBreakCardOpen, false);
  assert.equal(encounter.overlayOpen, false);

  encounter.openTutorial();
  encounter.openMechanicCard();
  encounter.openScannerBreakCard();
  encounter.reset();
  assert.equal(encounter.tutorialOpen, false);
  assert.equal(encounter.mechanicCardOpen, false);
  assert.equal(encounter.scannerBreakCardOpen, false);
  assert.equal(encounter.overlayOpen, false);
});

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

function queenScenarioHarness() {
  const calls = {
    createdOrders: [] as number[],
    released: [] as unknown[],
    added: [] as unknown[],
    enqueued: [] as unknown[],
    dequeued: [] as unknown[],
    reputation: [] as number[],
    clearFitting: [] as boolean[],
    occupyFitting: 0,
    patience: 0,
    hud: 0,
    prompt: 0,
    queenStatus: [] as unknown[][],
    banners: [] as unknown[][],
    toasts: [] as unknown[][],
    boss: 0,
    win: 0,
    pickup: 0,
    beginReturnCarry: 0,
  };
  const clients: any[] = [];
  const queue: any[] = [];
  let orderId = 0;
  let orderAvailable = true;
  let serviceActive = false;

  const makeOrder = () => ({ id: `order-${++orderId}` } as any);
  const makeClient = (order: any) => {
    const client: any = {
      order,
      state: 'waiting',
      arrived: false,
      bubbles: [] as string[],
      root: {
        visible: true,
        position: {
          x: 0, y: 0, z: 0,
          set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; },
        },
        rotation: { y: 0 },
      },
      label: { visible: true },
      rig: {
        carries: [] as unknown[],
        setCarry(value: boolean, color?: string) { this.carries.push([value, color]); },
      },
      showBubble(text: string) { this.bubbles.push(text); },
      hideBubble() {},
      setTarget() {},
      walkTo(point: unknown) { this.target = point; this.state = 'entering'; },
      isAt() { return this.arrived; },
      setPatience() {},
      leave() { this.state = 'leaving'; },
    };
    return client;
  };

  const ui: any = {
    setQueenStatus: (...args: unknown[]) => calls.queenStatus.push(args),
    banner: (...args: unknown[]) => calls.banners.push(args),
    toast: (...args: unknown[]) => calls.toasts.push(args),
  };
  const sound: any = {
    boss: () => calls.boss++,
    win: () => calls.win++,
    pickup: () => calls.pickup++,
  };
  const host: QueenScenarioHost = {
    ui,
    sound,
    nextBudget: () => 20,
    queenLine: () => 'queen-line',
    returnLine: () => 'return-line',
    createOrder: (maxItems) => {
      calls.createdOrders.push(maxItems);
      return orderAvailable ? makeOrder() : null;
    },
    releaseOrder: (order) => calls.released.push(order),
    createClient: (order) => makeClient(order),
    addClient: (client) => {
      calls.added.push(client);
      clients.push(client);
    },
    enqueueFront: (client) => {
      calls.enqueued.push(client);
      if (!queue.includes(client)) queue.unshift(client);
    },
    dequeue: (client) => {
      calls.dequeued.push(client);
      const index = queue.indexOf(client);
      if (index >= 0) queue.splice(index, 1);
    },
    isServiceActive: () => serviceActive,
    canTakeReturn: () => true,
    beginReturnCarry: () => calls.beginReturnCarry++,
    orderCells: () => 'A-1',
    addReputation: (amount) => calls.reputation.push(amount),
    clearFitting: (resetTimers) => calls.clearFitting.push(resetTimers),
    occupyFitting: () => calls.occupyFitting++,
    refreshPatience: () => calls.patience++,
    updateHud: () => calls.hud++,
    updatePrompt: () => calls.prompt++,
  };

  return {
    scenario: new QueenScenario(host, new QueenSystem()),
    calls,
    clients,
    queue,
    setOrderAvailable: (value: boolean) => { orderAvailable = value; },
    setServiceActive: (value: boolean) => { serviceActive = value; },
  };
}

test('queen scenario: появление ждёт реальный заказ и не дублирует клиента', () => {
  const h = queenScenarioHarness();
  h.setOrderAvailable(false);
  h.scenario.spawn();
  assert.equal(h.scenario.queen.spawned, false);
  assert.equal(h.scenario.client, null);
  assert.equal(h.clients.length, 0);

  h.setOrderAvailable(true);
  h.scenario.spawn();
  assert.equal(h.scenario.queen.spawned, true);
  assert.equal(h.clients.length, 1);
  assert.equal(h.queue.length, 1);
  assert.equal(h.queue[0], h.scenario.client);
  assert.ok(h.scenario.queen.budget >= 20 && h.scenario.queen.budget <= 30);
  assert.deepEqual(h.calls.createdOrders, [3, 3]);

  h.scenario.spawn();
  assert.equal(h.clients.length, 1);
  assert.equal(h.queue.length, 1);
});

test('queen scenario: примерка ждёт возврата с возвратом и отдаёт его игроку', () => {
  const h = queenScenarioHarness();
  h.scenario.spawn();
  const queen = h.scenario.client!;

  h.scenario.queen.deliver(3);
  h.scenario.sendToFitting();
  assert.equal(h.scenario.walkingToFitting, true);
  assert.equal(h.queue.length, 0);
  assert.deepEqual(h.calls.clearFitting, [false]);

  queen.arrived = true;
  queen.state = 'waiting';
  h.scenario.update(0, false);
  assert.equal(h.scenario.queen.inFitting, true);
  assert.equal(h.scenario.walkingToFitting, false);
  assert.equal(h.calls.occupyFitting, 1);

  h.setServiceActive(true);
  h.scenario.update(6.1, false);
  assert.equal(h.scenario.queen.hasReturn, false);
  h.setServiceActive(false);
  h.scenario.update(0.01, false);
  assert.equal(h.scenario.queen.hasReturn, true);
  assert.equal(queen.order, null);
  assert.equal(queen.state, 'entering');
  assert.equal(h.queue[0], queen);
  assert.equal(h.calls.banners.at(-1)?.[0], 'Королева вернулась с возвратом');

  h.scenario.takeReturn();
  assert.equal(h.scenario.queen.returnInHand, true);
  assert.equal(h.calls.beginReturnCarry, 1);
  assert.equal(h.queue.length, 0);
  assert.equal(queen.root.visible, false);
  assert.equal(queen.label.visible, false);
});

test('queen scenario: после примерки выбирает новый заказ вместо возврата', () => {
  const h = queenScenarioHarness();
  h.scenario.spawn();
  const queen = h.scenario.client!;
  const previousOrder = queen.order;

  h.scenario.queen.startFitting(0, () => 1);
  h.scenario.queen.startFitting(0, () => 1);
  assert.equal(h.scenario.queen.nextReturn, false);

  queen.state = 'gone';
  h.scenario.update(0.01, false);
  assert.notEqual(queen.order, previousOrder);
  assert.equal(queen.state, 'entering');
  assert.equal(h.queue[0], queen);
  assert.ok(h.calls.released.includes(previousOrder));
  assert.equal(h.calls.clearFitting.at(-1), true);
  assert.equal(h.calls.banners.at(-1)?.[0], 'Королева вернулась');
});

test('queen scenario: finish и clearForResults очищают клиента и состояние', () => {
  const finished = queenScenarioHarness();
  finished.scenario.spawn();
  const leaving = finished.scenario.client!;
  finished.scenario.finish();
  assert.equal(finished.scenario.client, null);
  assert.equal(finished.scenario.queen.active, false);
  assert.equal(leaving.state, 'leaving');
  assert.equal(finished.queue.length, 0);
  assert.deepEqual(finished.calls.reputation, [0.5]);
  assert.equal(finished.calls.win, 1);
  assert.equal(finished.calls.clearFitting.at(-1), true);

  const results = queenScenarioHarness();
  results.scenario.spawn();
  const hidden = results.scenario.client!;
  const hiddenOrder = hidden.order;
  results.scenario.clearForResults();
  assert.equal(results.scenario.client, null);
  assert.equal(results.scenario.queen.spawned, false);
  assert.equal(hidden.root.visible, false);
  assert.equal(hidden.label.visible, false);
  assert.ok(results.calls.released.includes(hiddenOrder));
  assert.equal(results.queue.length, 0);
});

function finalBossClientStub(kind: 'galya' | 'valera') {
  return {
    kind,
    order: null as any,
    state: 'waiting',
    isBoss: true,
    maxPatience: 999,
    patience: 999,
    patienceDrainMultiplier: 1,
    hasShouted: false,
    arrived: false,
    queueIndex: 0,
    target: null as any,
    bubbles: [] as string[],
    root: {
      visible: true,
      position: {
        x: 0, y: 0, z: 0,
        set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; },
      },
      rotation: { y: 0 },
    },
    label: {
      visible: true,
      element: {
        classList: {
          removed: [] as string[],
          remove(name: string) { this.removed.push(name); },
        },
      },
    },
    rig: {
      carries: [] as unknown[],
      setCarry(value: boolean, color?: string) { this.carries.push([value, color]); },
    },
    preplaceAtFront() { this.root.position.set(0.4, 0, 1.15); this.state = 'waiting'; },
    placeAt(point: { x: number; z: number }) {
      this.root.position.set(point.x, 0, point.z);
      this.state = 'waiting';
    },
    showBubble(text: string) { this.bubbles.push(text); },
    hideBubble() {},
    setTarget() {},
    walkTo(point: { x: number; z: number }) { this.target = point; this.state = 'entering'; },
    isAt() { return this.arrived; },
    setPatience(value: number) { this.patience = value; },
    setQueueIndex(index: number) { this.queueIndex = index; },
    leave() { this.state = 'leaving'; },
  };
}

function finalBossHarness() {
  const calls = {
    prepare: 0,
    created: [] as string[],
    added: [] as { kind: string; queue: string }[],
    dequeued: [] as string[],
    orderCounts: [] as number[],
    released: [] as unknown[],
    fitting: [] as { occupied: boolean[]; full: boolean; resetTimers: boolean; active: boolean }[],
    fittingRooms: [] as unknown[][],
    dialogues: [] as { phase: string; lines: unknown[]; button: string }[],
    closedDialogues: 0,
    stress: [] as number[],
    reputation: [] as number[],
    outcomes: [] as boolean[],
    deliveries: [] as { client: string; order: unknown }[],
    returnCarries: [] as string[],
    clearedReturns: 0,
    debuff: 0,
    status: [] as unknown[][],
    banners: [] as unknown[][],
    toasts: [] as unknown[][],
    bossSounds: 0,
    shoutSounds: 0,
    deliverSounds: 0,
    pickupSounds: 0,
    winSounds: 0,
    refresh: 0,
    finished: 0,
  };
  let shift = 5;
  let gameOver = false;
  let returnAllowed = true;
  let dialogueOpen = false;
  let orderId = 0;

  const points = {
    queueFront: { x: 0.4, z: 1.15 },
    fitting: { x: 3.15, z: 2.8 },
  };
  const makeOrder = (count: number) => ({ id: `order-${++orderId}`, count } as any);
  const galya = finalBossClientStub('galya');
  const valera = finalBossClientStub('valera');

  const ui: any = {
    setFinalBossDebuff: () => {},
    setFinalBossStatus: (...args: unknown[]) => calls.status.push(args),
    setScanSpeed: () => {},
    closePanels: () => {},
    setOrderChip: () => {},
    banner: (...args: unknown[]) => calls.banners.push(args),
    toast: (...args: unknown[]) => calls.toasts.push(args),
    setFittingRooms: (...args: unknown[]) => calls.fittingRooms.push(args),
  };
  const sound: any = {
    boss: () => calls.bossSounds++,
    shout: () => calls.shoutSounds++,
    deliver: () => calls.deliverSounds++,
    pickup: () => calls.pickupSounds++,
    win: () => calls.winSounds++,
  };

  const host: FinalBossScenarioHost = {
    ui,
    sound,
    points,
    shift: () => shift,
    isGameOver: () => gameOver,
    prepareEncounter: () => calls.prepare++,
    createClient: (kind) => {
      calls.created.push(kind);
      return kind === 'galya' ? (galya as any) : (valera as any);
    },
    addClient: (client: any, queue) => calls.added.push({ kind: client.kind, queue }),
    dequeue: (client: any) => calls.dequeued.push(client.kind),
    createBarcodeOrder: (count) => {
      calls.orderCounts.push(count);
      return makeOrder(count);
    },
    releaseOrder: (order) => calls.released.push(order),
    patienceMultiplier: () => 1,
    applyDebuffEffects: () => calls.debuff++,
    setFittingState: (occupied, full, resetTimers, active) =>
      calls.fitting.push({
        occupied: [...occupied],
        full,
        resetTimers,
        active,
      }),
    dialogueLines: (phase) => [
      { speaker: 'narrator', text: `phase ${phase}`, tone: 'narrator' },
    ] as any,
    openDialogue: (phase, lines, button) => {
      calls.dialogues.push({ phase, lines: [...lines], button });
      dialogueOpen = true;
    },
    closeDialogue: () => {
      calls.closedDialogues++;
      dialogueOpen = false;
    },
    isDialogueOpen: () => dialogueOpen,
    addStress: (amount) => calls.stress.push(amount),
    addReputation: (amount) => calls.reputation.push(amount),
    markOutcome: (success) => calls.outcomes.push(success),
    completeDelivery: (client: any, order) => {
      client.order = null;
      client.state = 'waiting';
      calls.deliveries.push({ client: client.kind, order });
    },
    canTakeReturn: () => returnAllowed,
    beginReturnCarry: (client: any) => calls.returnCarries.push(client.kind),
    clearReturnCarry: () => calls.clearedReturns++,
    nextTauntDelay: () => 0,
    shoutLine: () => 'Быстрее!',
    refreshUi: () => calls.refresh++,
    finishShift: () => calls.finished++,
  };

  const system = new FinalBossSystem();
  return {
    scenario: new FinalBossScenario(system, host),
    system,
    calls,
    galya,
    valera,
    points,
    setShift: (value: number) => { shift = value; },
    setGameOver: (value: boolean) => { gameOver = value; },
    setReturnAllowed: (value: boolean) => { returnAllowed = value; },
  };
}

test('final boss scenario: spawn создаёт Галю и Валеру и открывает entrance', () => {
  const h = finalBossHarness();
  h.scenario.spawn();

  assert.equal(h.calls.prepare, 1);
  assert.equal(h.scenario.galya, h.galya);
  assert.equal(h.scenario.valera, h.valera);
  assert.deepEqual(h.calls.created, ['galya', 'valera']);
  assert.deepEqual(h.calls.added, [
    { kind: 'galya', queue: 'back' },
    { kind: 'valera', queue: 'none' },
  ]);
  assert.deepEqual(h.calls.dialogues[0]?.phase, 'ФАЗА 1 / 3');
  assert.deepEqual(h.calls.dialogues[0]?.button, 'Дальше');
  assert.equal(h.calls.status.at(-1)?.[2], 'скандал на входе');
  assert.ok(h.valera.label.element.classList.removed.includes('boss'));

  h.setShift(4);
  h.scenario.spawn();
  assert.equal(h.calls.prepare, 1);
});

test('final boss scenario: entrance → три штрихкода → примерка → три возврата', () => {
  const h = finalBossHarness();
  h.scenario.spawn();
  h.scenario.onDialogueDone();

  assert.equal(h.scenario.order?.count, 2);
  assert.deepEqual(h.calls.orderCounts, [2]);
  assert.equal(h.calls.debuff, 1);
  h.scenario.update(0.01);
  assert.ok(h.calls.stress.includes(2));
  assert.equal(h.calls.shoutSounds, 1);

  h.scenario.handleDelivery({ client: h.galya as any, order: h.scenario.order! });
  assert.equal(h.scenario.order?.count, 3);
  assert.deepEqual(h.calls.orderCounts, [2, 3]);

  h.scenario.handleDelivery({ client: h.galya as any, order: h.scenario.order! });
  assert.equal(h.calls.dialogues.at(-1)?.phase, 'ФАЗА 2 / 3');
  h.scenario.onDialogueDone();
  assert.equal(h.scenario.order?.count, 4);
  assert.deepEqual(h.calls.orderCounts, [2, 3, 4]);

  h.scenario.handleDelivery({ client: h.galya as any, order: h.scenario.order! });
  assert.equal(h.scenario.order, null);
  assert.deepEqual(h.valera.target, h.points.fitting);

  h.valera.arrived = true;
  h.valera.state = 'waiting';
  h.scenario.update(0);
  assert.equal(h.calls.dialogues.at(-1)?.phase, 'ФАЗА 3 / 3');
  assert.deepEqual(h.calls.fitting.at(-1), {
    occupied: [true, false],
    full: false,
    resetTimers: false,
    active: true,
  });

  h.scenario.onDialogueDone();
  assert.equal(h.scenario.galya?.order, null);
  assert.ok(h.scenario.galya?.rig.carries.some((value) => JSON.stringify(value) === JSON.stringify([true, '#d95d5d'])));

  for (let index = 0; index < 3; index++) {
    h.scenario.takeReturn();
    assert.equal(h.calls.returnCarries.length, index + 1);
    const left = h.system.depositReturn();
    h.scenario.handleReturnDeposited(left);
    if (index < 2) {
      assert.equal(h.scenario.galya?.state, 'waiting');
    }
  }

  assert.deepEqual(h.calls.outcomes, [true]);
  assert.deepEqual(h.calls.reputation, [0.5]);
  assert.equal(h.calls.finished, 1);
  assert.equal(h.scenario.galya, null);
  assert.equal(h.scenario.valera, null);
  assert.equal(h.galya.state, 'leaving');
  assert.equal(h.valera.state, 'leaving');
});

test('final boss scenario: failure и game over очищают клиентов без награды', () => {
  const h = finalBossHarness();
  h.scenario.spawn();
  h.scenario.finish(false);

  assert.deepEqual(h.calls.outcomes, [false]);
  assert.deepEqual(h.calls.reputation, []);
  assert.equal(h.calls.finished, 1);
  assert.equal(h.scenario.galya, null);
  assert.equal(h.scenario.valera, null);
  assert.equal(h.galya.state, 'leaving');
  assert.equal(h.valera.state, 'leaving');

  const gameOver = finalBossHarness();
  gameOver.scenario.spawn();
  gameOver.scenario.clearForGameOver();
  assert.equal(gameOver.scenario.galya, null);
  assert.equal(gameOver.scenario.valera, null);
  assert.equal(gameOver.galya.root.visible, false);
  assert.equal(gameOver.valera.label.visible, false);
});

function bossClientStub(kind: OrdinaryBossKind, order: any = null) {
  return {
    kind,
    order,
    state: 'waiting',
    isBoss: kind !== 'sanya',
    maxPatience: kind === 'sanya' ? 34 : 999,
    patience: kind === 'sanya' ? 34 : 999,
    patienceDrainMultiplier: 1,
    hasShouted: false,
    arrived: false,
    queueIndex: 0,
    bubbles: [] as string[],
    root: {
      visible: true,
      position: {
        x: 0, y: 0, z: 0,
        set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; },
      },
      rotation: { y: 0 },
    },
    label: {
      visible: true,
      element: {
        classList: {
          removed: [] as string[],
          remove(name: string) { this.removed.push(name); },
        },
      },
    },
    rig: {
      carries: [] as unknown[],
      setCarry(value: boolean, color?: string) { this.carries.push([value, color]); },
    },
    preplaceAtFront() { this.state = 'waiting'; },
    showBubble(text: string) { this.bubbles.push(text); },
    hideBubble() {},
    setTarget() {},
    isAt() { return this.arrived; },
    setPatience(value: number) { this.patience = value; },
    setQueueIndex(index: number) { this.queueIndex = index; },
    leave() { this.state = 'leaving'; },
  } as any;
}

function bossHarness(options: { shift?: number; nextStep?: number | null } = {}) {
  const calls = {
    prepared: [] as string[],
    added: 0,
    dequeued: 0,
    queueUpdates: 0,
    banners: [] as unknown[][],
    showBoss: [] as unknown[][],
    showZinaGame: [] as unknown[][],
    results: [] as unknown[][],
    bossSounds: 0,
    errorSounds: 0,
    clickSounds: 0,
    winSounds: 0,
    loseSounds: 0,
    modalOpen: 0,
    closeDialogue: 0,
    gameOver: 0,
    scannerCleared: 0,
    scannerCard: 0,
    scannerToast: 0,
    resumed: [] as unknown[],
    restock: 0,
    reserved: [] as string[],
    services: [] as { client: any; order: any }[],
    highlighted: [] as any[],
    breaks: [] as { seconds: number; next: number }[],
    endShift: 0,
    stress: [] as number[],
    reputation: [] as number[],
    bossDefeated: 0,
    huds: 0,
    stresses: 0,
    prompts: 0,
  };
  let shift = options.shift ?? 1;
  let nextStep = options.nextStep ?? null;
  let dialogueContext: 'client' | 'boss' | null = 'boss';
  let dialogueClient: any = null;
  let modalOpen = true;
  let pendingGameOver = false;
  let scannerPending = false;
  let scannerSeen = true;
  let orderId = 0;

  const boss = new BossEncounter();
  const zina = new ZinaPuzzleSystem();
  const created: any[] = [];
  const clients: any[] = [];
  const queue: any[] = [];
  const cell = { id: 'A-1', shelfIndex: 0, column: 0, level: 0 };
  const makeOrder = (count: number) => ({
    id: `order-${++orderId}`,
    cellId: `A-${count}`,
    items: Array.from({ length: count }, () => ({ picked: false })),
  } as any);

  const ui: any = {
    closePanels: () => {},
    banner: (...args: unknown[]) => calls.banners.push(args),
    showBoss: (...args: unknown[]) => calls.showBoss.push(args),
    showZinaGame: (...args: unknown[]) => calls.showZinaGame.push(args),
    renderZinaPuzzle: () => {},
    setZinaFeedback: () => {},
    updateZinaTimer: () => {},
    showBossResult: (...args: unknown[]) => calls.results.push(args),
    setOrderChip: () => {},
  };
  const sound: any = {
    boss: () => calls.bossSounds++,
    error: () => calls.errorSounds++,
    click: () => calls.clickSounds++,
    win: () => calls.winSounds++,
    lose: () => calls.loseSounds++,
  };

  const host: BossScenarioHost = {
    ui,
    sound,
    points: { queueFront: { x: 0.4, z: 1.15 } },
    phase: () => 'boss',
    shift: () => shift,
    isGameOver: () => false,
    isModalOpen: () => modalOpen,
    prepareEncounter: (kind) => {
      calls.prepared.push(kind);
      boss.begin(kind);
      if (kind === 'sanya') {
        boss.trigger();
        return makeOrder(4);
      }
      return null;
    },
    createClient: (kind, order) => {
      const client = bossClientStub(kind, order);
      created.push(client);
      return client;
    },
    addClient: (client: any) => {
      clients.push(client);
      queue.push(client);
      calls.added++;
    },
    dequeue: (client: any) => {
      calls.dequeued++;
      const index = queue.indexOf(client);
      if (index >= 0) queue.splice(index, 1);
    },
    updateQueue: () => calls.queueUpdates++,
    patienceMultiplier: () => 1,
    bossLine: () => 'Галя: ну и очередь!',
    zinaIntroLine: () => 'Помоги, милок',
    zinaSegments: () => [0, 1, 2, 3],
    zinaFiller: () => 4,
    zinaPuzzleTime: () => 75,
    zinaWinLine: () => 'win-line',
    zinaLoseLine: () => 'lose-line',
    expectedServeStress: () => 25,
    openBossModal: () => calls.modalOpen++,
    closeBossDialogue: () => {
      modalOpen = false;
      calls.closeDialogue++;
      return { context: dialogueContext, client: dialogueClient };
    },
    consumePendingGameOver: () => {
      const value = pendingGameOver;
      pendingGameOver = false;
      return value;
    },
    gameOver: () => calls.gameOver++,
    scannerBreakPending: () => scannerPending,
    clearScannerBreak: () => {
      scannerPending = false;
      calls.scannerCleared++;
    },
    scannerBreakSeen: () => scannerSeen,
    showScannerBreakCard: () => calls.scannerCard++,
    toastScannerBreak: () => calls.scannerToast++,
    resumeClientService: (client: any) => calls.resumed.push(client),
    restockCells: () => calls.restock++,
    findAvailableCell: (id) => (id === cell.id ? (cell as any) : null),
    pickZinaCell: () => cell as any,
    createZinaOrder: (value) => ({
      id: 'zina-order',
      cellId: value.id,
      items: [],
    } as any),
    reserveCell: (id) => calls.reserved.push(id),
    beginService: (client, order) => calls.services.push({ client, order }),
    scannerWorks: () => true,
    highlightOrder: (order) => calls.highlighted.push(order),
    nextStepIndex: () => nextStep,
    startBreak: (seconds, next) => calls.breaks.push({ seconds, next }),
    endShift: () => calls.endShift++,
    addStress: (amount) => calls.stress.push(amount),
    addReputation: (amount) => calls.reputation.push(amount),
    emitBossDefeated: () => calls.bossDefeated++,
    updateHud: () => calls.huds++,
    updateStressUi: () => calls.stresses++,
    updatePrompt: () => calls.prompts++,
  };

  return {
    scenario: new BossScenario(boss, zina, host),
    boss,
    zina,
    calls,
    created,
    clients,
    queue,
    cell,
    setShift: (value: number) => { shift = value; },
    setNextStep: (value: number | null) => { nextStep = value; },
    setDialogue: (context: 'client' | 'boss' | null, client: any = null) => {
      dialogueContext = context;
      dialogueClient = client;
    },
    setModal: (value: boolean) => { modalOpen = value; },
    setPendingGameOver: (value: boolean) => { pendingGameOver = value; },
    setScanner: (pending: boolean, seen: boolean) => {
      scannerPending = pending;
      scannerSeen = seen;
    },
  };
}

test('boss scenario: Галя появляется и открывает модалку у стойки', () => {
  const h = bossHarness({ shift: 1 });
  h.scenario.spawn('galya');

  assert.deepEqual(h.calls.prepared, ['galya']);
  assert.equal(h.calls.added, 1);
  const galya = h.scenario.bossClient!;
  assert.equal(galya.isBoss, true);
  galya.arrived = true;
  h.scenario.updateApproach();

  assert.equal(h.boss.triggered, true);
  assert.equal(h.calls.modalOpen, 1);
  assert.equal(h.calls.showBoss.length, 1);
  assert.equal(h.calls.showBoss[0]?.[2], 'Галя');
  assert.equal(h.calls.showBoss[0]?.[0], 25);
});

test('boss scenario: Зина запускает загадку, создаёт заказ и начинает service', () => {
  const h = bossHarness({ shift: 2 });
  h.scenario.spawn('zina');
  const zina = h.scenario.bossClient!;
  zina.arrived = true;
  h.scenario.updateApproach();

  assert.equal(h.zina.active, true);
  assert.equal(h.calls.showZinaGame.length, 1);
  h.scenario.finishZinaGame(true);
  assert.equal(h.scenario.zinaOrderPending, true);
  assert.equal(h.scenario.zinaPendingCellId, 'A-1');
  assert.deepEqual(h.calls.stress, [-8]);
  assert.deepEqual(h.calls.reputation, [0.2]);

  h.setDialogue('boss', null);
  h.scenario.onBossDone();
  assert.equal(h.calls.services.length, 1);
  assert.equal(h.scenario.zinaOrderPending, false);
  assert.equal(zina.isBoss, false);
  assert.equal(zina.order.cellId, 'A-1');
  assert.equal(h.calls.reserved[0], 'A-1');
  assert.equal(h.boss.triggered, true);
  assert.equal(h.calls.queueUpdates, 1);
});

test('boss scenario: провал Zina-загадки даёт стресс и не создаёт заказ', () => {
  const h = bossHarness({ shift: 2 });
  h.scenario.spawn('zina');
  h.scenario.bossClient!.arrived = true;
  h.scenario.updateApproach();
  h.scenario.finishZinaGame(false);

  assert.equal(h.scenario.zinaOrderPending, false);
  assert.deepEqual(h.calls.stress, [15]);
  assert.deepEqual(h.calls.reputation, [-0.5]);
  assert.equal(h.calls.results.at(-1)?.[2], false);
  assert.equal(h.calls.results.at(-1)?.[3], 'lose-line');
});

test('boss scenario: Саня создаёт заказ на 4 позиции и завершает шаг', () => {
  const h = bossHarness({ shift: 3 });
  h.scenario.spawn('sanya');
  const sanya = h.scenario.bossClient!;

  assert.equal(sanya.order.items.length, 4);
  assert.equal(sanya.patience, 34);
  assert.equal(sanya.isBoss, false);
  assert.equal(h.calls.added, 1);
  sanya.state = 'leaving';
  h.scenario.handleBossDelivery(sanya);
  assert.equal(h.calls.bossDefeated, 1);
  assert.equal(h.calls.endShift, 1);
  assert.equal(h.scenario.bossClient, null);
  assert.equal(sanya.state, 'leaving');
});

test('boss scenario: потеря Сани завершает шаг без bossDefeated', () => {
  const h = bossHarness({ shift: 3 });
  h.scenario.spawn('sanya');
  const sanya = h.scenario.bossClient!;
  assert.equal(h.scenario.handlePatienceZero(sanya), true);
  assert.equal(h.calls.bossDefeated, 0);
  assert.equal(h.calls.endShift, 1);
});

test('boss scenario: onBossDone обрабатывает game over и scanner break', () => {
  const gameOver = bossHarness({ shift: 1 });
  gameOver.scenario.spawn('galya');
  gameOver.setDialogue('boss', null);
  gameOver.setPendingGameOver(true);
  gameOver.scenario.onBossDone();
  assert.equal(gameOver.calls.gameOver, 1);
  assert.equal(gameOver.calls.endShift, 0);

  const scanner = bossHarness({ shift: 1 });
  scanner.scenario.spawn('galya');
  scanner.setDialogue('boss', null);
  scanner.setScanner(true, false);
  scanner.scenario.onBossDone();
  assert.equal(scanner.calls.scannerCard, 1);
  assert.equal(scanner.calls.endShift, 1);
});

function argumentClientStub() {
  return {
    willArgue: true,
    argueTriggered: false,
    isBoss: false,
    isMenu: false,
    state: 'waiting',
    archetype: { name: 'Клиент' },
    maxPatience: 30,
    patience: 20,
    bubbles: [] as string[],
    showBubble(text: string) { this.bubbles.push(text); },
    hideBubble() {},
    setPatience(value: number) { this.patience = value; },
  } as any;
}

function argumentHarness(options: {
  shift?: number;
  stress?: number;
  winThreshold?: number;
} = {}) {
  const calls = {
    openDialogue: 0,
    clientArgue: [] as unknown[][],
    bossArgue: 0,
    startMash: 0,
    taunts: [] as string[],
    results: [] as unknown[][],
    bossSounds: 0,
    loseSounds: 0,
    clickSounds: 0,
    winSounds: 0,
    resolveBoss: 0,
    resetZina: 0,
    breakScanner: 0,
    pendingGameOver: 0,
    stress: [] as number[],
    reputation: [] as number[],
    buff: [] as number[],
    scanSpeed: [] as number[],
    bossDefeated: 0,
    argumentResolved: [] as { kind: string; won: boolean }[],
    huds: 0,
    stresses: 0,
    prompts: 0,
  };
  let shift = options.shift ?? 2;
  let stress = options.stress ?? 20;
  let modalOpen = true;
  let bossResolved = false;
  let excluded = false;
  const system = new ArgumentSystem();
  const client = argumentClientStub();
  const bossClient = {
    bubbles: [] as string[],
    showBubble(text: string) { this.bubbles.push(text); },
  } as any;

  const ui: any = {
    showClientArgue: (...args: unknown[]) => calls.clientArgue.push(args),
    showBossArgue: () => calls.bossArgue++,
    startBossMash: () => calls.startMash++,
    setBossMarker: () => {},
    pushBossTaunt: (line: string) => calls.taunts.push(line),
    updateBossTimer: () => {},
    showBossResult: (...args: unknown[]) => calls.results.push(args),
  };
  const sound: any = {
    boss: () => calls.bossSounds++,
    lose: () => calls.loseSounds++,
    click: () => calls.clickSounds++,
    win: () => calls.winSounds++,
  };

  const host: ArgumentScenarioHost = {
    ui,
    sound,
    shift: () => shift,
    charm: () => 0,
    phase: () => 'boss',
    isModalOpen: () => modalOpen,
    isGameOver: () => false,
    bossResolved: () => bossResolved,
    resolveBoss: () => {
      bossResolved = true;
      calls.resolveBoss++;
    },
    resetZina: () => calls.resetZina++,
    bossClient: () => bossClient,
    queueFront: () => client,
    serviceActive: () => false,
    carryingReturn: () => false,
    isExcludedClient: () => excluded,
    openDialogue: () => calls.openDialogue++,
    breakScanner: () => calls.breakScanner++,
    setPendingGameOver: () => calls.pendingGameOver++,
    stress: () => stress,
    setStress: (value) => {
      stress = value;
    },
    addStress: (amount) => {
      stress = Math.max(0, Math.min(100, stress + amount));
      calls.stress.push(amount);
    },
    addReputation: (amount) => calls.reputation.push(amount),
    setBuff: (seconds) => calls.buff.push(seconds),
    setScanSpeed: (value) => calls.scanSpeed.push(value),
    emitBossDefeated: () => calls.bossDefeated++,
    emitArgumentResolved: (kind, won) =>
      calls.argumentResolved.push({ kind, won }),
    updateHud: () => calls.huds++,
    updateStressUi: () => calls.stresses++,
    updatePrompt: () => calls.prompts++,
  };

  const rules = {
    mashDuration: 6,
    winThreshold: options.winThreshold ?? 0.03,
    startValue: () => 0,
    serveStress: () => 20,
    concedeStress: () => 4,
    pushback: () => 0,
  };
  const lines = {
    client: () => 'client-line',
    clientConcede: () => 'concede-line',
    clientWin: () => 'client-win-line',
    clientLose: () => 'client-lose-line',
    clientTaunts: ['client-taunt-0', 'client-taunt-1'],
    bossTaunts: ['boss-taunt-0', 'boss-taunt-1'],
    bossServed: 'boss-served-line',
    bossWin: 'boss-win-line',
    bossLose: 'boss-lose-line',
  };

  return {
    scenario: new ArgumentScenario(system, host, rules, lines),
    system,
    client,
    bossClient,
    calls,
    getStress: () => stress,
    setShift: (value: number) => { shift = value; },
    setModal: (value: boolean) => { modalOpen = value; },
    setExcluded: (value: boolean) => { excluded = value; },
  };
}

test('argument scenario: клиентский спор стартует, уступает и закрывается', () => {
  const h = argumentHarness();
  assert.equal(h.scenario.tryStartClientArgument(h.client), true);
  assert.equal(h.system.context, 'client');
  assert.equal(h.client.argueTriggered, true);
  assert.equal(h.calls.openDialogue, 1);
  assert.equal(h.client.bubbles.at(-1), 'client-line');

  h.scenario.onBossServe();
  assert.equal(h.system.isResolved, true);
  assert.equal(h.getStress(), 24);
  assert.equal(h.calls.results.at(-1)?.[0], 'Вы уступили');
  assert.deepEqual(h.calls.argumentResolved.at(-1), { kind: 'client', won: false });

  const closed = h.scenario.closeDialogue();
  assert.equal(closed.context, 'client');
  assert.equal(closed.client, h.client);
  assert.equal(h.scenario.argueClient, null);

  const early = argumentHarness({ shift: 1 });
  assert.equal(early.scenario.tryStartClientArgument(early.client), false);
});

test('argument scenario: клиентский mash даёт победу и поражение', () => {
  const win = argumentHarness();
  win.scenario.tryStartClientArgument(win.client);
  win.scenario.onBossArgue();
  for (let index = 0; index < 3; index++) win.scenario.mash();
  win.scenario.update(10);
  assert.deepEqual(win.calls.argumentResolved.at(-1), { kind: 'client', won: true });
  assert.equal(win.client.patience, 25);
  assert.deepEqual(win.calls.reputation, [0.1]);
  assert.equal(win.getStress(), 12);

  const loss = argumentHarness({ winThreshold: 0.5 });
  loss.scenario.tryStartClientArgument(loss.client);
  loss.scenario.onBossArgue();
  loss.scenario.update(10);
  assert.deepEqual(loss.calls.argumentResolved.at(-1), { kind: 'client', won: false });
  assert.equal(loss.client.patience, 16);
  assert.deepEqual(loss.calls.reputation, [-0.2]);
  assert.equal(loss.getStress(), 30);
});

test('argument scenario: обслуживание Гали даёт стресс и ломает сканер', () => {
  const h = argumentHarness({ shift: 1, stress: 20 });
  h.scenario.onBossServe();
  assert.equal(h.calls.resolveBoss, 1);
  assert.equal(h.calls.breakScanner, 1);
  assert.equal(h.getStress(), 40);
  assert.equal(h.calls.results.at(-1)?.[0], 'Обслужили');
  assert.equal(h.calls.loseSounds, 1);
});

test('argument scenario: победа над Галей даёт buff, репутацию события и scanner break', () => {
  const h = argumentHarness({ shift: 1, stress: 20 });
  h.scenario.onBossArgue();
  for (let index = 0; index < 20; index++) h.scenario.mash();
  h.scenario.update(10);

  assert.equal(h.calls.resolveBoss, 1);
  assert.equal(h.calls.resetZina, 1);
  assert.equal(h.calls.breakScanner, 1);
  assert.deepEqual(h.calls.buff, [20]);
  assert.deepEqual(h.calls.scanSpeed, [1.5]);
  assert.equal(h.getStress(), 0);
  assert.equal(h.calls.bossDefeated, 1);
  assert.deepEqual(h.calls.argumentResolved.at(-1), { kind: 'boss', won: true });
  assert.equal(h.calls.results.at(-1)?.[0], 'Вы победили в споре!');
});

test('argument scenario: поражение Гале выставляет pending game over при высоком стрессе', () => {
  const h = argumentHarness({ shift: 2, stress: 60 });
  h.scenario.onBossArgue();
  h.scenario.update(10);

  assert.equal(h.getStress(), 100);
  assert.equal(h.calls.pendingGameOver, 1);
  assert.equal(h.calls.bossDefeated, 0);
  assert.deepEqual(h.calls.argumentResolved.at(-1), { kind: 'boss', won: false });
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
