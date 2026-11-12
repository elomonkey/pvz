import { expect, test, type Page } from '@playwright/test';

import { solve } from './helpers/zina-solver';

const neighbors = [[1, 3], [0, 2, 4], [1, 5], [0, 4, 6], [1, 3, 5, 7], [2, 4, 8], [3, 7], [4, 6, 8], [5, 7]];

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  return errors;
}

async function setup(page: Page) {
  await page.addInitScript(() => localStorage.setItem('pvz_tycoon_tutorial_done', '1'));
  await page.goto('/');
  await page.waitForFunction(() => window.game);
  await page.evaluate(() => {
    const game = (window as any).game;
    game.renderer.setAnimationLoop(null);
    game.debugSetShift(2);
    game.debugBoss();
    game.bossClient.preplaceAtFront();
    game.update(0.01);
    game.run.stress = 20;
    game.run.reputation = 3;
  });
  await expect(page.locator('#boss-modal')).toHaveAttribute('data-portrait-character', 'zina');
  await expect(page.locator('#boss-modal')).toHaveAttribute('data-dialogue-mode', 'puzzle');
}

async function state(page: Page) {
  return page.evaluate(() => {
    const g = (window as any).game;
    return { board: [...g.zina.board] as (number | null)[], target: [...g.zina.target] as number[] };
  });
}

test('Зина: портрет, клавиатура и реальные ходы сохраняют победу и выдачу посылки', async ({ page }) => {
  const errors = watchErrors(page);
  await setup(page);
  const lines = await page.evaluate(async () => {
    const path = '/src/data.ts';
    const { ZINA_INTRO_LINES, ZINA_WIN_LINE } = await import(path);
    return { intro: ZINA_INTRO_LINES, win: ZINA_WIN_LINE };
  });
  expect(lines.intro).toContain(await page.locator('#boss-quote').textContent());
  await expect(page.locator('#boss-modal')).toHaveAttribute('aria-describedby', 'boss-quote zina-hint');
  await expect(page.locator('#boss-modal')).toHaveAttribute('data-emotion', 'stern');
  expect(await page.locator('#zina-puzzle button').first().evaluate(el => el === document.activeElement)).toBe(true);
  await page.locator('#zina-puzzle button').last().focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('#zina-puzzle button').first()).toBeFocused();

  const before = await state(page);
  const empty = before.board.indexOf(null);
  const illegal = before.board.findIndex((value, index) => value !== null && !neighbors[empty].includes(index));
  await page.locator(`[data-tile-index="${illegal}"]`).click();
  await expect(page.locator('#zina-feedback')).toHaveText('Плитку можно двигать только рядом с пустой клеткой.');
  expect((await state(page)).board).toEqual(before.board);

  const moves = solve(before.board, before.target);
  for (const index of moves) {
    await page.locator(`[data-tile-index="${index}"]`).focus();
    await page.keyboard.press('Enter');
    expect(await page.evaluate(() => document.getElementById('boss-modal')!.contains(document.activeElement))).toBe(true);
  }
  await expect(page.locator('#boss-result-title')).toHaveText('Штрихкод собран!');
  await expect(page.locator('#boss-quote')).toHaveText(lines.win);
  await expect(page.locator('#boss-modal')).toHaveAttribute('data-emotion', 'surprised');
  await expect(page.locator('#boss-done')).toBeFocused();
  expect(await page.evaluate(() => {
    const g = (window as any).game;
    return { stress: g.run.stress, reputation: g.run.reputation, pending: g.zinaOrderPending };
  })).toEqual({ stress: 12, reputation: 3.2, pending: true });
  await page.keyboard.press('Enter');
  await expect(page.locator('#boss-modal')).toBeHidden();
  expect(await page.evaluate(() => (window as any).game.bossClient.order !== null)).toBe(true);
  expect(await page.evaluate(() => document.body.classList.contains('in-boss-dialogue'))).toBe(false);
  const delivery = await page.evaluate(() => {
    const g = (window as any).game, order = g.service.active.order;
    g.deliver();
    const before = { served: g.run.served, ready: g.service.readyToDeliver };
    g.takeParcel(g.world.cells.find((cell: any) => cell.id === order.cellId), order);
    const ready = g.service.readyToDeliver;
    g.deliver();
    return { before, ready, served: g.run.served, active: g.service.active, carrying: g.service.carrying, phase: g.phase };
  });
  expect(delivery).toEqual({ before: { served: 0, ready: false }, ready: true, served: 1, active: null, carrying: false, phase: 'break' });
  expect(errors).toEqual([]);
});

