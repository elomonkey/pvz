import { expect, test, type Page } from '@playwright/test';

const banners = [
  ['Королева примерочной', 'Она занимает примерочные, злит очередь и приносит возвраты.', 'demanding'],
  ['Королева вернулась', 'Она снова впереди и с новыми товарами.', 'demanding'],
  ['Королева вернулась с возвратом', 'Заберите возврат и отнесите его в шкафчик «Возврат».', 'annoyed'],
  ['Королева ушла', 'Примерочные открыты. Обычные клиенты тоже могут ими пользоваться.', 'satisfied'],
] as const;

for (const viewport of [{ width: 1400, height: 900 }, { width: 390, height: 844 }]) {
  test(`Королева: вход при обычном переходе ко второй волне (${viewport.width})`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      for (const key of ['pvz_tycoon_tutorial_done', 'pvz_tycoon_shift4_intro_seen']) localStorage.setItem(key, '1');
    });
    await page.goto('/');
    await page.waitForFunction(() => window.game);
    const state = await page.evaluate(() => {
      const g = (window as any).game;
      g.renderer.setAnimationLoop(null);
      g.debugSetShift(4);
      g.update(1.3); // First wave, through the actual director.
      const first = document.getElementById('banner-title')!.textContent;
      g.clearClients();
      g.spawnQueue = []; // Skip serving the remaining first-wave clients only.
      g.update(.01); // Normal checkWaveComplete -> break.
      const between = g.phase;
      g.update(5.3); // Normal updateBreak -> executeStep -> startWave(2).
      g.renderer.render(g.scene, g.camera);
      (window as any).labelRenderer.render(g.scene, g.camera);
      return {
        first, between, phase: g.phase, modal: g.modalOpen,
        title: document.getElementById('banner-title')!.textContent,
        profile: document.getElementById('banner')!.dataset.entranceCharacter,
        queen: g.queenClient?.archetype.id, budget: g.queen.budget,
        ordinaryPending: g.spawnQueue.length,
      };
    });
    await testInfo.attach('natural-wave-transition', { body: JSON.stringify(state, null, 2), contentType: 'application/json' });
    expect(state.first).toBe('Волна 1');
    expect(state.between).toBe('break');
    expect(state.phase).toBe('playing');
    expect(state.modal).toBe(false);
    expect(state.queen).toBe('fitting-queen');
    expect(state.budget).toBeGreaterThanOrEqual(20);
    expect(state.budget).toBeLessThanOrEqual(30);
    expect(state.ordinaryPending).toBeGreaterThan(0);
    expect(state.title).toBe(banners[0][0]);
    expect(state.profile).toBe('queen');
    const banner = page.locator('#banner');
    await expect(banner).toBeVisible();
    await expect(banner).toHaveAttribute('data-entrance-emotion', 'demanding');
    await expect(page.locator('.boss-entrance-portrait')).toBeVisible();
    await expect(page.locator('#banner-sub')).toHaveText(banners[0][1]);
    await page.screenshot({ path: testInfo.outputPath('queen-natural-entry.png'), animations: 'disabled' });
    await expect(banner).toHaveClass(/hidden/, { timeout: 4500 });
    expect(errors).toEqual([]);
  });
}

async function setup(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => localStorage.setItem('pvz_tycoon_tutorial_done', '1'));
  await page.goto('/');
  await page.waitForFunction(() => window.game);
  await page.evaluate(() => {
    const g = (window as any).game;
    g.renderer.setAnimationLoop(null);
    g.debugSetShift(4);
    g.update(1.3); // Enter the wave before spawning the persistent Queen.
    g.clearClients(); g.spawnQueue = [];
    g.debugBoss();
    g.queenClient.preplaceAtFront();
    g.run.stress = 20;
    g.run.reputation = 3;
    g.renderer.render(g.scene, g.camera);
    (window as any).labelRenderer.render(g.scene, g.camera);
  });
  return errors;
}

