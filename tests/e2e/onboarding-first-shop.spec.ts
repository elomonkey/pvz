import { expect, test } from '@playwright/test';

test('первая выдача объясняет продолжение смены и сохраняет обучение', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', error => errors.push(error.message));

  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'Начать смену', exact: true }).click();
    await expect(page.locator('#tutorial')).toBeVisible();
    await expect(page.locator('#tutorial-kicker')).toHaveText('ОБУЧЕНИЕ · СМЕНА 1');
    await page.getByRole('button', { name: 'Начать', exact: true }).click();

    // The delivery path is covered by game-loop; trigger the same post-delivery transition.
    await page.evaluate(() => {
      (window as any).game.onTutorialAction('delivered');
    });

    await expect(page.locator('#tutorial')).toBeVisible();
    await expect(page.locator('#tutorial-kicker')).toHaveText('ГОТОВО');
    await expect(page.locator('#tutorial-text')).toContainText('терпением');
    await expect(page.locator('#tutorial-text')).toContainText(/Мини-квесты/);
    await expect(page.locator('#tutorial-text')).toContainText('игрушка на стойке');

    await page.getByRole('button', { name: 'Продолжить', exact: true }).click();
    await expect(page.locator('#tutorial')).toBeHidden();
    expect(
      await page.evaluate(() => localStorage.getItem('pvz_tycoon_tutorial_done')),
    ).toBe('1');
  } finally {
    expect(errors, 'console.error and uncaught browser exceptions').toEqual([]);
  }
});

test('итоги первой смены один раз объясняют зарплату и магазин', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', error => errors.push(error.message));

  try {
    await page.addInitScript(() => localStorage.setItem('pvz_tycoon_tutorial_done', '1'));
    await page.goto('/');
    await page.getByRole('button', { name: 'Начать смену', exact: true }).click();
    await page.waitForFunction(() => window.game);

    await page.evaluate(() => (window as any).game.endShift());
    await expect(page.locator('#results-modal')).toBeVisible();
    await expect(page.locator('#results-intro')).toBeVisible();
    await expect(page.locator('#results-intro')).toContainText('улучшения действуют до конца забега');
    await expect(page.locator('#results-intro')).toContainText('оформление меняет ПВЗ');
    await expect(page.locator('#results-intro')).toContainText('Разбитый сканер');

    // The callout must not block the shop underneath it.
    await page.getByRole('button', { name: 'Оформление ПВЗ', exact: true }).click();
    await expect(page.locator('#shop-decor-panel')).toBeVisible();

    await page.locator('#results-intro-close').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#results-intro')).toBeHidden();
    expect(
      await page.evaluate(() => localStorage.getItem('pvz_tycoon_results_intro_seen')),
    ).toBe('1');

    // A new run starts from shift 1 again, but the one-time callout must stay hidden.
    await page.evaluate(() => {
      const game = (window as any).game;
      game.startNewGame();
      game.endShift();
    });
    await expect(page.locator('#results-modal')).toBeVisible();
    await expect(page.locator('#results-intro')).toBeHidden();
  } finally {
    expect(errors, 'console.error and uncaught browser exceptions').toEqual([]);
  }
});

test('карточка итогов читается и закрывается на телефоне', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', error => errors.push(error.message));

  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.addInitScript(() => localStorage.setItem('pvz_tycoon_tutorial_done', '1'));
    await page.goto('/');
    await page.getByRole('button', { name: 'Начать смену', exact: true }).click();
    await page.waitForFunction(() => window.game);
    await page.evaluate(() => (window as any).game.endShift());

    await expect(page.locator('#results-intro')).toBeVisible();
    const box = await page.locator('#results-intro').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    await expect(page.locator('#results-intro-close')).toBeInViewport();
    await page.locator('#results-intro-close').click();
    await expect(page.locator('#results-intro')).toBeHidden();
  } finally {
    expect(errors, 'console.error and uncaught browser exceptions').toEqual([]);
  }
});
