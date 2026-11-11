import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

// npm run build && node tests/perf/final-dialogue.mjs
const server = await preview({
  preview: { host: '127.0.0.1', port: 4192, strictPort: true },
});
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1600, height: 960 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.addInitScript(() => {
    let seed = 73129;
    Math.random = () =>
      (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
    for (const key of [
      'pvz_tycoon_tutorial_done',
      'pvz_tycoon_results_intro_seen',
      'pvz_tycoon_argue_intro_seen',
      'pvz_tycoon_shift4_intro_seen',
    ])
      localStorage.setItem(key, '1');
  });
  await page.goto('http://127.0.0.1:4192');
  await page.waitForFunction(() => window.game);
  await page.evaluate(async () => {
    const g = window.game;
    g.renderer.setAnimationLoop(null);
    g.debugSetShift(5);
    g.debugBoss();
    g.finalBossGalya.preplaceAtFront();
    for (const selector of ['.dialogue-portrait-art']) {
      const image = new Image();
      image.src = getComputedStyle(
        document.querySelector(selector),
      ).backgroundImage.slice(5, -2);
      await image.decode();
    }
  });
  const images = resolve('docs/screenshots/final-boss');
  await mkdir(images, { recursive: true });
  const capture = async (name) => {
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      const g = window.game;
      for (const client of g.clients) client.rig.update(0, false, 1.5);
      g.renderer.render(g.scene, g.camera);
      window.labelRenderer.render(g.scene, g.camera);
    });
    await page.screenshot({
      path: resolve(images, `${name}.png`),
      animations: 'disabled',
    });
  };
  const capturePhase = async (number) => {
    for (const [name, width, height] of [
      ['desktop', 1600, 960],
      ['mobile', 390, 844],
      ['small', 320, 568],
      ['landscape', 568, 320],
    ]) {
      await page.setViewportSize({ width, height });
      await capture(`phase-${number}-${name}`);
    }
    await page.setViewportSize({ width: 1600, height: 960 });
  };
  const finishDialogue = async (number) => {
    for (let index = 0; index < (number === 2 ? 3 : 6); index++) {
      if (index === 1) {
        await capture(`phase-${number}-valera-desktop`);
        await page.setViewportSize({ width: 390, height: 844 });
        await capture(`phase-${number}-valera-mobile`);
        await page.setViewportSize({ width: 1600, height: 960 });
      }
      if (index === 5) await capture(`phase-${number}-narrator`);
      await page.locator('#final-boss-done').click();
    }
  };
  await page.evaluate(() =>
    document.getElementById('boss-modal').classList.add('hidden'),
  );
  await capture('valera-bag-in-game');
  await page.screenshot({
    path: resolve(images, 'valera-bag-detail.png'),
    clip: { x: 540, y: 350, width: 240, height: 240 },
  });
  await page.evaluate(() =>
    document.getElementById('boss-modal').classList.remove('hidden'),
  );
  await capturePhase(1);
  const metrics = await page.evaluate(async () => {
    const g = window.game,
      r = g.renderer,
      modal = document.getElementById('boss-modal'),
      rows = [];
    r.setAnimationLoop(() => {
      r.render(g.scene, g.camera);
      window.labelRenderer.render(g.scene, g.camera);
    });
    for (const stage of ['scene-only', 'speaker-visible']) {
      modal.classList.toggle('hidden', stage === 'scene-only');
      await new Promise((r) => setTimeout(r, 1000));
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
        frames: times.length,
        frameMs: {
          avg: times.reduce((a, b) => a + b, 0) / times.length,
          p95: sorted[Math.ceil(times.length * 0.95) - 1],
          max: sorted.at(-1),
        },
        drawCalls: r.info.render.calls,
        triangles: r.info.render.triangles,
        geometries: r.info.memory.geometries,
        textures: r.info.memory.textures,
        programs: r.info.programs.length,
      });
    }
    r.setAnimationLoop(null);
    const gl = r.getContext(),
      ext = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      rows,
      gpu: ext
        ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
        : gl.getParameter(gl.RENDERER),
    };
  });
  const deliver = () =>
    page.evaluate(() => {
      const g = window.game,
        client = g.finalBossGalya,
        order = client.order;
      client.preplaceAtFront();
      g.service.begin(client, order);
      while (g.service.remainingItems().length) {
        const item = g.service.remainingItems()[0];
        g.takeParcel(
          g.world.cells.find((c) => c.id === item.cellId),
          order,
        );
      }
      g.deliver();
    });
  await finishDialogue(1);
  await deliver();
  await deliver();
  await capturePhase(2);
  await finishDialogue(2);
  await deliver();
  await page.evaluate(() => {
    const g = window.game;
    for (let i = 0; i < 25; i++) {
      g.finalBossValera.update(1 / 60, i / 60);
      g.updateFinalBoss(1 / 60);
    }
  });
  await capture('fitting-walk');
  await page.evaluate(() => {
    const g = window.game;
    for (let i = 0; i < 600 && g.finalBoss.stage === 'fittingWalk'; i++) {
      g.finalBossValera.update(1 / 60, i / 60);
      g.updateFinalBoss(1 / 60);
    }
    if (g.finalBoss.stage !== 'fittingTalk')
      throw new Error('Fitting dialogue did not open');
  });
  await capturePhase(3);
  await finishDialogue(3);
  await capture('return-in-game');
  const output = resolve('test-results/perf/final-dialogue');
  await mkdir(output, { recursive: true });
  const report = {
    revision: execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim(),
    build: 'production preview',
    browser: browser.version(),
    viewport: { width: 1600, height: 960 },
    seed: 73129,
    method:
      'same frozen final encounter, DPR1, 1s warmup + 5s RAF each; entry animation excluded; CSS atlases excluded from WebGL counters',
    ...metrics,
    errors,
  };
  await writeFile(
    resolve(output, 'metrics.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  await new Promise((resolve, reject) =>
    server.httpServer.close((e) => (e ? reject(e) : resolve())),
  );
}
