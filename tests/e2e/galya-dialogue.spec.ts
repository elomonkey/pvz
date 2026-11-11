import { expect, test, type Page } from '@playwright/test';

async function setup(page: Page, shift = 1) {
  await page.addInitScript(() => {
    localStorage.setItem('pvz_tycoon_tutorial_done', '1');
    localStorage.setItem('pvz_tycoon_scanner_break_seen', '1');
  });
  await page.goto('/');
  await page.waitForFunction(() => window.game);
  await page.evaluate((shift) => {
    const game = (window as any).game;
    game.renderer.setAnimationLoop(null);
    game.debugSetShift(shift);
    game.debugBoss();
    if (shift !== 5) {
      game.bossClient.preplaceAtFront();
      game.update(0.01);
    }
    game.renderer.render(game.scene, game.camera);
    (window as any).labelRenderer.render(game.scene, game.camera);
  }, shift);
  await expect(page.locator('#boss-modal')).toBeVisible();
}

test('Галя: исходные ответы, обслуживание и последствия сохранены', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await setup(page);
  await expect(page.locator('#boss-modal')).toHaveAttribute('data-portrait-character', 'galya');
  const original = await page.evaluate(async () => {
    const path = '/src/data.ts';
    const { BOSS_LINES } = await import(path);
    return BOSS_LINES;
  });
  expect(original).toContain(await page.locator('#boss-quote').textContent());
  await expect(page.locator('#boss-serve-title')).toHaveText('Обслужить');
  await expect(page.locator('#boss-argue-title')).toHaveText('Вступить в спор');
  await expect(page.locator('#boss-serve')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#boss-argue')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.locator('#boss-serve')).toBeFocused();
  await page.evaluate(() => {
    (window as any).game.run.stress = 10;
  });
  await page.keyboard.press('Enter');
  await expect(page.locator('#boss-result-title')).toHaveText('Обслужили');
  await expect(page.locator('#boss-modal')).toHaveAttribute('data-emotion', 'stern');
  const state = await page.evaluate(() => {
    const game = (window as any).game;
    return { stress: game.run.stress, scannerBroken: game.scannerBroken, phase: game.phase };
  });
  expect(state).toEqual({ stress: 40, scannerBroken: true, phase: 'boss' });
  await expect(page.locator('#boss-quote')).toHaveText('Наконец-то! Но я всё равно недовольна.');
  await expect(page.locator('#boss-done')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#boss-modal')).toBeHidden();
  expect(await page.evaluate(() => (window as any).game.phase)).toBe('break');
  expect(await page.evaluate(() => document.body.classList.contains('in-boss-dialogue'))).toBe(false);
  expect(errors).toEqual([]);
});

test('Галя: спор, смена эмоций, победа и отложенное увольнение работают', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await setup(page);
  await page.evaluate(() => {
    (window as any).game.run.stress = 20;
  });
  await page.locator('#boss-argue').click();
  await expect(page.locator('#boss-modal')).toHaveAttribute('data-dialogue-mode', 'argue');
  await expect(page.locator('#boss-mash')).toBeFocused();
  await page.keyboard.press('Space');
  expect(await page.evaluate(() => (window as any).game.argumentSystem.mashState.mashTaps)).toBe(1);
  await page.evaluate(() => {
    for (let i = 0; i < 34; i++) (window as any).game.mashBoss();
  });
  await expect(page.locator('#boss-modal')).toHaveAttribute('data-emotion', 'surprised');
  await page.evaluate(() => (window as any).game.update(6));
  await expect(page.locator('#boss-result-title')).toHaveText('Вы победили в споре!');
  await expect(page.locator('#boss-quote')).toHaveText('Ладно, ваша взяла... но я ещё вернусь!');
  expect(await page.evaluate(() => (window as any).game.run.stress)).toBe(0);
  expect(await page.evaluate(() => (window as any).game.run.buffTimer)).toBe(20);
  await page.locator('#boss-done').click();
  await expect(page.locator('#boss-modal')).toBeHidden();

  // Same existing lose path: show the result first, dismiss it, then enter gameover.
  await page.evaluate(() => {
    const game = (window as any).game;
    game.debugSetShift(1);
    game.debugBoss();
    game.bossClient.preplaceAtFront();
    game.update(0.01);
    game.run.stress = 60;
  });
  await page.locator('#boss-argue').click();
  await page.evaluate(() => (window as any).game.update(6));
  await expect(page.locator('#boss-result-title')).toHaveText('Тётка победила');
  expect(await page.evaluate(() => (window as any).game.phase)).toBe('boss');
  await page.locator('#boss-done').click();
  await expect(page.locator('#gameover-modal')).toBeVisible();
  expect(await page.evaluate(() => (window as any).game.phase)).toBe('gameover');
  expect(await page.evaluate(() => document.body.classList.contains('in-boss-dialogue'))).toBe(false);
  expect(errors).toEqual([]);
});

