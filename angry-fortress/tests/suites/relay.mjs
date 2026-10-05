// Friend match through our relay server (relay/, here the local Node copy of it): the protocol
// checks, then two phones playing while things go wrong: the relay cuts every connection without a
// word (like both phones losing signal), the guest switches to another app for a moment, and the
// guest's page reloads (the app closed by the system). Each time they must find each other again
// and carry on in step.
import { startRelay } from '../../relay/local.mjs';
import { relayProtocolTest } from '../../relay/test.mjs';
import { pairUp, playTurns, drift } from './friend.mjs';

export default {
  name: 'relay',
  what: '중계 서버로 친구 대결, 도중에 연결이 끊겨도 다시 이어짐',
  async run(t) {
    const relay = await startRelay(0);
    try {
      for (const f of await relayProtocolTest(relay.url)) t.check(false, 'protocol: ' + f);

      const context = await t.browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
      await context.addInitScript(() => { window.__afNetDebug = true; });
      const query = `?relay=${encodeURIComponent(relay.url)}`;
      const A = await t.page({ context, query });
      const B = await t.page({ context, query });
      const code = await pairUp(A, B);
      t.check(await A.evaluate(() => window.__af.online.link.kind) === 'relay', 'host did not use the relay');
      t.check(await B.evaluate(() => window.__af.online.link.kind) === 'relay', 'guest did not use the relay');

      let cut = 0, overlay = false, back = 0, awayShown = false, awayGone = false, reloaded = false;
      const setHidden = (P, hidden) => P.evaluate((hidden) => {
        Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
        Object.defineProperty(document, 'visibilityState', { value: hidden ? 'hidden' : 'visible', configurable: true });
        document.dispatchEvent(new Event('visibilitychange'));
      }, hidden);
      const want = t.quick ? 5 : 7;
      const { turns, mismatches } = await playTurns(A, B, want, async (n) => {
        if (n === 3) {
          await setHidden(B, true);
          awayShown = await A.waitForFunction(() => !document.querySelector('#away').hidden, null, { timeout: 5000 }).then(() => true, () => false);
          await t.shot(A, 'away');
          await setHidden(B, false);
          awayGone = await A.waitForFunction(() => document.querySelector('#away').hidden, null, { timeout: 5000 }).then(() => true, () => false);
          return;
        }
        if (n === 4) {
          await B.reload();
          reloaded = await B.waitForFunction(() => window.__af && window.__af.game && window.__af.game.online && !window.__af.game.hold && window.__af.online && window.__af.online.status === 'paired', null, { timeout: 25000 }).then(() => true, () => false);
          if (!reloaded) {
            t.note('after reload: ' + await B.evaluate(() => JSON.stringify({ s: sessionStorage.getItem('af.online'), sid: sessionStorage.getItem('af.sid'), st: window.__af.online && window.__af.online.status, kind: window.__af.online && window.__af.online.link && window.__af.online.link.kind, g: !!window.__af.game, on: window.__af.game && window.__af.game.online, hold: window.__af.game && window.__af.game.hold, lobby: document.querySelector('#lobby-status').textContent })));
            await t.shot(B, 'reload');
          }
          return;
        }
        if (n !== 2) return;
        relay.drop();
        cut = Date.now();
        // the "connection lost" cover shows, then both phones find each other again
        overlay = await A.waitForFunction(() => !document.querySelector('#netlost').hidden, null, { timeout: 8000 }).then(() => true, () => false);
        await A.waitForFunction(() => window.__af.online.status === 'paired' && document.querySelector('#netlost').hidden, null, { timeout: 20000 });
        await B.waitForFunction(() => window.__af.online.status === 'paired', null, { timeout: 20000 });
        back = Date.now() - cut;
      });
      t.check(cut > 0, 'the match never got far enough to cut the connection');
      t.check(awayShown, 'the host was not told the guest stepped away');
      t.check(awayGone, 'the "stepped away" notice stayed after the guest came back');
      t.check(reloaded, 'the guest did not come back to the match by itself after a reload');
      t.check(overlay, 'no "connection lost" cover when the link broke');
      t.check(turns >= Math.min(want, 5), `only ${turns} turns were played`);
      t.check(!mismatches, `${mismatches} of ${turns} turns ended with different state on the two phones`);
      for (const [tag, P] of [['host', A], ['guest', B]]) {
        const n = await drift(P);
        t.check(!n, `${tag}: ${n} replays drifted from the shooter's result`);
      }
      t.note(`${turns} turns over the relay, room ${code}, back together ${(back / 1000).toFixed(1)}s after the cut`);
      await t.shot(A, 'host');
    } finally {
      await relay.close();
    }
  },
};
