// Two phones, one friend match, through the real lobby UI (host makes a room, guest types the code)
// over a stand-in for claude.ai's room channel. Every turn both phones must hold the same state,
// and replays must not drift.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pairUp, playTurns, drift } from './friend.mjs';

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
    const code = await pairUp(A, B);
    t.check(await A.evaluate(() => window.__af.online.link.kind) === 'room', 'did not use the claude.ai room');
    const want = t.quick ? 4 : 8;
    const { turns, mismatches } = await playTurns(A, B, want);
    t.check(turns >= Math.min(want, 3), `only ${turns} turns were played`);
    t.check(!mismatches, `${mismatches} of ${turns} turns ended with different state on the two phones`);
    for (const [tag, P] of [['host', A], ['guest', B]]) {
      const n = await drift(P);
      t.check(!n, `${tag}: ${n} replays drifted from the shooter's result`);
    }
    t.note(`${turns} turns, room code ${code}`);
    await t.shot(B, 'guest');
  },
};
