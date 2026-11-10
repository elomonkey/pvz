import { expect, test, type Page } from '@playwright/test';
import type { Client } from '../../src/client';

interface GameOverHarness {
  renderer: { setAnimationLoop(callback: null): void };
  debugSetShift(shift: number): void;
  debugBoss(): void;
  bossClient: Client | null;
  run: { stress: number; shift: number; lost: number; money: number };
  phase: string;
  modalOpen: boolean;
  update(dt: number): void;
  startNewGame(): void;
}

async function expireSanya(page: Page, stress: number) {
  await page.addInitScript(() => localStorage.setItem('pvz_tycoon_tutorial_done', '1'));
  await page.goto('/');
  await page.waitForFunction(() => window.game);
  return page.evaluate((stress) => {
    const game = (window as unknown as { game: GameOverHarness }).game;
    game.renderer.setAnimationLoop(null);
    game.debugSetShift(3);
    game.debugBoss();
    const sanya = game.bossClient;
    if (!sanya || sanya.archetype.id !== 'sanya') throw new Error('Expected shift 3 Sanya');
    sanya.preplaceAtFront();
    game.run.stress = stress;
    sanya.setPatience(0);
    // Actual Game.update -> Client.update -> onPatienceZero -> addStress -> gameOver.
    game.update(0.05);
    return {
      phase: game.phase,
      stress: game.run.stress,
      shift: game.run.shift,
      modalOpen: game.modalOpen,
      patience: sanya.patience,
      shouted: sanya.hasShouted,
      lost: game.run.lost,
    };
  }, stress);
}

test('Саня: стресс 99 и терпение 0 оставляют игру в gameover', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const state = await expireSanya(page, 99);
  await testInfo.attach('sanya-timeout.json', {
    body: JSON.stringify(state),
    contentType: 'application/json',
  });
  expect(state).toEqual({
    phase: 'gameover',
    stress: 100,
    shift: 3,
    modalOpen: true,
    patience: 0,
    shouted: true,
    lost: 1,
  });
  await expect(page.locator('#gameover-modal')).toBeVisible();
  await expect(page.locator('#gameover-shift')).toHaveText('3');
  await expect(page.locator('#results-modal')).toBeHidden();
  await page.evaluate(() => {
    const game = (window as unknown as { game: GameOverHarness }).game;
    for (let i = 0; i < 200; i++) game.update(0.05);
  });
  expect(await page.evaluate(() => (window as unknown as { game: GameOverHarness }).game.phase)).toBe(
    'gameover',
  );
  await expect(page.locator('#gameover-modal')).toBeVisible();
  // An intentional new run remains possible; stale transitions must not be needed to unlock it.
  await page.evaluate(() => (window as unknown as { game: GameOverHarness }).game.startNewGame());
  expect(await page.evaluate(() => (window as unknown as { game: GameOverHarness }).game.phase)).toBe(
    'break',
  );
  await expect(page.locator('#gameover-modal')).toBeHidden();
  expect(errors).toEqual([]);
});

test('Саня: таймаут при невысоком стрессе по-прежнему запускает передышку', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const state = await expireSanya(page, 20);
  expect(state.phase).toBe('break');
  expect(state.stress).toBe(26);
  expect(state.lost).toBe(1);
  await page.evaluate(() => (window as unknown as { game: GameOverHarness }).game.update(5.3));
  expect(await page.evaluate(() => (window as unknown as { game: GameOverHarness }).game.phase)).toBe(
    'playing',
  );
  await expect(page.locator('#gameover-modal')).toBeHidden();
  expect(errors).toEqual([]);
});

test('после увольнения поздние переходы и callbacks не меняют экран; restart работает', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await expireSanya(page, 99);
  const result = await page.evaluate(() => {
    const game = (window as any).game;
    const snapshot = () => ({
      phase: game.phase,
      modalOpen: game.modalOpen,
      stress: game.run.stress,
      shift: game.run.shift,
      money: game.run.money,
      lost: game.run.lost,
      clients: game.clients.map((client: Client) => client.id),
      step: game.director.currentIndex,
      gameOverHidden: document.getElementById('gameover-modal')!.classList.contains('hidden'),
      resultsHidden: document.getElementById('results-modal')!.classList.contains('hidden'),
      bossHidden: document.getElementById('boss-modal')!.classList.contains('hidden'),
      startHidden: document.getElementById('start-screen')!.classList.contains('hidden'),
    });
    const initial = snapshot();
    const transitions: [string, unknown[]][] = [
      ['onClientPatienceZero', [game.bossClient]],
      ['finishBossStep', []],
      ['finishCurrentStep', []],
      ['startBreak', [0, 0]],
      ['executeStep', [0]],
      ['startWave', [3]],
      ['spawnBoss', []],
      ['spawnSanya', []],
      ['spawnFinalBoss', []],
      ['finishFinalBoss', [false]],
      ['endShift', []],
      ['onBossDone', []],
      ['onFinalBossDialogueDone', []],
      ['finishZinaGame', [false]],
      ['startZinaOrder', []],
      ['beginShift', [4]],
      ['debugSetShift', [5]],
      ['debugBoss', []],
      ['nextShift', []],
      ['setupMenu', []],
      ['addStress', [-30]],
      ['gameOver', []],
      ['update', [10]],
    ];
    const attempts = transitions.map(([method, args]) => {
      game[method](...args);
      return { method, state: snapshot() };
    });
    return { initial, attempts };
  });
  expect(result.initial.phase).toBe('gameover');
  expect(result.initial.modalOpen).toBe(true);
  for (const attempt of result.attempts) expect(attempt.state, attempt.method).toEqual(result.initial);
  await expect(page.locator('#gameover-modal')).toBeVisible();
  await page.locator('#restart-btn').click();
  await expect(page.locator('#gameover-modal')).toBeHidden();
  await expect(page.locator('#start-screen')).toBeVisible();
  expect(await page.evaluate(() => (window as any).game.phase)).toBe('menu');
  await page.locator('#start-btn').click();
  await page.evaluate(() => (window as any).game.update(1.3));
  expect(await page.evaluate(() => (window as any).game.phase)).toBe('playing');
  expect(errors).toEqual([]);
});
