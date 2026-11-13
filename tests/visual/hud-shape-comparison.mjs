// After gameplay-hud.mjs: original concept / previous build / current build.
// HTML crops keep the image aspect ratios; no repainting or generation.
import { chromium } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const output = 'docs/screenshots/76-hud';
const bounds = JSON.parse(await readFile(`${output}/geometry-bounds.json`, 'utf8'));
const beforeBounds = JSON.parse(await readFile(`${output}/geometry-before/bounds.json`, 'utf8'));
const reference = {
  shift: { x: 26, y: 111, w: 270, h: 115 },
  money: { x: 386, y: 124, w: 184, h: 73 },
  quests: { x: 25, y: 231, w: 358, h: 137 },
  stress: { x: 25, y: 801, w: 387, h: 145 },
  help: { x: 1022, y: 125, w: 84, h: 72 },
  client: { x: 385, y: 413, w: 108, h: 48 },
  cell: { x: 463, y: 823, w: 187, h: 113 },
};
const names = { shift: 'Смена', money: 'Счётчик', quests: 'Задания', stress: 'Стресс', help: 'Кнопка', client: 'Бирка клиента', cell: 'Ячейка' };
const crop = (src, r, sourceWidth) => {
  const scale = 76 / r.h;
  return `<div class="crop" style="width:${r.w * scale}px;height:76px"><img alt="" src="${src}" style="width:${sourceWidth * scale}px;left:${-r.x * scale}px;top:${-r.y * scale}px"></div>`;
};
const rows = Object.keys(reference).map(name => `<div class="name">${names[name]}</div>
  <div>${crop('geometry-reference.png', reference[name], 1586)}</div>
  <div>${crop('geometry-before/desktop.png', beforeBounds[name], 1600)}</div>
  <div>${crop('desktop.png', bounds[name], 1600)}</div>`).join('');
const html = `<!doctype html><html lang="ru"><meta charset="UTF-8"><title>Геометрия HUD</title>
<style>
*{box-sizing:border-box}body{margin:0;padding:24px;background:#f6eedf;color:#29232a;font:15px system-ui,sans-serif}
h1{font-size:24px;margin:0 0 6px}p{margin:0 0 22px;color:#66594f;font-size:13px}
.grid{display:grid;grid-template-columns:125px repeat(3,1fr);gap:1px;background:#d8c8b4;border:1px solid #d8c8b4}
.grid>div{display:flex;align-items:center;justify-content:center;background:#fff9ed;min-height:103px;padding:10px}
.grid>.head{min-height:40px;background:#81253d;color:#fff1d8;font-weight:800}.grid>.name{justify-content:start;font-weight:700}
.crop{position:relative;overflow:hidden;padding:0!important;min-height:0!important;flex-shrink:0}.crop img{position:absolute;max-width:none;height:auto}
</style><h1>Геометрия HUD</h1><p>Исходные изображения. Детали приведены к одной высоте без растяжения. Компактный масштаб и расположение HUD сохранены; карточка ячейки стала флажком.</p>
<div class="grid"><div class="head">Элемент</div><div class="head">Концепт</div><div class="head">Было в игре</div><div class="head">Стало в игре</div>${rows}</div></html>`;
const path = resolve(output, 'geometry-comparison.html');
await writeFile(path, html, 'utf8');
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 950 } });
  await page.goto(pathToFileURL(path).href);
  await page.evaluate(() => Promise.all([...document.images].map(img => img.decode())));
  await page.screenshot({ path: `${output}/geometry-comparison.png`, fullPage: true });
} finally { await browser.close(); }
