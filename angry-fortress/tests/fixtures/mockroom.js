// A stand-in for claude.ai's `room` capability (presence arm only), shared by pages of one
// browser context over BroadcastChannel. Enforces the 4 KiB merged-presence limit.
(() => {
  const bc = new BroadcastChannel('mock-claude-room');
  const me = Math.random().toString(36).slice(2, 10);
  const rooms = new Map();
  window.__roomStats = { maxBytes: 0, sends: 0, rejects: 0 };
  function mkRoom(name) {
    const peers = new Map(); // peer -> {presence, updatedAt, seen}
    const listeners = new Set();
    let mine = Object.freeze({});
    let sendT = null, deliverT = null;
    const snapshot = () => {
      const arr = [{ peer: me, by: null, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: mine, updatedAt: Date.now() }];
      for (const [peer, v] of peers) arr.push({ peer, by: null, isMe: false, sameTab: false, kind: 'viewer', guest: false, presence: v.presence, updatedAt: v.updatedAt });
      return Object.freeze(arr);
    };
    const deliver = () => {
      clearTimeout(deliverT);
      deliverT = setTimeout(() => { const s = snapshot(); for (const fn of listeners) fn({ peers: s, joined: [], left: [], updated: [] }); }, 16);
    };
    const send = () => {
      clearTimeout(sendT);
      sendT = setTimeout(() => { window.__roomStats.sends++; bc.postMessage({ room: name, peer: me, t: 'p', presence: mine }); }, 33);
    };
    const hb = setInterval(() => bc.postMessage({ room: name, peer: me, t: 'p', presence: mine }), 1000);
    const reap = setInterval(() => {
      let changed = false;
      for (const [peer, v] of peers) if (Date.now() - v.seen > 3000) { peers.delete(peer); changed = true; }
      if (changed) deliver();
    }, 500);
    const onMsg = (ev) => {
      const d = ev.data;
      if (!d || d.room !== name || d.peer === me) return;
      if (d.t === 'bye') { peers.delete(d.peer); deliver(); return; }
      const prev = peers.get(d.peer);
      const same = prev && JSON.stringify(prev.presence) === JSON.stringify(d.presence);
      peers.set(d.peer, { presence: same ? prev.presence : Object.freeze(d.presence), updatedAt: same ? prev.updatedAt : Date.now(), seen: Date.now() });
      if (!prev || !same) deliver();
      if (!prev) send();
    };
    bc.addEventListener('message', onMsg);
    return {
      name,
      presence(patch) {
        const next = { ...mine };
        for (const [k, v] of Object.entries(patch)) { if (v === null) delete next[k]; else next[k] = v; }
        const bytes = new TextEncoder().encode(JSON.stringify(next)).length;
        window.__roomStats.maxBytes = Math.max(window.__roomStats.maxBytes, bytes);
        if (bytes > 4096) { window.__roomStats.rejects++; return Promise.reject({ code: 'invalid_argument', message: `presence ${bytes} bytes > 4 KiB` }); }
        mine = Object.freeze(next);
        send();
        deliver();
        return Promise.resolve();
      },
      peers: snapshot,
      onPeers(fn) { listeners.add(fn); deliver(); return () => listeners.delete(fn); },
      connected: () => true,
      onConnection(fn) { setTimeout(() => fn(true), 0); return () => {}; },
      on() { return () => {}; },
      emit() { return Promise.reject({ code: 'not_permitted' }); },
      leave() { bc.postMessage({ room: name, peer: me, t: 'bye' }); clearInterval(hb); clearInterval(reap); bc.removeEventListener('message', onMsg); listeners.clear(); return Promise.resolve(); },
    };
  }
  const room = Object.freeze({
    join: async (name) => { if (!rooms.has(name)) rooms.set(name, mkRoom(name)); return rooms.get(name); },
  });
  window.claude = Object.freeze({ use: (n) => new Promise((r) => setTimeout(() => r(n === 'room' ? room : null), 30)) });
  window.addEventListener('pagehide', () => { for (const r of rooms.values()) r.leave(); });
})();
