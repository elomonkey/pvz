// npm run build && node tests/visual/gameplay-hud.mjs
import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { mkdir } from 'node:fs/promises';

const output = 'docs/screenshots/76-hud';
await mkdir(output, { recursive: true });
const server = await preview({ preview: { host: '127.0.0.1', port: 4188, strictPort: true } });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, hasTouch: true });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => {
    let seed = 73129;
    Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    for (const key of ['tutorial_done', 'results_intro_seen', 'argue_intro_seen', 'shift4_intro_seen', 'scanner_break_seen']) localStorage.setItem(`pvz_tycoon_${key}`, '1');
  });
  await page.goto('http://127.0.0.1:4188');
  await page.waitForFunction(() => window.game);
  await page.evaluate(() => {
    const g = window.game;
    g.renderer.setAnimationLoop(null); g.debugSetShift(2); g.update(1.3);
    while (g.queue.length < 2 && g.spawnQueue.length) g.spawnNext();
    for (let i = 0; i < 300; i++) g.update(.02);
    g.debugAddMoney(1250); g.addStress(18);
    const client = g.queue[0], order = client.order;
    order.scanned = true; g.service.begin(client, order);
    g.ui.setOrderChip('Ячейка', order.cellId, 'cell'); g.updatePrompt();
  });
  await page.waitForFunction(() => document.getElementById('banner').classList.contains('hidden'));
  for (const [name, width, height] of [['desktop', 1600, 1000], ['landscape', 844, 390], ['compact', 667, 375], ['small', 568, 320]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => new Promise(requestAnimationFrame));
    await page.evaluate(() => {
      const g = window.game;
      g.renderer.render(g.scene, g.camera); window.labelRenderer.render(g.scene, g.camera);
    });
    await page.screenshot({ path: `${output}/${name}.png` });
    if (name === 'landscape') {
      await page.locator('#quest-panel summary').tap();
      await page.screenshot({ path: `${output}/landscape-quests.png` });
      await page.locator('#quest-panel summary').tap();
    }
  }
  console.log(JSON.stringify({ errors }));
  if (errors.length) throw new Error('HUD production smoke failed');
} finally {
  await browser.close();
  await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
}
