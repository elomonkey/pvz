import { expect, test, type Page } from '@playwright/test';

async function setup(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.addInitScript(() => {
    for (const key of [
      'tutorial_done',
      'results_intro_seen',
      'argue_intro_seen',
      'shift4_intro_seen',
      'scanner_break_seen',
    ]) {
      localStorage.setItem(`pvz_tycoon_${key}`, '1');
    }
  });
  await page.goto('/');
  await page.waitForFunction(() => window.game);
  await page.evaluate(() => {
    (window as any).game.renderer.setAnimationLoop(null);
  });
  return errors;
}

test('прогресс продолжается после reload: results → следующая смена', async ({ page }) => {
  const errors = await setup(page);
  const saved = await page.evaluate(() => {
    const g = (window as any).game;
    g.startNewGame();
    g.run.money = 5000;
    g.run.upgrades.speed = 1;
    g.ownedDecor.cat = true;
    g.world.applyDecor(g.ownedDecor);
    g.scannerBroken = true;
    g.endShift();
    g.buyUpgrade('charm');
    return {
      money: g.run.money,
      upgrades: { ...g.run.upgrades },
      decor: { ...g.ownedDecor },
      scannerBroken: g.scannerBroken,
      snapshot: JSON.parse(localStorage.getItem('pvz_tycoon_progress')!),
    };
  });

  expect(saved.snapshot).toMatchObject({
    stage: 'results',
    shift: 1,
    scannerBroken: true,
  });
  expect(saved.snapshot.decor).toContain('cat');

  await page.reload();
  await page.waitForFunction(() => window.game);
  await page.evaluate(() => {
    (window as any).game.renderer.setAnimationLoop(null);
  });
  await expect(page.locator('#continue-btn')).toHaveText('Продолжить · смена 2');
  await expect(page.locator('#continue-btn')).toBeVisible();
  await expect(page.locator('#start-btn')).toHaveText('Начать смену');
  await page.locator('#continue-btn').click();

  const restored = await page.evaluate(() => {
    const g = (window as any).game;
    return {
      shift: g.run.shift,
      phase: g.phase,
      money: g.run.money,
      upgrades: { ...g.run.upgrades },
      decor: { ...g.ownedDecor },
      scannerBroken: g.scannerBroken,
    };
  });
  expect(restored).toMatchObject({
    shift: 2,
    phase: 'break',
    money: saved.money,
    upgrades: saved.upgrades,
    scannerBroken: saved.scannerBroken,
  });
  expect(restored.decor.cat).toBe(true);
  expect(errors).toEqual([]);
});

test('повреждённые upgrades ограничиваются игровыми максимумами при continue', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.addInitScript(() => {
    for (const key of [
      'tutorial_done',
      'results_intro_seen',
      'argue_intro_seen',
      'shift4_intro_seen',
      'scanner_break_seen',
    ]) {
      localStorage.setItem(`pvz_tycoon_${key}`, '1');
    }
    localStorage.setItem('pvz_tycoon_progress', JSON.stringify({
      version: 1,
      stage: 'results',
      shift: 1,
      money: 5000,
      totalServed: 5,
      totalEarned: 5000,
      reputation: 3,
      upgrades: { speed: 1000000, charm: 11, tolerance: -1, toy: '4', scanner: 9 },
      scannerBroken: false,
      decor: [],
      savedAt: 123456789,
    }));
  });
  await page.goto('/');
  await page.waitForFunction(() => window.game);
  await page.evaluate(() => {
    (window as any).game.renderer.setAnimationLoop(null);
  });
  await expect(page.locator('#continue-btn')).toHaveText('Продолжить · смена 2');
  await page.locator('#continue-btn').click();

  const restored = await page.evaluate(() => {
    const g = (window as any).game;
    return {
      shift: g.run.shift,
      phase: g.phase,
      money: g.run.money,
      upgrades: { ...g.run.upgrades },
      saved: JSON.parse(localStorage.getItem('pvz_tycoon_progress')!),
    };
  });
  expect(restored).toMatchObject({
    shift: 2,
    phase: 'break',
    money: 5000,
    upgrades: { speed: 3, charm: 3, tolerance: 0, toy: 3, scanner: 1 },
  });
  expect(restored.saved.upgrades).toEqual({
    speed: 3,
    charm: 3,
    tolerance: 0,
    toy: 3,
    scanner: 1,
  });
  expect(errors).toEqual([]);
});

test('новая игра очищает старый забег, game over не оставляет продолжение', async ({
  page,
}) => {
  const errors = await setup(page);
  await page.evaluate(() => {
    const g = (window as any).game;
    g.startNewGame();
    g.run.money = 999;
    g.run.upgrades.speed = 2;
    g.endShift();
  });

  await page.reload();
  await page.waitForFunction(() => window.game);
  await page.getByRole('button', { name: 'Начать смену', exact: true }).click();

  const fresh = await page.evaluate(() => {
    const g = (window as any).game;
    return {
      shift: g.run.shift,
      money: g.run.money,
      speed: g.run.upgrades.speed,
      progress: JSON.parse(localStorage.getItem('pvz_tycoon_progress')!),
    };
  });
  expect(fresh).toMatchObject({
    shift: 1,
    money: 0,
    speed: 0,
    progress: { stage: 'shift', shift: 1, money: 0 },
  });
  expect(fresh.progress.upgrades.speed).toBe(0);

  await page.evaluate(() => {
    const g = (window as any).game;
    g.run.stress = 100;
    g.gameOver();
  });
  expect(
    await page.evaluate(() => localStorage.getItem('pvz_tycoon_progress')),
  ).toBeNull();
  expect(errors).toEqual([]);
});
