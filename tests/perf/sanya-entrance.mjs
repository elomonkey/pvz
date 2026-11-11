import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

// npm run build && node tests/perf/sanya-entrance.mjs
const server = await preview({ preview: { host: '127.0.0.1', port: 4182, strictPort: true } });
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
  await page.goto('http://127.0.0.1:4182');
  await page.waitForFunction(() => window.game);
  await page.evaluate(async () => {
    const g = window.game;
    g.renderer.setAnimationLoop(null);
    g.debugSetShift(3); g.debugBoss(); g.bossClient.preplaceAtFront(); g.update(.01);
    const image = new Image();
    image.src = getComputedStyle(document.querySelector('.boss-entrance-portrait')).backgroundImage.slice(5, -2);
    await image.decode();
  });
  const images = resolve('docs/screenshots/sanya');
  await mkdir(images, { recursive: true });
  const capture = async name => {
    // Let resize handlers and panel entrance animations settle before the frozen render.
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      const g = window.game;
      g.renderer.render(g.scene, g.camera);
      window.labelRenderer.render(g.scene, g.camera);
    });
    await page.screenshot({ path: resolve(images, `${name}.png`) });
  };
  const caption = await page.locator('#banner-sub').textContent();
  // Only the screenshot/perf fixture extends banner lifetime; production remains 3s.
  await page.evaluate(caption => window.ui.banner('Курьер Саня', caption, 30), caption);
  await page.waitForTimeout(400);
  for (const [name, width, height] of [
    ['entrance-desktop', 1600, 960], ['entrance-portrait', 390, 844],
    ['entrance-landscape', 844, 390], ['entrance-small', 320, 568], ['entrance-small-landscape', 568, 320],
  ]) {
    await page.setViewportSize({ width, height });
    await capture(name);
  }
  await page.setViewportSize({ width: 1600, height: 960 });
  const metrics = await page.evaluate(async caption => {
    const g = window.game, r = g.renderer, banner = document.getElementById('banner');
    const gl = r.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    const rows = [];
    r.setAnimationLoop(() => {
      // Fixed pose/service, same scene in both samples; only the DOM entrance differs.
      r.render(g.scene, g.camera);
      window.labelRenderer.render(g.scene, g.camera);
    });
    for (const stage of ['scene-only', 'sanya-entrance']) {
      if (stage === 'scene-only') banner.classList.add('hidden');
      else window.ui.banner('Курьер Саня', caption, 30);
      await new Promise(resolve => setTimeout(resolve, 1000));
      const times = [];
      let previous = await new Promise(requestAnimationFrame), start = previous;
      while (previous - start < 5000) {
        const now = await new Promise(requestAnimationFrame);
        times.push(now - previous); previous = now;
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
  }, caption);
  await page.locator('.client-tag').filter({ hasText: 'Курьер Саня' }).click();
  await page.evaluate(() => {
    // The frozen RAF above cannot advance a pending walk to the counter.
    for (let i = 0; i < 200 && document.getElementById('scanner-panel').classList.contains('hidden'); i++) {
      window.game.update(.05);
      window.ui.update(.05);
    }
  });
  await page.locator('#scanner-panel').waitFor({ state: 'visible' });
  if (await page.locator('#banner').isVisible()) throw new Error('Entrance obscures scanner');
  await capture('scanner');
  const report = { revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    workingTreeDirty: !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim(),
    build: 'production preview', browser: browser.version(), viewport: { width: 1600, height: 960 },
    method: 'same frozen shift-3 scene; 1s warmup + 5s RAF each; entrance animation excluded; banner 30s only in fixture; CSS atlas excluded from WebGL counters',
    ...metrics, errors };
  const output = resolve('test-results/perf/sanya-entrance');
  await mkdir(output, { recursive: true });
  await writeFile(resolve(output, 'metrics.json'), JSON.stringify(report, null, 2) + '\n');
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
}
