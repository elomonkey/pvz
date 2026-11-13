import { expect, test, type Page } from '@playwright/test';

test.use({ hasTouch: true });

/** Check the actual SVG paper, rather than its larger rectangular bounding box. */
async function expectInsidePaper(page: Page, stage: string, selectors: string[]) {
  const escaped = await page.locator(stage).evaluate((root, selectors) => {
    const paper = root.querySelector<SVGPathElement>('.intermission-frame-paper')!;
    const toPaper = paper.getScreenCTM()!.inverse();
    const scroll = root.querySelector<HTMLElement>('.intermission-scroll')!;
    const viewport = scroll.getBoundingClientRect();
    const escaped: string[] = [];
    for (const selector of selectors) {
      for (const element of root.querySelectorAll<HTMLElement>(selector)) {
        const rect = element.getBoundingClientRect();
        if (!rect.width || !rect.height) continue;
        const top = scroll.contains(element) ? Math.max(rect.top, viewport.top) : rect.top;
        const bottom = scroll.contains(element) ? Math.min(rect.bottom, viewport.bottom) : rect.bottom;
        if (bottom <= top) continue; // Offscreen catalog items are reached by scrolling.
        for (const x of [rect.left, rect.right]) {
          for (const y of [top, bottom]) {
            if (!paper.isPointInFill(new DOMPoint(x, y).matrixTransform(toPaper))) escaped.push(`${selector} (${Math.round(x)}, ${Math.round(y)})`);
          }
        }
      }
    }
    return escaped;
  }, selectors);
  expect(escaped, 'Visible controls/cards must stay inside the paper silhouette').toEqual([]);
}

async function setup(page: Page, shift = 2, failed = false) {
  const errors: string[] = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    for (const key of ['tutorial_done', 'results_intro_seen', 'argue_intro_seen', 'shift4_intro_seen', 'scanner_break_seen']) localStorage.setItem(`pvz_tycoon_${key}`, '1');
  });
  await page.goto('/');
  await page.waitForFunction(() => window.game);
  await page.evaluate(({ shift, failed }) => {
    const g = (window as any).game;
    g.renderer.setAnimationLoop(null); g.debugSetShift(shift);
    g.run.money = 10000; g.run.served = 18; g.run.stress = 12;
    g.shiftFailed = failed;
    if (failed) g.scannerBroken = true;
    g.endShift();
  }, { shift, failed });
  await expect(page.locator('#intermission-results')).toBeVisible();
  return errors;
}