// Collect through the existing parcel/service path, then deliver to the real Queen.
async function deliverOrder(page: Page) {
  return page.evaluate(() => {
    const g = (window as any).game, queen = g.queenClient, order = queen.order;
    queen.preplaceAtFront();
    g.service.begin(queen, order);
    const count = order.items.length;
    while (g.service.remainingItems().length) {
      const item = g.service.remainingItems()[0];
      const cell = g.world.cells.find((value: any) => value.id === item.cellId);
      if (!cell) throw new Error('Missing Queen parcel');
      g.takeParcel(cell, order);
    }
    g.deliver();
    return { count, budget: g.queen.budget, fitting: g.queen.inFitting, occupied: [...g.fittingOccupied] };
  });
}

test('Королева: исходные заказы, примерка, возврат и уход показывают нужные выражения', async ({ page }) => {
  const errors = await setup(page);
  const banner = page.locator('#banner');
  await expect(banner).toHaveAttribute('data-entrance-character', 'queen');
  await expect(banner).toHaveAttribute('data-entrance-emotion', 'demanding');
  await expect(page.locator('#banner-sub')).toHaveText(banners[0][1]);
  await expect(page.locator('#boss-modal')).toBeHidden();
  expect(await page.evaluate(() => (window as any).game.modalOpen)).toBe(false);
  const original = await page.evaluate(async () => {
    const path = '/src/data.ts';
    const data = await import(path);
    return { lines: data.QUEEN_LINES, returns: data.QUEEN_RETURN_LINES };
  });
  expect(original.lines).toContain(await page.locator('.client-bubble').filter({ hasText: /./ }).first().textContent());
  const budget = await page.evaluate(() => (window as any).game.queen.budget);
  expect(budget).toBeGreaterThanOrEqual(20);
  expect(budget).toBeLessThanOrEqual(30);
  const delivered = await deliverOrder(page);
  expect(delivered).toEqual({ count: 3, budget: budget - 3, fitting: true, occupied: [true, true] });
  await page.evaluate(() => (window as any).game.updateQueen(5.9));
  expect(await page.evaluate(() => (window as any).game.queen.inFitting)).toBe(true);
  await page.evaluate(() => (window as any).game.updateQueen(.11));
  await expect(page.locator('#banner-title')).toHaveText(banners[2][0]);
  await expect(page.locator('#banner-sub')).toHaveText(banners[2][1]);
  await expect(banner).toHaveAttribute('data-entrance-emotion', 'annoyed');
  expect(await page.evaluate(() => (window as any).game.queen.hasReturn)).toBe(true);
  expect(original.returns).toContain(await page.evaluate(() => (window as any).game.queenClient.bubbleEl.textContent));
  await page.evaluate(async () => {
    const g = (window as any).game;
    g.queenClient.preplaceAtFront();
    g.takeQueenReturn();
    const path = '/src/data.ts';
    const { RETURN_POINT } = await import(path);
    g.movement.snapTo(RETURN_POINT);
    g.depositReturn();
  });
  expect(await page.evaluate(() => (window as any).game.service.carryingReturn)).toBe(false);
  // The Queen is back in fitting for a short cooldown; the real update path
  // must schedule her new order automatically.
  expect(await page.evaluate(() => (window as any).game.queen.cooldown)).toBe(2);
  expect(await page.evaluate(() => (window as any).game.queen.inFitting)).toBe(true);
  await page.evaluate(() => (window as any).game.updateQueen(2.1));
  await expect(page.locator('#banner-title')).toHaveText(banners[1][0]);
  await expect(banner).toHaveAttribute('data-entrance-emotion', 'demanding');
  expect(await page.evaluate(() => (window as any).game.queenClient.order.items.length)).toBe(3);
  // Last-order fixture: still use the normal pickup/deliver/finish path.
  await page.evaluate(() => {
    const g = (window as any).game;
    g.queen.spawn(3);
    g.returnQueen();
  });
  await deliverOrder(page);
  await expect(page.locator('#banner-title')).toHaveText(banners[3][0]);
  await expect(page.locator('#banner-sub')).toHaveText(banners[3][1]);
  await expect(banner).toHaveAttribute('data-entrance-emotion', 'satisfied');
  const finalState = await page.evaluate(() => {
    const g = (window as any).game;
    return { active: g.queen.active, client: g.queenClient, stress: g.run.stress, reputation: g.run.reputation };
  });
  expect(finalState).toMatchObject({ active: false, client: null, stress: 16 });
  expect(finalState.reputation).toBeCloseTo(3.8, 5);
  expect(errors).toEqual([]);
});

