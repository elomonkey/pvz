import { expect, test, type Page } from '@playwright/test';

const caption = 'Четыре заказа сразу. Он очень спешит — не заставляйте ждать.';

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
    g.debugSetShift(3);
    g.debugBoss();
    g.bossClient.preplaceAtFront();
    g.update(.01);
    g.renderer.render(g.scene, g.camera);
    (window as any).labelRenderer.render(g.scene, g.camera);
  });
  return errors;
}

test('Саня: выразительный вход не останавливает терпение и не мешает сканировать четыре заказа', async ({ page }) => {
  const errors = await setup(page);
  await expect(page.locator('#banner')).toHaveClass(/boss-entrance/);
  await expect(page.locator('#banner-sub')).toHaveText(caption);
  await expect(page.locator('.boss-entrance-portrait')).toBeVisible();
  await expect(page.locator('#boss-modal')).toBeHidden();
  await expect(page.locator('#banner')).toHaveClass(/hidden/, { timeout: 4500 });
  // The scanner check must not pass merely because the native 3s timer expired.
  await page.evaluate(caption => (window as any).ui.banner('Курьер Саня', caption, 30), caption);
  const state = await page.evaluate(() => {
    const g = (window as any).game;
    const before = g.bossClient.patience;
    g.update(1);
    return { before, after: g.bossClient.patience, modal: g.modalOpen, phase: g.phase };
  });
  expect(state.modal).toBe(false);
  expect(state.phase).toBe('boss');
  expect(state.before).toBeGreaterThan(33);
  expect(state.after).toBeCloseTo(state.before - 1, 4);
  expect(await page.locator('#banner').evaluate(el => {
    const r = el.getBoundingClientRect();
    return !document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('#banner');
  })).toBe(true);
  await page.locator('.client-tag').filter({ hasText: 'Курьер Саня' }).click();
  await expect(page.locator('#scanner-panel')).toBeVisible();
  await expect(page.locator('#banner')).not.toHaveClass(/hidden/);
  await expect(page.locator('#banner')).toBeHidden();
  await page.locator('#scan-hold').hover();
  await page.mouse.down();
  try {
    await page.evaluate(() => (window as any).ui.update(.8));
    await expect(page.locator('#scanner-result-view')).toBeVisible();
  } finally {
    await page.mouse.up();
  }
  await expect(page.locator('.scan-cell-id')).toHaveCount(4);
  const service = await page.evaluate(() => {
    const g = (window as any).game, order = g.service.active.order;
    const stages = [];
    while (g.service.remainingItems().length) {
      g.takeParcel(g.world.cells.find((cell: any) => cell.id === order.cellId), order);
      stages.push({ carrying: g.service.carrying, ready: g.service.readyToDeliver });
      if (!g.service.readyToDeliver) g.deliver();
    }
    const before = g.run.served;
    g.deliver();
    return { stages, before, served: g.run.served, active: g.service.active, carrying: g.service.carrying, phase: g.phase };
  });
  expect(service.stages).toEqual([
    { carrying: true, ready: false }, { carrying: true, ready: false },
    { carrying: true, ready: false }, { carrying: true, ready: true },
  ]);
  expect(service).toMatchObject({ before: 0, served: 1, active: null, carrying: false, phase: 'break' });
  expect(errors).toEqual([]);
});

test('Саня: кадр читается на телефоне, фокус не перехватывается, обычные баннеры сохраняются', async ({ page }) => {
  const errors = await setup(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const count = await page.locator('#banner *').count();
  await page.locator('#btn-help').focus();
  for (const viewport of [
    { width: 1600, height: 960 }, { width: 1280, height: 720 },
    { width: 844, height: 390 }, { width: 667, height: 375 }, { width: 568, height: 320 },
    { width: 390, height: 844 }, { width: 360, height: 640 }, { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(viewport);
    await page.evaluate(caption => (window as any).ui.banner('Курьер Саня', caption, 3), caption);
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
    expect(await page.locator('#banner').evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0);
  }
  await page.evaluate(caption => {
    for (let i = 0; i < 20; i++) (window as any).ui.banner('Курьер Саня', caption, 3);
  }, caption);
  expect(await page.locator('#banner *').count()).toBe(count);
  await page.evaluate(() => (window as any).ui.banner('Перерыв', 'Обычный баннер', .1));
  await expect(page.locator('#banner')).not.toHaveClass(/boss-entrance/);
  await expect(page.locator('.boss-entrance-portrait')).toBeHidden();
  await expect(page.locator('#banner-sub')).toHaveText('Обычный баннер');
  await expect(page.locator('#banner')).toHaveClass(/hidden/);
  expect(errors).toEqual([]);
});
