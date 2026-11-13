// npm run build && node tests/visual/intermission.mjs
import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';

const output = 'docs/screenshots/78-intermission';
await mkdir(output, { recursive: true });
const server = await preview({ preview: { host: '127.0.0.1', port: 4189, strictPort: true } });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, hasTouch: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => {
    for (const key of ['tutorial_done', 'results_intro_seen', 'argue_intro_seen', 'shift4_intro_seen', 'scanner_break_seen']) localStorage.setItem(`pvz_tycoon_${key}`, '1');
  });
  await page.goto('http://127.0.0.1:4189');
  await page.waitForFunction(() => window.game);
  await page.evaluate(() => {
    const g = window.game;
    g.renderer.setAnimationLoop(null); g.debugSetShift(2);
    // Visual fixture only; salary/quests still go through the real endShift.
    g.run.served = 18; g.run.money = 950; g.run.stress = 12;
    for (const id of ['speed', 'charm', 'tolerance', 'toy']) g.run.upgrades[id] = 1;
    g.endShift();
    g.renderer.render(g.scene, g.camera); window.labelRenderer.render(g.scene, g.camera);
  });
  await page.locator('#results-portrait').evaluate(img => img.decode());
  for (const [name, width, height] of [['desktop', 1600, 1000], ['landscape', 844, 390], ['small', 568, 320], ['portrait', 390, 844]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => new Promise(requestAnimationFrame));
    await page.evaluate(() => {
      const g = window.game;
      g.renderer.render(g.scene, g.camera); window.labelRenderer.render(g.scene, g.camera);
    });
    await page.locator('#intermission-step-results').click();
    await page.screenshot({ animations: 'disabled', path: `${output}/${name}-results.png` });
    await page.locator('#results-to-shop').click();
    await page.waitForFunction(() => !document.getElementById('next-shift').disabled);
    await page.evaluate(async () => {
      const url = getComputedStyle(document.querySelector('.upgrade-icon')).backgroundImage.slice(5, -2);
      const image = new Image(); image.src = url; await image.decode();
    });
    await page.screenshot({ animations: 'disabled', path: `${output}/${name}-shop.png` });
    if (name === 'desktop' || name === 'landscape') {
      await page.getByRole('tab', { name: 'Оформление ПВЗ', exact: true }).click();
      await page.screenshot({ animations: 'disabled', path: `${output}/${name}-decor.png` });
      await page.getByRole('tab', { name: 'Улучшения', exact: true }).click();
    }
  }
  await writeFile(`${output}/smoke.json`, JSON.stringify({ errors, viewports: ['1600×1000', '844×390', '568×320', '390×844'] }, null, 2) + '\n');
  console.log(JSON.stringify({ errors }));
  if (errors.length) throw new Error('Production intermission smoke failed');
} finally {
  await browser.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