for (const viewport of [{ width: 1600, height: 1000 }, { width: 844, height: 390 }, { width: 568, height: 320 }, { width: 390, height: 844 }]) {
  test(`results → shop → purchases → results keeps economy and fits ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const errors = await setup(page);
    const initial = await page.evaluate(() => { const g = (window as any).game; return { money: g.run.money, salary: g.run.shiftEarnings }; });
    await expect(page.locator('#intermission-shop')).toBeHidden();
    await expect(page.locator('#next-shift')).toBeHidden();
    await expect(page.locator('#results-earned')).toHaveText(`${initial.salary} ₽`);
    await expect(page.locator('#results-to-shop')).toBeInViewport();
    await expectInsidePaper(page, '#intermission-results', ['#results-to-shop', '.results-star', '.character-primary > div']);
    await page.locator('#results-to-shop').tap();
    await expect(page.locator('#intermission-results')).toBeHidden();
    await expect(page.locator('#intermission-step-shop')).toHaveAttribute('aria-current', 'step');
    await expect(page.locator('#shop-next-label')).toHaveText('ПОДГОТОВКА К СМЕНЕ 3');
    await expect(page.locator('#shop-money')).toHaveText(String(initial.money));
    await expectInsidePaper(page, '#intermission-shop', ['.intermission-wallet', '.shop-tab', '.upgrade-card', '#next-shift', '#shop-to-results']);
    const speed = page.locator('[data-offer="speed"]');
    await speed.locator('button').tap();
    await expect(speed.locator('button')).toHaveText('1350 ₽');
    await expect(speed.locator('button')).toBeFocused();
    await expect(page.locator('#shop-money')).toHaveText(String(initial.money - 850));
    await page.locator('#shop-to-results').tap();
    await expect(page.locator('#results-earned')).toHaveText(`${initial.salary} ₽`);
    await expect(page.locator('#char-speed')).toHaveText('+8%');
    await page.locator('#results-to-shop').tap();
    await page.getByRole('tab', { name: 'Оформление ПВЗ', exact: true }).tap();
    const cat = page.locator('[data-offer="cat"]');
    await cat.locator('button').tap();
    await expect(cat.locator('button')).toHaveText('КУПЛЕНО');
    await expect(cat.locator('button')).toBeDisabled();
    const state = await page.evaluate(() => {
      const g = (window as any).game;
      return { shift: g.run.shift, phase: g.phase, money: g.run.money, speed: g.run.upgrades.speed, cat: g.ownedDecor.cat,
        saved: JSON.parse(localStorage.getItem('pvz_tycoon_progress')!) };
    });
    expect(state).toMatchObject({ shift: 2, phase: 'results', money: initial.money - 1250, speed: 1, cat: true });
    expect(state.saved.money).toBe(state.money);
    expect(state.saved.decor).toContain('cat');
    await expect(page.locator('#next-shift')).toBeInViewport();
    await expect(page.locator('#shop-to-results')).toBeInViewport();
    const bounds = await page.locator('.intermission').boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height);
    await page.locator('#next-shift').tap();
    await expect(page.locator('#results-modal')).toBeHidden();
    expect(await page.evaluate(() => (window as any).game.run.shift)).toBe(3);
    expect(errors).toEqual([]);
  });
}

test('double tap, held Enter and back navigation do not skip the shop or add salary', async ({ page }) => {
  const errors = await setup(page);
  const initial = await page.evaluate(() => (window as any).game.run.money);
  await page.locator('#results-to-shop').dblclick();
  await expect(page.locator('#intermission-shop')).toBeVisible();
  await expect(page.locator('#next-shift')).toBeEnabled();
  expect(await page.evaluate(() => (window as any).game.run.shift)).toBe(2);
  await page.keyboard.press('Escape');
  await expect(page.locator('#intermission-results')).toBeVisible();
  await page.locator('#results-to-shop').focus();
  await page.keyboard.down('Enter');
  await expect(page.locator('#next-shift')).toBeEnabled();
  await page.keyboard.down('Enter');
  await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  await expect(page.locator('#intermission-shop')).toBeVisible();
  expect(await page.evaluate(() => (window as any).game.run.shift)).toBe(2);
  expect(await page.evaluate(() => (window as any).game.run.money)).toBe(initial);
  await page.getByRole('tab', { name: 'Улучшения', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Оформление ПВЗ', exact: true })).toBeFocused();
  await expect(page.locator('#shop-decor-panel')).toBeVisible();
  // A new results session starts at step 1 and the upgrades department again.
  await page.evaluate(() => { const g = (window as any).game; g.startNewGame(); g.endShift(); });
  await expect(page.locator('#intermission-results')).toBeVisible();
  await page.locator('#results-to-shop').click();
  await expect(page.locator('#shop-upgrades-panel')).toBeVisible();
  expect(errors).toEqual([]);
});

test('failed results and scanner replacement keep their original prices and consequences', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  const errors = await setup(page, 3, true);
  await expect(page.locator('#results-modal')).toHaveClass(/failed-shift/);
  await expect(page.locator('#quest-bonus')).toHaveText('+0 ₽');
  await expect(page.locator('#char-scanner')).toHaveText('разбит');
  await page.locator('#results-to-shop').tap();
  const scanner = page.locator('[data-offer="scanner"]');
  await expect(scanner.locator('button')).toHaveText('5000 ₽');
  const before = await page.evaluate(() => (window as any).game.run.money);
  await scanner.locator('button').tap();
  await expect(scanner.locator('button')).toBeDisabled();
  await page.locator('#shop-to-results').tap();
  await expect(page.locator('#char-scanner')).toHaveText('заменён');
  expect(await page.evaluate(() => (window as any).game.run.money)).toBe(before - 5000);
  expect(errors).toEqual([]);
});

test('fifth shift shows final results and returns to the menu through the existing action', async ({ page }) => {
  const errors = await setup(page, 5);
  await expect(page.locator('#results-kicker')).toHaveText('СМЕНА 5 ЗАВЕРШЕНА');
  await page.locator('#results-to-shop').click();
  await expect(page.locator('#shop-next-label')).toHaveText('ЗАБЕГ ЗАВЕРШЁН');
  await expect(page.locator('#next-shift')).toHaveText('В меню');
  await page.locator('#next-shift').click();
  await expect(page.locator('#results-modal')).toBeHidden();
  await expect(page.locator('#start-screen')).toBeVisible();
  expect(await page.evaluate(() => (window as any).game.phase)).toBe('menu');
  expect(errors).toEqual([]);
});
