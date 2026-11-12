import assert from 'node:assert/strict';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { chromium } from '@playwright/test';
import { preview } from 'vite';

const label = process.argv[2] ?? 'current';
if (!/^[a-z0-9-]+$/.test(label)) throw new Error('Use an alphanumeric report label');
const out = `docs/perf/bundle/${label}.json`;
const assets = [];
for (const name of (await readdir('dist/assets')).sort()) {
  const bytes = await readFile(`dist/assets/${name}`);
  assets.push({ file: `assets/${name}`, raw: bytes.length, gzip: gzipSync(bytes).length });
}
let chunks = null;
try {
  const manifest = JSON.parse(await readFile('dist/.vite/manifest.json', 'utf8'));
  chunks = Object.fromEntries(Object.entries(manifest).filter(([, v]) => v.file.endsWith('.js'))
    .map(([key, v]) => [key, { file: v.file, imports: v.imports ?? [], dynamicImports: v.dynamicImports ?? [] }]));
  const visited = new Set();
  const visiting = new Set();
  function visit(key) {
    assert.ok(!visiting.has(key), `Chunk import cycle: ${key}`);
    if (visited.has(key)) return;
    visiting.add(key);
    for (const dep of [...chunks[key].imports, ...chunks[key].dynamicImports]) visit(dep);
    visiting.delete(key);
    visited.add(key);
  }
  for (const key of Object.keys(chunks)) visit(key);
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const server = await preview({ preview: { host: '127.0.0.1', port: 4178, strictPort: true } });
let browser;
try {
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('pvz_tycoon_tutorial_done', '1'));
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  const requests = [];
  const byId = new Map();
  cdp.on('Network.requestWillBeSent', event => {
    const path = new URL(event.request.url).pathname;
    if (!path.startsWith('/assets/')) return;
    const item = { file: path.slice(1), status: null, wireStatus: null, cached: false, transferred: null };
    requests.push(item);
    byId.set(event.requestId, item);
  });
  cdp.on('Network.requestServedFromCache', event => { const r = byId.get(event.requestId); if (r) r.cached = true; });
  cdp.on('Network.responseReceived', event => {
    const r = byId.get(event.requestId);
    if (r) {
      r.status = event.response.status;
      r.cached ||= !!event.response.fromDiskCache;
      r.cacheControl = event.response.headers['Cache-Control'] ?? event.response.headers['cache-control'] ?? null;
      r.encoding = event.response.headers['Content-Encoding'] ?? event.response.headers['content-encoding'] ?? null;
    }
  });
  cdp.on('Network.responseReceivedExtraInfo', event => { const r = byId.get(event.requestId); if (r) r.wireStatus = event.statusCode; });
  cdp.on('Network.loadingFinished', event => { const r = byId.get(event.requestId); if (r) r.transferred = event.encodedDataLength; });
  const phases = {};
  const assetPhases = {};
  let cursor = 0;
  async function checkpoint(name) {
    await page.waitForTimeout(250);
    assetPhases[name] = requests.slice(cursor).map(r => ({ ...r }));
    phases[name] = assetPhases[name].filter(r => r.file.endsWith('.js'));
    cursor = requests.length;
  }
  async function interactive() {
    await page.waitForFunction(() => window.game && !document.getElementById('start-screen').classList.contains('hidden'));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }
  await page.goto('http://127.0.0.1:4178');
  await interactive();
  await checkpoint('coldMenu');
  await page.getByRole('button', { name: 'Начать смену', exact: true }).click();
  await page.waitForFunction(() => window.game.queue.length > 0);
  await checkpoint('startShift');
  await page.evaluate(() => window.game.endShift());
  await page.locator('#shop-grid button').first().waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Оформление ПВЗ', exact: true }).click();
  await page.locator('#decor-grid button').first().waitFor({ state: 'visible' });
  await checkpoint('shop');
  async function boss() {
    await page.evaluate(() => {
      const g = window.game;
      g.renderer.setAnimationLoop(null);
      g.debugSetShift(1);
      g.debugBoss();
      g.bossClient.preplaceAtFront();
      g.update(.01);
    });
    await page.locator('#boss-modal').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#boss-name').textContent(), 'Галя');
  }
  await boss();
  await checkpoint('boss');
  await boss();
  await checkpoint('bossReopen');
  await page.keyboard.press('F2');
  await page.locator('#dev-console').waitFor({ state: 'visible' });
  const money = await page.evaluate(() => window.game.run.money);
  await page.locator('#dev-money').click();
  assert.equal(await page.evaluate(() => window.game.run.money), money + 500);
  await checkpoint('devConsole');
  await page.keyboard.press('F2');
  await page.locator('#dev-console').waitFor({ state: 'hidden' });
  await page.keyboard.press('F2');
  await page.locator('#dev-console').waitFor({ state: 'visible' });
  await page.locator('#dev-money').click();
  assert.equal(await page.evaluate(() => window.game.run.money), money + 1000);
  await checkpoint('devReopen');
  await page.reload();
  await interactive();
  await checkpoint('warmMenu');
  assert.deepEqual(errors, []);
  const cold = [...new Set(phases.coldMenu.map(r => r.file))];
  const initial = cold.map(file => { const asset = assets.find(a => a.file === file); assert.ok(asset, file); return asset; });
  const report = {
    label, method: 'Chromium 1400x900, production preview :4178; cold browser context, then same-context reload; gzipSync level 6, decimal bytes; transferred is CDP encodedDataLength including HTTP headers; wireStatus shows actual 304 revalidation behind a cached 200 response',
    assets, chunks, initial: { jsRequests: phases.coldMenu.length, raw: initial.reduce((s, a) => s + a.raw, 0), gzip: initial.reduce((s, a) => s + a.gzip, 0),
      assetRequests: assetPhases.coldMenu.length,
      assetRaw: [...new Set(assetPhases.coldMenu.map(r => r.file))].reduce((sum, file) => sum + assets.find(a => a.file === file).raw, 0) },
    phases, assetPhases, errors,
  };
  await mkdir('docs/perf/bundle', { recursive: true });
  await writeFile(out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ report: out, initial: report.initial, jsRequestsByPhase: Object.fromEntries(Object.entries(phases).map(([name, r]) => [name, r.length])) }, null, 2));
} finally {
  await browser?.close();
  await new Promise(resolve => server.httpServer.close(resolve));
}
