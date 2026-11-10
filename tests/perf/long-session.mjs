import { chromium } from '@playwright/test';
import { preview } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { measureLongSession, assertLongSessionPlateau } from './long-session-fixture.mjs';

const argument = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? fallback : process.argv[index + 1];
};
const label = argument('label', 'current');
if (!/^[a-z0-9-]+$/i.test(label)) throw new Error('Label must be a simple filename');
const output = resolve('test-results/long-session', label);
await mkdir(output, { recursive: true });
const server = await preview({ preview: { host: '127.0.0.1', port: 4177, strictPort: true } });
let browser;
try {
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 960, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.addInitScript(() => {
    let seed = 73129;
    Math.random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    localStorage.setItem('pvz_tycoon_tutorial_done', '1');
  });
  await page.goto('http://127.0.0.1:4177');
  await page.waitForFunction(() => window.game);
  const measurement = await page.evaluate(measureLongSession, {
    cycles: 20,
    sampleFrames: 12,
    warmupCycles: 4,
  });
  const report = {
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    label,
    build: 'production preview',
    browser: browser.version(),
    viewport: { width: 960, height: 720 },
    deviceScaleFactor: 1,
    seed: 73129,
    method:
      '20 real start/restart cycles; four student/mom clients with parcels, then two menu clients; 2 settle RAF + 12 sampled RAF per state; first 4 cycles warmup',
    ...measurement,
    errors,
  };
  await writeFile(resolve(output, 'metrics.json'), JSON.stringify(report, null, 2) + '\n');
  await page.screenshot({ path: resolve(output, 'final-menu.png') });
  for (const stage of ['active', 'menu']) {
    const rows = report.rows.filter((row) => row.stage === stage);
    console.log(JSON.stringify({ stage, first: rows[0], last: rows.at(-1) }));
  }
  console.log(`Report: ${resolve(output, 'metrics.json')}`);
  if (errors.length) throw new Error(errors.join('\n'));
  if (process.argv.includes('--check-plateau')) assertLongSessionPlateau(report);
} finally {
  await browser?.close();
  await new Promise((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  );
}
