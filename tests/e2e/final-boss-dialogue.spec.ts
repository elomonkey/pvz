import { expect, test, type Page } from '@playwright/test';

test.use({ hasTouch: true });
async function setup(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.addInitScript(() => {
    for (const key of [
      'pvz_tycoon_tutorial_done',
      'pvz_tycoon_results_intro_seen',
      'pvz_tycoon_argue_intro_seen',
      'pvz_tycoon_shift4_intro_seen',
    ])
      localStorage.setItem(key, '1');
  });
  await page.goto('/');
  await page.waitForFunction(() => window.game);
  await page.evaluate(() => {
    const w = window as any,
      g = w.game;
    g.renderer.setAnimationLoop(null);
    g.debugSetShift(5);
    g.debugBoss();
    g.finalBossGalya.preplaceAtFront();
    g.renderer.render(g.scene, g.camera);
    w.finalAdvances = 0;
    const done = g.onFinalBossDialogueDone.bind(g);
    g.onFinalBossDialogueDone = () => {
      w.finalAdvances++;
      done();
    };
  });
  return errors;
}
async function original(page: Page, phase: number) {
  return page.evaluate(async (phase) => {
    const path = '/src/data.ts',
      d = await import(path);
    return [
      d.FINAL_BOSS_ENTRANCE_LINES,
      d.FINAL_BOSS_MID_LINES,
      d.FINAL_BOSS_FITTING_LINES,
    ][phase - 1];
  }, phase);
}
async function playLines(page: Page, phase: number, touch = false) {
  const lines = await original(page, phase),
    stage = await page.evaluate(() => (window as any).game.finalBoss.stage);
  for (const [i, line] of lines.entries()) {
    await expect(
      page.locator('#final-boss-dialogue .final-boss-text'),
    ).toHaveText(line.text);
    await expect(page.locator('#boss-name')).toHaveText(line.speaker);
    await expect(page.locator('#boss-modal')).toHaveAttribute(
      'data-final-speaker',
      line.tone ?? 'narrator',
    );
    await expect(page.locator('#final-boss-phase-label')).toHaveText(
      `ФАЗА ${phase} / 3`,
    );
    expect(
      await page.locator('#final-boss-dialogue .final-boss-line').count(),
    ).toBe(1);
    if (line.tone === 'narrator')
      await expect(page.locator('.dialogue-portrait')).toBeHidden();
    else {
      await expect(page.locator('.dialogue-portrait')).toBeVisible();
      await expect(page.locator('#boss-modal')).toHaveAttribute(
        'data-portrait-character',
        line.tone,
      );
      const src = await page
        .locator('.dialogue-portrait-art')
        .evaluate((el) => getComputedStyle(el).backgroundImage);
      expect(src).toContain(
        line.tone === 'valera' ? 'valera-expressions' : 'galya-expressions',
      );
    }
    await expect(page.locator('#final-boss-done')).toHaveText(
      i === lines.length - 1 && phase === 3 ? 'Забрать возврат' : 'Дальше',
    );
    expect(
      await page.evaluate(() => (window as any).game.finalBoss.stage),
    ).toBe(stage);
    expect(await page.evaluate(() => (window as any).game.modalOpen)).toBe(
      true,
    );
    if (touch) await page.locator('#final-boss-dialogue').tap();
    else await page.locator('#final-boss-done').press('Enter');
    if (i < lines.length - 1)
      expect(
        await page.evaluate(() => (window as any).game.finalBoss.stage),
      ).toBe(stage);
  }
}
async function deliver(page: Page) {
  return page.evaluate(() => {
    const g = (window as any).game,
      c = g.finalBossGalya,
      o = c.order;
    c.preplaceAtFront();
    g.service.begin(c, o);
    while (g.service.remainingItems().length) {
      const item = g.service.remainingItems()[0];
      g.takeParcel(
        g.world.cells.find((cell: any) => cell.id === item.cellId),
        o,
      );
    }
    g.deliver();
    return { count: o.items.length, stage: g.finalBoss.stage };
  });
}
test('one line per tap preserves all final phases, real Valera bag, fitting walk and three returns', async ({
  page,
}) => {
  const errors = await setup(page);
  expect(
    await page.evaluate(() => {
      const g = (window as any).game,
        r = g.finalBossValera.rig,
        b = r.root.getObjectByName('valera-bag');
      return {
        valera: r.body.name,
        galya: g.finalBossGalya.rig.body.name,
        bag: !!b && b.visible,
        bagMeshes: b?.children.filter((o: any) => o.isMesh && o.visible).length,
      };
    }),
  ).toEqual({
    valera: 'valera-body',
    galya: 'galina-body',
    bag: true,
    bagMeshes: 1,
  });
  const initial = await page.evaluate(() => {
    const g = (window as any).game,
      p = g.finalBossGalya.patience;
    g.update(1);
    return g.modalOpen && p === g.finalBossGalya.patience;
  });
  expect(initial).toBe(true);
  await playLines(page, 1, true);
  expect(await page.evaluate(() => (window as any).finalAdvances)).toBe(1);
  expect(await page.evaluate(() => (window as any).game.finalBoss.debuff)).toBe(
    true,
  );
  expect(await deliver(page)).toEqual({ count: 2, stage: 'collect' });
  expect(await deliver(page)).toEqual({ count: 3, stage: 'mid' });
  await playLines(page, 2);
  expect(await page.evaluate(() => (window as any).finalAdvances)).toBe(2);
  expect(await deliver(page)).toEqual({ count: 4, stage: 'fittingWalk' });
  const walk = await page.evaluate(() => {
    const g = (window as any).game;
    let frames = 0;
    while (g.finalBoss.stage === 'fittingWalk' && frames < 600) {
      g.finalBossValera.update(1 / 60, frames / 60);
      g.updateFinalBoss(1 / 60);
      frames++;
    }
    return { frames, stage: g.finalBoss.stage };
  });
  expect(walk.frames).toBeGreaterThan(20);
  expect(walk.stage).toBe('fittingTalk');
  await playLines(page, 3, true);
  expect(await page.evaluate(() => (window as any).finalAdvances)).toBe(3);
  await expect(page.locator('#boss-modal')).toBeHidden();
  const final = await page.evaluate(async () => {
    const g = (window as any).game,
      path = '/src/data.ts',
      { RETURN_POINT } = await import(path);
    for (let i = 0; i < 3; i++) {
      g.finalBossGalya.preplaceAtFront();
      g.takeFinalBossReturn();
      if (!g.service.carryingReturn) throw new Error('Missing return');
      g.movement.snapTo(RETURN_POINT);
      g.depositReturn();
    }
    return {
      active: g.finalBoss.active,
      phase: g.phase,
      served: g.run.served,
      debuff: g.finalBoss.debuff,
    };
  });
  expect(final).toEqual({
    active: false,
    phase: 'results',
    served: 3,
    debuff: false,
  });
  expect(errors).toEqual([]);
});
test('every individual line fits compact screens, keyboard focus and reduced motion survive profile switches', async ({
  page,
}) => {
  const errors = await setup(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const count = await page.locator('#boss-modal *').count(),
    textures = await page.evaluate(
      () => (window as any).game.renderer.info.memory.textures,
    );
  for (const viewport of [
    { width: 1600, height: 960 },
    { width: 844, height: 390 },
    { width: 568, height: 320 },
    { width: 390, height: 844 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(viewport);
    for (const phase of [1, 2, 3]) {
      await page.evaluate(async (phase) => {
        const path = '/src/data.ts',
          d = await import(path);
        (window as any).ui.showFinalBossDialogue(
          `ФАЗА ${phase} / 3`,
          [
            d.FINAL_BOSS_ENTRANCE_LINES,
            d.FINAL_BOSS_MID_LINES,
            d.FINAL_BOSS_FITTING_LINES,
          ][phase - 1],
          phase === 3 ? 'Забрать возврат' : 'Дальше',
        );
      }, phase);
      for (const [i, line] of (await original(page, phase)).entries()) {
        await expect(
          page.locator('#final-boss-dialogue .final-boss-text'),
        ).toHaveText(line.text);
        await expect(page.locator('#final-boss-done')).toBeFocused();
        for (const selector of [
          '#final-boss-done',
          '#final-boss-dialogue',
          '#boss-name',
        ]) {
          const b = (await page.locator(selector).boundingBox())!;
          expect(b.x, selector).toBeGreaterThanOrEqual(0);
          expect(b.y, selector).toBeGreaterThanOrEqual(0);
          expect(b.x + b.width, selector).toBeLessThanOrEqual(viewport.width);
          expect(b.y + b.height, selector).toBeLessThanOrEqual(viewport.height);
        }
        expect(await page.locator('#boss-modal *').count()).toBe(count);
        await page.keyboard.press('Tab');
        await expect(page.locator('#final-boss-done')).toBeFocused();
        if (i < (await original(page, phase)).length - 1)
          await page.locator('#final-boss-done').click();
      }
    }
  }
  const result = await page.evaluate(async () => {
    const g = (window as any).game;
    g.renderer.render(g.scene, g.camera);
    return {
      textures: g.renderer.info.memory.textures,
      animations: document
        .getElementById('boss-modal')!
        .getAnimations({ subtree: true }).length,
    };
  });
  expect(result).toEqual({ textures, animations: 0 });
  await page.evaluate(() => (window as any).ui.showBoss(10, 'Обычная реплика'));
  await expect(page.locator('#boss-modal')).toHaveAttribute(
    'data-dialogue-mode',
    'choice',
  );
  await expect(page.locator('#boss-modal')).not.toHaveAttribute(
    'data-final-speaker',
  );
  expect(errors).toEqual([]);
});
test('held Enter, hidden late clicks and reopening do not skip lines or finish twice', async ({
  page,
}) => {
  const errors = await setup(page);
  await page.keyboard.down('Enter');
  await expect(page.locator('#final-boss-dialogue')).toHaveAttribute(
    'data-line-index',
    '1',
  );
  await page.keyboard.down('Enter');
  await page.keyboard.down('Enter');
  await page.keyboard.up('Enter');
  await expect(page.locator('#final-boss-dialogue')).toHaveAttribute(
    'data-line-index',
    '1',
  );
  expect(await page.evaluate(() => (window as any).finalAdvances)).toBe(0);
  await page.evaluate(() => (window as any).ui.hideBoss());
  await page
    .locator('#final-boss-done')
    .evaluate((el) => (el as HTMLButtonElement).click());
  expect(await page.evaluate(() => (window as any).finalAdvances)).toBe(0);
  await page.evaluate(async () => {
    const path = '/src/data.ts',
      d = await import(path);
    (window as any).ui.showFinalBossDialogue(
      'ФАЗА 1 / 3',
      d.FINAL_BOSS_ENTRANCE_LINES,
      'Дальше',
    );
  });
  await expect(page.locator('#final-boss-dialogue')).toHaveAttribute(
    'data-line-index',
    '0',
  );
  await playLines(page, 1);
  await page
    .locator('#final-boss-done')
    .evaluate((el) => (el as HTMLButtonElement).click());
  expect(await page.evaluate(() => (window as any).finalAdvances)).toBe(1);
  expect(errors).toEqual([]);
});
