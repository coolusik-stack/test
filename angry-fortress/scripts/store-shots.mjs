// Store screenshots, rendered straight from the game with a caption on top, so they never go
// stale and nobody has to make them by hand.
//   npm run store:shots                → store/screenshots/ko/  App Store, iPhone 6.9" (2868×1320)
//                                        store/play/            Google Play phone (1920×1080) + feature graphic (1024×500)
//   npm run store:shots -- --only=fall render one scene while tweaking it
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serve } from '../tests/serve.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);

const TARGETS = [
  { dir: 'store/screenshots/ko', suffix: 'iphone69', width: 956, height: 440, dpr: 3 }, // 2868×1320
  { dir: 'store/play', suffix: 'play', width: 960, height: 540, dpr: 2 }, // 1920×1080
];

// Each scene sets the game up through the same hooks the tests use, then waits for the moment.
const SCENES = [
  {
    name: 'duel', caption: '친구랑 폰 두 대로, 다람쥐 새총 1:1!',
    async setup(page) {
      await start(page, { mode: 'pvp', theme: 'oak' });
      await page.evaluate(() => window.__af.game.toggleOverview());
      await page.waitForTimeout(1800);
    },
  },
  {
    name: 'seasons', caption: '봄부터 겨울까지, 열두 개의 숲',
    async setup(page) {
      await start(page, { mode: 'pvp', theme: 'igloo' });
      await page.evaluate(() => window.__af.game.toggleOverview());
      await page.waitForTimeout(1800);
    },
  },
  {
    name: 'aim', caption: '끝까지 당겼다 놓으면, 깡!',
    async setup(page) {
      await start(page, { mode: 'cpu', theme: 'maple' });
      await page.evaluate(() => {
        const g = window.__af.game;
        g.selectBird('burr');
        g.aim = { id: 99, sx: 0, sy: 0, px: 0, py: 0, power: 0.86, angle: 0.72 };
        const p = g.players[0].body.getPosition();
        g.cam.focus(p.x + 5.5, p.y + 2.2, g.cam.baseZoom * 1.05, 30);
      });
      await page.waitForTimeout(900);
    },
  },
  {
    name: 'fall', caption: '땅을 파내면 그대로 추락 K.O.!',
    async setup(page) {
      await start(page, { mode: 'pvp', theme: 'maple' });
      await page.evaluate(async () => {
        const g = window.__af.game, q = g.players[1], pl = window.planck;
        const { AMMO } = await import('./js/config.js');
        q.body.setPosition(pl.Vec2(37.4, 14.2 + 0.77));
        q.body.setLinearVelocity(pl.Vec2(0, 0));
        q.facing = -1;
        g.state = 'flight';
        g.blastQueue.push({ x: 36.0, y: 14.3, spec: AMMO.burr.blast, owner: g.players[0], kind: 'burr' });
      });
      await page.waitForFunction(() => { const g = window.__af.game; return g.fallcam || g.players[1].dead; }, null, { timeout: 8000 });
      await page.waitForTimeout(700);
    },
  },
  {
    name: 'spots', caption: '자리마다 장점과 약점, 명당을 차지하라',
    async setup(page) {
      await start(page, { mode: 'pvp', theme: 'night' });
      await drive(page, 30);
      await page.evaluate(() => {
        const g = window.__af.game;
        g.cam.manual = 0;
        g.cam.focus(28, 17.5, g.cam.baseZoom * 0.72, 30);
      });
      await page.waitForTimeout(1200);
    },
  },
  {
    name: 'pad', caption: '버섯 트램펄린 타고 다른 섬으로 슝!',
    async setup(page) {
      await start(page, { mode: 'pvp', theme: 'oak' });
      await page.evaluate(() => {
        const g = window.__af.game, p = g.players[0], pl = window.planck;
        p.body.setPosition(pl.Vec2(24.6, g.terrain.surfaceY(24.6) + 0.77));
        p.stamina = 1e9;
        g.setMove(1);
      });
      await page.waitForFunction(() => { const p = window.__af.game.players[0]; return p.padFlight && p.padFlight.t > 0.75; }, null, { timeout: 8000 });
    },
  },
  {
    name: 'closet', caption: '깡단 원정에서 별 모아, 나만의 깡단으로',
    async setup(page) {
      await start(page, { mode: 'cpu', theme: 'pine', looks: [{ hat: 'crown', cart: 'gold', trail: 'star' }, { hat: 'mushroom', cart: 'sky', trail: 'leaf' }] });
      await page.evaluate(() => {
        const g = window.__af.game, p = g.players[0];
        const pos = p.body.getPosition();
        // last shot's stardust arc, rising from the sling toward the other island
        p.lastTrail = Array.from({ length: 26 }, (_, i) => {
          const u = i / 25, x = pos.x + 1 + u * 13;
          return { x, y: pos.y + 1.2 + Math.sin(u * Math.PI * 0.9) * 6.5, s: i % 3 === 0 ? 0.13 : 0.07 };
        });
        g.cam.focus(pos.x + 5.2, pos.y + 2.6, g.cam.baseZoom * 1.25, 30);
      });
      await page.waitForTimeout(900);
    },
  },
  {
    name: 'crew', caption: '언제나 씩씩한 깡단과 함께',
    async setup(page) {
      await start(page, { mode: 'cpu', theme: 'pine' });
      await page.evaluate(() => {
        const g = window.__af.game, p = g.players[0];
        g.crew.react(p, 'win');
        const pos = p.body.getPosition();
        g.cam.focus(pos.x + 0.6, pos.y + 1.4, g.cam.baseZoom * 2.1, 30);
      });
      await page.waitForTimeout(900);
    },
  },
];

