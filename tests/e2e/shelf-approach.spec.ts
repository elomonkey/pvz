import { expect, test, type Page } from '@playwright/test';

async function prepare(page: Page, search = false) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => {
    for (const key of ['tutorial_done', 'results_intro_seen', 'argue_intro_seen', 'shift4_intro_seen', 'scanner_break_seen']) {
      localStorage.setItem(`pvz_tycoon_${key}`, '1');
    }
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Начать смену', exact: true }).click();
  await page.waitForFunction(() => (window as any).game.queue.length > 0);
  const before = await page.evaluate((isSearch) => {
    const g = (window as any).game;
    g.renderer.setAnimationLoop(null);
    g.queue[0].preplaceAtFront();
    g.releaseOrder(g.queue[0].order);
    g.warehouse.reserved.clear();
    for (const cell of g.world.cells) g.warehouse.setStock(cell.id, cell.id === 'B-4-1');
    const original = Math.random;
    let order: any;
    try {
      Math.random = () => 0;
      order = g.createOrder(false, 1);
    } finally {
      Math.random = original;
    }
    g.warehouse.setStock('B-1-1', true);
    if (isSearch) {
      order.searchMode = true;
      order.actualCellId = 'B-4-1';
    }
    const client = g.queue[0];
    client.order = order;
    order.scanned = true;
    g.service.begin(client, order);
    g.onShelfClick(order.shelf);
    for (let step = 0; step < 500; step++) {
      g.update(0.05);
      if (g.pendingAction === null && !document.getElementById('cell-panel').classList.contains('hidden')) break;
    }
    const cell = (id: string) => {
      const value = g.world.cells.find((item: any) => item.id === id);
      return { x: value.center.x, z: value.center.z, stock: g.warehouse.hasStock(id) };
    };
    return {
      panelVisible: !document.getElementById('cell-panel').classList.contains('hidden'),
      player: { x: g.playerRoot.position.x, z: g.playerRoot.position.z },
      b1: cell('B-1-1'),
      b4: cell('B-4-1'),
    };
  }, search);

  async function takeAndFinish() {
    await page.locator('[data-cell-id="B-4-1"]').click();
    await page.evaluate(() => {
      const g = (window as any).game;
      for (let step = 0; step < 400 && !g.service.readyToDeliver; step++) g.update(0.05);
    });
    return page.evaluate(() => {
      const g = (window as any).game;
      const cell = (id: string) => {
        const value = g.world.cells.find((item: any) => item.id === id);
        return { x: value.center.x, z: value.center.z, stock: g.warehouse.hasStock(id) };
      };
      return {
        ready: g.service.readyToDeliver,
        player: { x: g.playerRoot.position.x, z: g.playerRoot.position.z },
        b1: cell('B-1-1'),
        b4: cell('B-4-1'),
      };
    });
  }

  return { before, takeAndFinish, errors };
}

test('normal shelf click approaches the requested column, not the first one', async ({ page }) => {
  const { before, takeAndFinish, errors } = await prepare(page);
  expect(before.panelVisible).toBe(true);
  expect(Math.abs(before.player.x - before.b4.x)).toBeLessThan(0.6);
  expect(Math.abs(before.player.x - before.b4.x)).toBeLessThan(Math.abs(before.player.x - before.b1.x));

  const after = await takeAndFinish();
  expect(after).toMatchObject({ ready: true, b1: { stock: true }, b4: { stock: false } });
  expect(Math.abs(after.player.x - after.b4.x)).toBeLessThan(0.6);
  expect(errors).toEqual([]);
});

test('search result also walks to the actual column before taking the parcel', async ({ page }) => {
  const { before, takeAndFinish, errors } = await prepare(page, true);
  expect(before.panelVisible).toBe(true);

  const after = await takeAndFinish();
  expect(after).toMatchObject({ ready: true, b1: { stock: true }, b4: { stock: false } });
  expect(Math.abs(after.player.x - after.b4.x)).toBeLessThan(0.6);
  expect(errors).toEqual([]);
});
