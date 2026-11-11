import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

// npm run build && node tests/perf/queen-dialogue.mjs
const server = await preview({ preview: { host: '127.0.0.1', port: 4183, strictPort: true } });
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 960 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.addInitScript(() => {
    localStorage.setItem('pvz_tycoon_tutorial_done', '1');
    let seed = 20261111;
    Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  });
  await page.goto('http://127.0.0.1:4183');
  await page.waitForFunction(() => window.game);
  await page.evaluate(async () => {
    const g = window.game;
    g.renderer.setAnimationLoop(null);
    g.debugSetShift(4); g.update(1.3); g.clearClients(); g.spawnQueue = [];
    g.debugBoss(); g.queenClient.preplaceAtFront();
    const image = new Image();
    image.src = getComputedStyle(document.querySelector('.boss-entrance-portrait')).backgroundImage.slice(5, -2);
    await image.decode();
  });
  const images = resolve('docs/screenshots/queen');
  await mkdir(images, { recursive: true });
  const holdBanner = async () => page.evaluate(() => {
    // Only fixtures extend presentation lifetime; Game's original 3/2.2s stay intact.
    window.ui.banner(document.getElementById('banner-title').textContent, document.getElementById('banner-sub').textContent, 30);
  });
  const capture = async name => {
    await page.waitForTimeout(400); // Resize + entrance animations before frozen render.
    await page.evaluate(() => {
      const g = window.game; g.renderer.render(g.scene, g.camera);
      window.labelRenderer.render(g.scene, g.camera);
    });
    await page.screenshot({ path: resolve(images, `${name}.png`) });
  };
  await holdBanner();
  await capture('entrance-desktop');
  const metrics = await page.evaluate(async () => {
    const g = window.game, r = g.renderer, banner = document.getElementById('banner');
    const title = document.getElementById('banner-title').textContent, sub = document.getElementById('banner-sub').textContent;
    const gl = r.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'), rows = [];
    r.setAnimationLoop(() => { r.render(g.scene, g.camera); window.labelRenderer.render(g.scene, g.camera); });
    for (const stage of ['scene-only', 'queen-entrance']) {
      if (stage === 'scene-only') banner.classList.add('hidden');
      else window.ui.banner(title, sub, 30);
      await new Promise(resolve => setTimeout(resolve, 1000));
      const times = []; let previous = await new Promise(requestAnimationFrame), start = previous;
      while (previous - start < 5000) {
        const now = await new Promise(requestAnimationFrame); times.push(now - previous); previous = now;
      }
      const sorted = [...times].sort((a, b) => a - b);
      rows.push({ stage, frames: times.length, frameMs: {
        avg: times.reduce((a, b) => a + b, 0) / times.length,
        p95: sorted[Math.ceil(sorted.length * .95) - 1], max: sorted.at(-1),
      }, drawCalls: r.info.render.calls, triangles: r.info.render.triangles,
      geometries: r.info.memory.geometries, textures: r.info.memory.textures, programs: r.info.programs.length });
    }
    r.setAnimationLoop(null);
    return { rows, gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) };
  });
  await page.evaluate(() => {
    const g = window.game, q = g.queenClient, order = q.order;
    g.service.begin(q, order);
    while (g.service.remainingItems().length) {
      const item = g.service.remainingItems()[0];
      g.takeParcel(g.world.cells.find(cell => cell.id === item.cellId), order);
    }
    g.deliver();
  });
  await capture('fitting');
  await page.evaluate(() => {
    const g = window.game; g.updateQueen(6.1); g.queenClient.preplaceAtFront();
  });
  await holdBanner(); await capture('return-desktop');
  for (const [name, width, height] of [['return-portrait', 390, 844], ['return-small', 320, 568], ['return-landscape', 568, 320]]) {
    await page.setViewportSize({ width, height }); await capture(name);
  }
  await page.setViewportSize({ width: 1600, height: 960 });
  await page.evaluate(() => {
    const g = window.game;
    // Exercise the existing new-order handler separately from the known main
    // scheduling bug after return deposit, documented in the visual report.
    g.returnQueen(); g.queenClient.preplaceAtFront();
  });
  await holdBanner(); await capture('new-order');
  await page.evaluate(() => window.game.finishQueen());
  await holdBanner(); await capture('departure');
  const output = resolve('test-results/perf/queen-overlay');
  await mkdir(output, { recursive: true });
  const report = { revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    workingTreeDirty: !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
    build: 'production preview', browser: browser.version(), viewport: { width: 1600, height: 960 },
    method: 'same frozen shift-4 Queen scene, seed 20261111, DPR 1; 1s warmup + 5s RAF each; entrance animation excluded; banner 30s only in fixture; CSS atlas excluded from WebGL counters',
    ...metrics, errors };
  await writeFile(resolve(output, 'metrics.json'), JSON.stringify(report, null, 2) + '\n');
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
}
