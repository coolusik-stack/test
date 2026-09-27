// The link between two friends' phones.
//
// Both sides publish one small object of fields ("presence"); the other side always sees the
// latest value of every field, and a phone that drops out and comes back simply gets the whole
// object again. Two carriers, same shape:
//   - claude.ai's `room` capability, when the game runs as a claude.ai artifact
//   - a WebRTC data channel through PeerJS, anywhere else (brokered by the public PeerJS server)
//
// connect({ code, role, onPeer, onStatus }) resolves a link { kind, set(patch), close() } or
// throws when neither carrier is available.
//   onPeer(state)   the friend's latest object (null when the friend is gone)
//   onStatus(s)     'waiting' | 'paired' | 'lost' | 'taken' | 'nohost' | 'error'

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
export const sid = Math.random().toString(36).slice(2, 10);

export async function connect(opts) {
  const room = await roomLink(opts).catch(() => null);
  if (room) return room;
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
