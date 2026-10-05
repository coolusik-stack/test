// Checks a relay speaks the protocol in src/room.js, with plain WebSocket clients.
//   node relay/test.mjs                    against a local relay it starts itself
//   node relay/test.mjs ws://127.0.0.1:8787 against one already running (e.g. `wrangler dev`)
// Exits non-zero on any failure.

function client(base, room, role, sid) {
  const ws = new WebSocket(`${base}/r/${room}?role=${role}&sid=${sid}`);
  const inbox = [];
  const waiters = [];
  const c = { ws, inbox, closed: null };
  ws.addEventListener('message', (e) => {
    const v = e.data === 'pong' ? 'pong' : JSON.parse(e.data);
    inbox.push(v);
    for (const w of [...waiters]) w();
  });
  ws.addEventListener('close', (e) => { c.closed = { code: e.code, reason: e.reason }; for (const w of [...waiters]) w(); });
  c.open = () => new Promise((ok, bad) => { ws.addEventListener('open', ok); ws.addEventListener('error', bad); });
  // the next message matching `pred`, consuming everything before it
  c.next = (pred, ms = 3000) => new Promise((resolve) => {
    const look = () => {
      const i = inbox.findIndex(pred);
      if (i >= 0) { const v = inbox[i]; inbox.splice(0, i + 1); done(v); return true; }
      if (c.closed && pred === CLOSED) { done(c.closed); return true; }
      return false;
    };
    const w = () => look();
    const t = setTimeout(() => done(null), ms);
    const done = (v) => { clearTimeout(t); const k = waiters.indexOf(w); if (k >= 0) waiters.splice(k, 1); resolve(v); };
    if (!look()) waiters.push(w);
  });
  c.closedWith = (ms = 3000) => new Promise((resolve) => {
    if (c.closed) { resolve(c.closed); return; }
    const t = setTimeout(() => resolve(null), ms);
    ws.addEventListener('close', () => { clearTimeout(t); setTimeout(() => resolve(c.closed), 0); });
  });
  c.send = (v) => ws.send(typeof v === 'string' ? v : JSON.stringify(v));
  return c;
}
const CLOSED = () => false;
const is = (t) => (m) => m && m.t === t;

export async function relayProtocolTest(base) {
  const fails = [];
  const check = (ok, msg) => { if (!ok) fails.push(msg); };
  const room = 'dotori-' + Math.random().toString(36).slice(2, 6).padEnd(4, 'x');

  const host = client(base, room, 'host', 'hostaaaa');
  await host.open();
  const hi = await host.next(is('hi'));
  check(hi && hi.peers === 0, `host hello ${JSON.stringify(hi)}`);

  const guest = client(base, room, 'guest', 'guestbbb');
  await guest.open();
  const ghi = await guest.next(is('hi'));
  check(ghi && ghi.peers === 1, `guest hello ${JSON.stringify(ghi)}`);
  check(await host.next(is('join')), 'host was not told the guest joined');

  guest.send({ full: { app: 'dotori', role: 'guest', n: 1 } });
  const got = await host.next((m) => m && m.d);
  check(got && got.d.full && got.d.full.n === 1, `host did not get the guest's state: ${JSON.stringify(got)}`);
  host.send({ p: { live: { x: 1.5 } } });
  const got2 = await guest.next((m) => m && m.d);
  check(got2 && got2.d.p && got2.d.p.live.x === 1.5, `guest did not get the host's patch: ${JSON.stringify(got2)}`);

  host.send('ping');
  check(await host.next((m) => m === 'pong'), 'no pong');

  // junk is ignored, not forwarded, and does not close anything
  host.send('not json');
  host.send({ hello: 1 });
  host.send({ p: { ok: 2 } });
  const got3 = await guest.next((m) => m && m.d);
  check(got3 && got3.d.p && got3.d.p.ok === 2, `junk got through or the patch after it was lost: ${JSON.stringify(got3)}`);

  // another phone opening the same code as host is refused; so is a third phone. (The game closes
  // a refused socket itself: a server-side close is not always delivered by `wrangler dev`.)
  const host2 = client(base, room, 'host', 'hostcccc');
  await host2.open();
  check(await host2.next(is('taken')), 'a second host was not refused');
  host2.send({ full: { sneaky: 1 } });
  host2.ws.close(1000);
  const guest2 = client(base, room, 'guest', 'guestddd');
  await guest2.open();
  check(await guest2.next(is('full')), 'a third phone was not refused');
  guest2.ws.close(1000);
  check(!(await guest.next((m) => m && m.d && m.d.full && m.d.full.sneaky, 400)), 'a refused phone still reached the room');

  // the host's phone comes back on a new socket (new network) before the old one has closed
  const hostB = client(base, room, 'host', 'hostaaaa');
  await hostB.open();
  const hiB = await hostB.next(is('hi'));
  check(hiB && hiB.peers === 1, `returning host hello ${JSON.stringify(hiB)}`);
  const old = await host.closedWith();
  check(old && old.code === 4000, `the old host socket was not replaced: ${JSON.stringify(old)}`);
  check(await guest.next(is('left')), 'guest not told the old host left');
  check(await guest.next(is('join')), 'guest not told the host is back');
  hostB.send({ full: { app: 'dotori', role: 'host', n: 2 } });
  const got4 = await guest.next((m) => m && m.d);
  check(got4 && got4.d.full && got4.d.full.n === 2, 'guest did not hear the returning host');

  // a message too big to be a game message closes that phone's socket
  hostB.send({ p: { junk: 'x'.repeat(20000) } });
  const big = await hostB.closedWith();
  check(big && big.code === 4009, `oversized message: ${JSON.stringify(big)}`);
  check(await guest.next(is('left')), 'guest not told the host left');

  guest.ws.close(1000);
  await guest.closedWith();

  const bad = client(base, room, 'king', 'x');
  await bad.open().catch(() => {});
  check(await bad.next(is('bad')), 'a malformed join was not refused');
  bad.ws.close(1000);
  return fails;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  let base = process.argv[2];
  let relay = null;
  if (!base) {
    const { startRelay } = await import('./local.mjs');
    relay = await startRelay(0);
    base = relay.url;
  }
  const fails = await relayProtocolTest(base);
  if (relay) await relay.close();
  for (const f of fails) console.log('✗ ' + f);
  console.log(fails.length ? `${fails.length} relay checks failed (${base})` : `relay protocol ok (${base})`);
  process.exit(fails.length ? 1 : 0);
}
