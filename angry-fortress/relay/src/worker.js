// 도토리깡 friend-match relay on Cloudflare (Workers + Durable Objects, free plan).
//
// wss://<worker>/r/dotori-abcd?role=host|guest&sid=…  → the Durable Object for room "dotori-abcd".
// Phones that cannot reach each other directly (mobile data, strict Wi-Fi) still meet here.
// The room logic lives in room.js; this file only adapts it to Durable Objects. Sockets use the
// hibernation API, so an idle room costs nothing, and "ping" is answered without waking it.
import { DurableObject } from 'cloudflare:workers';
import { RelayRoom } from './room.js';

const ROOM = /^\/r\/(dotori-[a-z0-9]{4})$/;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response('dotori relay ok\n', { headers: { 'content-type': 'text/plain', 'access-control-allow-origin': '*' } });
    }
    const m = ROOM.exec(url.pathname);
    if (!m) return new Response('not found\n', { status: 404 });
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('websocket only\n', { status: 426 });
    return env.ROOMS.get(env.ROOMS.idFromName(m[1])).fetch(req);
  },
};

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    this.room = new RelayRoom({
      sockets: () => ctx.getWebSockets(),
      meta: (ws) => ws.deserializeAttachment(),
      setMeta: (ws, m) => ws.serializeAttachment(m),
      seen: (ws) => {
        const t = ctx.getWebSocketAutoResponseTimestamp(ws);
        return t ? t.getTime() : 0;
      },
      send: (ws, text) => { try { ws.send(text); } catch { /* already closed */ } },
      close: (ws, code, reason) => { try { ws.close(code, reason); } catch { /* already closed */ } },
    });
  }

  async fetch(req) {
    const url = new URL(req.url);
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    this.room.join(server, { role: url.searchParams.get('role'), sid: url.searchParams.get('sid'), now: Date.now() });
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, msg) {
    this.room.message(ws, typeof msg === 'string' ? msg : '', Date.now());
  }

  async webSocketClose(ws, code) {
    this.room.leave(ws);
    try { ws.close(code === 1005 || code === 1006 ? 1000 : code, 'bye'); } catch { /* already closed */ }
  }

  async webSocketError(ws) {
    this.room.leave(ws);
  }
}
