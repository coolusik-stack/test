// The link between two friends' phones.
//
// Both sides publish one small object of fields ("presence"); the other side always sees the
// latest value of every field, and a phone that drops out and comes back simply gets the whole
// object again. Three carriers, same shape, tried in this order:
//   - claude.ai's `room` capability, when the game runs as a claude.ai artifact
//   - our relay server (relay/ in this repo, on Cloudflare), when the build knows its address:
//     works on mobile data and strict Wi-Fi, where a direct link often can't be made
//   - a WebRTC data channel through PeerJS (brokered by the public PeerJS server)
//
// connect({ code, role, onPeer, onStatus }) resolves a link { kind, set(patch), close() } or
// throws when neither carrier is available.
//   onPeer(state)   the friend's latest object (null when the friend is gone)
//   onStatus(s)     'waiting' | 'paired' | 'lost' | 'taken' | 'full' | 'nohost' | 'error'
import { loadSite } from './site.js';

export const PROTO = 1;
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function makeCode() {
  let s = '';
  for (let i = 0; i < 4; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

export function cleanCode(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/[O]/g, '0').replace(/[IL]/g, '1').slice(0, 4);
}

const roomName = (code) => 'dotori-' + code.toLowerCase();

// This page's id. It survives a reload of the tab, so a phone that comes back to a match is
// recognised as the same phone (the relay then swaps its old connection for the new one).
export const sid = (() => {
  const fresh = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => (b % 36).toString(36)).join('');
  try {
    let s = sessionStorage.getItem('af.sid');
    if (!/^[a-z0-9]{8}$/.test(s || '')) { s = fresh(); sessionStorage.setItem('af.sid', s); }
    return s;
  } catch (e) {
    return fresh();
  }
})();

export async function connect(opts) {
  const room = await roomLink(opts).catch(() => null);
  if (room) return room;
  // a relay that answers "this code is taken" is final; one that can't be reached is skipped
  const relay = await relayLink(opts).catch((e) => { if (e && e.refused) throw e; return null; });
  if (relay) return relay;
  return peerLink(opts);
}

// ------------------------------------------------------------------ claude.ai room
async function roomLink({ code, role, onPeer, onStatus }) {
  const c = window.claude;
  if (!c || typeof c.use !== 'function') return null;
  const lobby = await c.use('room');
  if (!lobby) return null;
  const r = await lobby.join(roomName(code));
  const other = role === 'host' ? 'guest' : 'host';
  let friend = null; // peer label we are paired with
  let lastPresence = null;
  let closed = false;
  let status = '';
  const say = (s) => { if (s !== status) { status = s; onStatus(s); } };
  const bornAt = Date.now();
  const pick = (peers) => {
    const mine = peers.filter((p) => !p.sameTab && p.kind === 'viewer' && p.presence && p.presence.app === 'dotori' && p.presence.v === PROTO);
    // two hosts on one code: the one that opened the room first keeps it
    if (role === 'host' && mine.some((p) => p.presence.role === 'host' && p.presence.sid !== sid && (p.presence.t || 0) < bornAt)) return 'taken';
    const cands = mine.filter((p) => p.presence.role === other);
    return cands.find((p) => p.peer === friend) || cands[0] || null;
  };
  r.onPeers((ch) => {
    if (closed) return;
    const f = pick(ch.peers);
    if (f === 'taken') { say('taken'); return; }
    if (!f) {
      if (friend) { friend = null; lastPresence = null; onPeer(null); say('lost'); } else say('waiting');
      return;
    }
    friend = f.peer;
    say('paired');
    if (f.presence !== lastPresence) {
      lastPresence = f.presence;
      onPeer(f.presence);
    }
  }, () => { if (!closed) say('error'); });
  await r.presence({ app: 'dotori', v: PROTO, role, sid, t: bornAt });
  say('waiting');
  return {
    kind: 'room',
    set(patch) {
      if (closed) return;
      r.presence(patch).catch((e) => console.warn('presence', e && e.code, e && e.message));
    },
    close() {
      closed = true;
      r.leave().catch(() => {});
    },
  };
}

// ------------------------------------------------------------------ relay (WebSocket)
// The relay's address comes from site.json (see site.js), or ?relay=ws://host:port for tests and
// local play (node relay/local.mjs).
async function relayUrl() {
  const q = new URLSearchParams(location.search).get('relay');
  if (q) return q.replace(/\/+$/, '');
  return (await loadSite()).relay;
}

const PING_MS = 5000;
const DEAD_MS = 12000;

