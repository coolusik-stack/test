// A first-time player's tutorial, with real touches: the title offers it, the coach asks for each
// move (pull, release, drive, pick the walnut, tap mid-flight) and waits until it happens, then
// lets them play it out. Afterwards the title stops offering it.
export default {
  name: 'tutorial',
  what: '처음 켠 사람: 연습 한 판을 코치 안내대로 끝까지',
  async run(t) {
    const page = await t.page();
    const game = (fn, arg) => page.evaluate(fn, arg);
    const coach = () => page.evaluate(() => {
      const b = document.querySelector('#coach .coach-bubble');
      const h = document.querySelector('#coach .coach-hand');
      return { text: b.hidden ? '' : b.textContent, hand: h.className };
    });
    const waitCoach = async (re, what, ms = 20000) => {
      const ok = await page.waitForFunction((src) => {
        const b = document.querySelector('#coach .coach-bubble');
        return !b.hidden && new RegExp(src).test(b.textContent);
      }, re.source, { timeout: ms }).then(() => true, () => false);
      if (!ok) t.check(false, `coach never said ${what} (says "${(await coach()).text}")`);
      return ok;
    };
    const myTurn = (n) => page.waitForFunction((n) => { const g = window.__af.game; return g && g.state === 'aim' && g.turn === 0 && g.turnNo >= n; }, n, { timeout: 40000 });
    const sling = () => game(() => { const g = window.__af.game; const r = g.restPos(g.players[0]); return g.cam.toScreen(r.x, r.y); });
    const drag = async (dx, dy, between) => {
      const pos = await sling();
      await page.mouse.move(pos.x, pos.y);
      await page.mouse.down();
      for (let i = 1; i <= 12; i++) {
        await page.mouse.move(pos.x + (dx * i) / 12, pos.y + (dy * i) / 12);
        await page.waitForTimeout(16);
        if (i === 9 && between) await between();
      }
      await page.mouse.up();
    };

    t.check(await page.isVisible('#btn-train'), 'the title does not offer the tutorial to a first-timer');
    await page.click('#btn-train');
    await page.waitForTimeout(400);
    if (await page.isVisible('#rotate')) await page.click('#rotate-ok');
    await myTurn(1);
    const opts = await game(() => window.__af.game.opts);
    t.check(opts.tutorial && opts.wind === 'off' && opts.calm, `not the tutorial match: ${JSON.stringify(opts)}`);

    // 1. pull back, 2. release
    await waitCoach(/당겨/, 'how to pull');
    t.check((await coach()).hand.includes('drag'), 'no finger showing the pull');
    await t.shot(page, 'pull');
    let sawRelease = false;
    await drag(-115, 62, async () => { sawRelease = /손을 떼면/.test((await coach()).text); });
    t.check(sawRelease, 'coach did not switch to "let go" while pulling');
    await page.waitForTimeout(300);
    t.check(await game(() => window.__af.game.state !== 'aim'), 'the pull did not fire');

    // the CPU answers (and misses on purpose)
    await waitCoach(/CPU 차례/, 'that it is the CPU\'s turn', 30000);
    await myTurn(3);
    const hp1 = await game(() => window.__af.game.players[0].hp);
    t.check(hp1 >= 99, `the tutorial CPU hit on its first shot (hp ${hp1})`);

    // 3. drive
    await waitCoach(/◀ ▶/, 'how to drive');
    const btn = await page.locator('#mv-right').boundingBox();
    t.check((await coach()).hand.includes('tap'), 'no finger on the move button');
    await page.mouse.move(btn.x + btn.width / 2, btn.y + btn.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(900);
    await page.mouse.up();

    // 4. pick the walnut, 5. shoot it and tap mid-flight
    await waitCoach(/호두를 골라/, 'to pick the walnut', 8000);
    await t.shot(page, 'pick');
    await page.click('.slot[data-type="walnut"]');
    await waitCoach(/호두를 쏴요/, 'to shoot the walnut', 4000);
    await drag(-115, 62);
    await waitCoach(/톡/, 'to tap now', 4000);
    await page.waitForTimeout(350);
    await page.mouse.click(520, 180);
    await waitCoach(/쿵/, 'that the walnut pounded', 4000);

    // the lesson about digging, then free play
    await waitCoach(/발밑을 파내면/, 'what digging does', 30000);
    await myTurn(5);
    await waitCoach(/마음껏/, 'that the rest is free play', 8000);
    await page.waitForTimeout(6500);
    const seen = await game(() => JSON.parse(localStorage.getItem('af.seen') || '{}'));
    t.check(seen.trained, 'finishing the lessons did not mark the tutorial done');

    await game(() => { const g = window.__af.game; g._kill(g.players[1], false); });
    await page.waitForSelector('#result:not([hidden])', { timeout: 15000 });
    t.check(/연습 끝/.test(await page.textContent('#result-title')), 'the result does not say the practice is over');
    t.check(await page.textContent('#again-label') === 'CPU와 한 판', 'the next step after the tutorial is not a CPU match');
    t.check(await page.isHidden('#coach'), 'the coach stayed on the result screen');
    await t.shot(page, 'result');
    await page.click('#btn-menu');
    await page.waitForTimeout(500);
    t.check(await page.isHidden('#btn-train'), 'the title still offers the tutorial after it was done');
  },
};
