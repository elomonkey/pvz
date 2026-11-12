import { expect, test, type Page } from '@playwright/test';
import { solve } from './helpers/zina-solver';

// Reuse the console API used by the focused boss specs. Only clock/navigation
// are accelerated: orders, deliveries, director steps and shift resets are real.
async function deliver(page: Page, who: 'front' | 'boss' | 'queen' | 'final') {
  return page.evaluate((who) => {
    const g = (window as any).game;
    const client = who === 'boss' ? g.bossClient : who === 'queen' ? g.queenClient
      : who === 'final' ? g.finalBossGalya : g.queue[0];
    if (!client?.order) throw new Error(`Missing ${who} order`);
    client.preplaceAtFront();
    const order = client.order;
    g.service.begin(client, order);
    for (const item of order.items) {
      const cell = g.world.cells.find((cell: any) => cell.id === item.actualCellId);
      if (!cell || !g.warehouse.hasStock(cell.id)) throw new Error('Missing parcel');
      g.takeParcel(cell, order);
    }
    if (!g.service.readyToDeliver) throw new Error('Incomplete collection');
    g.deliver();
    if (g.service.active) throw new Error('Delivery did not clear service');
    return order.items.length;
  }, who);
}

async function settleDepartures(page: Page) {
  // Run actual Client.update/onGone; do not clear clients or reservations in fixtures.
  await page.evaluate(() => {
    const g = (window as any).game;
    for (let frame = 0; frame < 900 && g.clients.some((c: any) => c.state === 'leaving'); frame++) {
      for (const c of [...g.clients]) if (c.state === 'leaving') c.update(1 / 60, frame / 60);
    }
    if (g.clients.some((c: any) => c.state === 'leaving')) throw new Error('Clients never left');
  });
}

async function snapshot(page: Page) {
  return page.evaluate(() => {
    const g = (window as any).game;
    return {
      shift: g.run.shift, phase: g.phase, served: g.run.served,
      service: g.service.active !== null, carrying: g.service.carrying,
      carryingReturn: g.service.carryingReturn, carryColors: [...g.service.carryColors],
      clients: g.clients.map((c: any) => ({ id: c.id, state: c.state, archetype: c.archetype.id })),
      queue: g.queue.length, pending: g.spawnQueue.length,
      reserved: [...g.warehouse.reserved],
      empty: g.world.cells.filter((c: any) => !g.warehouse.hasStock(c.id)).map((c: any) => c.id),
      stockMismatch: g.world.cells.filter((c: any) => c.parcel.visible !== g.warehouse.hasStock(c.id)).map((c: any) => c.id),
      queen: { active: g.queen.active, spawned: g.queen.spawned, budget: g.queen.budget, client: g.queenClient !== null },
      final: { active: g.finalBoss.active, stage: g.finalBoss.stage, debuff: g.finalBoss.debuff, galya: g.finalBossGalya !== null, valera: g.finalBossValera !== null },
      boss: { kind: g.boss.kind, triggered: g.boss.triggered, resolved: g.boss.resolved, client: g.bossClient !== null },
    };
  });
}

async function finishQueen(page: Page) {
  // Drain the real 20–30-item budget, including fitting walks and returns.
  let deliveries = 0, returns = 0;
  for (let visit = 0; visit < 30; visit++) {
    const state = await page.evaluate(() => {
      const g = (window as any).game;
      return { active: g.queen.active, hasReturn: g.queen.hasReturn, budget: g.queen.budget };
    });
    if (!state.active) {
      expect(deliveries).toBeGreaterThanOrEqual(7);
      expect(returns).toBeGreaterThan(0);
      return;
    }
    if (state.hasReturn) {
      await page.evaluate(async () => {
        const g = (window as any).game, path = '/src/data.ts';
        const { RETURN_POINT } = await import(path);
        g.queenClient.preplaceAtFront();
        g.takeQueenReturn();
        if (!g.service.carryingReturn) throw new Error('Queen return not picked');
        g.movement.snapTo(RETURN_POINT);
        g.depositReturn();
      });
      returns++;
    } else {
      expect(await deliver(page, 'queen')).toBe(Math.min(3, state.budget));
      deliveries++;
    }
    await page.evaluate(() => {
      const g = (window as any).game;
      for (let frame = 0; frame < 900 && g.queenWalkingToFitting; frame++) {
        g.queenClient.update(1 / 60, frame / 60);
        g.updateQueen(1 / 60);
      }
      if (g.queenWalkingToFitting) throw new Error('Queen never reached fitting');
      g.updateQueen(6.1);
    });
  }
  throw new Error('Queen did not finish within 30 visits');
}

