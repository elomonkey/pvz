import { expect, test as base, type Page } from '@playwright/test';

const test = base.extend<{ browserErrors: string[] }>({
  browserErrors: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    try { await use(errors); }
    finally { expect(errors, 'console.error / pageerror').toEqual([]); }
  }, { auto: true }],
});

async function setup(page: Page) {
  await page.addInitScript(() => {
    for (const key of ['pvz_tycoon_tutorial_done', 'pvz_tycoon_shift4_intro_seen']) localStorage.setItem(key, '1');
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Начать смену', exact: true }).click();
  await page.waitForFunction(() => (window as any).game.queue.length > 0);
  await page.evaluate(() => {
    const g = (window as any).game;
    g.renderer.setAnimationLoop(null);
    g.queue[0].preplaceAtFront();
    g.releaseOrder(g.queue[0].order);
    g.reservedCells.clear();
    // Observe validity against reservations BEFORE allocation: afterwards the
    // new order correctly owns reservations for all its requested/actual IDs.
    (window as any).allocationSnapshot = (order: any, reserved: Set<string>) => order.items.map((item: any) => {
      const valid = (id: string) => {
        const c = g.world.cells.find((cell: any) => cell.id === id);
        return !!c && c.shelfIndex < g.progression.activeShelfCount && c.parcel.visible && !reserved.has(id);
      };
      return { id: item.cellId, actual: item.actualCellId, shelf: item.shelf,
        valid: valid(item.cellId) && valid(item.actualCellId),
        reserved: g.reservedCells.has(item.cellId) && g.reservedCells.has(item.actualCellId) };
    });
  });
}

test('almost empty stock allocates its only parcel and the order can be collected and delivered', async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(() => {
    const g = (window as any).game;
    for (const c of g.world.cells) c.parcel.visible = c.id === 'B-4-1';
    const reserved = new Set<string>(g.reservedCells);
    const original = Math.random;
    let order: any;
    try { Math.random = () => 0; order = g.createOrder(false, 1); }
    finally { Math.random = original; }
    const snapshot = (window as any).allocationSnapshot(order, reserved);
    const client = g.queue[0];
    client.order = order;
    order.scanned = true;
    g.service.begin(client, order);
    g.movement.snapTo(g.world.shelves[order.shelf].interaction);
    g.openCellPanelFor(order);
    return snapshot;
  });
  expect(result).toEqual([{ id: 'B-4-1', actual: 'B-4-1', shelf: 1, valid: true, reserved: true }]);
  await expect(page.locator('#cell-panel')).toBeVisible();
  await page.locator('[data-cell-id="B-4-1"]').click();
  expect(await page.evaluate(() => (window as any).game.service.readyToDeliver)).toBe(true);
  await page.evaluate(() => {
    const g = (window as any).game;
    g.handleArrival({ type: 'service', client: g.queue[0] });
  });
  await expect(page.locator('#hud-served')).toHaveText('1');
  expect(await page.evaluate(() => (window as any).game.service.active)).toBeNull();
});

test('stock shortage triggers one restock, preserves reservations and shrinks to real availability', async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(() => {
    const g = (window as any).game;
    const keep = ['A-1-1', 'B-4-1'];
    for (const cell of g.world.cells) {
      cell.parcel.visible = cell.id === keep[0];
      if (!keep.includes(cell.id)) g.reservedCells.add(cell.id);
    }
    const reserved = new Set<string>(g.reservedCells);
    let restocks = 0;
    const restock = g.restockCells.bind(g);
    g.restockCells = () => { restocks++; restock(); };
    const order = g.createOrder(false, 3);
    return { restocks, snapshot: (window as any).allocationSnapshot(order, reserved),
      keptReservations: [...reserved].every(id => g.reservedCells.has(id)) };
  });
  expect(result.restocks).toBe(1);
  expect(result.keptReservations).toBe(true);
  expect(result.snapshot.map((i: any) => i.id).sort()).toEqual(['A-1-1', 'B-4-1']);
  expect(result.snapshot.every((i: any) => i.valid && i.reserved)).toBe(true);
});

test('mixed actual cell is available, unreserved and on the requested shelf', async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(() => {
    const g = (window as any).game;
    const keep = ['A-1-1', 'A-2-1', 'B-1-1'];
    for (const c of g.world.cells) c.parcel.visible = keep.includes(c.id) || c.shelfIndex === 2;
    g.reservedCells.add('A-1-2');
    const reserved = new Set<string>(g.reservedCells);
    const original = Math.random;
    try {
      Math.random = () => 0;
      const order = g.createOrder(true, 1);
      return { mixed: order.mixed, snapshot: (window as any).allocationSnapshot(order, reserved) };
    } finally { Math.random = original; }
  });
  expect(result.mixed).toBe(true);
  expect(result.snapshot).toEqual([{ id: 'A-1-1', actual: 'A-2-1', shelf: 0, valid: true, reserved: true }]);
});

