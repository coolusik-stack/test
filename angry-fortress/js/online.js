// A friend match between two phones: the lobby handshake, starting (and restarting) matches,
// and the glue that feeds the friend's turns into our Game and ours into theirs.
//
// Everything travels as presence fields (see net.js), so a message is never "lost": the other
// phone always converges on our latest fields, even after a reconnect.
//   lobby  host's chosen map/wind/timer (shown to the guest while waiting)
//   match  host's current match {id, seed, theme, wind, timer, first}
//   in     the match this phone is playing {m, match, ok}
//   live   our captain + aim while we line up a shot (throttled)
//   st     our latest snapshot hand-over: {kind:'shot'|'end', q, ...}
//   fl     how far our simulation has run during our shot, and the ability tick
//   need / sync   a phone that (re)joined mid-match asks for, and gets, the current state
//   emo, rm, bye  emotes, rematch requests, leaving
import { connect } from './net.js';

export class Online {
  constructor({ role, code, onEvent }) {
    this.role = role;
    this.code = code;
    this.emit = onEvent;
    this.link = null;
    this.peer = null;
    this.peerSid = null;
    this.status = 'connecting';
    this.match = null;
    this.game = null;
    this.mine = {};
    this.fl = null;
    this.waitingSync = false;
    this.syncSentFor = null;
    this.lastEmo = undefined;
    this.emoC = 0;
    this.closed = false;
  }

  async start() {
    this.link = await connect({
      code: this.code,
      role: this.role,
      onPeer: (s) => this._onPeer(s),
      onStatus: (s) => { this.status = s; this.emit('status', s); },
    });
    if (this.closed) this.link.close();
    return this.link.kind;
  }

