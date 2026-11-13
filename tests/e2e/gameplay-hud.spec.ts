import { expect, test } from '@playwright/test';

test.use({ hasTouch: true });

for (const viewport of [{ width: 1600, height: 1000 }, { width: 844, height: 390 }, { width: 667, height: 375 }, { width: 568, height: 320 }]) {
  test(`HUD stays reachable at ${viewport.width}×${viewport.height}, including quests and boss statuses`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      for (const key of ['tutorial_done', 'results_intro_seen', 'argue_intro_seen', 'shift4_intro_seen', 'scanner_break_seen']) localStorage.setItem(`pvz_tycoon_${key}`, '1');
    });
    await page.goto('/');
    await page.waitForFunction(() => window.game);
    await page.evaluate(async () => {
      const g = (window as any).game, path = '/src/data.ts';
      const { ARCHETYPES } = await import(path);
      g.renderer.setAnimationLoop(null); g.debugSetShift(4); g.update(1.3);
      g.spawnQueue = ['office', 'student', 'elderly', 'mom'].map(id => ({ archetype: ARCHETYPES.find((a: any) => a.id === id), patience: 35, mixed: false }));
      while (g.spawnQueue.length) g.spawnNext();
      for (let i = 0; i < 300; i++) g.update(.02);
      g.renderer.render(g.scene, g.camera); (window as any).labelRenderer.render(g.scene, g.camera);
    });
    await expect(page.locator('#banner')).toBeHidden();
    const compact = viewport.height <= 520;
    expect(await page.locator('#quest-panel').evaluate(el => (el as HTMLDetailsElement).open)).toBe(!compact);
    if (compact) {
      await expect(page.locator('#quest-list')).toBeHidden();
      await page.locator('#quest-panel summary').tap();
      await expect(page.locator('#quest-list')).toBeVisible();
      // Native summary keyboard support, with no custom duplicate click handler.
      await page.locator('#quest-panel summary').focus();
      await page.keyboard.press('Space');
      await expect(page.locator('#quest-list')).toBeHidden();
    }
    const mutedBefore = await page.locator('#btn-mute').getAttribute('aria-pressed');
    await page.locator('#btn-mute').tap();
    await expect(page.locator('#btn-mute')).toHaveAttribute('aria-pressed', mutedBefore === 'true' ? 'false' : 'true');
    await expect(page.locator('#btn-mute svg')).toBeVisible();
    await page.locator('#btn-help').tap();
    await expect(page.locator('#help-modal')).toBeVisible();
    await page.locator('#help-close').click();
    await expect(page.locator('#help-modal')).toBeHidden();

    await page.evaluate(() => {
      const ui = (window as any).ui;
      ui.setOrderChip('Ячейка', 'B-3-2', 'cell');
      ui.setPrompt('Подойдите к стеллажу B и выберите ячейку.');
      ui.updateStress(88); ui.setBuff(10);
      ui.setFinalBossStatus(true, 2, '2/3'); ui.setFinalBossDebuff(true);
    });
    await expect(page.locator('#order-chip')).toBeVisible();
    await expect(page.locator('#order-value')).toHaveText('B-3-2');
    await expect(page.locator('#prompt')).toBeHidden();
    await expect(page.locator('#stress-card')).toHaveClass(/critical/);
    const rects = await page.evaluate(() => {
      const selectors = ['.hud-shift', '.hud-mid', '.hud-actions', '#quest-panel', '#stress-card', '#order-chip', '#debuff-chip', '#final-boss-status', '#final-boss-debuff'];
      const rect = (el: Element) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
      return { panels: selectors.map(selector => ({ selector, ...rect(document.querySelector(selector)!) })),
        clients: [...document.querySelectorAll('.client-label:not(.menu) .client-tag')].map(rect),
        buttons: ['btn-mute', 'btn-help'].map(id => rect(document.getElementById(id)!)) };
    });
    await testInfo.attach('hud-bounds', { body: JSON.stringify(rects, null, 2), contentType: 'application/json' });
    for (const panel of rects.panels) {
      expect(panel.x, panel.selector).toBeGreaterThanOrEqual(0);
      expect(panel.y, panel.selector).toBeGreaterThanOrEqual(0);
      expect(panel.right, panel.selector).toBeLessThanOrEqual(viewport.width);
      expect(panel.bottom, panel.selector).toBeLessThanOrEqual(viewport.height);
    }
    const intersects = (a: typeof rects.clients[number], b: typeof rects.clients[number]) => a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom;
    for (let i = 0; i < rects.panels.length; i++) {
      for (const other of rects.panels.slice(i + 1)) expect(intersects(rects.panels[i], other), `${rects.panels[i].selector} overlaps ${other.selector}`).toBe(false);
    }
    for (const button of rects.buttons) { expect(button.width).toBeGreaterThanOrEqual(44); expect(button.height).toBeGreaterThanOrEqual(44); }
    expect(rects.clients).toHaveLength(4);
    for (let i = 0; i < rects.clients.length; i++) {
      for (const other of rects.clients.slice(i + 1)) expect(intersects(rects.clients[i], other), 'client tags overlap').toBe(false);
      for (const panel of rects.panels) expect(intersects(rects.clients[i], panel), `client tag covered by ${panel.selector}`).toBe(false);
    }
    for (const state of ['search', 'carry', 'return']) {
      await page.evaluate(state => { const ui = (window as any).ui; ui.setOrderChip('Особый заказ', 'B-3-2', state); ui.setPrompt('Важная подсказка'); }, state);
      await expect(page.locator('#prompt')).toBeVisible();
    }
    await page.evaluate(() => { const ui = (window as any).ui; ui.setOrderChip(null); ui.setPrompt('Кликните по клиенту у стойки, чтобы отсканировать заказ.'); });
    await expect(page.locator('#prompt')).toBeVisible();
    // Rotation / resize reflows the same session and resets only presentation.
    if (compact) {
      await page.setViewportSize({ width: viewport.height, height: viewport.width });
      await expect(page.locator('#hud')).toBeVisible();
      await page.setViewportSize(viewport);
      await expect.poll(() => page.locator('#quest-panel').evaluate(el => (el as HTMLDetailsElement).open)).toBe(false);
    }
    expect(errors).toEqual([]);
  });
}