async function relayLink({ code, role, onPeer, onStatus }) {
  const base = await relayUrl();
  if (!base || typeof WebSocket !== 'function') return null;
  const url = `${base}/r/${roomName(code)}?role=${role}&sid=${sid}&v=${PROTO}`;
  const state = { app: 'dotori', v: PROTO, role, sid };
  let peerState = null;
  let ws = null;
  let closed = false;
  let status = '';
  let everPaired = false;
  let tries = 0;
  let retryT = null;
  let lastHeard = 0;
  let settle = null; // the first connection's promise callbacks
  const say = (s) => { if (s !== status) { status = s; onStatus(s); } };
  const lose = () => {
    if (!peerState) return;
    peerState = null;
    onPeer(null);
  };
  const alone = () => say(everPaired ? 'lost' : role === 'guest' ? 'nohost' : 'waiting');
  const send = (s, v) => { if (s && s.readyState === 1) s.send(typeof v === 'string' ? v : JSON.stringify(v)); };

  // our socket is gone (closed, or silent too long): show it, then dial again soon
  const drop = (s) => {
    if (s !== ws) return;
    ws = null;
    try { s.close(); } catch (e) { /* already closed */ }
    if (closed) return;
    if (settle) { const f = settle; settle = null; f.no(new Error('relay unreachable')); return; }
    lose();
    say(everPaired ? 'lost' : 'error');
    clearTimeout(retryT);
    retryT = setTimeout(dial, Math.min(5000, 500 * 2 ** tries++));
  };

  const dial = () => {
    if (closed || ws) return;
    const s = new WebSocket(url);
    ws = s;
    const openT = setTimeout(() => { if (s.readyState !== 1) drop(s); }, 6000);
    s.onopen = () => {
      clearTimeout(openT);
      lastHeard = Date.now();
      send(s, { full: state });
    };
    s.onmessage = (e) => {
      if (s !== ws || closed) return;
      lastHeard = Date.now();
      if (e.data === 'pong') return;
      let m;
      try { m = JSON.parse(e.data); } catch (err) { return; }
      if (!m || typeof m !== 'object') return;
      if (m.t === 'hi') {
        tries = 0;
        if (settle) { const f = settle; settle = null; f.ok(); }
        if (!m.peers) { lose(); alone(); } else if (status !== 'paired') say('waiting');
      } else if (m.t === 'join') {
        send(s, { full: state });
      } else if (m.t === 'left') {
        lose();
        alone();
      } else if (m.t === 'taken' || m.t === 'full' || m.t === 'bad') {
        ws = null;
        try { s.close(); } catch (err) { /* already closed */ }
        say(m.t === 'bad' ? 'error' : m.t);
        if (settle) { const f = settle; settle = null; const err = new Error(m.t); err.refused = true; f.no(err); }
      } else if (m.d && typeof m.d === 'object') {
        const d = m.d;
        if (d.full && typeof d.full === 'object') peerState = { ...d.full };
        else if (d.p && typeof d.p === 'object') {
          if (!peerState) return; // a patch before we have their whole state: their full is on its way
          peerState = { ...peerState };
          for (const [k, v] of Object.entries(d.p)) {
            if (v === null) delete peerState[k];
            else peerState[k] = v;
          }
        } else return;
        if (peerState.app !== 'dotori' || peerState.v !== PROTO) return;
        everPaired = true;
        say('paired');
        onPeer(peerState);
      }
    };
    s.onclose = () => drop(s);
    s.onerror = () => drop(s);
  };

  // keep the link warm, and notice a dead one long before the phone's network stack would
  const beat = setInterval(() => {
    if (!ws || ws.readyState !== 1) return;
    if (Date.now() - lastHeard > DEAD_MS) { drop(ws); return; }
    send(ws, 'ping');
  }, PING_MS);
  // back from the background or back online: check right away instead of waiting for a timeout
  const wake = () => {
    if (closed || document.visibilityState === 'hidden') return;
    if (!ws) { clearTimeout(retryT); tries = 0; dial(); return; }
    if (ws.readyState === 1) {
      send(ws, 'ping');
      const s = ws;
      const at = Date.now();
      setTimeout(() => { if (s === ws && lastHeard < at) drop(s); }, 3000);
    }
  };
  document.addEventListener('visibilitychange', wake);
  window.addEventListener('online', wake);

  await new Promise((ok, no) => {
    settle = { ok, no };
    dial();
  }).catch((e) => {
    closed = true;
    clearInterval(beat);
    document.removeEventListener('visibilitychange', wake);
    window.removeEventListener('online', wake);
    throw e;
  });
  return {
    kind: 'relay',
    set(patch) {
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) delete state[k];
        else state[k] = v;
      }
      send(ws, { p: patch });
    },
    close() {
      closed = true;
      clearTimeout(retryT);
      clearInterval(beat);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
      const s = ws;
      ws = null;
      if (s) { try { s.close(1000); } catch (e) { /* already closed */ } }
    },
  };
}

