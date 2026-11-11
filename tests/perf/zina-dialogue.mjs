import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// npm run build && node tests/perf/zina-dialogue.mjs
// Production overlay comparison and reproducible screenshots of the same encounter.
const server = await preview({ preview: { host: '127.0.0.1', port: 4178, strictPort: true } });
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
  await page.goto('http://127.0.0.1:4178');
  await page.waitForFunction(() => window.game);
  await page.evaluate(async () => {
    const g = window.game;
    g.renderer.setAnimationLoop(null);
    g.debugSetShift(2);
    g.debugBoss();
    g.bossClient.preplaceAtFront();
    g.update(0.01);
    g.run.stress = 20;
    const image = new Image();
    image.src = getComputedStyle(document.querySelector('.dialogue-portrait-art')).backgroundImage.slice(5, -2);
    await image.decode();
  });
  const images = resolve('docs/screenshots/zina');
  await mkdir(images, { recursive: true });
  const capture = async name => {
    await page.evaluate(() => {
      const g = window.game;
      g.renderer.render(g.scene, g.camera);
      window.labelRenderer.render(g.scene, g.camera);
    });
    await page.waitForTimeout(600);
    await page.screenshot({ path: resolve(images, `${name}.png`) });
  };
  await capture('puzzle-desktop');
  for (const [name, width, height] of [
    ['puzzle-portrait', 390, 844], ['puzzle-landscape', 844, 390],
    ['puzzle-small', 320, 568], ['puzzle-small-landscape', 568, 320],
  ]) {
    await page.setViewportSize({ width, height });
    await capture(name);
  }
  await page.setViewportSize({ width: 1600, height: 960 });
  const metrics = await page.evaluate(async () => {
    const g = window.game, ui = window.ui, r = g.renderer;
    const quote = document.getElementById('boss-quote').textContent;
    const gl = r.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    const rows = [];
    r.setAnimationLoop(() => {
      g.update(1 / 60);
      ui.update(1 / 60);
      r.render(g.scene, g.camera);
      window.labelRenderer.render(g.scene, g.camera);
    });
    for (const stage of ['scene-only', 'zina-puzzle']) {
      if (stage === 'scene-only') ui.hideBoss();
      else ui.showZinaGame('Баба Зина', quote, g.zina.target, g.zina.board, g.zina.time, 75);
      await new Promise(resolve => setTimeout(resolve, 1000));
      const times = [];
      let previous = await new Promise(requestAnimationFrame), start = previous;
      while (previous - start < 5000) {
        const now = await new Promise(requestAnimationFrame);
        times.push(now - previous);
        previous = now;
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
  await page.evaluate(() => window.game.update(Math.max(0, window.game.zina.time - 15)));
  await capture('worried');
  await page.evaluate(() => window.game.update(76));
  await capture('timeout');
  // A fresh encounter; solve the actual shuffled board via real legal clicks.
  const path = await page.evaluate(() => {
    const g = window.game;
    window.ui.hideBoss();
    g.debugSetShift(2); g.debugBoss(); g.bossClient.preplaceAtFront(); g.update(.01);
    const links = [[1,3],[0,2,4],[1,5],[0,4,6],[1,3,5,7],[2,4,8],[3,7],[4,6,8],[5,7]];
    const queue = [{ board: [...g.zina.board], path: [] }];
    const seen = new Set([JSON.stringify(queue[0].board)]);
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const node = queue[cursor];
      if ([0,1,3,4].every((index, i) => node.board[index] === g.zina.target[i])) return node.path;
      const empty = node.board.indexOf(null);
      for (const index of links[empty]) {
        const board = [...node.board];
        [board[empty], board[index]] = [board[index], board[empty]];
        const key = JSON.stringify(board);
        if (seen.has(key)) continue;
        seen.add(key); queue.push({ board, path: [...node.path, index] });
      }
    }
    throw new Error('No solution');
  });
  for (const index of path) await page.locator(`[data-tile-index="${index}"]`).click();
  await capture('success');
  for (const [name, width, height] of [['success-portrait', 320, 568], ['success-landscape', 568, 320]]) {
    await page.setViewportSize({ width, height });
    await capture(name);
  }
  const output = resolve('test-results/perf/zina-overlay');
  await mkdir(output, { recursive: true });
  const report = { build: 'production preview', browser: browser.version(), viewport: { width: 1600, height: 960 },
    method: 'same shift-2 encounter, service paused; 1s warmup + 5s RAF each; intro excluded; WebGL counters exclude CSS atlas memory',
    ...metrics, errors };
  await writeFile(resolve(output, 'metrics.json'), JSON.stringify(report, null, 2) + '\n');
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
}
