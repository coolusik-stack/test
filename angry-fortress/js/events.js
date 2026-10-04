// Forest forecast events and the parachute supply drop.
//
// Everything here is decided by the match seed and the turn number, and runs in fixed physics
// ticks, so both phones of a friend match see exactly the same boar, the same falling acorns and
// the same basket. The drop is part of the lockstep snapshot; the rest never outlives a turn.
import * as Art from './art.js';
import { WORLD } from './terrain.js';
import { clamp, lerp, rng } from './util.js';
import {
  EVENT_FIRST, EVENT_EVERY, EVENT_LEN, EVENT_INFO, RAINNUT, BOAR, MAT,
  DROP_FIRST, DROP_EVERY, DROP_STEP, DROP_HEAL, HP_MAX,
} from './config.js';

const planck = window.planck;
const V = (x, y) => planck.Vec2(x, y);
const KINDS = ['gust', 'rain', 'acornrain', 'boar'];

export class ForestEvents {
  constructor(game) {
    this.g = game;
    this.boar = null;
    this.drop = null;
    this.rainQueue = null;
    this.rainFx = 0; // shower strength on screen (looks only)
    // a shuffled cycle of all event kinds, fixed per match
    const r = rng((game.seed ^ 0x5eed7) >>> 0);
    const kinds = KINDS.filter((k) => k !== 'gust' || game.windMax > 0);
    this.order = [];
    for (let round = 0; round < 6; round++) {
      const bag = kinds.slice();
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      // no back-to-back repeat across cycles
      if (this.order.length && bag[0] === this.order[this.order.length - 1]) bag.push(bag.shift());
      this.order.push(...bag);
    }
  }

  // The event that is on during turn `n` (null when none).
  kindFor(n) {
    if (n < EVENT_FIRST) return null;
    const k = Math.floor((n - EVENT_FIRST) / EVENT_EVERY);
    const off = (n - EVENT_FIRST) % EVENT_EVERY;
    return off < EVENT_LEN ? this.order[k % this.order.length] : null;
  }

  starts(n) {
    return n >= EVENT_FIRST && (n - EVENT_FIRST) % EVENT_EVERY === 0;
  }

  // What the HUD should say at the start of turn n.
  info(n) {
    const now = this.kindFor(n);
    const next = !now && this.kindFor(n + 1) ? this.kindFor(n + 1) : null;
    const left = now ? EVENT_LEN - ((n - EVENT_FIRST) % EVENT_EVERY) : 0;
    return { now, next, left, starting: !!now && this.starts(n), name: EVENT_INFO[now || next]?.name, desc: EVENT_INFO[now || next]?.desc };
  }

