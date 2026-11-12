import { expect, test as base } from '@playwright/test';

const bossModule = /\/(?:src\/ui\/bossView\.ts|assets\/bossView-[^/]+\.js)(?:\?|$)/;
const devModule = /\/(?:src\/ui\/devConsole\.ts|assets\/devConsole-[^/]+\.js)(?:\?|$)/;
const test = base.extend<{ errors: string[] }>({
  errors: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    try { await use(errors); } finally { expect(errors).toEqual([]); }
  }, { auto: true }],
});

test('optional UI loads on action, reuses its modules and binds buttons once', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', r => requests.push(r.url()));
  await page.addInitScript(() => localStorage.setItem('pvz_tycoon_tutorial_done', '1'));
  await page.goto('/');
  await expect(page.locator('#start-screen')).toBeVisible();
  expect(requests.filter(url => bossModule.test(url) || devModule.test(url))).toEqual([]);
  await page.getByRole('button', { name: 'Начать смену', exact: true }).click();
  await page.waitForFunction(() => (window as any).ui.boss !== null);
  expect(requests.filter(url => bossModule.test(url))).toHaveLength(1);
  expect(requests.filter(url => devModule.test(url))).toHaveLength(0);
  await page.keyboard.press('F2');
  await expect(page.locator('#dev-console')).toBeVisible();
  const money = await page.evaluate(() => (window as any).game.run.money);
  for (let i = 0; i < 3; i++) {
    await page.locator('#dev-money').click();
    await page.keyboard.press('F2');
    await expect(page.locator('#dev-console')).toBeHidden();
    await page.keyboard.press('F2');
    await expect(page.locator('#dev-console')).toBeVisible();
  }
  expect(await page.evaluate(() => (window as any).game.run.money)).toBe(money + 1500);
  expect(requests.filter(url => devModule.test(url))).toHaveLength(1);
});

test('closing a dialogue before its chunk resolves does not reopen it later', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(bossModule, async route => { await gate; await route.continue(); });
  try {
    await page.goto('/');
    await page.waitForFunction(() => (window as any).ui);
    await page.evaluate(() => {
      const ui = (window as any).ui;
      ui.showBoss(5, 'Первая реплика');
      ui.hideAllModals();
    });
    release();
    await page.waitForFunction(() => (window as any).ui.boss !== null);
    await expect(page.locator('#boss-modal')).toBeHidden();
    const immediate = await page.evaluate(() => {
      const w = window as any;
      w.serveCalls = 0;
      w.game.onBossServe = () => w.serveCalls++;
      w.ui.showBoss(5, 'Повторное открытие');
      return !document.getElementById('boss-modal')!.classList.contains('hidden');
    });
    expect(immediate).toBe(true);
    await expect(page.locator('#boss-quote')).toHaveText('Повторное открытие');
    await page.locator('#boss-serve').click();
    expect(await page.evaluate(() => (window as any).serveCalls)).toBe(1);
  } finally { release(); }
});

test('two shortcuts during dev loading leave it closed; a later shortcut opens it', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route(devModule, async route => { await gate; await route.continue(); });
  try {
    await page.goto('/');
    await page.waitForFunction(() => (window as any).ui);
    await page.keyboard.press('F2');
    await page.keyboard.press('F2');
    release();
    await page.waitForFunction(() => (window as any).ui.dev !== null);
    await expect(page.locator('#dev-console')).toBeHidden();
    await page.keyboard.press('Backquote');
    await expect(page.locator('#dev-console')).toBeVisible();
  } finally { release(); }
});

test('Yandex initialization and ready notification still run once after game startup', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as any;
    localStorage.removeItem('pvz_tycoon_best');
    w.sdkCalls = { init: 0, ready: 0, player: 0, data: 0 };
    w.YaGames = { init: async () => {
      w.sdkCalls.init++;
      return {
        features: { LoadingAPI: { ready: () => w.sdkCalls.ready++ } },
        getPlayer: async () => {
          w.sdkCalls.player++;
          return { getData: async () => { w.sdkCalls.data++; return { best: 9876 }; } };
        },
      };
    } };
  });
  await page.goto('/');
  await expect(page.locator('#start-best')).toHaveText('9876');
  expect(await page.evaluate(() => (window as any).sdkCalls)).toEqual({ init: 1, ready: 1, player: 1, data: 1 });
});
