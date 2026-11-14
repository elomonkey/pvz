import { expect, test } from '@playwright/test';

test('help cancels a held scan and a new hold still works after closing it', async ({ page }) => {
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
  await page.waitForFunction(() => {
    const game = (window as any).game;
    return game.queue[0] && game.isServableFront(game.queue[0]);
  });

  const name = await page.evaluate(() => (window as any).game.queue[0].archetype.name);
  await page.locator('.client-tag').filter({ hasText: name }).first().click();
  await expect(page.locator('#scanner-panel')).toBeVisible();

  const hold = await page.locator('#scan-hold').boundingBox();
  await page.mouse.move(hold!.x + hold!.width / 2, hold!.y + hold!.height / 2);
  await page.mouse.down();
  await expect(page.locator('#scan-hold')).toHaveClass(/holding/);

  // Open help with the keyboard while the pointer is still held on the scanner.
  await page.locator('#btn-help').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#help-modal')).toBeVisible();
  await page.waitForTimeout(900);

  const paused = await page.evaluate(() => {
    const game = (window as any).game;
    const scanner = (window as any).ui.scanner;
    return {
      serviceActive: game.service.active !== null,
      scanned: game.queue[0]?.order?.scanned ?? null,
      holding: scanner.scanHolding,
      progress: scanner.scanProgress,
      scanViewVisible: !document.getElementById('scanner-scan-view')!.classList.contains('hidden'),
      resultViewVisible: !document.getElementById('scanner-result-view')!.classList.contains('hidden'),
    };
  });
  expect(paused).toMatchObject({
    serviceActive: false,
    holding: false,
    progress: 0,
    scanViewVisible: true,
    resultViewVisible: false,
  });
  if (paused.scanned !== null) expect(paused.scanned).toBe(false);

  // Close help with the keyboard, release the old pointer and start a fresh hold.
  await page.locator('#help-close').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#help-modal')).toBeHidden();
  await expect(page.locator('#scanner-panel')).toBeVisible();
  await page.mouse.up();

  const freshHold = await page.locator('#scan-hold').boundingBox();
  await page.mouse.move(freshHold!.x + freshHold!.width / 2, freshHold!.y + freshHold!.height / 2);
  await page.mouse.down();
  await expect(page.locator('#scanner-result-view')).toBeVisible();
  await page.mouse.up();

  const finished = await page.evaluate(() => {
    const game = (window as any).game;
    return {
      serviceActive: game.service.active !== null,
      scanned: game.queue[0]?.order?.scanned ?? null,
      resultViewVisible: !document.getElementById('scanner-result-view')!.classList.contains('hidden'),
    };
  });
  expect(finished).toMatchObject({ serviceActive: true, scanned: true, resultViewVisible: true });
  expect(errors).toEqual([]);
});
