import { expect, test, type Page } from '@playwright/test';

async function setup(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => {
    for (const key of ['pvz_tycoon_tutorial_done', 'pvz_tycoon_results_intro_seen', 'pvz_tycoon_argue_intro_seen', 'pvz_tycoon_shift4_intro_seen']) localStorage.setItem(key, '1');
  });
  await page.goto('/');
  await page.waitForFunction(() => window.game);
  await page.evaluate(() => {
    const g = (window as any).game;
    g.renderer.setAnimationLoop(null);
    g.debugSetShift(5); g.debugBoss();
    g.finalBossGalya.preplaceAtFront();
    g.renderer.render(g.scene, g.camera);
  });
  return errors;
}

async function expectTranscript(page: Page, phase: number) {
  const original = await page.evaluate(async phase => {
    const source = '/src/data.ts', data = await import(source);
    return [data.FINAL_BOSS_ENTRANCE_LINES, data.FINAL_BOSS_MID_LINES, data.FINAL_BOSS_FITTING_LINES][phase - 1];
  }, phase);
  expect(await page.locator('#final-boss-dialogue .final-boss-text').allTextContents()).toEqual(original.map((l: any) => l.text));
  expect(await page.locator('#final-boss-dialogue .final-boss-speaker').allTextContents()).toEqual(original.map((l: any) => l.speaker));
  await expect(page.locator('#final-boss-phase-label')).toHaveText(`ФАЗА ${phase} / 3`);
  await expect(page.locator('.family-partner')).toBeVisible();
  const position = await page.locator('.family-partner-art').evaluate(el => (el as HTMLElement).style.backgroundPosition);
  expect(position).toBe(`${phase === 1 ? '0%' : phase === 2 ? '100%' : '50%'} 50%`);
}

async function deliverBarcode(page: Page) {
  return page.evaluate(() => {
    const g = (window as any).game, client = g.finalBossGalya, order = client.order;
    client.preplaceAtFront();g.service.begin(client, order);
    while (g.service.remainingItems().length) {
      const item = g.service.remainingItems()[0];
      g.takeParcel(g.world.cells.find((cell: any) => cell.id === item.cellId), order);
    }
    g.deliver();return { count: order.items.length, stage: g.finalBoss.stage };
  });
}

test('final duet preserves all three transcripts, 2/3/4 parcels, fitting walk and three returns', async ({ page }) => {
  const errors = await setup(page);
  expect(await page.evaluate(() => ({
    valera: (window as any).game.finalBossValera.rig.body.name,
    galya: (window as any).game.finalBossGalya.rig.body.name,
  }))).toEqual({ valera: 'valera-body', galya: 'galina-body' });
  await expectTranscript(page, 1);
  const initial = await page.evaluate(() => {
    const g = (window as any).game, patience = g.finalBossGalya.patience;
    g.update(1);
    return { modal: g.modalOpen, patienceUnchanged: patience === g.finalBossGalya.patience };
  });
  expect(initial).toEqual({ modal: true, patienceUnchanged: true });
  await page.locator('#final-boss-done').press('Enter');
  expect(await page.evaluate(() => (window as any).game.finalBoss.debuff)).toBe(true);
  expect(await deliverBarcode(page)).toEqual({ count: 2, stage: 'collect' });
  expect(await deliverBarcode(page)).toEqual({ count: 3, stage: 'mid' });
  await expectTranscript(page, 2);
  await page.locator('#final-boss-done').click();
  expect(await deliverBarcode(page)).toEqual({ count: 4, stage: 'fittingWalk' });
  const walk = await page.evaluate(() => {
    const g = (window as any).game, valera = g.finalBossValera;
    let frames = 0;
    while (g.finalBoss.stage === 'fittingWalk' && frames < 600) {
      valera.update(1 / 60, frames / 60);g.updateFinalBoss(1 / 60);frames++;
    }
    return { frames, stage: g.finalBoss.stage, modal: g.modalOpen };
  });
  expect(walk.frames).toBeGreaterThan(20);
  expect(walk).toMatchObject({ stage: 'fittingTalk', modal: true });
  await expectTranscript(page, 3);
  await expect(page.locator('#final-boss-done')).toHaveText('Забрать возврат');
  await page.locator('#final-boss-done').click();
  await expect(page.locator('.family-partner')).toBeHidden();
  const final = await page.evaluate(async () => {
    const g = (window as any).game, source = '/src/data.ts', { RETURN_POINT } = await import(source);
    for (let i = 0; i < 3; i++) {
      g.finalBossGalya.preplaceAtFront();g.takeFinalBossReturn();
      if (!g.service.carryingReturn) throw new Error('Missing final return');
      g.movement.snapTo(RETURN_POINT);g.depositReturn();
    }
    return { active: g.finalBoss.active, stage: g.finalBoss.stage, phase: g.phase, served: g.run.served, debuff: g.finalBoss.debuff, returning: g.service.carryingReturn };
  });
  expect(final).toMatchObject({ active: false, phase: 'results', served: 3, debuff: false, returning: false });
  expect(errors).toEqual([]);
});