// ------------------------------------------------------------------ PeerJS (WebRTC)
let peerLib = null;
function loadPeerJs() {
  if (window.Peer) return Promise.resolve(window.Peer);
  if (!peerLib) {
    peerLib = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'vendor/peerjs.min.js';
      s.onload = () => (window.Peer ? resolve(window.Peer) : reject(new Error('peerjs')));
      s.onerror = () => { peerLib = null; reject(new Error('peerjs')); };
      document.head.appendChild(s);
    });
  }
  return peerLib;
}

// ?peer=host:port points at a self-hosted PeerServer (used by the automated tests)
function peerOptions() {
  const q = new URLSearchParams(location.search).get('peer');
  const base = { debug: 0, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] } };
  if (!q) return base;
  const [host, port] = q.split(':');
  return { ...base, host, port: Number(port) || 9000, path: '/', secure: false, config: { iceServers: [] } };
}

async function peerLink({ code, role, onPeer, onStatus }) {
  const Peer = await loadPeerJs();
  const state = { app: 'dotori', v: PROTO, role, sid };
  let peerState = null;
  let conn = null;
  let closed = false;
  let status = '';
  let retry = null;
  const say = (s) => { if (s !== status) { status = s; onStatus(s); } };
  const hostId = roomName(code);
  const peer = role === 'host' ? new Peer(hostId, peerOptions()) : new Peer(peerOptions());

  const adopt = (c) => {
    if (conn && conn !== c) { try { conn.close(); } catch (e) { /* already gone */ } }
    conn = c;
    c.on('open', () => {
      if (closed) return;
      c.send({ full: state });
    });
    c.on('data', (d) => {
      if (closed || c !== conn || !d || typeof d !== 'object') return;
      if (d.full) peerState = { ...d.full };
      else if (d.p) {
        peerState = { ...(peerState || {}) };
        for (const [k, v] of Object.entries(d.p)) {
          if (v === null) delete peerState[k];
          else peerState[k] = v;
        }
      } else return;
      if (peerState.app !== 'dotori' || peerState.v !== PROTO) return;
      say('paired');
      onPeer(peerState);
    });
    const gone = () => {
      if (closed || c !== conn) return;
      conn = null;
      peerState = null;
      onPeer(null);
      say('lost');
      if (role === 'guest') scheduleDial();
    };
    c.on('close', gone);
    c.on('error', gone);
  };
  const dial = () => {
    if (closed || conn || peer.destroyed) return;
    if (peer.disconnected) { try { peer.reconnect(); } catch (e) { /* retry later */ } scheduleDial(); return; }
    adopt(peer.connect(hostId, { reliable: true, serialization: 'json' }));
  };
  const scheduleDial = () => {
    clearTimeout(retry);
    retry = setTimeout(dial, 2000);
  };

  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), 12000);
    peer.on('open', () => { clearTimeout(t); resolve(); });
    peer.on('error', (e) => {
      if (e.type === 'unavailable-id') { clearTimeout(t); say('taken'); reject(e); return; }
      if (e.type === 'peer-unavailable') { say('nohost'); if (conn) conn = null; scheduleDial(); return; }
      if (e.type === 'network' || e.type === 'server-error' || e.type === 'socket-error' || e.type === 'browser-incompatible') {
        clearTimeout(t);
        say('error');
        reject(e);
      }
    });
  });
  peer.on('disconnected', () => { if (!closed) { try { peer.reconnect(); } catch (e) { /* ignore */ } } });
  if (role === 'host') peer.on('connection', (c) => { if (!closed) adopt(c); });
  else dial();
  say('waiting');
  return {
    kind: 'peer',
    set(patch) {
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) delete state[k];
        else state[k] = v;
      }
      if (conn && conn.open) conn.send({ p: patch });
    },
    close() {
      closed = true;
      clearTimeout(retry);
      try { if (conn) conn.close(); } catch (e) { /* ignore */ }
      setTimeout(() => { try { peer.destroy(); } catch (e) { /* ignore */ } }, 300);
    },
  };
}
