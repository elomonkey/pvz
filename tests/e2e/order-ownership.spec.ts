import { expect, test, type Page } from '@playwright/test';

async function setup(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => localStorage.setItem('pvz_tycoon_tutorial_done', '1'));
  await page.goto('/');
  await page.getByRole('button', { name: 'Начать смену', exact: true }).click();
  await page.waitForFunction(() => window.game.queue.length > 0);
  await page.evaluate(() => {
    const g = (window as any).game, client = g.queue[0];
    g.renderer.setAnimationLoop(null);
    client.preplaceAtFront();
    g.releaseOrder(client.order);
    client.order = g.createOrder(false, 2);
    client.order.scanned = true;
    g.service.begin(client, client.order);
    g.movement.snapTo(g.world.shelves[client.order.shelf].interaction);
    g.openCellPanelFor(client.order);
  });
  return errors;
}

async function takeCurrentItem(page: Page) {
  const id = await page.evaluate(() => (window as any).game.service.active.order.cellId);
  await page.locator(`[data-cell-id="${id}"]`).click();
  return id;
}

test('a partial multi-cell order cannot be delivered; the full order can', async ({ page }, testInfo) => {
  const errors = await setup(page);
  expect(await page.evaluate(() => (window as any).game.service.remainingItems().length)).toBe(2);
  const firstId = await takeCurrentItem(page);
  const partial = await page.evaluate(() => {
    const g = (window as any).game, active = g.service.active;
    const before = { served: g.run.served, reputation: g.run.reputation, stress: g.run.stress };
    g.deliver(); // Must reject a partial stack even though carrying is true.
    const unchanged = before.served === g.run.served && before.reputation === g.run.reputation && before.stress === g.run.stress;
    g.handleArrival({ type: 'service', client: active.client });
    return { carrying: g.service.carrying, ready: g.service.readyToDeliver, remaining: g.service.remainingItems().length, sameSession: g.service.active === active, unchanged };
  });
  expect(partial).toEqual({ carrying: true, ready: false, remaining: 1, sameSession: true, unchanged: true });
  await expect(page.locator('#scanner-result-view')).toBeVisible();
  await page.evaluate(() => {
    const g = (window as any).game, order = g.service.active.order;
    g.movement.snapTo(g.world.shelves[order.shelf].interaction);
    g.openCellPanelFor(order);
  });
  await expect(page.locator('#cell-panel')).toBeVisible();
  const secondId = await takeCurrentItem(page);
  expect(secondId).not.toBe(firstId);
  const complete = await page.evaluate(() => {
    const g = (window as any).game;
    return { carrying: g.service.carrying, ready: g.service.readyToDeliver, remaining: g.service.remainingItems().length, colors: [...g.service.carryColors] };
  });
  expect(complete).toMatchObject({ carrying: true, ready: true, remaining: 0 });
  expect(complete.colors).toHaveLength(2);
  await page.evaluate(() => {
    const g = (window as any).game, active = g.service.active;
    g.openCellPanelFor(active.order);
    g.handleArrival({ type: 'service', client: active.client });
  });
  await expect(page.locator('#cell-panel')).toBeHidden();
  await expect(page.locator('#hud-served')).toHaveText('1');
  expect(await page.evaluate(() => {
    const s = (window as any).game.service;
    return { active: s.active, carrying: s.carrying, ready: s.readyToDeliver, colors: [...s.carryColors] };
  })).toEqual({ active: null, carrying: false, ready: false, colors: [] });
  await testInfo.attach('partial-and-complete', { body: JSON.stringify({ partial, complete }), contentType: 'application/json' });
  expect(errors).toEqual([]);
});

for (const picked of [false, true]) {
  test(`cancel ${picked ? 'with a partial stack restocks shelves' : 'before pickup leaves shelf stock unchanged'}`, async ({ page }, testInfo) => {
    const errors = await setup(page);
    const fixture = await page.evaluate(() => {
      const g = (window as any).game;
      const unrelated = g.world.cells.find((cell: any) => g.warehouse.isAvailable(cell.id, g.progression.activeShelfCount));
      g.setCellStock(unrelated.id, false); // An empty cell left by an earlier delivery.
      return { empty: unrelated.id, first: g.service.active.order.cellId, queue: g.queue.map((c: any) => c.id), served: g.run.served, reputation: g.run.reputation, stress: g.run.stress };
    });
    if (picked) await takeCurrentItem(page);
    const result = await page.evaluate(({ empty, first }) => {
      const g = (window as any).game, order = g.service.active.order;
      g.openCellPanelFor(order);
      const before = { carrying: g.service.carrying, ready: g.service.readyToDeliver };
      g.cancelActiveOrder();
      let visibleCarried = 0;
      g.player.root.traverseVisible((o: any) => { if (o.userData.carryParcel !== undefined) visibleCarried++; });
      return {
        before, active: g.service.active, carrying: g.service.carrying, ready: g.service.readyToDeliver,
        colors: [...g.service.carryColors], returnInHand: g.service.carryingReturn, visibleCarried,
        firstVisible: g.world.cells.find((c: any) => c.id === first).parcel.visible,
        unrelatedVisible: g.world.cells.find((c: any) => c.id === empty).parcel.visible,
        released: order.released, reserved: order.items.some((item: any) => g.warehouse.isReserved(item.cellId) || g.warehouse.isReserved(item.actualCellId)),
        picked: order.items.filter((item: any) => item.picked).length,
        queue: g.queue.map((c: any) => c.id), served: g.run.served, reputation: g.run.reputation, stress: g.run.stress,
      };
    }, fixture);
    expect(result).toMatchObject({
      before: { carrying: picked, ready: false }, active: null, carrying: false, ready: false,
      colors: [], returnInHand: false, visibleCarried: 0, firstVisible: true, unrelatedVisible: picked,
      released: true, reserved: false, picked: picked ? 1 : 0,
      queue: fixture.queue, served: fixture.served, reputation: fixture.reputation, stress: fixture.stress,
    });
    await expect(page.locator('#cell-panel')).toBeHidden();
    await expect(page.locator('#scanner-panel')).toBeHidden();
    await testInfo.attach('cancel-snapshot', { body: JSON.stringify(result), contentType: 'application/json' });
    expect(errors).toEqual([]);
  });
}
