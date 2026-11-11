import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const label = process.argv[2] ?? 'current';
if (!/^[a-z0-9-]+$/i.test(label)) throw new Error('Invalid label');
const output = resolve('test-results/perf/final-boss', label);
await mkdir(output, { recursive: true });
const server = await createServer({
  server: { host: '127.0.0.1', port: 4190, strictPort: true },
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch();
  const rows = [],
    errors = [];
  for (const shift of [5]) {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 1,
    });
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    await page.addInitScript(() => {
      let seed = 73129;
      Math.random = () =>
        (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
      localStorage.setItem('pvz_tycoon_tutorial_done', '1');
    });
    await page.goto('http://127.0.0.1:4190');
    await page.waitForFunction(() => window.game);
    const row = await page.evaluate(async (shift) => {
      const g = window.game,
        r = g.renderer;
      r.setAnimationLoop(null);
      g.debugSetShift(shift);
      g.debugBoss();
      const valera = g.finalBossValera;
      valera.preplaceAtFront();
      g.update(0.01);
      window.ui.hideBoss();
      g.helpOpen = true;
      const counts = { total: 0, visible: 0 };
      const triangles = (o) =>
        (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
      valera.root.traverse((o) => {
        if (o.isMesh) counts.total += triangles(o);
      });
      valera.root.traverseVisible((o) => {
        if (o.isMesh) counts.visible += triangles(o);
      });
      r.setAnimationLoop(() => {
        g.update(1 / 60);
        r.render(g.scene, g.camera);
        window.labelRenderer.render(g.scene, g.camera);
      });
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const times = [];
      let previous = await new Promise(requestAnimationFrame),
        start = previous;
      while (previous - start < 5000) {
        const now = await new Promise(requestAnimationFrame);
        times.push(now - previous);
        previous = now;
      }
      const sorted = [...times].sort((a, b) => a - b);
      r.setAnimationLoop(null);
      const gl = r.getContext(),
        ext = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        shift,
        characterTriangles: counts,
        frameMs: {
          avg: times.reduce((a, b) => a + b, 0) / times.length,
          p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
          max: sorted.at(-1),
        },
        frames: times.length,
        drawCalls: r.info.render.calls,
        triangles: r.info.render.triangles,
        geometries: r.info.memory.geometries,
        textures: r.info.memory.textures,
        programs: r.info.programs.length,
        gpu: ext
          ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)
          : gl.getParameter(gl.RENDERER),
      };
    }, shift);
    await page.screenshot({ path: resolve(output, `shift-${shift}.png`) });
    rows.push(row);
    await page.close();
  }
  const report = {
    revision: execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim(),
    label,
    method:
      'seed 73129, 1280x900 DPR1, actual shift 5 final boss encounter, help service paused, world animated; 1.5s warmup + 5s RAF',
    browser: browser.version(),
    rows,
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
  await server.close();
}