async function finalDialogue(page: Page, phase: number) {
  const count = await page.evaluate(async (phase) => {
    const path = '/src/data.ts', data = await import(path);
    return [data.FINAL_BOSS_ENTRANCE_LINES, data.FINAL_BOSS_MID_LINES, data.FINAL_BOSS_FITTING_LINES][phase - 1].length;
  }, phase);
  await expect(page.locator('#boss-modal')).toBeVisible();
  for (let line = 0; line < count; line++) await page.locator('#final-boss-done').press('Enter');
  await expect(page.locator('#boss-modal')).toBeHidden();
}

async function finishBoss(page: Page, shift: number) {
  await page.evaluate(() => {
    const g = (window as any).game;
    (g.bossClient ?? g.finalBossGalya).preplaceAtFront();
    g.update(.01);
  });
  if (shift === 1) {
    await expect(page.locator('#boss-modal')).toBeVisible();
    await page.locator('#boss-argue').click();
    await page.evaluate(() => {
      const g = (window as any).game;
      for (let i = 0; i < 35; i++) g.mashBoss();
      g.update(6);
    });
    await expect(page.locator('#boss-result-title')).toHaveText('Вы победили в споре!');
    await page.locator('#boss-done').click();
  } else if (shift === 2) {
    await expect(page.locator('#boss-modal')).toHaveAttribute('data-dialogue-mode', 'puzzle');
    const puzzle = await page.evaluate(() => {
      const z = (window as any).game.zina;
      return { board: [...z.board] as (number | null)[], target: [...z.target] as number[] };
    });
    for (const index of solve(puzzle.board, puzzle.target)) await page.locator(`[data-tile-index="${index}"]`).press('Enter');
    await expect(page.locator('#boss-result-title')).toHaveText('Штрихкод собран!');
    await page.locator('#boss-done').click();
    expect(await deliver(page, 'boss')).toBe(1);
  } else if (shift === 3) {
    expect(await deliver(page, 'boss')).toBe(4);
  } else {
    await finalDialogue(page, 1);
    expect(await deliver(page, 'final')).toBe(2);
    expect(await deliver(page, 'final')).toBe(3);
    await finalDialogue(page, 2);
    expect(await deliver(page, 'final')).toBe(4);
    expect(await page.evaluate(() => {
      const g = (window as any).game;
      for (let frame = 0; frame < 900 && g.finalBoss.stage === 'fittingWalk'; frame++) {
        g.finalBossValera.update(1 / 60, frame / 60);
        g.updateFinalBoss(1 / 60);
      }
      return g.finalBoss.stage;
    })).toBe('fittingTalk');
    await finalDialogue(page, 3);
    await page.evaluate(async () => {
      const g = (window as any).game, path = '/src/data.ts';
      const { RETURN_POINT } = await import(path);
      for (let i = 0; i < 3; i++) {
        g.finalBossGalya.preplaceAtFront();
        g.takeFinalBossReturn();
        if (!g.service.carryingReturn) throw new Error('Final return not picked');
        g.movement.snapTo(RETURN_POINT);
        g.depositReturn();
      }
    });
  }
}

