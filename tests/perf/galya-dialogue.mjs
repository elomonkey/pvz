import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Build first. A single paused encounter compares scene-only vs the new DOM layer.
const server = await preview({ preview: { host: '127.0.0.1', port: 4178, strictPort: true } });
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.addInitScript(() => localStorage.setItem('pvz_tycoon_tutorial_done', '1'));
  await page.goto('http://127.0.0.1:4178');
  await page.waitForFunction(() => window.game);
  const report = await page.evaluate(async () => {
    const game = window.game,
      renderer = game.renderer,
      ui = window.ui;
    renderer.setAnimationLoop(null);
    game.debugSetShift(1);
    game.debugBoss();
    game.bossClient.preplaceAtFront();
    game.update(0.01);
    const quote = document.getElementById('boss-quote').textContent;
    const gl = renderer.getContext(),
      extension = gl.getExtension('WEBGL_debug_renderer_info');
    renderer.setAnimationLoop(() => {
      game.update(1 / 60);
      ui.update(1 / 60);
      renderer.render(game.scene, game.camera);
      window.labelRenderer.render(game.scene, game.camera);
    });
    const rows = [];
    for (const stage of ['scene-only', 'galya-choice']) {
      if (stage === 'scene-only') ui.hideBoss();
      else ui.showBoss(30, quote, 'Галя');
      // Game.modalOpen stays true in both variants; same world and paused service.
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const times = [];
      let previous = await new Promise(requestAnimationFrame),
        start = previous;
      while (previous - start < 5000) {
        const now = await new Promise(requestAnimationFrame);
        times.push(now - previous);
        previous = now;
      }
      const sorted = [...times].sort((a, b) => a - b);
      rows.push({
        stage,
        frameMs: {
          avg: times.reduce((a, b) => a + b, 0) / times.length,
          p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
          max: sorted.at(-1),
        },
        frames: times.length,
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        geometries: renderer.info.memory.geometries,
        textures: renderer.info.memory.textures,
        programs: renderer.info.programs.length,
      });
    }
    renderer.setAnimationLoop(null);
    return {
      gpu: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      rows,
    };
  });
  const output = resolve('test-results/perf/galya-overlay');
  await mkdir(output, { recursive: true });
  const result = {
    build: 'production preview',
    browser: browser.version(),
    viewport: { width: 1280, height: 900 },
    method:
      'same paused shift-1 Galya encounter; 1s warmup, 5s RAF per state; intro excluded; WebGL counters exclude CSS image memory',
    ...report,
    errors,
  };
  await writeFile(resolve(output, 'metrics.json'), JSON.stringify(result, null, 2) + '\n');
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(JSON.stringify(result));
} finally {
  await browser?.close();
  await new Promise((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  );
}
