// npm run build && node tests/visual/window-street.mjs
// Production preview, unchanged main camera, identical clients/car position in all phases.
import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';

const output = 'docs/screenshots/74-street';
await mkdir(output, { recursive: true });
const server = await preview({ preview: { host: '127.0.0.1', port: 4188, strictPort: true } });
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
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
  const entrance = await page.evaluate(() => {
    const g = window.game;
    g.renderer.setAnimationLoop(null); g.debugSetShift(2); g.update(1.3);
    while (g.queue.length < 2 && g.spawnQueue.length) g.spawnNext();
    const client = g.queue.at(-1), start = client.position, hiddenLabel = !client.label.visible;
    for (let i = 0; i < 300; i++) g.update(.02);
    return { start, hiddenLabel, waiting: client.state === 'waiting', position: client.position };
  });
  await page.waitForFunction(() => document.getElementById('banner').classList.contains('hidden'));
  for (const phase of [1, 2, 3]) {
    await page.evaluate(phase => {
      const g = window.game; g.world.setDayPhase(phase);
      const time = 64 + (phase - 1) * 36;
      for (let i = 0; i <= 180; i++) g.world.update(time - 6 + i / 30);
      g.renderer.render(g.scene, g.camera); window.labelRenderer.render(g.scene, g.camera);
    }, phase);
    await page.screenshot({ path: `${output}/phase-${phase}.png` });
    await page.screenshot({ path: `${output}/detail-${phase}.png`, clip: { x: 400, y: 210, width: 320, height: 235 } });
  }
  const exit = await page.evaluate(() => {
    const g = window.game, client = g.queue[0];
    client.leave();
    for (let i = 0; i < 600 && client.state !== 'gone'; i++) client.update(1 / 60, i / 60);
    return { state: client.state, position: client.position, visible: client.root.visible };
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await page.evaluate(() => {
    const g = window.game;
    g.renderer.render(g.scene, g.camera); window.labelRenderer.render(g.scene, g.camera);
  });
  await page.screenshot({ path: `${output}/mobile-evening.png` });
  const report = { entrance, exit, errors };
  await writeFile(`${output}/smoke.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
  if (!entrance.waiting || exit.state !== 'gone' || errors.length) throw new Error('Street smoke failed');
} finally {
  await browser.close();
  await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
}
