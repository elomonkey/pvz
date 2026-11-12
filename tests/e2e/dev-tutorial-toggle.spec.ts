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
      localStorage.setItem('pvz_tycoon_scanner_break_seen', '1');
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
        scanner: localStorage.getItem('pvz_tycoon_scanner_break_seen'),
        shift: (window as any).game.run.shift,
      })),
    ).toEqual({ tutorial: null, results: null, argue: null, shift4: null, scanner: null, shift: 1 });

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
      scanner: localStorage.getItem('pvz_tycoon_scanner_break_seen'),
      modal: (window as any).game.modalOpen,
      phase: (window as any).game.phase,
    }));
    expect(state.tutorial).toBe('1');
    expect(state.results).toBe('1');
    expect(state.argue).toBe('1');
    expect(state.shift4).toBe('1');
    expect(state.scanner).toBe('1');
    expect(state.modal).toBe(false);
    expect(state.phase).not.toBe('menu');

    // Exercise the actual scanner-break event after disabling its tutorial.
    await page.keyboard.press('F2');
    await page.evaluate(() => {
      const g = (window as any).game;
      g.renderer.setAnimationLoop(null);
      g.debugBoss();
      g.bossClient.preplaceAtFront();
      g.update(.01);
    });
    await expect(page.locator('#boss-modal')).toBeVisible();
    await page.locator('#boss-argue').click();
    await page.evaluate(() => {
      const g = (window as any).game;
      for (let i = 0; i < 35; i++) g.mashBoss();
      g.update(6);
    });
    await expect(page.locator('#boss-result-title')).toHaveText('Вы победили в споре!');
    expect(await page.evaluate(() => (window as any).game.scannerBroken)).toBe(true);
    await page.locator('#boss-done').click();
    await expect(page.locator('#tutorial')).toBeHidden();
    await page.evaluate(() => (window as any).game.update(1));
    await expect(page.locator('#tutorial')).toBeHidden();
    expect(await page.evaluate(() => ({
      pending: (window as any).game.scannerBreakPending,
      card: (window as any).game.scannerBreakCardOpen,
      seen: localStorage.getItem('pvz_tycoon_scanner_break_seen'),
    }))).toEqual({ pending: false, card: false, seen: '1' });
  } finally {
    expect(errors, 'console.error and uncaught browser exceptions').toEqual([]);
  }
});

test('без флага сканера статус обучения включён даже при остальных четырёх флагах', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.addInitScript(() => {
      for (const key of ['pvz_tycoon_tutorial_done', 'pvz_tycoon_results_intro_seen',
        'pvz_tycoon_argue_intro_seen', 'pvz_tycoon_shift4_intro_seen']) localStorage.setItem(key, '1');
      localStorage.removeItem('pvz_tycoon_scanner_break_seen');
    });
    await page.goto('/');
    await page.waitForFunction(() => window.game);
    await page.keyboard.press('F2');
    await expect(page.locator('#dev-console')).toBeVisible();
    await expect(page.locator('#dev-tutorial-status')).toHaveText('Обучение: включено');
    await expect(page.locator('#dev-tutorial-status')).toHaveClass(/on/);
    // The basic tutorial is inactive here: the early-return path must also save the flag.
    await page.getByRole('button', { name: 'Выключить', exact: true }).click();
    await expect(page.locator('#dev-tutorial-status')).toHaveText('Обучение: выключено');
    expect(await page.evaluate(() => localStorage.getItem('pvz_tycoon_scanner_break_seen'))).toBe('1');
  } finally { expect(errors, 'console.error and uncaught browser exceptions').toEqual([]); }
});