test('Королева: все заголовки читаются на mobile, сканер доступен, профиль сбрасывается', async ({ page }) => {
  const errors = await setup(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const count = await page.locator('#banner *').count();
  await page.locator('#btn-help').focus();
  for (const viewport of [
    { width: 1600, height: 960 }, { width: 1280, height: 720 },
    { width: 844, height: 390 }, { width: 568, height: 320 },
    { width: 390, height: 844 }, { width: 360, height: 640 }, { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(viewport);
    for (const [title, sub, emotion] of banners) {
      await page.evaluate(({ title, sub }) => (window as any).ui.banner(title, sub, 30), { title, sub });
      await expect(page.locator('#banner')).toHaveAttribute('data-entrance-emotion', emotion);
      for (const selector of ['#banner-title', '#banner-sub', '.boss-entrance-portrait']) {
        const box = (await page.locator(selector).boundingBox())!;
        expect(box.x, selector).toBeGreaterThanOrEqual(0);
        expect(box.y, selector).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width, selector).toBeLessThanOrEqual(viewport.width);
        expect(box.y + box.height, selector).toBeLessThanOrEqual(viewport.height);
      }
      expect(await page.evaluate(() => {
        const portrait = document.querySelector('.boss-entrance-portrait')!.getBoundingClientRect();
        const range = new Range(); range.selectNodeContents(document.getElementById('banner-sub')!);
        const line = range.getClientRects()[0];
        return innerWidth < innerHeight ? portrait.bottom <= line.top : portrait.right <= line.left;
      })).toBe(true);
      await expect(page.locator('#btn-help')).toBeFocused();
    }
  }
  expect(await page.locator('#banner').evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0);
  expect(await page.locator('#banner *').count()).toBe(count);
  await page.evaluate(() => {
    (window as any).ui.banner('Королева примерочной', 'Она занимает примерочные, злит очередь и приносит возвраты.', 30);
    (window as any).ui.openScanner('Королева примерочной');
  });
  await expect(page.locator('#scanner-panel')).toBeVisible();
  await expect(page.locator('#banner')).not.toHaveClass(/hidden/);
  await expect(page.locator('#banner')).toBeHidden();
  await page.evaluate(() => {
    (window as any).ui.closeScanner();
    (window as any).ui.banner('Курьер Саня', 'Четыре заказа сразу. Он очень спешит — не заставляйте ждать.', 3);
  });
  await expect(page.locator('#banner')).toHaveAttribute('data-entrance-character', 'sanya');
  expect(await page.locator('#banner').getAttribute('data-entrance-emotion')).toBeNull();
  expect(await page.locator('.boss-entrance-portrait').evaluate(el => getComputedStyle(el).backgroundImage)).toContain('sanya-portrait');
  await page.evaluate(() => (window as any).ui.banner('Перерыв', 'Обычный баннер', .1));
  expect(await page.locator('#banner').getAttribute('data-entrance-character')).toBeNull();
  await expect(page.locator('.boss-entrance-portrait')).toBeHidden();
  await expect(page.locator('#banner')).toHaveClass(/hidden/);
  expect(errors).toEqual([]);
});
