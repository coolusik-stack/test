// Two phones, one friend match, through the real lobby UI (host makes a room, guest types the code)
// over a stand-in for claude.ai's room channel. Every turn both phones must hold the same state,
// and replays must not drift.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MOCK_ROOM = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'mockroom.js');

export default {
  name: 'online',
  what: '친구 대결: 방 만들기 → 코드로 참가 → 번갈아 쏘기, 매 턴 두 폰 상태 일치',
  async run(t) {
    const context = await t.browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
    await context.addInitScript({ path: MOCK_ROOM });
    await context.addInitScript(() => { window.__afNetDebug = true; });
    const A = await t.page({ context });
    const B = await t.page({ context });
    await A.click('#btn-friend');
    await A.click('#btn-host');
    await A.waitForFunction(() => document.querySelectorAll('#code-tiles b').length === 4, null, { timeout: 15000 });
    const code = await A.evaluate(() => [...document.querySelectorAll('#code-tiles b')].map((b) => b.textContent).join(''));
    await B.click('#btn-friend');
    await B.click('#btn-join');
    await B.fill('#code-input', code.toLowerCase());
    await B.click('#btn-join-go');
    await A.waitForFunction(() => !document.querySelector('#btn-room-go').disabled, null, { timeout: 20000 });
    await A.click('#btn-room-go');
    await A.waitForFunction(() => window.__af.game && window.__af.game.online, null, { timeout: 10000 });
    await B.waitForFunction(() => window.__af.game && window.__af.game.online && !window.__af.game.hold, null, { timeout: 10000 });

    const state = (P) => P.evaluate(() => { const g = window.__af.game; return g ? { st: g.state, turn: g.turn, n: g.turnNo, q: g.snapSeq, over: g.over, local: g.players[g.turn] && !g.players[g.turn].remote } : null; });
    const TURNS = t.quick ? 4 : 8;
    let turns = 0, mismatches = 0;
    const deadline = Date.now() + 6 * 60 * 1000;
    while (turns < TURNS && Date.now() < deadline) {
      const sa = await state(A), sb = await state(B);
      if (!sa || !sb) { await A.waitForTimeout(300); continue; }
      if (sa.over && sb.over) break;
      let fired = false;
      for (const P of [A, B]) {
        const s = P === A ? sa : sb;
        if (s.st !== 'aim' || !s.local) continue;
        fired = await P.evaluate(async () => {
          const g = window.__af.game;
          const { planShot } = await import('./js/ai.js');
          const plan = planShot(g, g.players[g.turn], 'normal');
          g.selectBird(plan.type);
          const before = g.snapSeq;
          g.launch(plan.power, plan.angle);
          return g.snapSeq !== before;
        });
      }
      if (!fired) { await A.waitForTimeout(300); continue; }
      const n0 = Math.max(sa.n, sb.n);
      const tw = Date.now();
      while (Date.now() - tw < 30000) {
        await A.waitForTimeout(250);
        const a = await state(A), b = await state(B);
        if (a && b && ((a.over && b.over) || (a.n > n0 && b.n > n0 && a.q === b.q))) break;
      }
      turns++;
      const snapA = await A.evaluate(() => JSON.stringify(window.__af.game.lastSnap));
      const snapB = await B.evaluate(() => JSON.stringify(window.__af.game.lastSnap));
      if (snapA !== snapB) mismatches++;
    }
    t.check(turns >= Math.min(TURNS, 3), `only ${turns} turns were played`);
    t.check(!mismatches, `${mismatches} of ${turns} turns ended with different state on the two phones`);
    for (const [tag, P] of [['host', A], ['guest', B]]) {
      const drift = await P.evaluate(() => (window.__af.game.netDiffs || []).filter((d) => d.pos > 1e-6 || d.hp || d.missing || !d.ops).length);
      t.check(!drift, `${tag}: ${drift} replays drifted from the shooter's result`);
    }
    t.note(`${turns} turns, room code ${code}`);
    await t.shot(B, 'guest');
  },
};
