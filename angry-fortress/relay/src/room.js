// One friend-match room on the relay: at most one host phone and one guest phone, and whatever
// one sends reaches the other. Shared by the Cloudflare Durable Object (worker.js) and the local
// Node relay the tests use (../local.mjs), so both speak exactly the same protocol.
//
// The relay keeps no game state. Each phone holds its own "presence" object (see js/net.js) and
// sends it whole when it connects or when the other phone arrives, and patches after that.
//
// phone → relay   {"full":{…}} | {"p":{…}} | "ping"
// relay → phone   {"t":"hi","peers":n}       you are in; n other phones are here
//                 {"t":"join"} {"t":"left"}  the other phone arrived / went away
//                 {"t":"taken"} {"t":"full"} refused: this code already has a host / two phones
//                 {"d":{…}}                  what the other phone sent
//                 "pong"
//
// `io` adapts the platform: sockets(), meta(ws), setMeta(ws, m), seen(ws), send(ws, text),
// close(ws, code, reason).

export const LIMITS = {
  bytes: 16384, // one message (a snapshot hand-over is ~3 KB)
  perSecond: 40, // messages per phone per second, averaged over 5 s
  staleMs: 20000, // a phone silent this long (it pings every 5 s) has gone, even if its socket hasn't closed
};

const ROLE = /^(host|guest)$/;
const SID = /^[a-z0-9]{4,16}$/;

export class RelayRoom {
  constructor(io) {
    this.io = io;
  }

  live(except) {
    return this.io.sockets().filter((ws) => ws !== except && !(this.io.meta(ws) || {}).dead);
  }

  drop(ws, code, reason, msg) {
    const m = this.io.meta(ws) || {};
    this.io.setMeta(ws, { ...m, dead: true });
    if (msg) this.io.send(ws, JSON.stringify(msg));
    this.io.close(ws, code, reason);
  }

  join(ws, { role, sid, now }) {
    if (!ROLE.test(role || '') || !SID.test(sid || '')) {
      this.drop(ws, 4400, 'bad request', { t: 'bad' });
      return;
    }
    for (const other of this.live(ws)) {
      const m = this.io.meta(other);
      const quiet = now - Math.max(m.at || 0, m.seen || 0, this.io.seen(other) || 0) > LIMITS.staleMs;
      // the same phone again (new network, app back from the background): the new socket wins
      if (m.sid === sid || (m.role === role && quiet)) {
        this.drop(other, 4000, 'replaced');
        for (const ws2 of this.live(ws)) this.io.send(ws2, '{"t":"left"}');
        continue;
      }
      if (m.role === role) {
        this.drop(ws, 4001, role === 'host' ? 'taken' : 'full', { t: role === 'host' ? 'taken' : 'full' });
        return;
      }
    }
    this.io.setMeta(ws, { role, sid, at: now, seen: now, n: 0, t0: now });
    const others = this.live(ws);
    this.io.send(ws, JSON.stringify({ t: 'hi', peers: others.length }));
    for (const o of others) this.io.send(o, '{"t":"join"}');
  }

  message(ws, text, now) {
    const m = this.io.meta(ws);
    if (!m || m.dead) return;
    if (text === 'ping') { this.io.send(ws, 'pong'); return; }
    // a flood (a broken or hostile page) closes that phone's socket, not the room
    const span = now - m.t0;
    const n = span > 5000 ? 1 : m.n + 1;
    this.io.setMeta(ws, { ...m, seen: now, n, t0: span > 5000 ? now : m.t0 });
    if (n > LIMITS.perSecond * 5) { this.leave(ws); this.io.close(ws, 4008, 'too fast'); return; }
    if (typeof text !== 'string' || text.length > LIMITS.bytes) { this.leave(ws); this.io.close(ws, 4009, 'too big'); return; }
    let msg;
    try { msg = JSON.parse(text); } catch { return; }
    if (!msg || typeof msg !== 'object' || (typeof msg.full !== 'object' && typeof msg.p !== 'object') || !(msg.full || msg.p)) return;
    const out = '{"d":' + text + '}';
    for (const o of this.live(ws)) this.io.send(o, out);
  }

  leave(ws) {
    const m = this.io.meta(ws);
    const was = m && !m.dead;
    if (m) this.io.setMeta(ws, { ...m, dead: true });
    if (was) for (const o of this.live(ws)) this.io.send(o, '{"t":"left"}');
  }
}
