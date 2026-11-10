import { expect, test } from '@playwright/test';
import type { Client } from '../../src/client';
import type { Order } from '../../src/domain/orders';

// Existing console API only: no production hooks or game state overrides.
// Scene navigation and early shift completion depend on these internal methods.
interface SmokeGame {
  queue: Client[];
  service: { active: { order: Order } | null; carrying: boolean };
  isServableFront(client: Client): boolean;
  onShelfClick(shelf: number): void;
  endShift(): void;
}

declare global {
  interface Window { game: SmokeGame }
}

test('старт → клиент → сканер → ячейка → выдача → итоги → магазин', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', error => errors.push(error.message));

  try {
    await page.addInitScript(() => localStorage.setItem('pvz_tycoon_tutorial_done', '1'));
    await page.goto('/');
    await expect(page.locator('#start-screen')).toBeVisible();
    await page.getByRole('button', { name: 'Начать смену', exact: true }).click();
    await expect(page.locator('#start-screen')).toBeHidden();
    await expect(page.locator('#hud')).toBeVisible();
    await expect(page.locator('#hud-served')).toHaveText('0');
    await page.waitForFunction(() => {
      const client = window.game.queue[0];
      return client && window.game.isServableFront(client);
    });
    const clientName = await page.evaluate(() => window.game.queue[0].archetype.name);
    const clientTag = page.locator('.client-tag').filter({ hasText: clientName }).first();
    await clientTag.click();
    await expect(page.locator('#scanner-panel')).toBeVisible();
    await expect(page.locator('#scanner-client')).toHaveText(clientName);

    await page.locator('#scan-hold').hover();
    await page.mouse.down();
    try {
      await expect(page.locator('#scanner-result-view')).toBeVisible();
    } finally {
      await page.mouse.up();
    }
    const cellId = (await page.locator('#scan-cell').innerText()).trim();
    expect(cellId).toMatch(/^[AB]-\d-\d$/);
    await expect.poll(() => page.evaluate(() => window.game.service.active?.order.scanned)).toBe(true);
    await page.locator('#scan-ok').click();

    // Use the same navigation entry point as a 3D shelf click; movement stays real.
    await page.evaluate(() => {
      const order = window.game.service.active!.order;
      window.game.onShelfClick(order.shelf);
    });
    await expect(page.locator('#cell-panel')).toBeVisible();
    await page.locator(`[data-cell-id="${cellId}"]`).click();
    await expect(page.locator('#cell-panel')).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.game.service.carrying)).toBe(true);
    await clientTag.click();
    await expect(page.locator('#hud-served')).toHaveText('1');
    await expect.poll(() => page.evaluate(() => window.game.service.active === null)).toBe(true);

    // Skip the remaining waves/boss, not the service flow or results calculation.
    await page.evaluate(() => window.game.endShift());
    await expect(page.locator('#results-modal')).toBeVisible();
    await expect(page.locator('#results-kicker')).toHaveText('СМЕНА 1 ЗАВЕРШЕНА');
    await expect(page.locator('#results-served')).toHaveText('1');
    await expect(page.locator('#results-earned')).toHaveText(/[1-9]\d* ₽/);
    await expect(page.locator('#shop-upgrades-panel')).toBeVisible();
    await expect(page.locator('#shop-grid button').first()).toBeVisible();
    await page.getByRole('button', { name: 'Оформление ПВЗ', exact: true }).click();
    await expect(page.locator('#shop-decor-panel')).toBeVisible();
    await expect(page.locator('#decor-grid button').first()).toBeVisible();
  } finally {
    expect(errors, 'console.error and uncaught browser exceptions').toEqual([]);
  }
});
