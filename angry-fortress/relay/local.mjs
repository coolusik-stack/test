// The friend-match relay on your own computer, speaking the same protocol as the Cloudflare one
// (both run src/room.js). The tests use it; you can too:
//   node relay/local.mjs 8787      then open the game with ?relay=ws://<this computer>:8787
import { WebSocketServer } from 'ws';
import { RelayRoom } from './src/room.js';

const ROOM = /^\/r\/(dotori-[a-z0-9]{4})$/;

export function startRelay(port = 0) {
  const rooms = new Map(); // name -> { sockets:Set, room:RelayRoom }
  const meta = new WeakMap();
  const roomOf = (name) => {
    let r = rooms.get(name);
    if (!r) {
      const sockets = new Set();
      r = {
        sockets,
        room: new RelayRoom({
          sockets: () => [...sockets],
          meta: (ws) => meta.get(ws),
          setMeta: (ws, m) => meta.set(ws, m),
          seen: (ws) => ws._pinged || 0,
          send: (ws, text) => { if (ws.readyState === 1) ws.send(text); },
          close: (ws, code, reason) => { try { ws.close(code, reason); } catch { /* gone */ } },
        }),
      };
      rooms.set(name, r);
    }
    return r;
  };
  const wss = new WebSocketServer({ port, host: '0.0.0.0' });
  wss.on('connection', (ws, req) => {
    const url = new URL(req.url, 'http://relay');
    const m = ROOM.exec(url.pathname);
    if (!m) { ws.close(4404, 'not found'); return; }
    const r = roomOf(m[1]);
    r.sockets.add(ws);
    r.room.join(ws, { role: url.searchParams.get('role'), sid: url.searchParams.get('sid'), now: Date.now() });
    ws.on('message', (data, isBinary) => {
      const text = isBinary ? '' : data.toString();
      if (text === 'ping') ws._pinged = Date.now();
      r.room.message(ws, text, Date.now());
    });
    ws.on('close', () => {
      r.room.leave(ws);
      r.sockets.delete(ws);
      if (!r.sockets.size) rooms.delete(m[1]);
    });
    ws.on('error', () => {});
  });
  return new Promise((resolve) => {
    wss.on('listening', () => {
      const url = `ws://127.0.0.1:${wss.address().port}`;
      resolve({
        url,
        rooms,
        // cut every socket without a goodbye, like a phone losing its signal
        drop() { for (const c of wss.clients) c.terminate(); },
        close: () => new Promise((done) => { for (const c of wss.clients) c.terminate(); wss.close(() => done()); }),
      });
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const relay = await startRelay(Number(process.argv[2]) || 8787);
  console.log(`dotori relay on ${relay.url} (open the game with ?relay=ws://<this computer's address>:${relay.url.split(':').pop()})`);
}
