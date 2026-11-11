import { expect, test } from '@playwright/test';

test('dev-консоль включает и выключает обучение', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', error => errors.push(error.message));

  try {
    await page.addInitScript(() => {
      localStorage.setItem('pvz_tycoon_tutorial_done', '1');
      localStorage.setItem('pvz_tycoon_results_intro_seen', '1');
      localStorage.setItem('pvz_tycoon_argue_intro_seen', '1');
      localStorage.setItem('pvz_tycoon_shift4_intro_seen', '1');
    });
    await page.goto('/');
    await page.getByRole('button', { name: 'Начать смену', exact: true }).click();
    await page.waitForFunction(() => window.game);

    await page.keyboard.press('F2');
    await expect(page.locator('#dev-console')).toBeVisible();
    await expect(page.locator('#dev-tutorial-status')).toHaveText('Обучение: выключено');
    await expect(page.locator('#dev-tutorial-status')).not.toHaveClass(/on/);

    await page.getByRole('button', { name: 'Включить', exact: true }).click();
    await expect(page.locator('#dev-console')).toBeHidden();
    await expect(page.locator('#tutorial')).toBeVisible();
    await expect(page.locator('#tutorial-kicker')).toHaveText('ОБУЧЕНИЕ · СМЕНА 1');
    expect(
      await page.evaluate(() => ({
        tutorial: localStorage.getItem('pvz_tycoon_tutorial_done'),
        results: localStorage.getItem('pvz_tycoon_results_intro_seen'),
        argue: localStorage.getItem('pvz_tycoon_argue_intro_seen'),
        shift4: localStorage.getItem('pvz_tycoon_shift4_intro_seen'),
        shift: (window as any).game.run.shift,
      })),
    ).toEqual({ tutorial: null, results: null, argue: null, shift4: null, shift: 1 });

    await page.keyboard.press('F2');
    await expect(page.locator('#dev-console')).toBeVisible();
    await expect(page.locator('#dev-tutorial-status')).toHaveText('Обучение: включено');
    await expect(page.locator('#dev-tutorial-status')).toHaveClass(/on/);

    await page.getByRole('button', { name: 'Выключить', exact: true }).click();
    await expect(page.locator('#tutorial')).toBeHidden();
    await expect(page.locator('#dev-tutorial-status')).toHaveText('Обучение: выключено');
    const state = await page.evaluate(() => ({
      tutorial: localStorage.getItem('pvz_tycoon_tutorial_done'),
      results: localStorage.getItem('pvz_tycoon_results_intro_seen'),
      argue: localStorage.getItem('pvz_tycoon_argue_intro_seen'),
      shift4: localStorage.getItem('pvz_tycoon_shift4_intro_seen'),
      modal: (window as any).game.modalOpen,
      phase: (window as any).game.phase,
    }));
    expect(state.tutorial).toBe('1');
    expect(state.results).toBe('1');
    expect(state.argue).toBe('1');
    expect(state.shift4).toBe('1');
    expect(state.modal).toBe(false);
    expect(state.phase).not.toBe('menu');
  } finally {
    expect(errors, 'console.error and uncaught browser exceptions').toEqual([]);
  }
});