test('непрерывный забег: 5 смен → боссы → магазин → финальные итоги', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  const checkpoints: { boundary: string; state: Awaited<ReturnType<typeof snapshot>> }[] = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.addInitScript(() => {
      for (const key of ['tutorial_done', 'results_intro_seen', 'argue_intro_seen', 'shift4_intro_seen', 'scanner_break_seen']) {
        localStorage.setItem(`pvz_tycoon_${key}`, '1');
      }
      let seed = 51;
      Math.random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
    });
    await page.goto('/');
    await page.waitForFunction(() => window.game);
    await page.evaluate(() => (window as any).game.renderer.setAnimationLoop(null));
    await page.getByRole('button', { name: 'Начать смену', exact: true }).click();

    for (let shift = 1; shift <= 5; shift++) {
      await test.step(`Смена ${shift}: reset → все шаги → итоги → магазин`, async () => {
        const initial = await snapshot(page);
        checkpoints.push({ boundary: `beginShift(${shift})`, state: initial });
        expect(initial).toMatchObject({ shift, phase: 'break', served: 0, service: false, carrying: false, carryingReturn: false,
          carryColors: [], clients: [], queue: 0, pending: 0, reserved: [], empty: [], stockMismatch: [],
          queen: { active: false, spawned: false, budget: 0, client: false },
          final: { active: false, stage: 'idle', debuff: false, galya: false, valera: false },
          boss: { kind: null, triggered: false, resolved: false, client: false } });
        // No debugSetShift/debugBoss/endShift, no director.jumpTo or step replacement.
        const expected = shift === 4 ? ['wave1', 'wave2', 'wave3']
          : shift === 5 ? ['wave1', 'wave2', 'boss'] : ['wave1', 'wave2', 'boss', 'wave3'];
        for (const [index, step] of expected.entries()) {
          await page.evaluate(() => (window as any).game.update(5.3));
          expect(await page.evaluate(() => {
            const g = (window as any).game, s = g.director.currentStep;
            return { index: g.director.currentIndex, step: s.type === 'wave' ? `wave${s.wave}` : 'boss' };
          })).toEqual({ index, step });
          if (step === 'boss') {
            await finishBoss(page, shift);
          } else {
            if (shift === 4 && step === 'wave2') await finishQueen(page);
            // Spawn and serve each scheduled client, preserving the actual wave plan.
            for (let arrivals = 0; arrivals < 10; arrivals++) {
              const pending = await page.evaluate(() => {
                const g = (window as any).game;
                g.updateSpawning(10);
                return g.queue.length;
              });
              if (!pending) break;
              await deliver(page, 'front');
              await settleDepartures(page);
              if (arrivals === 9) throw new Error('Wave did not finish');
            }
            await page.evaluate(() => (window as any).game.checkWaveComplete());
          }
          // Do not clean up after final completion: results must own its cleanup.
          if (shift !== 5) await settleDepartures(page);
          expect(await page.evaluate(() => (window as any).game.phase)).toBe(index === expected.length - 1 ? 'results' : 'break');
        }
        await expect(page.locator('#results-modal')).toBeVisible();
        const result = await snapshot(page);
        checkpoints.push({ boundary: `results(${shift})`, state: result });
        if (shift === 5) {
          // Regression reproduction: normal updates cannot finish the final exit
          // animation once Game.update starts returning early in results.
          await page.evaluate(() => {
            const g = (window as any).game;
            for (let frame = 0; frame < 600; frame++) g.update(1 / 60);
          });
          const settled = await snapshot(page);
          checkpoints.push({ boundary: 'results(5) + 10 seconds of Game.update', state: settled });
          expect.soft(settled.clients, 'final clients must not remain leaving after 10 seconds').toEqual([]);
        }
        expect.soft(result, `shift ${shift} results must not retain sessions, clients or reservations`).toMatchObject({
          shift, phase: 'results', service: false, carrying: false, carryingReturn: false,
          clients: [], queue: 0, pending: 0, reserved: [], stockMismatch: [],
          queen: { active: false, spawned: false, budget: 0, client: false },
          final: { active: false, stage: 'idle', debuff: false, galya: false, valera: false },
        });
        expect(result.served).toBeGreaterThan(0);
        await page.getByRole('button', { name: 'Оформление ПВЗ', exact: true }).click();
        await expect(page.locator('#shop-decor-panel')).toBeVisible();
        if (shift < 5) {
          await expect(page.locator('#next-shift')).toHaveText('Следующая смена →');
          await page.locator('#next-shift').click();
          await expect(page.locator('#results-modal')).toBeHidden();
        } else {
          await expect(page.locator('#next-shift')).toHaveText('В меню');
          await expect(page.locator('#char-shift')).toContainText('5');
        }
      });
    }
  } finally {
    await testInfo.attach('five-shift-checkpoints', { body: JSON.stringify(checkpoints, null, 2), contentType: 'application/json' });
    expect(errors, 'console.error/pageerror across the entire run').toEqual([]);
  }
});