  // ------------------------------------------------------------------ turn start
  // Called from Game.startTurn after the wind roll. Returns true when an animated event (the
  // boar) must play before anyone can shoot.
  onTurnStart(n) {
    const g = this.g;
    const now = this.kindFor(n);
    if (now === 'gust') {
      const sign = Math.sign(g.wind) || (rng((g.seed + n * 31) >>> 0)() < 0.5 ? -1 : 1);
      g.wind = sign * clamp(Math.max(Math.abs(g.wind) * 2, 6), 6, 14);
    }
    for (const p of g.players) p.body.setLinearDamping(now === 'rain' ? 0.08 : 0.35);
    this._dropTurn(n);
    if (now === 'boar' && this.starts(n)) {
      const dir = (Math.floor((n - EVENT_FIRST) / EVENT_EVERY) + (g.seed & 1)) % 2 ? -1 : 1;
      this._startBoar(dir);
      return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ acorn rain
  onLaunch() {
    const g = this.g;
    this.rainQueue = null;
    if (g.event !== 'acornrain') return;
    const W = WORLD.W;
    this.rainQueue = [];
    for (let i = 0; i < 8; i++) {
      this.rainQueue.push({ t: 24 + i * 15 + Math.floor(g.lrng() * 10), x: lerp(5, W - 5, g.lrng()) });
    }
    g.fx.text(W / 2, 24, '도토리 비!', '#ffe45c', 1.0, { life: 1.4 });
  }

  // ------------------------------------------------------------------ per physics tick
  tick(dt) {
    const g = this.g;
    if (this.rainQueue && this.rainQueue.length && (g.state === 'flight' || g.state === 'settle')) {
      while (this.rainQueue.length && g.shotTick >= this.rainQueue[0].t) {
        const o = this.rainQueue.shift();
        const q = g._spawnProjectile('fallnut', 'acorn', RAINNUT, g.players[g.turn], o.x, 31, 0, -7);
        q.t = 1;
      }
    }
    if (this.boar) this._tickBoar(dt);
  }

  // ------------------------------------------------------------------ boar
  _startBoar(dir) {
    const g = this.g;
    // it bursts out of the bushes at the outer cliff of the first island
    let x = dir > 0 ? 2 : WORLD.W - 2;
    while (x > 1 && x < WORLD.W - 1 && g.terrain.surfaceY(x) < WORLD.SEA + 0.5) x += dir * 0.25;
    x += dir * 0.8;
    const y = Math.max(g.terrain.surfaceY(x), WORLD.SEA);
    this.boar = { x, y, vy: 0, dir, t: 0, hit: 0, hitIds: new Set(), air: false };
    g.crew?.reactAll('boar');
    g._sfx('boar');
    g._hap('boar');
  }

  _tickBoar(dt) {
    const g = this.g, b = this.boar, t = g.terrain;
    b.t += dt;
    b.hit = Math.max(0, b.hit - dt * 4);
    b.x += b.dir * BOAR.speed * dt;
    // follow the ground it runs on (never the islets overhead), scramble up walls, tumble down
    // slopes and leap the gaps between islands; with no land left ahead it sails off the edge
    let ground = t.surfaceY(b.x, b.y + 3.2);
    if (ground < 0 || t.solid(b.x, b.y + 3.1)) ground = t.surfaceY(b.x);
    const sky = ground < WORLD.SEA + 0.3;
    if (!b.air && sky) {
      b.air = true;
      b.vy = this._landAhead(b) ? 10.5 : 3;
      g.fx.burst(b.x - b.dir * 0.6, b.y + 0.1, 'dust', 4, { speed: 2 });
    }
    if (!sky && ground > b.y) {
      b.y = Math.min(ground, b.y + 20 * dt);
      b.vy = 0;
      if (b.air) { b.air = false; g.fx.burst(b.x, b.y + 0.1, 'dust', 5, { speed: 2 }); g._hap('dent'); }
    } else {
      b.vy -= (b.air ? 30 : 32) * dt;
      const floor = sky ? -Infinity : ground;
      b.y = Math.max(floor, b.y + b.vy * dt);
      if (b.y <= floor) {
        b.vy = 0;
        if (b.air) { b.air = false; g.fx.burst(b.x, b.y + 0.1, 'dust', 5, { speed: 2 }); g._hap('dent'); }
      }
    }
    if (b.y < WORLD.SEA - 0.4) {
      g._cloudPoof(b.x, 1);
      this.boar = null;
      return;
    }
    // what it crashes into
    for (const p of g.players) {
      if (p.dead || b.hitIds.has(p)) continue;
      const pos = p.body.getPosition();
      if (Math.abs(pos.x - b.x) < 1.3 && Math.abs(pos.y - (b.y + 0.7)) < 1.7) {
        b.hitIds.add(p);
        b.hit = 1;
        const m = p.body.getMass();
        p.body.applyLinearImpulse(V(b.dir * 2.2 * m, 6.5 * m), p.body.getPosition(), true);
        g._hurt(p, BOAR.dmg, null);
        g.fx.burst(pos.x, pos.y + 0.8, 'star', 6, { speed: 4 });
        g.fx.text(pos.x, pos.y + 2.4, '쿵!', '#ffe45c', 0.9, { life: 1 });
        g._sfx('squeak_hurt');
      }
    }
    for (const B of g.blocks) {
      if (B.dead || b.hitIds.has(B)) continue;
      const pos = B.body.getPosition();
      const half = B.shape === 'circle' ? B.r : Math.max(B.w, B.h) / 2;
      if (Math.abs(pos.x - b.x) < 1.0 + half && pos.y < b.y + 1.5 + half && pos.y > b.y - 0.6) {
        b.hitIds.add(B);
        b.hit = 1;
        const m = Math.min(B.body.getMass(), 3);
        B.body.applyLinearImpulse(V(b.dir * 6 * m, 4 * m), V(pos.x - b.dir * 0.1, pos.y - 0.1), true);
        g._damageBlock(B, BOAR.blockDmg * MAT[B.mat].resist, false);
        g._sfx('hit_wood', { vol: 0.7 });
      }
    }
    for (const d of g.forest.dandelions) {
      if (!d.done && Math.abs(d.x - b.x) < 0.8 && Math.abs(d.ground - b.y) < 1.5) g.forest._blowDandelion(d, b.dir);
    }
    if (Math.floor(b.t * 7) !== Math.floor((b.t - dt) * 7)) {
      g.fx.burst(b.x - b.dir * 0.9, b.y + 0.15, 'dust', 2, { speed: 1.2 });
      if (Math.floor(b.t * 7) % 3 === 0) g._hap('dent');
    }
    if ((b.dir > 0 && b.x > WORLD.W + 2) || (b.dir < 0 && b.x < -2)) this.boar = null;
  }

  // Is there an island to land on within one leap?
  _landAhead(b) {
    const t = this.g.terrain;
    for (let d = 1; d <= 10; d += 0.5) if (t.surfaceY(b.x + b.dir * d, b.y + 2.5) > WORLD.SEA + 0.5) return true;
    return false;
  }

  // ------------------------------------------------------------------ supply drop
  _dropTurn(n) {
    const g = this.g;
    const d = this.drop;
    if (d && !d.landed) {
      d.x = clamp(d.x + g.wind * 0.22, g.land.mid - 12, g.land.mid + 12);
      const ground = g.terrain.surfaceY(d.x);
      d.y = Math.max(ground + 0.36, d.y - DROP_STEP);
      if (d.y <= ground + 0.37) {
        if (ground < WORLD.SEA + 0.2) {
          // nothing under it: lost to the clouds
          g._cloudPoof(d.x, 0.8);
          g.fx.text(d.x, WORLD.SEA + 2, '보급이 구름 아래로 떨어졌어요', '#fff', 0.8, { life: 1.6 });
          this._removeDrop();
          return;
        }
        d.landed = true;
        g._sfx('land', { vol: 0.6 });
      }
      this._dropBody();
    } else if (!d && n >= DROP_FIRST && (n - DROP_FIRST) % DROP_EVERY === 0) {
      const r = rng(((g.seed ^ 0xd809) + n * 131) >>> 0);
      this.drop = { x: g.land.mid + r.range(-6, 6), y: 28, kind: r() < 0.5 ? 'nuts' : 'heal', landed: false, showY: 33 };
      this._dropBody();
      g.fx.text(this.drop.x, 25, '보급 도착!', '#ffe45c', 1.0, { life: 1.8 });
      g._sfx('alert');
    }
  }

  _dropBody() {
    const g = this.g, d = this.drop;
    if (d.body && !d.body._destroyed) { d.body._destroyed = true; g.world.destroyBody(d.body); }
    d.body = g.world.createBody({ type: 'static', position: V(d.x, d.y) });
    d.body.createFixture(planck.Circle(0.85), { isSensor: true });
    if (!d.landed) d.body.createFixture(planck.Circle(V(0, 2.3), 1.35), { isSensor: true });
    d.body.setUserData({ kind: 'drop', ref: d });
  }

  _removeDrop() {
    const d = this.drop;
    if (!d) return;
    if (d.body && !d.body._destroyed) { d.body._destroyed = true; this.g.world.destroyBody(d.body); }
    this.drop = null;
  }

  // a nut touched the basket or its leaf (called from begin-contact: the world is locked)
  onDropHit(P) {
    const d = this.drop;
    if (!d || d.claimed || P.dead || (P.kind !== 'nut' && P.kind !== 'kernel')) return;
    d.claimed = true;
    const g = this.g;
    g.afterStep.push(() => {
      const p = P.owner;
      const pos = V(d.x, d.y);
      if (d.kind === 'heal') {
        const add = Math.min(DROP_HEAL, HP_MAX - p.hp);
        p.hp += add;
        g.fx.text(pos.x, pos.y + 1.4, `체력 +${Math.round(add)}!`, '#7cf07a', 1.0, { life: 1.8 });
      } else {
        p.ammo.burr = (p.ammo.burr || 0) + 1;
        p.ammo.walnut = (p.ammo.walnut || 0) + 1;
        g.fx.text(pos.x, pos.y + 1.4, '+밤송이 +호두!', '#ffe45c', 1.0, { life: 1.8 });
      }
      g.fx.burst(pos.x, pos.y, 'leaf', 14, { speed: 5 });
      g.fx.burst(pos.x, pos.y, 'star', 8, { speed: 4 });
      g._sfx('pickup');
      g._hap('pickup');
      g.crew?.react(p, 'drop');
      g.emit('hud');
      this._removeDrop();
    });
  }

  // ------------------------------------------------------------------ lockstep state
  state() {
    const d = this.drop;
    return d ? { d: [Math.round(d.x * 100), Math.round(d.y * 100), d.kind === 'heal' ? 1 : 0, d.landed ? 1 : 0] } : {};
  }

  load(s) {
    this.boar = null;
    this.rainQueue = null;
    const e = s && s.d;
    if (!e) { this.drop = null; return; }
    const keep = this.drop && Math.abs(this.drop.x - e[0] / 100) < 0.01 ? this.drop.showY : null;
    this.drop = { x: e[0] / 100, y: e[1] / 100, kind: e[2] ? 'heal' : 'nuts', landed: !!e[3], showY: keep ?? e[1] / 100 };
    this._dropBody();
  }

  // ------------------------------------------------------------------ drawing
  drawWorld(ctx, time, dt) {
    const d = this.drop;
    if (d) {
      d.showY = d.showY == null ? d.y : lerp(d.showY, d.y, 1 - Math.exp(-3 * dt)); // glide down between turns
      Art.drawSupplyDrop(ctx, { x: d.x, y: -d.showY, time, kind: d.kind, sway: Math.sin(time * 0.9 + d.x) * 0.5, landed: d.landed });
    }
    const b = this.boar;
    if (b) Art.drawBoar(ctx, { x: b.x, y: -b.y, facing: b.dir, time, run: 1, hit: b.hit });
  }

  // a passing shower: slanted streaks and a grey veil over the screen
  drawScreen(ctx, W, H, dpr, time, dt) {
    const on = this.g.event === 'rain';
    this.rainFx = clamp(this.rainFx + (on ? dt : -dt) * 1.5, 0, 1);
    if (this.rainFx <= 0.01) return;
    const k = this.rainFx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = `rgba(40,60,90,${0.18 * k})`;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = `rgba(210,230,255,${0.45 * k})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    const n = Math.round(90 * k);
    for (let i = 0; i < n; i++) {
      const sx = ((i * 0.6180339 * W * 3 + time * 60) % (W + 80)) - 40;
      const sy = ((i * 131.7 + time * 900) % (H + 60)) - 30;
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx - 7, sy + 22);
    }
    ctx.stroke();
  }
}