test('final barcodes keep 2/3/4 items on normal stock and fall back or shrink on shortage', async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(() => {
    const g = (window as any).game;
    g.debugSetShift(5);
    g.clearClients();
    const normal = [2, 3, 4].map(count => {
      g.restockCells();
      const reserved = new Set<string>(g.reservedCells);
      const order = g.createFinalBossBarcodeOrder(count);
      const snapshot = (window as any).allocationSnapshot(order, reserved);
      g.releaseOrder(order);
      return { count, snapshot };
    });
    for (const c of g.world.cells) if (c.shelfIndex === 0) g.reservedCells.add(c.id);
    const beforeFallback = new Set<string>(g.reservedCells);
    const fallback = g.createFinalBossBarcodeOrder(4);
    const fallbackSnapshot = (window as any).allocationSnapshot(fallback, beforeFallback);
    g.releaseOrder(fallback);
    const keep = ['B-1-1', 'C-1-1'];
    for (const c of g.world.cells) {
      c.parcel.visible = false;
      if (!keep.includes(c.id)) g.reservedCells.add(c.id);
    }
    const beforeDeficit = new Set<string>(g.reservedCells);
    const deficit = g.createFinalBossBarcodeOrder(4);
    return { normal, fallback: fallbackSnapshot, deficit: (window as any).allocationSnapshot(deficit, beforeDeficit) };
  });
  for (const { count, snapshot } of result.normal) {
    expect(snapshot).toHaveLength(count);
    expect(snapshot.slice(0, Math.min(3, count)).map((i: any) => i.shelf)).toEqual([0, 1, 2].slice(0, count));
    expect(new Set(snapshot.map((i: any) => i.id)).size).toBe(count);
    expect(snapshot.every((i: any) => i.valid && i.reserved)).toBe(true);
  }
  expect(result.fallback).toHaveLength(4);
  expect(result.fallback.every((i: any) => i.shelf > 0 && i.valid && i.reserved)).toBe(true);
  expect(result.deficit.map((i: any) => i.id).sort()).toEqual(['B-1-1', 'C-1-1']);
  expect(result.deficit.every((i: any) => i.valid && i.reserved)).toBe(true);
});

test('fully reserved stock returns null without a client; the queued arrival resumes after release', async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(() => {
    const g = (window as any).game;
    for (const c of g.world.cells) g.reservedCells.add(c.id);
    const reserved = new Set<string>(g.reservedCells);
    const normal = g.createOrder(false, 3);
    const final = g.createFinalBossBarcodeOrder(4);
    const unchanged = [...reserved].every(id => g.reservedCells.has(id)) && reserved.size === g.reservedCells.size;
    const config = { archetype: g.queue[0].archetype, mixed: false, patience: 35 };
    g.spawnQueue = [config];
    const before = g.queue.length;
    g.spawnNext();
    const waiting = g.spawnQueue.length === 1 && g.spawnQueue[0] === config && g.queue.length === before;
    g.reservedCells.delete('B-4-1');
    const beforeResume = new Set<string>(g.reservedCells);
    g.updateSpawning(5);
    return { normal, final, unchanged, waiting, before, after: g.queue.length, pending: g.spawnQueue.length,
      snapshot: (window as any).allocationSnapshot(g.queue.at(-1).order, beforeResume) };
  });
  expect(result).toMatchObject({ normal: null, final: null, unchanged: true, waiting: true, pending: 0 });
  expect(result.after).toBe(result.before + 1);
  expect(result.snapshot).toEqual([{ id: 'B-4-1', actual: 'B-4-1', shelf: 1, valid: true, reserved: true }]);
});

test('Queen entrance and fitting return wait for a real order before changing state', async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(() => {
    const g = (window as any).game;
    g.debugSetShift(4);
    g.clearClients();
    g.director.enterStep(1); // Wave 2, when the Queen normally enters.
    for (const c of g.world.cells) g.reservedCells.add(c.id);
    g.spawnQueen();
    const entranceWaiting = !g.queen.spawned && g.queenClient === null;
    g.reservedCells.delete('A-1-1');
    g.updateQueen(.01);
    const q = g.queenClient;
    const entrance = q?.order?.items.map((i: any) => i.cellId);
    g.updateQueen(.01);
    const onlyOneQueen = g.queue.filter((c: any) => c === q).length === 1;
    g.releaseOrder(q.order);
    q.order = null;
    g.removeFromQueue(q);
    q.state = 'gone';
    g.queen.startFitting(0, () => 1);
    g.queen.startFitting(0, () => 1); // Choose the new-order return, not a parcel return.
    for (const c of g.world.cells) g.reservedCells.add(c.id);
    g.returnQueen();
    const returnWaiting = q.state === 'gone' && q.order === null && g.queen.inFitting;
    g.reservedCells.delete('B-4-1');
    const reserved = new Set<string>(g.reservedCells);
    g.updateQueen(.01);
    return { entranceWaiting, entrance, onlyOneQueen, returnWaiting, state: q.state,
      snapshot: (window as any).allocationSnapshot(q.order, reserved) };
  });
  expect(result).toMatchObject({ entranceWaiting: true, entrance: ['A-1-1'], onlyOneQueen: true, returnWaiting: true, state: 'entering' });
  expect(result.snapshot).toEqual([{ id: 'B-4-1', actual: 'B-4-1', shelf: 1, valid: true, reserved: true }]);
});

test('final barcode waits at the same index until an active cell is released', async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(() => {
    const g = (window as any).game;
    g.debugSetShift(5);
    g.debugBoss();
    for (const c of g.world.cells) g.reservedCells.add(c.id);
    g.onFinalBossDialogueDone();
    g.updateFinalBoss(.01);
    const waiting = g.finalBoss.stage === 'collect' && g.finalBoss.barcode === 0 &&
      g.finalBossOrder === null && g.finalBossGalya.order === null;
    g.reservedCells.delete('C-1-1');
    const reserved = new Set<string>(g.reservedCells);
    g.updateFinalBoss(.01);
    const order = g.finalBossOrder;
    const snapshot = (window as any).allocationSnapshot(order, reserved);
    g.updateFinalBoss(.01);
    return { waiting, barcode: g.finalBoss.barcode, sameOrder: g.finalBossOrder === order,
      sameClientOrder: g.finalBossGalya.order === order, snapshot };
  });
  expect(result).toMatchObject({ waiting: true, barcode: 0, sameOrder: true, sameClientOrder: true });
  expect(result.snapshot).toEqual([{ id: 'C-1-1', actual: 'C-1-1', shelf: 2, valid: true, reserved: true }]);
});
