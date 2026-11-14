import { expect, test, type Page } from '@playwright/test';

const bossModule = /\/(?:src\/ui\/bossView\.ts|assets\/bossView-[^/]+\.js)(?:\?|$)/;

async function prepare(page: Page): Promise<void> {
  await page.addInitScript(() => {
    for (const key of ['tutorial_done', 'results_intro_seen', 'argue_intro_seen', 'shift4_intro_seen', 'scanner_break_seen']) {
      localStorage.setItem(`pvz_tycoon_${key}`, '1');
    }
  });
}

async function stageBoss(page: Page): Promise<void> {
  await page.evaluate(() => {
    const game = (window as any).game;
    game.renderer.setAnimationLoop(null);
    game.debugSetShift(1);
    game.debugBoss();
    game.bossClient.preplaceAtFront();
    game.update(0.01);
  });
}

test('failed dialogue chunk keeps the request and retries exactly once', async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => pageErrors.push(error.message));
  await prepare(page);
  await page.route(bossModule, route => route.abort());
  await page.goto('/');
  await page.waitForFunction(() => (window as any).ui);
  await stageBoss(page);

  await expect(page.locator('#boss-load-error')).toBeVisible();
  await expect(page.locator('#boss-modal')).toBeHidden();
  expect(await page.evaluate(() => (window as any).ui.pendingBossCalls.length)).toBeGreaterThan(0);
  expect(consoleErrors.some(message => message.includes('Не удалось загрузить диалоги'))).toBe(true);

  await page.unroute(bossModule);
  const errorsBeforeRetry = consoleErrors.length;
  await page.locator('#boss-load-retry').click();

  await expect(page.locator('#boss-modal')).toBeVisible();
  await expect(page.locator('#boss-load-error')).toBeHidden();
  await expect(page.locator('#boss-name')).toHaveText('Галя');
  expect(await page.evaluate(() => (window as any).ui.pendingBossCalls.length)).toBe(0);
  expect(consoleErrors.slice(errorsBeforeRetry)).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('restart during the failed dialogue clears the retry state and stale request', async ({ page }) => {
  await prepare(page);
  await page.route(bossModule, route => route.abort());
  await page.goto('/');
  await page.waitForFunction(() => (window as any).ui);
  await stageBoss(page);
  await expect(page.locator('#boss-load-error')).toBeVisible();

  await page.evaluate(() => (window as any).game.restartGame());
  await expect(page.locator('#start-screen')).toBeVisible();
  await expect(page.locator('#boss-load-error')).toBeHidden();
  await expect(page.locator('#boss-modal')).toBeHidden();
  expect(await page.evaluate(() => (window as any).ui.pendingBossCalls.length)).toBe(0);

  await page.unroute(bossModule);
  await page.getByRole('button', { name: 'Начать смену', exact: true }).click();
  await expect(page.locator('#start-screen')).toBeHidden();
  await expect(page.locator('#boss-modal')).toBeHidden();
});

test('a failed background preload stays silent until a dialogue is requested', async ({ page }) => {
  await prepare(page);
  await page.route(bossModule, route => route.abort());
  await page.goto('/');
  await page.getByRole('button', { name: 'Начать смену', exact: true }).click();
  await expect(page.locator('#start-screen')).toBeHidden();
  await expect(page.locator('#hud')).toBeVisible();
  await page.waitForFunction(() => (window as any).ui.bossLoading === null);
  await expect(page.locator('#boss-load-error')).toBeHidden();

  await stageBoss(page);
  await expect(page.locator('#boss-load-error')).toBeVisible();
});