async function start(page, { mode, theme, looks }) {
  await page.evaluate(({ mode, theme, looks }) => window.__af.startBattle({ mode, difficulty: 'normal', theme, wind: 'off', timer: 0, guide: true, seed: 777, ...(looks ? { looks } : {}) }), { mode, theme, looks });
  await page.waitForFunction(() => { const g = window.__af.game; return g && g.state === 'aim' && g.turn === 0; }, null, { timeout: 15000 });
}

async function drive(page, target) {
  await page.evaluate((target) => {
    const g = window.__af.game, p = g.players[0];
    p.stamina = 1e9;
    g.setMove(Math.sign(target - p.body.getPosition().x));
  }, target);
  await page.waitForFunction((target) => { const p = window.__af.game.players[0]; return !p.padFlight && (Math.abs(p.body.getPosition().x - target) < 0.4 || !p.moveDir); }, target, { timeout: 15000 });
  await page.evaluate(() => window.__af.game.setMove(0));
}

// Hide the HUD and lay the caption across the top.
async function caption(page, text) {
  await page.evaluate((text) => {
    for (const el of document.querySelectorAll('#hud, #hint, #banner, #tip')) el.style.visibility = 'hidden';
    let c = document.getElementById('store-caption');
    if (!c) {
      c = document.createElement('div');
      c.id = 'store-caption';
      c.style.cssText = 'position:fixed;left:0;right:0;top:0;padding:3.2vh 4vw 9vh;text-align:center;z-index:999;pointer-events:none;'
        + 'background:linear-gradient(rgba(25,14,6,0.72),rgba(25,14,6,0.38) 60%,rgba(25,14,6,0));'
        + 'font-family:"Black Han Sans","Jua",sans-serif;font-size:8.2vh;line-height:1.1;color:#fff;'
        + '-webkit-text-stroke:0.9vh #2b1a12;paint-order:stroke fill;letter-spacing:0.02em;';
      document.body.appendChild(c);
    }
    c.textContent = text;
  }, text);
  await page.evaluate(() => document.fonts.ready);
}

const server = await serve(root);
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
let n = 0;
for (const target of TARGETS) {
  mkdirSync(join(root, target.dir), { recursive: true });
  for (const [i, scene] of SCENES.entries()) {
    if (only && scene.name !== only) continue;
    const ctx = await browser.newContext({ viewport: { width: target.width, height: target.height }, deviceScaleFactor: target.dpr, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(server.url + 'index.html?hq=1');
    await page.waitForFunction(() => window.__af && window.planck);
    await page.evaluate(() => document.fonts.ready);
    await scene.setup(page);
    await caption(page, scene.caption);
    const file = join(root, target.dir, `${String(i + 1).padStart(2, '0')}_${scene.name}_${target.suffix}.png`);
    await page.screenshot({ path: file });
    await ctx.close();
    n++;
    console.log('✓', file.slice(root.length + 1));
  }
}

// Google Play's feature graphic: the title screen without its buttons
if (!only || only === 'feature') {
  const ctx = await browser.newContext({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(server.url + 'index.html?hq=1');
  await page.waitForFunction(() => window.__af && window.planck);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(2500);
  await page.evaluate(() => { for (const el of document.querySelectorAll('#title .menu, #title button, #rejoin, #record')) el.style.visibility = 'hidden'; });
  await page.screenshot({ path: join(root, 'store/play/feature_1024x500.png') });
  await ctx.close();
  n++;
  console.log('✓ store/play/feature_1024x500.png');
}
await browser.close();
await server.close();
console.log(`${n} images`);
