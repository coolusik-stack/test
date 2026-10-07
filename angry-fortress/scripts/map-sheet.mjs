// A contact sheet of every hand-made map, seen whole, for designing and reviewing maps side by side.
//   npm run maps:sheet                 → tests/output/maps/<map>.png and tests/output/maps/sheet.png
//   npm run maps:sheet -- oak igloo    just these maps (no sheet)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serve } from '../tests/serve.mjs';
import { THEMES, THEME_ORDER } from '../js/levels.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'tests/output/maps');
mkdirSync(out, { recursive: true });
const pick = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const maps = pick.length ? pick : THEME_ORDER;

const server = await serve(root);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 600 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(server.url + 'index.html?hq=1');
await page.waitForFunction(() => window.__af && window.planck);
await page.evaluate(() => document.fonts.ready);
for (const theme of maps) {
  await page.evaluate((theme) => window.__af.startBattle({ mode: 'pvp', difficulty: 'normal', theme, wind: 'off', timer: 0, guide: true, seed: 777, flip: false }), theme);
  await page.waitForFunction(() => { const g = window.__af.game; return g && g.state === 'aim'; }, null, { timeout: 15000 });
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('#hud, #hint, #banner, #tip')) el.style.visibility = 'hidden';
    const g = window.__af.game;
    g.cam.manual = 0;
    g.cam.focus(36, 14, g.cam.fitZoom * 1.02, 30);
  });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(out, `${theme}.png`) });
  console.log('✓', theme);
}
if (!pick.length) {
  // three across, in menu order (a season per row when there are twelve)
  const shots = maps.map((m) => 'data:image/png;base64,' + readFileSync(join(out, `${m}.png`)).toString('base64'));
  const sheet = await page.evaluate(async ({ shots, names }) => {
    const w = 640, h = 300, cols = 3, rows = Math.ceil(shots.length / cols);
    const cv = document.createElement('canvas');
    cv.width = w * cols; cv.height = h * rows;
    const ctx = cv.getContext('2d');
    for (const [i, src] of shots.entries()) {
      const img = new Image();
      img.src = src;
      await img.decode();
      const x = (i % cols) * w, y = Math.floor(i / cols) * h;
      ctx.drawImage(img, x, y, w, h);
      ctx.font = '22px Jua, sans-serif';
      ctx.lineWidth = 5; ctx.strokeStyle = '#2b1a12'; ctx.fillStyle = '#fff';
      ctx.strokeText(names[i], x + 12, y + 30); ctx.fillText(names[i], x + 12, y + 30);
    }
    return cv.toDataURL('image/png').split(',')[1];
  }, { shots, names: maps.map((m) => THEMES[m].name) });
  writeFileSync(join(out, 'sheet.png'), Buffer.from(sheet, 'base64'));
  console.log('✓ sheet.png');
}
console.log(errors.length ? 'page errors: ' + errors.join(' | ') : 'no page errors');
await browser.close();
await server.close();