test('final portraits and keyboard scroll work on compact screens without leaking into other bosses', async ({ page }) => {
  const errors = await setup(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const count = await page.locator('#boss-modal *').count();
  const textureCount = await page.evaluate(() => (window as any).game.renderer.info.memory.textures);
  for (const viewport of [{width:1600,height:960},{width:844,height:390},{width:568,height:320},{width:390,height:844},{width:320,height:568}]) {
    await page.setViewportSize(viewport);
    for (const phase of [1, 2, 3]) {
      await page.evaluate(async phase => {
        const source = '/src/data.ts', d = await import(source);
        (window as any).ui.showFinalBossDialogue(`ФАЗА ${phase} / 3`, [d.FINAL_BOSS_ENTRANCE_LINES, d.FINAL_BOSS_MID_LINES, d.FINAL_BOSS_FITTING_LINES][phase - 1], phase === 3 ? 'Забрать возврат' : 'Дальше');
      }, phase);
      await expectTranscript(page, phase);
      await expect(page.locator('#final-boss-done')).toBeFocused();
      for (const selector of ['#final-boss-done', '#final-boss-dialogue', '#boss-name']) {
        const b = (await page.locator(selector).boundingBox())!;
        expect(b.x).toBeGreaterThanOrEqual(0);expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.x+b.width).toBeLessThanOrEqual(viewport.width);expect(b.y+b.height).toBeLessThanOrEqual(viewport.height);
      }
      expect(await page.locator('#boss-modal *').count()).toBe(count - (phase === 2 ? 9 : 0));
      await page.keyboard.press('Tab');
      await expect(page.locator('#final-boss-dialogue')).toBeFocused();
      await page.keyboard.press('End');
      await expect.poll(() => page.locator('#final-boss-dialogue').evaluate(el => el.scrollHeight-el.clientHeight-el.scrollTop)).toBeLessThanOrEqual(1);
      await page.keyboard.press('Tab');
      await expect(page.locator('#final-boss-done')).toBeFocused();
    }
  }
  const result = await page.evaluate(async () => {
    const g = (window as any).game, el = document.querySelector('.family-partner-art')!;
    const src = getComputedStyle(el).backgroundImage.match(/url\(["']?(.*?)["']?\)/)![1];
    const image = new Image();image.src=src;await image.decode();
    g.renderer.render(g.scene,g.camera);
    return { width:image.width,height:image.height,textures:g.renderer.info.memory.textures,animations:document.getElementById('boss-modal')!.getAnimations({subtree:true}).length };
  });
  expect(result.width).toBe(result.height*3);expect(result.textures).toBe(textureCount);expect(result.animations).toBe(0);
  await page.evaluate(() => (window as any).ui.showBoss(10,'Обычная реплика'));
  await expect(page.locator('.family-partner')).toBeHidden();
  await expect(page.locator('#boss-modal')).toHaveAttribute('data-dialogue-mode','choice');
  expect(errors).toEqual([]);
});
