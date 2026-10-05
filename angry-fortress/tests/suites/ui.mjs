// A player's path through the screens: 깡단 원정 → free practice setup → battle → aim and shoot with touch-drag →
// ability mid-flight → the CPU answers → pause → bomb → win → result → menu → help.
export default {
  name: 'ui',
  what: '메뉴 → CPU 대결 → 조준·발사·능력 → 결과 → 도움말',
  async run(t) {
    const page = await t.page();
    const game = (fn, arg) => page.evaluate(fn, arg);
    await page.click('#btn-solo');
    await page.waitForSelector('#campaign:not([hidden])');
    await page.click('#camp-free');
    await page.waitForTimeout(500);
    await page.click('.map[data-id="pine"]');
    await page.click('.seg[data-key="difficulty"] button[data-v="easy"]');
    await page.click('#btn-go');
    await page.waitForTimeout(600);
    if (await page.isVisible('#rotate')) await page.click('#rotate-ok');
    await page.waitForFunction(() => { const g = window.__af.game; return g && g.state === 'aim' && g.turn === 0; }, null, { timeout: 15000 });
    await t.shot(page, 'battle');

    const aimShot = async (dx, dy) => {
      const pos = await game(() => { const g = window.__af.game; const r = g.restPos(g.players[g.turn]); return g.cam.toScreen(r.x, r.y); });
      await page.mouse.move(pos.x, pos.y);
      await page.mouse.down();
      for (let i = 1; i <= 12; i++) { await page.mouse.move(pos.x + (dx * i) / 12, pos.y + (dy * i) / 12); await page.waitForTimeout(16); }
      await page.mouse.up();
    };
    await page.click('.slot[data-type="pinenut"]');
    await aimShot(-110, 70);
    await page.waitForTimeout(700);
    t.check(await game(() => window.__af.game.state === 'flight'), 'touch-drag did not launch a shot');
    await page.mouse.click(422, 195); // ability mid-flight
    await page.waitForTimeout(300);
    t.check(await game(() => { const g = window.__af.game; return !g.lead || g.lead.used || g.lead.dead; }), 'tap did not trigger the pine nut dash');

    // the CPU takes its turn and hands back
    await page.waitForFunction(() => { const g = window.__af.game; return g.state === 'aim' && g.turn === 0 && g.turnNo >= 3; }, null, { timeout: 40000 });
    await page.click('#btn-pause');
    t.check(await page.isVisible('#pause'), 'pause menu did not open');
    await page.click('#btn-resume');
    await page.click('.slot[data-type="burr"]');
    await aimShot(-120, 60);
    await page.waitForTimeout(1100);
    await page.mouse.click(422, 195);
    await page.waitForTimeout(150);
    await t.shot(page, 'boom');
    await page.waitForTimeout(2500);

    await game(() => { const g = window.__af.game; g._kill(g.players[1], false); });
    await page.waitForSelector('#result:not([hidden])', { timeout: 15000 });
    await t.shot(page, 'result');
    const shots = await game(() => window.__af.game.players[0].stats.shots);
    t.check(shots >= 2, `expected 2 shots from the player, saw ${shots}`);
    await page.click('#btn-menu');
    await page.waitForTimeout(600);
    await page.click('#btn-help');
    t.check(await page.isVisible('#help'), 'help did not open');
  },
};
