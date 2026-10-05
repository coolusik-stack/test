// Speed. (1) The game's own work per frame (physics, CPU, drawing calls) stays well inside a
// frame at full speed. (2) On a phone too slow for the full resolution (here: the CPU slowed 4×,
// with a software renderer), the game notices within seconds and drops to fewer pixels, and the
// frame rate comes back up.
const BATTLE = { mode: 'cpu', difficulty: 'hard', theme: 'oak', wind: 'normal', timer: 0, guide: true, seed: 99, firstTurn: 0 };

async function measure(page, secs) {
  return page.evaluate(async (secs) => {
    const g = window.__af.game;
    const T = { up: 0, dr: 0, n: 0 };
    const u = g.update, d = g.draw;
    g.update = function (dt) { const t = performance.now(); u.call(this, dt); T.up += performance.now() - t; };
    g.draw = function () { const t = performance.now(); d.call(this); T.dr += performance.now() - t; T.n++; };
    const frames = [];
    let last = performance.now();
    const t0 = last;
    await new Promise((res) => {
      const f = (now) => { frames.push(now - last); last = now; if (now - t0 < secs * 1000) requestAnimationFrame(f); else res(); };
      requestAnimationFrame(f);
    });
    g.update = u; g.draw = d;
    const avg = frames.reduce((a, b) => a + b, 0) / frames.length;
    return { fps: 1000 / avg, js: (T.up + T.dr) / Math.max(1, T.n), up: T.up / Math.max(1, T.n), dr: T.dr / Math.max(1, T.n) };
  }, secs);
}

export default {
  name: 'perf',
  what: '프레임당 게임 계산 시간 · 느린 폰에서 화질 자동 조절',
  async run(t) {
    const page = await t.page({ dpr: 2, query: '?hq=1' }); // full resolution, no adapting yet
    const start = () => page.evaluate((o) => { window.__af.startBattle(o); window.__af.game.players[0].isAI = true; }, BATTLE);

    await start();
    await page.waitForTimeout(1500);
    const full = await measure(page, 5);
    t.check(full.js < 12, `the game's own work takes ${full.js.toFixed(1)} ms a frame (budget 12)`);
    t.note(`full speed (dpr ${(await page.evaluate(() => window.__af.perf)).dpr}): game work ${full.js.toFixed(1)} ms/frame (update ${full.up.toFixed(1)}, draw ${full.dr.toFixed(1)}), ${full.fps.toFixed(0)} fps`);

    // a slow phone: from the sharpest level, it must step down on its own
    await page.evaluate(() => { try { localStorage.removeItem('af.q'); } catch (e) { /* none */ } });
    await page.goto(t.url + 'index.html');
    await page.waitForFunction(() => window.__af && window.planck, null, { timeout: 15000 });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await start();
    const before = await page.evaluate(() => window.__af.perf);
    const slow = await measure(page, 3);
    const stepped = await page.waitForFunction((l) => window.__af.perf.level > l, before.level, { timeout: 30000 }).then(() => true, () => false);
    const after = await page.evaluate(() => window.__af.perf);
    t.check(stepped, `a slow phone never dropped to fewer pixels (level ${after.level}, dpr ${after.dpr})`);
    await page.waitForTimeout(6000); // let it settle
    const settled = await page.evaluate(() => window.__af.perf);
    const eased = await measure(page, 4);
    t.check(eased.fps > slow.fps * 1.15, `dropping resolution did not help: ${slow.fps.toFixed(1)} → ${eased.fps.toFixed(1)} fps`);
    t.note(`4× slower: ${slow.fps.toFixed(1)} fps at dpr ${before.dpr} → ${eased.fps.toFixed(1)} fps at dpr ${settled.dpr}`);
    const end = await page.evaluate(() => ({ level: window.__af.perf.level, saved: localStorage.getItem('af.q') }));
    t.check(Number(end.saved) === end.level, `the chosen level was not remembered (${end.saved} vs ${end.level})`);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  },
};