test('Галя: финальные реплики, переход к Зине и fallback клиента работают', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await setup(page, 5);
  const lines = await page.evaluate(async () => {
    const path = '/src/data.ts';
    const { FINAL_BOSS_ENTRANCE_LINES } = await import(path);
    return FINAL_BOSS_ENTRANCE_LINES.map((line: any) => line.text);
  });
  for (const text of lines) {
    await expect(page.locator('#final-boss-dialogue .final-boss-text')).toHaveText(text);
    await page.locator('#final-boss-done').click();
  }
  expect(await page.evaluate(() => (window as any).game.finalBoss.stage)).toBe('collect');
  await expect(page.locator('#boss-modal')).toBeHidden();
  await page.evaluate(() => {
    const game = (window as any).game;
    game.debugSetShift(2);
    game.debugBoss();
    game.bossClient.preplaceAtFront();
    game.update(0.01);
  });
  await expect(page.locator('#boss-zina-view')).toBeVisible();
  await expect(page.locator('#boss-modal')).toHaveAttribute('data-portrait-character', 'zina');
  await expect(page.locator('.dialogue-portrait')).toBeVisible();
  await page.evaluate(() =>
    (window as any).ui.showClientArgue('Студент', 'Я тут полчаса стою! Почему так долго?', 5),
  );
  await expect(page.locator('#boss-modal')).toHaveClass(/client-argue/);
  await expect(page.locator('.dialogue-portrait')).toBeHidden();
  expect(errors).toEqual([]);
});

test('Галя: мобильная компоновка, reduced motion и повторное открытие без накопления DOM', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setup(page);
  const count = await page.locator('#boss-modal *').count();
  for (const viewport of [
    { width: 1600, height: 960 },
    { width: 844, height: 390 },
    { width: 667, height: 375 },
    { width: 568, height: 320 },
    { width: 390, height: 844 },
    { width: 360, height: 640 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(viewport);
    for (const selector of ['#boss-serve', '#boss-argue', '#boss-name', '#boss-quote']) {
      const box = await page.locator(selector).boundingBox();
      expect(box, `${viewport.width}: ${selector}`).not.toBeNull();
      expect(box!.x, selector).toBeGreaterThanOrEqual(0);
      expect(box!.y, selector).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width, selector).toBeLessThanOrEqual(viewport.width);
      expect(box!.y + box!.height, selector).toBeLessThanOrEqual(viewport.height);
    }
    await page.locator('#boss-argue').focus();
    expect(
      await page.locator('#boss-argue').evaluate((el) => {
        const r = el.getBoundingClientRect();
        return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('button')?.id;
      }),
    ).toBe('boss-argue');
  }
  const animations = await page
    .locator('#boss-modal')
    .evaluate((el) => el.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length);
  expect(animations).toBe(0);
  await page.evaluate(() => {
    const ui = (window as any).ui;
    for (let i = 0; i < 20; i++) {
      ui.hideBoss();
      ui.showBoss(30, 'Я жалобу напишу! Мне надоело!', 'Галя');
    }
  });
  expect(await page.locator('#boss-modal *').count()).toBe(count);
  expect(errors).toEqual([]);
});