test('Зина: тревога по таймеру, таймаут и исходные последствия', async ({ page }) => {
  const errors = watchErrors(page);
  await setup(page);
  await page.evaluate(() => (window as any).game.update(55));
  await expect(page.locator('#boss-modal')).toHaveAttribute('data-emotion', 'angry');
  await expect(page.locator('#zina-timer-fill')).toHaveClass('danger');
  expect(await page.evaluate(() => (window as any).game.run.stress)).toBe(20);
  await page.evaluate(() => (window as any).game.update(21));
  await expect(page.locator('#boss-result-title')).toHaveText('Штрихкод не собран');
  await expect(page.locator('#boss-modal')).toHaveAttribute('data-dialogue-mode', 'result');
  await expect(page.locator('#boss-modal')).toHaveAttribute('data-emotion', 'angry');
  expect(await page.evaluate(() => {
    const g = (window as any).game;
    return { stress: g.run.stress, reputation: g.run.reputation };
  })).toEqual({ stress: 35, reputation: 2.5 });
  await page.locator('#boss-done').click();
  await expect(page.locator('#boss-modal')).toBeHidden();
  expect(await page.evaluate(() => (window as any).game.phase)).toBe('break');
  expect(errors).toEqual([]);
});

test('Зина: мобильные плитки доступны, reduced motion и повторные открытия стабильны', async ({ page }) => {
  const errors = watchErrors(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await setup(page);
  for (const viewport of [
    { width: 1600, height: 960 }, { width: 1280, height: 720 },
    { width: 844, height: 390 }, { width: 667, height: 375 }, { width: 568, height: 320 },
    { width: 390, height: 844 }, { width: 360, height: 640 }, { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(viewport);
    for (const selector of ['#boss-name', '#boss-quote', '.zina-phone', '#zina-hint', '#zina-timer-fill']) {
      const box = await page.locator(selector).boundingBox();
      expect(box, `${viewport.width}: ${selector}`).not.toBeNull();
      expect(box!.x, selector).toBeGreaterThanOrEqual(0);
      expect(box!.y, selector).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width, selector).toBeLessThanOrEqual(viewport.width);
      expect(box!.y + box!.height, selector).toBeLessThanOrEqual(viewport.height);
    }
    for (const tile of await page.locator('#zina-puzzle button').all()) {
      const box = (await tile.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(await tile.evaluate(el => {
        const r = el.getBoundingClientRect();
        return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)!.closest('button') === el;
      })).toBe(true);
    }
    if (viewport.width < viewport.height) {
      expect(await page.evaluate(() => {
        const range = new Range();
        range.selectNodeContents(document.getElementById('boss-quote')!);
        return document.querySelector('.dialogue-portrait')!.getBoundingClientRect().bottom <= range.getClientRects()[0].top;
      }), 'portrait must clear the first text line').toBe(true);
    }
  }
  const count = await page.locator('#boss-modal *').count();
  await page.evaluate(() => {
    const ui = (window as any).ui, g = (window as any).game;
    for (let i = 0; i < 20; i++) {
      ui.hideBoss();
      ui.showZinaGame('Баба Зина', document.getElementById('boss-quote')!.textContent, g.zina.target, g.zina.board, 75, 75);
    }
  });
  expect(await page.locator('#boss-modal *').count()).toBe(count);
  expect(await page.locator('#boss-modal').evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0);
  await page.evaluate(async () => {
    const path = '/src/data.ts';
    const { ZINA_WIN_LINE } = await import(path);
    (window as any).ui.showBossResult('Штрихкод собран!',
      'Баба Зина прикладывает штрихкод к телефону. Заберите посылку из ячейки A-2-3 и отдайте ей.', true, ZINA_WIN_LINE);
  });
  for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 568, height: 320 }]) {
    await page.setViewportSize(viewport);
    for (const selector of ['#boss-quote', '#boss-result-title', '#boss-done']) {
      const box = (await page.locator(selector).boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
    }
    expect(await page.evaluate(() => {
      const range = new Range();
      range.selectNodeContents(document.getElementById('boss-quote')!);
      const portrait = document.querySelector('.dialogue-portrait')!.getBoundingClientRect();
      const line = range.getClientRects()[0];
      return innerWidth < innerHeight ? portrait.bottom <= line.top : portrait.right <= line.left;
    }), 'result portrait must clear the dialogue text').toBe(true);
  }
  expect(errors).toEqual([]);
});