test('landscape touch: client → scanner hold → cell → delivery with compact HUD', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setViewportSize({ width: 844, height: 390 });
  await page.addInitScript(() => {
    for (const key of ['tutorial_done', 'results_intro_seen', 'argue_intro_seen', 'shift4_intro_seen', 'scanner_break_seen']) localStorage.setItem(`pvz_tycoon_${key}`, '1');
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Начать смену', exact: true }).tap();
  await page.waitForFunction(() => { const g = (window as any).game; return g.queue[0] && g.isServableFront(g.queue[0]); });
  const name = await page.evaluate(() => (window as any).game.queue[0].archetype.name);
  const tag = page.locator('.client-tag').filter({ hasText: name }).first();
  await tag.tap();
  await expect(page.locator('#scanner-panel')).toBeVisible();
  const hold = await page.locator('#scan-hold').boundingBox();
  const input = await page.context().newCDPSession(page);
  await input.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: hold!.x + hold!.width / 2, y: hold!.y + hold!.height / 2 }] });
  try { await expect(page.locator('#scanner-result-view')).toBeVisible(); }
  finally { await input.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await input.detach(); }
  const cell = (await page.locator('#scan-cell').innerText()).trim();
  await page.locator('#scan-ok').tap();
  await expect(page.locator('#order-chip')).toBeVisible();
  await expect(page.locator('#order-value')).toContainText(cell);
  await expect(page.locator('#prompt')).toBeHidden();
  await page.evaluate(() => { const g = (window as any).game; g.onShelfClick(g.service.active.order.shelf); });
  await expect(page.locator('#cell-panel')).toBeVisible();
  await page.locator(`[data-cell-id="${cell}"]`).tap();
  await expect.poll(() => page.evaluate(() => (window as any).game.service.readyToDeliver)).toBe(true);
  await expect(page.locator('#prompt')).toBeVisible();
  await tag.tap();
  await expect(page.locator('#hud-served')).toHaveText('1');
  await expect.poll(() => page.evaluate(() => (window as any).game.service.active === null)).toBe(true);
  expect(errors).toEqual([]);
});
