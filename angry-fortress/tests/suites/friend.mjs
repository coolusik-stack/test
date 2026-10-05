// Two phones in one friend match, shared by the online (claude.ai room) and relay suites.

// Host makes a room through the real lobby UI, the guest types the code, the host starts.
export async function pairUp(A, B) {
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
  return code;
}

const state = (P) => P.evaluate(() => {
  const g = window.__af.game;
  return g ? { st: g.state, turn: g.turn, n: g.turnNo, q: g.snapSeq, over: g.over, local: g.players[g.turn] && !g.players[g.turn].remote } : null;
});

// Whoever's turn it is aims like a normal CPU and shoots; wait until both phones have the turn's
// result. Returns { turns, mismatches } (turns whose final state differs between the phones).
// `between(turn)` runs after each turn (to break the connection, say).
export async function playTurns(A, B, want, between) {
  let turns = 0, mismatches = 0;
  const deadline = Date.now() + 6 * 60 * 1000;
  while (turns < want && Date.now() < deadline) {
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
    if (between) await between(turns);
  }
  return { turns, mismatches };
}

// Replays on each phone that came out different from the shooter's own result.
export async function drift(P) {
  return P.evaluate(() => (window.__af.game.netDiffs || []).filter((d) => d.pos > 1e-6 || d.hp || d.missing || !d.ops).length);
}
