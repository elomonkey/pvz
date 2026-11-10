import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const argument = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? fallback : process.argv[index + 1];
};
const label = argument('label', 'current');
const variant = argument('variant', 'current');
if (!['current', 'no-shadows', 'no-shadows-lambert'].includes(variant)) throw new Error('Unknown variant');
if (!/^[a-z0-9-]+$/i.test(label)) throw new Error('Label must be a simple filename');
const output = resolve('test-results/perf', label);
await mkdir(output, { recursive: true });
const server = await createServer({ server: { host: '127.0.0.1', port: 4176, strictPort: true } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch();
  const report = {
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    label, variant, browser: browser.version(), viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 1, seed: 73129, sampleMs: 5000, warmupMs: 2000,
    method: 'RAF intervals; paused service simulation, animated world; refresh uses synchronous 1-pixel readPixels, includes readback overhead',
    scenes: [],
  };
  for (const scenario of ['two-clients', 'four-clients-decor']) {
    const context = await browser.newContext({ viewport: report.viewport, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.addInitScript(() => {
      let seed = 73129;
      Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
      window.resetPerfRandom = () => { seed = 73129; };
      localStorage.setItem('pvz_tycoon_tutorial_done', '1');
    });
    await page.goto('http://127.0.0.1:4176');
    await page.waitForFunction(() => window.game);
    const setup = await page.evaluate(async ({ scenario, variant }) => {
      const { ARCHETYPES } = await import('/src/data.ts');
      const game = window.game;
      // Stop RAF during fixture setup; use the same seeded creation/update sequence.
      game.renderer.setAnimationLoop(null);
      window.resetPerfRandom();
      game.debugSetShift(scenario === 'two-clients' ? 1 : 5);
      if (scenario === 'four-clients-decor') {
        game.debugAddMoney(50000);
        for (const id of ['cat', 'clock', 'rug', 'sign', 'walls', 'floor', 'tv']) game.buyDecor(id);
      }
      game.update(1.3); // Enter the first wave through the normal director.
      const ids = scenario === 'two-clients' ? ['office', 'elderly'] : ['office', 'elderly', 'student', 'courier'];
      game.spawnQueue = ids.map(id => ({ archetype: ARCHETYPES.find(value => value.id === id), patience: 35, mixed: false }));
      while (game.spawnQueue.length) game.spawnNext();
      for (let i = 0; i < 300; i++) game.update(0.05);
      game.helpOpen = true;
      let convertedMaterials = 0;
      if (variant !== 'current') game.renderer.shadowMap.enabled = false;
      if (variant === 'no-shadows-lambert') {
        let template;
        game.scene.traverse(object => { if (object.material?.isMeshLambertMaterial) template = object.material; });
        const replacements = new Map();
        game.scene.traverse(object => {
          if (!object.material?.isMeshStandardMaterial) return;
          const old = object.material;
          if (!replacements.has(old)) {
            const material = template.clone();
            material.color.copy(old.color);
            material.map = old.map;
            material.vertexColors = old.vertexColors;
            material.flatShading = old.flatShading;
            replacements.set(old, material);
          }
          object.material = replacements.get(old);
        });
        convertedMaterials = replacements.size;
        for (const old of replacements.keys()) old.dispose();
      }
      game.time = 15;
      game.renderer.setAnimationLoop(() => {
        game.update(1 / 60);
        window.ui.update(1 / 60);
        game.renderer.render(game.scene, game.camera);
        window.labelRenderer.render(game.scene, game.camera);
      });
      const gl = game.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        clients: game.queue.map(client => client.archetype.id), convertedMaterials,
        gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
      };
    }, { scenario, variant });
    if (setup.clients.length !== (scenario === 'two-clients' ? 2 : 4)) throw new Error('Fixture client count changed');
    await page.waitForTimeout(2000);
    const result = await page.evaluate(async () => {
      const renderer = window.game.renderer;
      const times = [];
      const draws = []; const triangles = [];
      let previous = await new Promise(requestAnimationFrame);
      const started = previous;
      while (previous - started < 5000) {
        const now = await new Promise(requestAnimationFrame);
        times.push(now - previous); previous = now;
        draws.push(renderer.info.render.calls); triangles.push(renderer.info.render.triangles);
      }
      const sorted = [...times].sort((a, b) => a - b);
      return {
        elapsedMs: previous - started, frames: times.length,
        frameMs: { avg: times.reduce((a, b) => a + b, 0) / times.length, p95: sorted[Math.ceil(sorted.length * 0.95) - 1], max: sorted.at(-1) },
        drawCalls: Math.max(...draws), triangles: Math.max(...triangles),
        textures: renderer.info.memory.textures, programs: renderer.info.programs.length,
      };
    });
    const refresh = await page.evaluate(() => {
      const game = window.game; const renderer = game.renderer;
      const light = game.scene.children.find(object => object.isDirectionalLight && object.castShadow);
      if (!renderer.shadowMap.enabled || !light) return { enabled: false, refreshMs: 0, extraMs: 0 };
      const gl = renderer.getContext();
      const pixel = new Uint8Array(4);
      const sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      const measure = () => { sync(); const start = performance.now(); renderer.render(game.scene, game.camera); sync(); return { ms: performance.now() - start, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }; };
      const cached = measure();
      light.shadow.needsUpdate = true;
      const refreshed = measure();
      return { enabled: true, cachedMs: cached.ms, refreshMs: refreshed.ms, extraMs: refreshed.ms - cached.ms, drawCalls: refreshed.calls, triangles: refreshed.triangles };
    });
    // Fixed animation pose for the before/after screenshots, same camera and UI.
    await page.evaluate(() => {
      const game = window.game; game.renderer.setAnimationLoop(null); game.time = 15; game.update(0);
      game.renderer.render(game.scene, game.camera); window.labelRenderer.render(game.scene, game.camera);
    });
    await page.screenshot({ path: resolve(output, `${scenario}.png`) });
    if (errors.length) throw new Error(errors.join('\n'));
    const scene = { scenario, ...setup, ...result, shadowRefresh: refresh };
    report.scenes.push(scene);
    console.log(JSON.stringify(scene));
    await context.close();
  }
  await writeFile(resolve(output, 'metrics.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`Report: ${resolve(output, 'metrics.json')}`);
  if (process.argv.includes('--check-budget')) {
    for (const scene of report.scenes) {
      const limit = scene.scenario === 'two-clients' ? 150 : 180;
      if (scene.drawCalls > limit || scene.triangles > 150000 ||
          (scene.shadowRefresh.enabled && (scene.shadowRefresh.drawCalls > 180 || scene.shadowRefresh.triangles > 150000))) {
        throw new Error(`Rendering budget exceeded: ${scene.scenario}`);
      }
    }
  }
} finally {
  await browser?.close();
  await server.close();
}
