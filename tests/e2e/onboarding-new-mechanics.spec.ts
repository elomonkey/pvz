import { expect, test } from '@playwright/test';

async function startShift(page: import('@playwright/test').Page, shift: number) {
  await page.addInitScript(() => localStorage.setItem('pvz_tycoon_tutorial_done', '1'));
  await page.goto('/');
  await page.getByRole('button', { name: 'Начать смену', exact: true }).click();
  await page.waitForFunction(() => window.game);
  await page.evaluate((value) => {
    const game = (window as any).game;
    game.renderer.setAnimationLoop(null);
    game.debugSetShift(value);
    game.update(3.3);
  }, shift);
}

test('первый старт 2-й смены объясняет споры один раз', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', error => errors.push(error.message));

  try {
    await startShift(page, 2);
    await expect(page.locator('#tutorial')).toBeVisible();
    await expect(page.locator('#tutorial-kicker')).toHaveText('НОВОЕ · СМЕНА 2');
    await expect(page.locator('#tutorial-title')).toHaveText('Клиенты могут спорить');
    await expect(page.locator('#tutorial-text')).toContainText('«Уступить»');
    await expect(page.locator('#tutorial-text')).toContainText('«Спорить»');
    await expect(page.locator('#tutorial-text')).toContainText('«Обаяние»');
    expect(
      await page.evaluate(() => ({
        modal: (window as any).game.modalOpen,
        phase: (window as any).game.phase,
        flag: localStorage.getItem('pvz_tycoon_argue_intro_seen'),
      })),
    ).toEqual({ modal: true, phase: 'break', flag: '1' });

    await page.getByRole('button', { name: 'Понятно', exact: true }).click();
    await expect(page.locator('#tutorial')).toBeHidden();
    expect(await page.evaluate(() => (window as any).game.modalOpen)).toBe(false);

    await page.evaluate(() => {
      const game = (window as any).game;
      game.debugSetShift(2);
      game.update(3.3);
    });
    await expect(page.locator('#tutorial')).toBeHidden();
  } finally {
    expect(errors, 'console.error and uncaught browser exceptions').toEqual([]);
  }
});

test('первый старт 4-й смены объясняет примерочные и сборные заказы один раз', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', error => errors.push(error.message));

  try {
    await startShift(page, 4);
    await expect(page.locator('#tutorial')).toBeVisible();
    await expect(page.locator('#tutorial-kicker')).toHaveText('НОВОЕ · СМЕНА 4');
    await expect(page.locator('#tutorial-title')).toHaveText('Четвёртая смена: что нового');
    await expect(page.locator('#tutorial-text')).toContainText('нескольких ячеек');
    await expect(page.locator('#tutorial-text')).toContainText('открылась примерочная');
    await expect(page.locator('#tutorial-text')).toContainText('Королева');
    expect(
      await page.evaluate(() => ({
        modal: (window as any).game.modalOpen,
        phase: (window as any).game.phase,
        flag: localStorage.getItem('pvz_tycoon_shift4_intro_seen'),
      })),
    ).toEqual({ modal: true, phase: 'break', flag: '1' });

    await page.getByRole('button', { name: 'Понятно', exact: true }).click();
    await expect(page.locator('#tutorial')).toBeHidden();
    expect(await page.evaluate(() => (window as any).game.modalOpen)).toBe(false);

    await page.evaluate(() => {
      const game = (window as any).game;
      game.debugSetShift(4);
      game.update(3.3);
    });
    await expect(page.locator('#tutorial')).toBeHidden();
  } finally {
    expect(errors, 'console.error and uncaught browser exceptions').toEqual([]);
  }
});