  set(patch) {
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) delete this.mine[k];
      else this.mine[k] = v;
    }
    if (this.link) this.link.set(patch);
  }

  close(bye = true) {
    if (this.closed) return;
    this.closed = true;
    if (bye && this.link) this.link.set({ bye: 1 });
    const link = this.link;
    setTimeout(() => link && link.close(), bye ? 250 : 0);
  }

  get paired() {
    return this.status === 'paired';
  }

  // ---------------------------------------------------------------- lobby / matches
  setLobby(settings) {
    this.set({ lobby: settings });
  }

  // Host only: start the next match. The loser of the last one shoots first. `series` carries
  // the best-of-3 score into the next round (null = a fresh series / single match).
  hostStart(settings, series = null) {
    const prev = this.match;
    const id = (prev ? prev.id : 0) + 1;
    let first = Math.random() < 0.5 ? 0 : 1;
    if (prev && this.lastWinner != null) first = this.lastWinner < 0 ? 1 - prev.first : 1 - this.lastWinner;
    const bo = settings.bo || 1;
    const match = {
      id, seed: (Math.random() * 1e9) | 0, theme: settings.theme, wind: settings.wind, timer: settings.timer, first,
      series: series || { bo, wins: [0, 0], round: 1 },
    };
    this.lastWinner = null;
    this.set({ match, rm: null, pick: null });
    this._begin(match, false);
  }

  // The loser of a round picks the next battlefield. A guest sends it to the host.
  sendPick(theme) {
    if (!this.match) return;
    this.set({ pick: { m: this.match.id, theme } });
  }

  _begin(match, needSync) {
    this.match = match;
    this.fl = null;
    this.set({ rm: null });
    this.emit('match', { match, needSync });
  }

  // main.js calls this once it has built the Game for `this.match`
  attach(game, needSync) {
    this.game = game;
    this.waitingSync = needSync;
    game.hold = needSync;
    const m = this.match.id;
    // nk tells one request from the next: a phone that reloads asks again under the same id
    const nk = needSync ? Math.random().toString(36).slice(2, 8) : null;
    this.set({ in: { m, match: this.match, ok: needSync ? 0 : 1 }, st: null, fl: null, live: null, sync: null, need: needSync ? m : null, nk });
    if (this.peer) this._onPeer(this.peer);
  }

  requestRematch() {
    if (!this.match) return;
    this.set({ rm: this.match.id + 1 });
    this._checkRematch();
  }

  _checkRematch() {
    if (this.role !== 'host' || !this.match || !this.peer) return;
    const want = this.match.id + 1;
    if (this.mine.rm === want && this.peer.rm === want) this.emit('rematch-go');
  }

  sendEmote(e) {
    this.emoC++;
    this.set({ emo: { c: `${this.emoC}-${Date.now() % 100000}`, e } });
  }

  // ---------------------------------------------------------------- game → friend
  onGameNet(msg) {
    if (!this.match) return;
    const m = this.match.id;
    switch (msg.t) {
      case 'live':
        this.set({ live: { m, n: msg.n, x: msg.x, y: msg.y, f: msg.f, pw: msg.pw, an: msg.an, sel: msg.sel } });
        break;
      case 'shot':
        this.fl = { m, q: msg.q, k: 0, ab: -1 };
        this.set({ st: { m, kind: 'shot', q: msg.q, n: msg.n, snap: msg.snap, pw: msg.pw, an: msg.an, sel: msg.sel }, fl: this.fl, live: null });
        break;
      case 'ab':
        if (this.fl && this.fl.q === msg.q) {
          this.fl = { ...this.fl, ab: msg.k, k: Math.max(this.fl.k, msg.k) };
          this.set({ fl: this.fl });
        }
        break;
      case 'fl':
        if (this.fl && this.fl.q === msg.q && msg.k > this.fl.k) {
          this.fl = { ...this.fl, k: msg.k };
          this.set({ fl: this.fl });
        }
        break;
      case 'end':
        this.set({ st: { m, kind: 'end', q: msg.q, n: msg.n, k: msg.k, snap: msg.snap }, live: null });
        break;
    }
  }

  // ---------------------------------------------------------------- friend → game
  _onPeer(ps) {
    this.peer = ps;
    if (!ps) { this.emit('peer', null); return; }
    if (this.peerSid && ps.sid !== this.peerSid) this.emit('rejoined');
    this.peerSid = ps.sid;
    // first sight of their emote counter: remember it, don't replay an old one
    if (this.lastEmo === undefined) this.lastEmo = ps.emo ? ps.emo.c : null;
    this.emit('peer', ps);
    if (ps.bye) { this.emit('bye'); return; }

    // a new match from the host, or a match already in progress (we came back to it)
    if (this.role === 'guest' && ps.match && (!this.match || ps.match.id > this.match.id)) {
      this._begin(ps.match, true);
      return;
    }
    if (!this.match && ps.in && ps.in.match && ps.in.ok) {
      this._begin(ps.in.match, true);
      return;
    }
    if (ps.emo && ps.emo.c !== this.lastEmo) {
      this.lastEmo = ps.emo.c;
      this.emit('emote', ps.emo.e);
    }
    this._checkRematch();
    if (ps.rm && this.match && ps.rm === this.match.id + 1) this.emit('rematch-asked');
    if (this.role === 'host' && ps.pick && this.match && ps.pick.m === this.match.id && this.pickSeen !== this.match.id) {
      this.pickSeen = this.match.id;
      this.emit('pick', ps.pick.theme);
    }

    const g = this.game;
    if (!g || !this.match) return;
    const m = this.match.id;
    // they (re)joined this match without its state: send ours
    if (ps.need === m && this.mine.in && this.mine.in.m === m && this.mine.in.ok) {
      const key = `${ps.sid}:${m}:${ps.nk}`;
      if (this.syncSentFor !== key) {
        this.syncSentFor = key;
        this.set({ sync: { m, ...g.syncPayload() } });
      }
    } else if (this.mine.sync && ps.need !== m) {
      this.set({ sync: null });
    }
    if (this.waitingSync) {
      if (!ps.sync || ps.sync.m !== m) return;
      this.waitingSync = false;
      try { g.applySync(ps.sync); } catch (e) { console.warn('sync', e); }
      this.set({ need: null, nk: null, in: { m, match: this.match, ok: 1 } });
    }
    // what the friend's page sends is untrusted: a malformed field must not take the link down
    try {
      if (ps.st && ps.st.m === m) {
        if (ps.st.kind === 'shot') g.netShot(ps.st);
        else if (ps.st.kind === 'end') g.netEndTurn(ps.st);
      }
      if (ps.fl && ps.fl.m === m) g.netProgress(ps.fl);
      if (ps.live && ps.live.m === m) g.netLiveUpdate(ps.live);
    } catch (e) {
      console.warn('friend state', e);
    }
  }
}
