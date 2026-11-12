import { expect, test as base, type Page } from '@playwright/test';

const test = base.extend<{ browserErrors: string[] }>({
  browserErrors: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('pageerror', error => errors.push(error.message));
    try { await use(errors); }
    finally { expect(errors, 'console.error and pageerror').toEqual([]); }
  }, { auto: true }],
});

test.use({ viewport: { width: 1400, height: 900 } });

async function start(page: Page) {
  await page.addInitScript(() => localStorage.setItem('pvz_tycoon_tutorial_done', '1'));
  await page.goto('/');
  await page.getByRole('button', { name: 'Начать смену', exact: true }).click();
  await page.waitForFunction(() => {
    const g = (window as any).game;
    return g.queue[0] && g.isServableFront(g.queue[0]);
  });
  // Observe the real input dispatch; always retain its original game behavior.
  await page.evaluate(() => {
    const g = (window as any).game;
    (window as any).picks = [];
    const original = g.handleClickData.bind(g);
    g.handleClickData = (data: any, point: any) => {
      (window as any).picks.push({ type: data.type, shelfIndex: data.shelfIndex, cellId: data.cellId });
      original(data, point);
    };
  });
}

async function lastPick(page: Page) {
  return page.evaluate(() => (window as any).picks.at(-1));
}

test('hidden shelf C lets a real canvas click reach the floor and move the player', async ({ page }, testInfo) => {
  await start(page);
  const before = await page.evaluate(() => {
    const g = (window as any).game;
    return { ...g.movement.position, hidden: !g.world.shelves[2].group.visible };
  });
  expect(before.hidden).toBe(true);
  await expect(page.locator('#game-canvas')).toBeVisible();
  // Project the hidden C's lowest middle parcel into the real canvas. This
  // remains a regression for invisible picking when the room/camera is resized.
  const hiddenPoint = await page.evaluate(() => {
    const g = (window as any).game;
    g.scene.updateMatrixWorld(true);
    const cell = g.world.cells.find((c: any) => c.shelfIndex === 2 && c.column === 1 && c.level === 0);
    const p = cell.parcel.getWorldPosition(cell.center.clone()).project(g.camera);
    const r = g.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (p.x + 1) * r.width / 2, y: r.top + (1 - p.y) * r.height / 2 };
  });
  await page.mouse.click(hiddenPoint.x, hiddenPoint.y);
  expect(await lastPick(page)).toMatchObject({ type: 'floor' });
  await expect(page.getByText('Сначала отсканируйте заказ', { exact: true })).toHaveCount(0);
  await expect.poll(() => page.evaluate(({ x, z }) => {
    const p = (window as any).game.movement.position;
    return Math.hypot(p.x - x, p.z - z);
  }, before)).toBeGreaterThan(0.05);
  await testInfo.attach('hidden-C-click', { body: await page.screenshot(), contentType: 'image/png' });
  const visiblePoint = await page.evaluate(() => {
    const g = (window as any).game;
    const shelf = g.world.shelves[1].group;
    const p = shelf.position.clone().set(-0.2, 2.1, 0.23).applyMatrix4(shelf.matrixWorld).project(g.camera);
    const r = g.renderer.domElement.getBoundingClientRect();
    return { x: r.left + (p.x + 1) * r.width / 2, y: r.top + (1 - p.y) * r.height / 2 };
  });
  await page.mouse.click(visiblePoint.x, visiblePoint.y);
  expect(await lastPick(page)).toMatchObject({ type: 'shelf', shelfIndex: 1 });
});

test('visible shelf opens cells; a picked parcel no longer receives canvas clicks', async ({ page }, testInfo) => {
  await start(page);
  await page.locator('.client-tag').first().click();
  await expect(page.locator('#scanner-panel')).toBeVisible();
  await page.locator('#scan-hold').hover();
  await page.mouse.down();
  try { await expect(page.locator('#scanner-result-view')).toBeVisible(); }
  finally { await page.mouse.up(); }
  const id = (await page.locator('#scan-cell').innerText()).trim();
  await page.locator('#scan-ok').click();
  const point = await page.evaluate(id => {
    const g = (window as any).game;
    g.scene.updateMatrixWorld(true);
    const cell = g.world.cells.find((c: any) => c.id === id);
    const p = cell.parcel.getWorldPosition(cell.center.clone()).project(g.camera);
    const rect = g.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + (p.x + 1) * rect.width / 2, y: rect.top + (1 - p.y) * rect.height / 2, shelf: cell.shelfIndex };
  }, id);
  await page.mouse.click(point.x, point.y);
  expect(await lastPick(page)).toMatchObject({ type: 'cell', cellId: id, shelfIndex: point.shelf });
  await expect(page.locator('#cell-panel')).toBeVisible();
  await page.locator(`[data-cell-id="${id}"]`).click();
  await expect(page.locator('#cell-panel')).toBeHidden();
  expect(await page.evaluate(id => {
    const g = (window as any).game;
    return !g.world.cells.find((c: any) => c.id === id).parcel.visible && g.service.carrying;
  }, id)).toBe(true);
  await page.mouse.click(point.x, point.y);
  // The shelf behind the removed parcel remains clickable, but not the parcel.
  expect(await lastPick(page)).toMatchObject({ type: 'shelf', shelfIndex: point.shelf });
  await testInfo.attach('visible-shelf-after-pickup', { body: await page.screenshot(), contentType: 'image/png' });
});

test('a hidden client parent prevents its visible child meshes receiving clicks', async ({ page }) => {
  await start(page);
  const point = await page.evaluate(() => {
    const g = (window as any).game;
    g.renderer.setAnimationLoop(null); // Keep both control clicks in the same frame.
    g.scene.updateMatrixWorld(true);
    const p = g.queue[0].rig.head.getWorldPosition(g.player.root.position.clone()).project(g.camera);
    const rect = g.renderer.domElement.getBoundingClientRect();
    return { x: rect.left + (p.x + 1) * rect.width / 2, y: rect.top + (1 - p.y) * rect.height / 2 };
  });
  await page.mouse.click(point.x, point.y);
  expect(await lastPick(page)).toMatchObject({ type: 'client' });
  const count = await page.evaluate(() => {
    const g = (window as any).game;
    g.queue[0].root.visible = false;
    return (window as any).picks.length;
  });
  await page.mouse.click(point.x, point.y);
  const next = await page.evaluate(count => (window as any).picks.slice(count), count);
  expect(next.length).toBeGreaterThan(0);
  expect(next.every((pick: any) => pick.type !== 'client')).toBe(true);
});
