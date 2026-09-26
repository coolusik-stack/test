// One match: physics world, turn flow, damage rules, input and rendering.
import { WORLD, Terrain, buildLandscape, makeDirtPattern } from './terrain.js';
import { THEMES, FORTS, PROPS } from './levels.js';
import { Scene } from './scene.js';
import { FX } from './fx.js';
import { Camera } from './camera.js';
import * as Art from './art.js';
import Sound from './audio.js';
import { planShot } from './ai.js';
import { clamp, rng, vibrate, lerp, dist } from './util.js';
import {
  GRAV, VMAX, WIND_ACC, MAX_PULL, CART_R, HEAD, HP_MAX, STAMINA, STAMINA_PER_M, MOVE_SPEED,
  MAT, BIRDS, MINI, EGG, TNT_BLAST, WIND_LEVELS, TEAM, HIT_K, HIT_CAP, FLOOD_TURN, FLOOD_STEP,
} from './config.js';

const planck = window.planck;
const V = (x, y) => planck.Vec2(x, y);
const DT = 1 / 60;
const TAU = Math.PI * 2;

export class Game {
  constructor(canvas, opts, emit, size) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = opts; // {mode:'cpu'|'pvp', difficulty, theme, wind:'off'|'normal'|'strong', timer:0|30, guide:boolean, seed}
    this.emit = emit || (() => {});
    this.seed = opts.seed ?? ((Math.random() * 1e9) | 0);
    this.theme = THEMES[opts.theme] || THEMES.meadow;
    this.time = 0;
    this.fx = new FX();
    this.cam = new Camera();
    this.scene = new Scene(this.theme, this.seed);
    this.acc = 0;
    this.timeScale = 1;
    this.slowT = 0;
    this.state = 'intro';
    this.stateT = 0;
    this.turn = 0;
    this.turnNo = 0;
    this.wind = 0;
    this.windMax = WIND_LEVELS[opts.wind] ?? WIND_LEVELS.normal;
    this.projectiles = [];
    this.blocks = [];
    this.killQueue = [];
    this.blastQueue = [];
    this.dentQueue = [];
    this.pointers = new Map();
    this.aim = null;
    this.paused = false;
    this.damageOn = false;
    this.currentTrail = [];
    this.turnTimer = 0;
    this.over = false;
    this.lastTickSec = -1;
    this.silent = !!opts.demo;
    if (size) this.resize(size.w, size.h, size.dpr);
    this._build();
  }

  // ------------------------------------------------------------------ setup
  _build() {
    WORLD.SEA = WORLD.SEA0;
    this.seaTarget = WORLD.SEA0;
    const r = rng(this.seed);
    this.world = new planck.World({ gravity: V(0, -GRAV) });
    const land = buildLandscape(this.theme.layout, this.seed);
    this.land = land;
    this.terrain = new Terrain({ style: this.theme.ground, seed: this.seed, heights: land.heights, ops: land.ops });
    this.terrain.attach(this.world, planck);
    this.pattern = makeDirtPattern(this.ctx, this.theme.ground, this.seed);

    // captains
    this.players = [0, 1].map((i) => {
      const x = land.bases[i];
      const y = this.terrain.surfaceY(x) + CART_R + 0.05;
      const body = this.world.createBody({ type: 'dynamic', position: V(x, y), fixedRotation: true, linearDamping: 0.15 });
      body.createFixture(planck.Circle(CART_R), { density: 2.0, friction: 1.2, restitution: 0.02 });
      body.createFixture(planck.Circle(V(0, HEAD.y), HEAD.r), { density: 0.6, friction: 0.6, restitution: 0.05 });
      const p = {
        id: i,
        team: i,
        name: TEAM[i].name,
        isAI: this.opts.demo || (this.opts.mode === 'cpu' && i === 1),
        body,
        hp: HP_MAX,
        shownHp: HP_MAX,
        facing: i === 0 ? 1 : -1,
        ammo: Object.fromEntries(Object.entries(BIRDS).map(([k, v]) => [k, v.ammo])),
        sel: 'red',
        stamina: STAMINA,
        moveDir: 0,
        wheel: 0,
        hurtT: 0,
        blinkT: r.range(1, 4),
        blink: 0,
        dead: false,
        drowned: false,
        lastTrail: [],
        dmgAcc: 0,
        dmgT: 0,
        moveSoundT: 0,
        mood: 'normal',
        moodT: 0,
        stats: { shots: 0, hits: 0, dmg: 0, blocks: 0 },
      };
      body.setUserData({ kind: 'captain', ref: p });
      return p;
    });
    if (this.opts.mode === 'pvp') {
      this.players[0].name = '1P ' + TEAM[0].name;
      this.players[1].name = '2P ' + TEAM[1].name;
    } else {
      this.players[1].name = 'CPU ' + TEAM[1].name;
    }

    // forts (same blueprint mirrored for fairness)
    const fort = FORTS[r.int(0, FORTS.length - 1)];
    for (const p of this.players) {
      const back = p.body.getPosition().x + p.facing * 3.0;
      this._placeStructure(fort, back, p.facing);
    }
    // neutral props in the middle
    const nProps = r.int(1, 2);
    const span0 = land.bases[0] + 9, span1 = land.bases[1] - 9;
    for (let k = 0; k < nProps; k++) {
      const prop = PROPS[r.int(0, PROPS.length - 1)];
      const x = lerp(span0, span1, nProps === 1 ? r.range(0.35, 0.65) : k === 0 ? r.range(0.1, 0.4) : r.range(0.6, 0.9));
      const gy = this.terrain.surfaceY(x);
      const gy2 = this.terrain.surfaceY(x + 1.6);
      if (gy < WORLD.SEA + 0.5 || Math.abs(gy - gy2) > 1.0) continue;
      this._placeStructure(prop, x, 1);
    }

    this._wireContacts();
    // let everything settle before anyone is watching
    for (let i = 0; i < 150; i++) this._physicsStep(DT, true);
    this.blastQueue.length = this.dentQueue.length = 0;
    for (const p of this.players) p.body.setLinearVelocity(V(0, 0));
    this.damageOn = true;

    // intro camera: sweep from enemy to player 1
    this.cam.resize(this.cssW || 800, this.cssH || 400);
    const p1 = this.players[1].body.getPosition();
    this.cam.x = p1.x; this.cam.y = p1.y + 3; this.cam.zoom = this.cam.baseZoom;
    this.cam.tx = this.cam.x; this.cam.ty = this.cam.y; this.cam.tz = this.cam.zoom;
    this.turn = this.opts.firstTurn ?? 0;
  }

  _placeStructure(bp, back, facing) {
    const xs = bp.blocks.map((b) => back + facing * b.x);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    let ground = -Infinity;
    for (let x = minX - 0.4; x <= maxX + 0.4; x += 0.2) ground = Math.max(ground, this.terrain.surfaceY(x));
    for (const b of bp.blocks) {
      this._makeBlock(b.m, b.s || 'box', back + facing * b.x, ground + b.y + 0.02, b.w, b.h, b.r);
    }
  }

  _makeBlock(mat, shape, x, y, w, h, rad, angle = 0) {
    const M = MAT[mat];
    const body = this.world.createBody({ type: 'dynamic', position: V(x, y), angle, angularDamping: 0.1, linearDamping: 0.05 });
    const fix = shape === 'circle' ? planck.Circle(rad) : planck.Box(w / 2, h / 2);
    body.createFixture(fix, { density: M.density, friction: M.friction, restitution: M.restitution });
    const area = shape === 'circle' ? Math.PI * rad * rad : w * h;
    const hp = M.hp * clamp(0.6 + area * 0.9, 0.7, 1.8);
    const blk = { body, mat, shape, w, h, r: rad, hp, maxHp: hp, seed: (Math.random() * 1e6) | 0, flash: 0, dead: false, lastHitBy: -1 };
    body.setUserData({ kind: 'block', ref: blk });
    this.blocks.push(blk);
    return blk;
  }

  // ------------------------------------------------------------------ contacts
  _wireContacts() {
    const w = this.world;
    const ud = (f) => f.getBody().getUserData() || {};
    w.on('pre-solve', (contact) => {
      const a = ud(contact.getFixtureA()), b = ud(contact.getFixtureB());
      const pr = a.kind === 'proj' ? a : b.kind === 'proj' ? b : null;
      if (!pr) return;
      const other = pr === a ? b : a;
      const P = pr.ref;
      if (other.kind === 'captain' && other.ref === P.owner && P.t < 0.45) contact.setEnabled(false);
    });
    w.on('begin-contact', (contact) => {
      const a = ud(contact.getFixtureA()), b = ud(contact.getFixtureB());
      for (const [s, o] of [[a, b], [b, a]]) {
        if (s.kind !== 'proj') continue;
        const P = s.ref;
        if (P.dead) continue;
        if (o.kind === 'captain' && o.ref === P.owner && P.t < 0.45) continue;
        const vel = P.body.getLinearVelocity();
        const speed = Math.hypot(vel.x, vel.y);
        if (!P.firstHit) {
          P.firstHit = true;
          P.hitT = 0;
          P.squash = 0.22;
          P.impactSpeed = speed;
          const pos = P.body.getPosition();
          if (P.kind === 'egg' || P.kind === 'mini') {
            this.blastQueue.push({ x: pos.x, y: pos.y, spec: P.spec.blast, owner: P.owner, proj: P });
          } else if (P.type === 'black') {
            P.fuse = o.kind === 'captain' ? 0.05 : 1.15;
            this._sfx('fuse');
          } else if (o.kind === 'terrain' && speed > 6 && P.spec.dent) {
            this.dentQueue.push({ x: pos.x + vel.x / speed * P.spec.r, y: pos.y + vel.y / speed * P.spec.r, r: P.spec.dent * clamp(speed / 20, 0.6, 1.2) });
          }
        }
        if (speed > 3) {
          if (o.kind === 'terrain') this._sfx(speed > 9 ? 'thud' : 'bounce', { vol: clamp(speed / 18, 0.25, 1) });
          if (o.kind === 'captain') { this._sfx('hurt'); }
        }
      }
    });
    w.on('post-solve', (contact, impulse) => {
      if (!this.damageOn) return;
      const ni = impulse.normalImpulses;
      let imp = 0;
      for (let k = 0; k < ni.length; k++) imp = Math.max(imp, ni[k]);
      if (imp < 1.0) return;
      const a = ud(contact.getFixtureA()), b = ud(contact.getFixtureB());
      this._impact(a, b, imp);
      this._impact(b, a, imp);
    });
  }

  // `s` received an impact of magnitude imp from `o`.
  _impact(s, o, imp) {
    if (s.kind === 'block') {
      const B = s.ref;
      if (B.dead) return;
      const M = MAT[B.mat];
      let mul = 1;
      if (o.kind === 'proj') { mul = o.ref.spec.mul ? o.ref.spec.mul[B.mat] ?? 1 : 1; B.lastHitBy = o.ref.owner.id; }
      const dmg = Math.max(0, imp - 1.2) * 12 * M.resist * mul;
      if (dmg > 0.5) this._damageBlock(B, dmg, o.kind === 'proj');
    } else if (s.kind === 'captain') {
      const p = s.ref;
      if (p.dead) return;
      let dmg = 0;
      if (o.kind === 'proj') {
        const P = o.ref;
        if (P.owner === p && P.t < 0.45) return;
        const room = HIT_CAP - (P.dealt || 0);
        dmg = Math.min(room, Math.max(0, imp - 1.5) * HIT_K * (P.spec.hit ?? 1));
        P.dealt = (P.dealt || 0) + dmg;
        if (dmg > 4) {
          p.hurtT = 1;
          const pos = p.body.getPosition();
          this.fx.burst(pos.x, pos.y + 0.6, 'feather', 8, { color: TEAM[p.team].color, speed: 5 });
          this.fx.burst(pos.x, pos.y + 1.2, 'star', 5, { speed: 4 });
        }
      } else if (o.kind === 'block') {
        dmg = Math.min(25, Math.max(0, imp - 2.5) * 1.2);
      } else if (o.kind === 'terrain') {
        dmg = Math.max(0, imp - 14) * 0.8;
        if (imp > 10) this._sfx('land', { vol: clamp(imp / 30, 0.3, 1) });
      }
      if (dmg > 0.3) this._hurt(p, dmg, o.kind === 'proj' ? o.ref.owner : null);
    }
  }

  _damageBlock(B, dmg, fromProj) {
    B.hp -= dmg;
    B.flash = 1;
    const pos = B.body.getPosition();
    if (B.hp <= 0) {
      B.dead = true;
      this.killQueue.push(B.body);
      const kind = B.mat === 'tnt' ? 'wood' : B.mat;
      const n = B.shape === 'circle' ? 10 : Math.round(6 + (B.w + B.h) * 5);
      this.fx.burst(pos.x, pos.y, kind, n, { speed: 5, jitter: Math.max(B.w || B.r * 2, B.h || B.r * 2) * 0.6 });
      this.fx.burst(pos.x, pos.y, 'dust', 4, { speed: 1.5 });
      this._sfx('break_' + (kind === 'wood' ? 'wood' : kind), { vol: 0.9 });
      const shooter = this.players[this.turn];
      if (B.lastHitBy >= 0 || fromProj) shooter.stats.blocks++;
      if (B.mat === 'tnt') this.blastQueue.push({ x: pos.x, y: pos.y, spec: TNT_BLAST, owner: shooter, tnt: true });
    } else if (dmg > 6) {
      this._sfx('hit_' + (B.mat === 'tnt' ? 'wood' : B.mat), { vol: clamp(dmg / 40, 0.2, 1) });
    }
  }

  _hurt(p, dmg, attacker) {
    if (p.dead || dmg <= 0) return;
    dmg = Math.min(dmg, p.hp);
    p.hp -= dmg;
    p.dmgAcc += dmg;
    if (p.dmgT <= 0) p.dmgT = 0.3;
    p.hurtT = Math.max(p.hurtT, clamp(dmg / 20, 0.4, 1));
    if (attacker && attacker !== p) {
      attacker.stats.dmg += dmg;
      attacker.turnDmg = (attacker.turnDmg || 0) + dmg;
    }
    if (dmg >= 12) {
      this.fx.shake(0.12 + dmg * 0.006);
      if (dmg >= 25) this.slowmo(0.35);
      vibrate(dmg >= 25 ? [30, 40, 60] : 25);
    }
    p.mood = 'scared';
    p.moodT = 1.5;
    const enemy = this.players[1 - p.id];
    if (!enemy.dead) { enemy.mood = 'happy'; enemy.moodT = 1.8; }
    if (p.hp <= 0.01) this._kill(p, false);
  }

  _kill(p, drowned) {
    if (p.dead) return;
    p.dead = true;
    p.hp = 0;
    p.drowned = drowned;
    const pos = p.body.getPosition();
    this._sfx(drowned ? 'splash' : 'ko');
    this.fx.burst(pos.x, pos.y + 0.5, 'feather', 18, { color: TEAM[p.team].color, speed: 7 });
    this.fx.burst(pos.x, pos.y + 1.4, 'star', 8, { speed: 5 });
    this.fx.text(pos.x, pos.y + 2.6, drowned ? '풍덩!' : 'K.O.!', '#ffe45c', 1.4, { life: 1.8 });
    this.slowmo(0.8);
  }

  slowmo(sec) {
    this.slowT = Math.max(this.slowT, sec);
  }

  // ------------------------------------------------------------------ explosions
  _explode(x, y, spec, owner, isTnt) {
    const { r, dmg, crater, push } = spec;
    if (crater) this.terrain.carve(x, y, crater);
    this.fx.explosion(x, y, r * 0.8);
    this.fx.burst(x, y, 'dirt', Math.round(8 + crater * 6), { speed: 7 + r * 2, color: this.theme.ground.dirtDark });
    this.fx.shake(0.12 + r * 0.1);
    this._sfx(isTnt ? 'tnt' : r > 1.6 ? 'explode_big' : 'explode_small');
    vibrate(r > 1.6 ? [40, 30, 60] : 25);
    if (r > 1.6) this.slowmo(0.18);
    // captains
    for (const p of this.players) {
      if (p.dead) continue;
      const pos = p.body.getPosition();
      const d = Math.max(0, Math.min(dist(x, y, pos.x, pos.y) - CART_R * 0.6, dist(x, y, pos.x, pos.y + HEAD.y) - HEAD.r * 0.6));
      if (d < r) {
        const k = 1 - d / r;
        this._hurt(p, dmg * Math.pow(k, 0.8), owner);
        const dx = pos.x - x, dy = pos.y - y + 0.6;
        const l = Math.hypot(dx, dy) || 1;
        const m = p.body.getMass();
        p.body.applyLinearImpulse(V((dx / l) * push * 0.22 * k * m, (dy / l) * push * 0.22 * k * m + 1.5 * k * m), p.body.getPosition(), true);
      }
    }
    // blocks
    for (const B of this.blocks) {
      if (B.dead) continue;
      const pos = B.body.getPosition();
      const size = B.shape === 'circle' ? B.r : Math.max(B.w, B.h) * 0.5;
      const d = Math.max(0, dist(x, y, pos.x, pos.y) - size * 0.5);
      if (d < r + 0.3) {
        const k = clamp(1 - d / (r + 0.3), 0, 1);
        const dx = pos.x - x, dy = pos.y - y;
        const l = Math.hypot(dx, dy) || 1;
        const m = Math.min(B.body.getMass(), 1.6);
        B.body.applyLinearImpulse(V((dx / l) * push * 0.4 * k * m, (dy / l) * push * 0.4 * k * m + push * 0.08 * k * m), V(pos.x - dx / l * 0.1, pos.y - dy / l * 0.1), true);
        B.lastHitBy = owner ? owner.id : -1;
        this._damageBlock(B, dmg * 2.4 * k * MAT[B.mat].resist, true);
      }
    }
    for (const P of this.projectiles) {
      if (P.dead) continue;
      const pos = P.body.getPosition();
      const d = dist(x, y, pos.x, pos.y);
      if (d < r && d > 0.01) {
        const k = 1 - d / r;
        P.body.applyLinearImpulse(V(((pos.x - x) / d) * push * 0.1 * k, ((pos.y - y) / d) * push * 0.1 * k), pos, true);
      }
    }
    this._wakeAround(x, y, r + 3);
  }

  _wakeAround(x, y, rad) {
    for (let b = this.world.getBodyList(); b; b = b.getNext()) {
      if (!b.isDynamic()) continue;
      const p = b.getPosition();
      if (Math.abs(p.x - x) < rad && Math.abs(p.y - y) < rad + 2) b.setAwake(true);
    }
  }

  // ------------------------------------------------------------------ projectiles
  _spawnProjectile(kind, type, spec, owner, x, y, vx, vy) {
    const body = this.world.createBody({ type: 'dynamic', position: V(x, y), bullet: true, angularDamping: 0.6, linearDamping: 0 });
    body.createFixture(planck.Circle(spec.r), { density: spec.density, friction: 0.55, restitution: kind === 'egg' ? 0 : 0.28, filterGroupIndex: -1 });
    body.setLinearVelocity(V(vx, vy));
    const P = { kind, type, spec, owner, body, t: 0, firstHit: false, hitT: 0, squash: 0, used: false, fuse: 0, slowT: 0, dead: false, trailT: 0, blink: 0, dealt: 0 };
    body.setUserData({ kind: 'proj', ref: P });
    this.projectiles.push(P);
    return P;
  }

  launch(power, angle) {
    // angle: radians in world space (0 = right, ccw)
    const p = this.players[this.turn];
    if (p.dead || this.state !== 'aim') return;
    const type = p.sel;
    if (p.ammo[type] <= 0) return;
    p.ammo[type]--;
    const spec = BIRDS[type];
    const rest = this.restPos(p);
    const v = power * VMAX;
    const vx = Math.cos(angle) * v, vy = Math.sin(angle) * v;
    if (Math.abs(vx) > 0.5) p.facing = vx > 0 ? 1 : -1;
    const P = this._spawnProjectile('bird', type, spec, p, rest.x, rest.y, vx, vy);
    this.lead = P;
    p.stats.shots++;
    this.currentTrail = [];
    this.shotPower = power;
    this._stretch(null);
    this._sfx('launch', { vol: 0.6 + power * 0.5 });
    this._sfx('squawk_' + type, { vol: 0.8 });
    vibrate(15);
    this.fx.burst(rest.x, rest.y, 'feather', 3, { color: Art.BIRD_INFO[type].color, speed: 2 });
    this.aim = null;
    this.setState('flight');
    this.emit('fired', { player: p.id, type });
    // select next available bird automatically if this one ran out
    if (p.ammo[type] <= 0) p.sel = 'red';
  }

  restPos(p) {
    const pos = p.body.getPosition();
    const a = Art.slingAnchors(pos.x, -pos.y, p.facing);
    return { x: a.rest.x, y: -a.rest.y };
  }

  activateAbility() {
    const P = this.lead;
    if (!P || P.dead || P.used || P.kind !== 'bird') return false;
    const spec = P.spec;
    if (!spec.ability) return false;
    if (P.firstHit && spec.ability !== 'boom') return false;
    P.used = true;
    const pos = P.body.getPosition();
    const vel = P.body.getLinearVelocity();
    const sp = Math.hypot(vel.x, vel.y) || 1;
    if (spec.ability === 'dash') {
      const ns = Math.max(sp * 2.1, 32);
      P.body.setLinearVelocity(V((vel.x / sp) * ns, (vel.y / sp) * ns));
      P.dash = 0.5;
      this._sfx('dash');
      this.fx.burst(pos.x, pos.y, 'spark', 10, { speed: 6 });
      this.fx.add({ x: pos.x, y: pos.y, vx: 0, vy: 0, type: 'ring', life: 0.35, size: 0.3, grow: 3, color: 'rgba(255,240,150,0.9)', g: 0, drag: 0 });
    } else if (spec.ability === 'split') {
      P.dead = true;
      this.killQueue.push(P.body);
      const base = Math.atan2(vel.y, vel.x);
      let first = null;
      for (const da of [-0.2, 0, 0.2]) {
        const m = this._spawnProjectile('mini', 'mini', MINI, P.owner, pos.x, pos.y, Math.cos(base + da) * sp, Math.sin(base + da) * sp);
        m.t = 1;
        if (!first) first = m;
        if (da === 0) this.lead = m;
      }
      this._sfx('split');
      this.fx.burst(pos.x, pos.y, 'star', 6, { speed: 4 });
      this.fx.burst(pos.x, pos.y, 'feather', 6, { color: '#39a7f0', speed: 3 });
    } else if (spec.ability === 'boom') {
      P.fuse = 0.001;
    } else if (spec.ability === 'egg') {
      const e = this._spawnProjectile('egg', 'egg', EGG, P.owner, pos.x, pos.y - 0.45, vel.x * 0.15, -16);
      e.t = 1;
      P.body.setLinearVelocity(V(vel.x * 1.25, Math.max(10, vel.y + 13)));
      P.egged = true;
      this.lead = e;
      this._sfx('egg_drop');
      this.fx.burst(pos.x, pos.y, 'feather', 8, { color: '#f5f1ea', speed: 4 });
    }
    this._sfx('ability', { vol: 0.5 });
    return true;
  }

  // ------------------------------------------------------------------ turn flow
  setState(s) {
    this.state = s;
    this.stateT = 0;
  }

  startTurn() {
    const p = this.players[this.turn];
    this.turnNo++;
    const r = Math.random;
    const prev = this.wind;
    this.wind = this.windMax ? Math.round((r() * 2 - 1) * this.windMax) : 0;
    if (Math.abs(this.wind - prev) >= 3) this._sfx('wind', { vol: 0.6 });
    p.stamina = STAMINA;
    p.moveDir = 0;
    this.turnTimer = this.opts.timer || 0;
    let flood = null;
    if (this.turnNo > FLOOD_TURN) {
      this.seaTarget += FLOOD_STEP;
      flood = this.turnNo === FLOOD_TURN + 1 ? (this.theme.sea.lava ? '용암이 차오릅니다!' : '바닷물이 차오릅니다!') : null;
    }
    this.lastTickSec = -1;
    const pos = p.body.getPosition();
    this.cam.manual = 0;
    this.cam.focus(pos.x + p.facing * 5, pos.y + 2.2, this.cam.baseZoom, 3);
    this.lead = null;
    this.setState(p.isAI ? 'ai-think' : 'aim');
    this._sfx('turn');
    this.emit('turn', { player: p.id, name: p.name, isAI: p.isAI, wind: this.wind, turnNo: this.turnNo, flood });
    if (p.isAI) {
      this.aiPlan = null;
    }
  }

  endTurn() {
    const shooter = this.players[this.turn];
    if ((shooter.turnDmg || 0) >= 3) shooter.stats.hits++;
    shooter.turnDmg = 0;
    const alive = this.players.filter((p) => !p.dead);
    if (alive.length < 2) {
      this.finish(alive.length === 1 ? alive[0] : null);
      return;
    }
    this.turn = 1 - this.turn;
    this.startTurn();
  }

  finish(winner) {
    if (this.over) return;
    this.over = true;
    this.winner = winner;
    this.setState('over');
    const humanWon = winner && !winner.isAI;
    this._sfx(winner ? (this.opts.mode === 'cpu' && !humanWon ? 'lose' : 'win') : 'lose');
    if (winner) {
      const pos = winner.body.getPosition();
      this.cam.focus(pos.x, pos.y + 2, this.cam.baseZoom * 1.25, 2);
      winner.mood = 'happy';
      winner.moodT = 99;
    }
    setTimeout(() => this.emit('over', this.result()), 1600);
  }

  result() {
    const w = this.winner;
    const stars = w ? (w.hp >= 70 ? 3 : w.hp >= 35 ? 2 : 1) : 0;
    return {
      winner: w ? w.id : -1,
      winnerName: w ? w.name : null,
      isAIWin: w ? w.isAI : false,
      stars,
      turns: this.turnNo,
      players: this.players.map((p) => ({ name: p.name, hp: Math.round(p.hp), ...p.stats, dmg: Math.round(p.stats.dmg) })),
    };
  }

  skipTurn() {
    if (this.state !== 'aim') return;
    this.aim = null;
    this._stretch(null);
    this.emit('banner', { text: '시간 초과!', sub: '턴이 넘어갑니다' });
    this.setState('settle');
  }

  // ------------------------------------------------------------------ input
  resize(cssW, cssH, dpr) {
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = dpr;
    this.cam.resize(cssW, cssH);
  }

  canControl() {
    const p = this.players[this.turn];
    return this.state === 'aim' && !p.isAI && !p.dead && !this.paused;
  }

  pointerDown(id, sx, sy) {
    if (this.paused) return;
    this.pointers.set(id, { x: sx, y: sy, sx, sy, t: performance.now() });
    if (this.pointers.size === 2) {
      // pinch: cancel aiming
      if (this.aim) { this.aim = null; this._stretch(null); }
      const [a, b] = [...this.pointers.values()];
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) };
      return;
    }
    if (this.state === 'flight') {
      if (this.activateAbility()) this.pointers.get(id).used = true;
      return;
    }
    if (this.canControl()) {
      const p = this.players[this.turn];
      const rest = this.restPos(p);
      const rs = this.cam.toScreen(rest.x, rest.y);
      const ps = this.cam.toScreen(p.body.getPosition().x, p.body.getPosition().y);
      const grab = Math.max(64, 1.4 * this.cam.zoom);
      if (Math.hypot(sx - rs.x, sy - rs.y) < grab || Math.hypot(sx - ps.x, sy - ps.y) < grab) {
        this.aim = { id, sx: rs.x, sy: rs.y, px: sx, py: sy, power: 0, angle: 0 };
        this.cam.manual = 0;
        this.emit('aimstart');
        this._sfx('tap', { vol: 0.4 });
        return;
      }
    }
  }

  pointerMove(id, sx, sy) {
    const pt = this.pointers.get(id);
    if (!pt) return;
    const dx = sx - pt.x, dy = sy - pt.y;
    pt.x = sx; pt.y = sy;
    if (this.pointers.size === 2 && this.pinch) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinch.d > 10) this.cam.zoomAt(d / this.pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2);
      this.pinch.d = d;
      return;
    }
    if (this.aim && this.aim.id === id) {
      this.aim.px = sx;
      this.aim.py = sy;
      this._updateAim();
      return;
    }
    if (!pt.used) this.cam.pan(dx, dy);
  }

  pointerUp(id) {
    const pt = this.pointers.get(id);
    this.pointers.delete(id);
    if (this.pointers.size < 2) this.pinch = null;
    if (this.aim && this.aim.id === id) {
      const a = this.aim;
      if (a.power > 0.12 && this.canControl()) {
        this.launch(a.power, a.angle);
      } else {
        this.aim = null;
        this._stretch(null);
      }
      return;
    }
    // double tap recenters on the active captain
    if (pt && performance.now() - pt.t < 250 && Math.hypot(pt.x - pt.sx, pt.y - pt.sy) < 8) {
      const now = performance.now();
      if (this._lastTap && now - this._lastTap < 320) this.recenter();
      this._lastTap = now;
    }
  }

  wheel(dy, sx, sy) {
    this.cam.zoomAt(Math.exp(-dy * 0.0015), sx, sy);
  }

  recenter() {
    const p = this.players[this.turn];
    const pos = p.body.getPosition();
    this.cam.manual = 0;
    this.cam.focus(pos.x + p.facing * 5, pos.y + 2.2, this.cam.baseZoom, 4);
  }

  toggleOverview() {
    if (this.cam.tz < this.cam.baseZoom * 0.8) {
      this.recenter();
      return false;
    }
    this.cam.manual = 0;
    this.cam.focus(WORLD.W / 2, 14, this.cam.fitZoom, 3);
    return true;
  }

  _updateAim() {
    const a = this.aim;
    const pullPx = Math.min(150, Math.max(90, this.cssH * 0.3));
    const dx = a.px - a.sx, dy = a.py - a.sy;
    const d = Math.hypot(dx, dy);
    a.power = clamp(d / pullPx, 0, 1);
    // launch direction is opposite of the pull, screen y down → world y up
    a.angle = Math.atan2(dy, -dx);
    const p = this.players[this.turn];
    if (a.power > 0.08) {
      const vx = Math.cos(a.angle);
      if (Math.abs(vx) > 0.2) p.facing = vx > 0 ? 1 : -1;
    }
    this._stretch(a.power);
    if (a.power > 0.98 && !a.maxed) { a.maxed = true; vibrate(8); }
    if (a.power < 0.95) a.maxed = false;
  }

  setMove(dir) {
    const p = this.players[this.turn];
    if (!this.canControl()) { p.moveDir = 0; return; }
    p.moveDir = dir;
    if (dir) p.facing = dir;
  }

  selectBird(type) {
    const p = this.players[this.turn];
    if (!this.canControl() || p.ammo[type] <= 0) { this._sfx('deny'); return false; }
    p.sel = type;
    this._sfx('select');
    this._sfx('squawk_' + type, { vol: 0.45 });
    return true;
  }

  // ------------------------------------------------------------------ simulation
  update(realDt) {
    if (this.paused) return;
    realDt = Math.min(realDt, 0.05);
    if (this.slowT > 0) {
      this.slowT -= realDt;
      this.timeScale = lerp(this.timeScale, 0.3, 0.3);
    } else {
      this.timeScale = lerp(this.timeScale, 1, 0.15);
    }
    const dt = realDt * this.timeScale;
    this.time += realDt;
    this.stateT += dt;
    this._updateState(dt, realDt);
    this.acc += dt;
    let steps = 0;
    while (this.acc >= DT && steps < 4) {
      this._physicsStep(DT, false);
      this.acc -= DT;
      steps++;
    }
    if (steps === 4) this.acc = 0;
    this._updateActors(dt, realDt);
    if (WORLD.SEA < this.seaTarget) WORLD.SEA = Math.min(this.seaTarget, WORLD.SEA + realDt * 0.4);
    this.scene.update(realDt, this.wind);
    this.fx.update(dt);
    this._updateCamera(realDt);
    this.cam.update(realDt);
  }

  _physicsStep(dt, warmup) {
    // wind + per-projectile bookkeeping
    for (const P of this.projectiles) {
      if (P.dead) continue;
      P.t += dt;
      if (!P.firstHit && this.wind) {
        const m = P.body.getMass();
        P.body.applyForceToCenter(V(this.wind * WIND_ACC * m, 0), true);
      }
    }
    this.world.step(dt, 8, 3);
    // process deferred actions
    if (this.dentQueue.length) {
      for (const d of this.dentQueue) {
        this.terrain.carve(d.x, d.y, d.r);
        this.fx.burst(d.x, d.y, 'dirt', 8, { speed: 5, color: this.theme.ground.dirtDark });
        this.fx.burst(d.x, d.y, 'dust', 4, { speed: 1.2 });
        this.fx.shake(0.08);
        this._wakeAround(d.x, d.y, d.r + 2);
      }
      this.dentQueue.length = 0;
    }
    let guard = 0;
    while (this.blastQueue.length && guard++ < 20) {
      const b = this.blastQueue.shift();
      if (b.proj) {
        if (b.proj.dead) continue;
        b.proj.dead = true;
        this.killQueue.push(b.proj.body);
      }
      if (!warmup) this._explode(b.x, b.y, b.spec, b.owner, b.tnt);
    }
    if (this.killQueue.length) {
      for (const body of this.killQueue) {
        if (body._destroyed) continue;
        body._destroyed = true;
        this.world.destroyBody(body);
      }
      this.killQueue.length = 0;
      this.blocks = this.blocks.filter((b) => !b.dead);
      this.projectiles = this.projectiles.filter((p) => !p.dead);
    }
    this.terrain.syncPhysics();
    // water & bounds
    for (const B of this.blocks) {
      const pos = B.body.getPosition();
      if (pos.y < WORLD.SEA - 0.6 || pos.x < -6 || pos.x > WORLD.W + 6) {
        B.dead = true;
        this.killQueue.push(B.body);
        if (!warmup && pos.y < WORLD.SEA) this._splash(pos.x, 0.8);
      }
    }
    for (const p of this.players) {
      if (p.dead) continue;
      const pos = p.body.getPosition();
      if (pos.y < WORLD.SEA - 0.2 || pos.x < -3 || pos.x > WORLD.W + 3) {
        if (!warmup) {
          this._splash(pos.x, 1.4);
          this._kill(p, true);
        }
      }
    }
  }

  _splash(x, size) {
    this.fx.burst(x, WORLD.SEA + 0.1, 'splash', Math.round(10 * size), { speed: 4 * size, color: this.theme.sea.lava ? '#ffb347' : '#dff4ff' });
    if (this.theme.sea.lava) this.fx.burst(x, WORLD.SEA + 0.2, 'spark', 8, { speed: 5 });
    this._sfx('splash', { vol: clamp(size, 0.4, 1) });
  }

  _updateState(dt, realDt) {
    const p = this.players[this.turn];
    if (p.dead && (this.state === 'aim' || this.state === 'ai-think' || this.state === 'ai-aim')) {
      // e.g. drove off a cliff: the turn is over
      this.aim = null;
      p.moveDir = 0;
      this._stretch(null);
      this.setState('settle');
    }
    switch (this.state) {
      case 'intro': {
        if (this.stateT > 0.35 && !this._introPanned) {
          this._introPanned = true;
          const p0 = this.players[this.turn].body.getPosition();
          this.cam.focus(p0.x, p0.y + 3, this.cam.baseZoom, 1.1);
        }
        if (this.stateT > 2.4) this.startTurn();
        break;
      }
      case 'aim': {
        if (this.turnTimer > 0) {
          this.turnTimer -= realDt;
          const sec = Math.ceil(this.turnTimer);
          if (sec <= 5 && sec !== this.lastTickSec && sec > 0) { this.lastTickSec = sec; this._sfx('tick'); }
          if (this.turnTimer <= 0) this.skipTurn();
        }
        break;
      }
      case 'ai-think': {
        if (!this.aiPlan && this.stateT > 0.5) {
          this.aiPlan = planShot(this, p, this.opts.difficulty || 'normal');
          p.sel = this.aiPlan.type;
          this._sfx('select');
          this.emit('hud');
        }
        if (this.aiPlan && this.stateT > 1.3) {
          this.setState('ai-aim');
          this.aimAI = { t: 0 };
        }
        break;
      }
      case 'ai-aim': {
        const plan = this.aiPlan;
        const k = clamp(this.stateT / 1.0, 0, 1);
        const ease = 1 - Math.pow(1 - k, 3);
        const vx = Math.cos(plan.angle);
        if (Math.abs(vx) > 0.2) p.facing = vx > 0 ? 1 : -1;
        this.aim = { ai: true, power: plan.power * ease, angle: plan.angle };
        this._stretch(this.aim.power);
        if (this.stateT > 1.25) {
          this.state = 'aim'; // launch requires aim state
          this.launch(plan.power, plan.angle);
          this.aiAbilityAt = plan.abilityAt;
        }
        break;
      }
      case 'flight': {
        // AI ability timing
        if (p.isAI && this.aiAbilityAt != null && this.stateT >= this.aiAbilityAt) {
          this.aiAbilityAt = null;
          this.activateAbility();
        }
        if (this.projectiles.length === 0 && this.blastQueue.length === 0) this.setState('settle');
        if (this.stateT > 16) {
          for (const P of this.projectiles) { P.dead = true; this.killQueue.push(P.body); }
        }
        break;
      }
      case 'settle': {
        let maxV = 0;
        for (const B of this.blocks) {
          if (!B.body.isAwake()) continue;
          const v = B.body.getLinearVelocity();
          maxV = Math.max(maxV, Math.hypot(v.x, v.y), Math.abs(B.body.getAngularVelocity()) * 0.3);
        }
        for (const q of this.players) {
          if (q.dead) continue;
          const v = q.body.getLinearVelocity();
          maxV = Math.max(maxV, Math.hypot(v.x, v.y));
        }
        this.calmT = maxV < 0.35 ? (this.calmT || 0) + dt : 0;
        if (this.projectiles.length) this.setState('flight');
        else if ((this.calmT > 0.45 && this.stateT > 0.6) || this.stateT > 4.5) {
          this.calmT = 0;
          this.endTurn();
        }
        break;
      }
    }
  }

  _updateActors(dt, realDt) {
    for (const p of this.players) {
      p.hurtT = Math.max(0, p.hurtT - realDt * 1.6);
      p.blinkT -= realDt;
      if (p.blinkT < 0) { p.blink = 0.15; p.blinkT = 2 + Math.random() * 3; }
      p.blink = Math.max(0, p.blink - realDt);
      if (p.moodT > 0) { p.moodT -= realDt; if (p.moodT <= 0) p.mood = 'normal'; }
      p.shownHp = lerp(p.shownHp, p.hp, 1 - Math.exp(-6 * realDt));
      if (p.dmgT > 0) {
        p.dmgT -= realDt;
        if (p.dmgT <= 0 && p.dmgAcc > 0.5) {
          const pos = p.body.getPosition();
          const n = Math.round(p.dmgAcc);
          const big = n >= 25;
          this.fx.text(pos.x, pos.y + 2.2, '-' + n, big ? '#ff4a3d' : '#fff', big ? 1.35 : 1.0, { life: 1.5 });
          if (big) this.fx.text(pos.x, pos.y + 3.3, n >= 35 ? '치명타!' : '명중!', '#ffe45c', 0.9, { life: 1.4, vy: 1.5 });
          p.dmgAcc = 0;
          this.emit('hud');
        }
      }
      // movement
      const moving = p === this.players[this.turn] && this.state === 'aim' && p.moveDir && p.stamina > 0 && !p.dead;
      const v = p.body.getLinearVelocity();
      if (moving) {
        const grounded = Math.abs(v.y) < 2.5;
        if (grounded) {
          p.body.setLinearVelocity(V(p.moveDir * MOVE_SPEED, v.y));
          p.stamina = Math.max(0, p.stamina - Math.abs(v.x) * dt * STAMINA_PER_M);
          p.wheel += v.x * dt / 0.28;
          p.moveSoundT -= realDt;
          if (p.moveSoundT <= 0) { p.moveSoundT = 0.26; this._sfx('move', { vol: 0.5 }); }
          if (Math.random() < 0.3) {
            const pos = p.body.getPosition();
            this.fx.burst(pos.x - p.moveDir * 0.5, pos.y - CART_R + 0.05, 'dust', 1, { speed: 0.8 });
          }
        }
        p.moving = true;
      } else {
        if (p.moving && !p.dead) {
          p.body.setLinearVelocity(V(v.x * 0.2, v.y));
        }
        p.moving = false;
        p.wheel += v.x * dt / 0.28;
      }
    }
    for (const B of this.blocks) B.flash = Math.max(0, B.flash - realDt * 5);
    // projectiles lifecycle
    for (const P of this.projectiles) {
      if (P.dead) continue;
      P.squash *= Math.exp(-8 * realDt);
      if (P.dash) P.dash = Math.max(0, P.dash - realDt);
      const pos = P.body.getPosition();
      const vel = P.body.getLinearVelocity();
      const sp = Math.hypot(vel.x, vel.y);
      // trail
      if (P === this.lead || P.kind === 'mini') {
        P.trailT -= dt;
        if (P.trailT <= 0 && !P.firstHit) {
          P.trailT = 0.045;
          if (P === this.lead) {
            this.currentTrail.push({ x: pos.x, y: pos.y, s: this.currentTrail.length % 3 === 0 ? 0.13 : 0.07 });
          }
          if (P.dash) this.fx.add({ x: pos.x, y: pos.y, vx: 0, vy: 0, type: 'trailpuff', life: 0.3, size: 0.18, color: 'rgba(255,240,160,0.8)', g: 0, drag: 0 });
        }
      }
      if (P.fuse > 0) {
        P.fuse -= dt;
        if (P.fuse <= 0) {
          this.blastQueue.push({ x: pos.x, y: pos.y, spec: P.spec.blast, owner: P.owner, proj: P });
          P.fuse = -1;
        }
      }
      if (P.firstHit) {
        P.hitT += dt;
        P.slowT = sp < 0.7 ? P.slowT + dt : 0;
        const done = P.kind === 'bird' && P.type !== 'black' && (P.slowT > 0.6 || P.hitT > 4.5);
        const blackDone = P.type === 'black' && P.fuse === 0 && P.hitT > 3;
        if (done || blackDone) this._poof(P);
      } else if (P.t > 14) {
        this._poof(P);
      }
      if (P.egged && P.t > 6) this._poof(P);
      if (pos.y < WORLD.SEA - 0.3) {
        this._splash(pos.x, 0.7);
        P.dead = true;
        this.killQueue.push(P.body);
      } else if (pos.x < -6 || pos.x > WORLD.W + 6) {
        P.dead = true;
        this.killQueue.push(P.body);
      }
    }
    if (this.lead && this.lead.dead) {
      // store trail for the shooter and hand focus to any remaining projectile
      const alive = this.projectiles.filter((q) => !q.dead);
      this.lead = alive.find((q) => q.kind === 'egg') || alive[0] || null;
    }
    if (this.state === 'flight' || this.state === 'settle') {
      const p = this.players[this.turn];
      if (this.currentTrail.length) p.lastTrail = this.currentTrail;
    }
  }

  _poof(P) {
    if (P.dead) return;
    P.dead = true;
    this.killQueue.push(P.body);
    const pos = P.body.getPosition();
    const color = P.kind === 'mini' ? '#39a7f0' : P.kind === 'egg' ? '#f5f1ea' : Art.BIRD_INFO[P.type]?.color || '#fff';
    this.fx.burst(pos.x, pos.y, 'feather', 7, { color, speed: 3 });
    this.fx.burst(pos.x, pos.y, 'dust', 5, { speed: 1.4, color: 'rgba(255,255,255,0.9)' });
    this._sfx('tap', { vol: 0.35, pitch: 1.4 });
  }

  _updateCamera(realDt) {
    if (this.cam.manual > 0 && this.state !== 'flight') return;
    if (this.state === 'flight' && this.lead && !this.lead.dead) {
      if (this.cam.manual > 0) this.cam.manual = 0;
      const pos = this.lead.body.getPosition();
      const vel = this.lead.body.getLinearVelocity();
      // keep the ground under the bird in frame (zoom out on high lobs)
      let ground = this.terrain.surfaceY(clamp(pos.x, 0.5, WORLD.W - 0.5));
      if (ground < WORLD.SEA) ground = WORLD.SEA;
      const span = Math.max(0, pos.y - ground) + 6;
      const z = Math.min(this.cam.baseZoom * 0.85, this.cssH / span);
      const cy = Math.max((pos.y + ground) / 2 + 1, ground + 2.5);
      this.cam.focus(pos.x + vel.x * 0.25, cy, z, 5);
    }
  }

  // ------------------------------------------------------------------ rendering
  draw() {
    const ctx = this.ctx;
    const dpr = this.dpr || 1;
    const W = this.cssW, H = this.cssH;
    const cam = this.cam;
    this.scene.drawBack(ctx, cam, W, H, dpr, this.time);
    const [shx, shy] = this.fx.shakeOffset();
    cam.apply(ctx, dpr, shx, shy);
    const view = cam.view();
    this.scene.drawWater(ctx, view, this.time, false);
    this.terrain.draw(ctx, this.theme.ground, this.pattern, view);

    const cur = this.players[this.turn];
    // previous shot trail
    if ((this.state === 'aim' || this.state === 'ai-aim') && cur.lastTrail.length) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      for (const d of cur.lastTrail) {
        ctx.beginPath();
        ctx.arc(d.x, -d.y, d.s, 0, TAU);
        ctx.fill();
      }
    }
    if (this.state === 'flight' || this.state === 'settle') {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (const d of this.currentTrail) {
        ctx.beginPath();
        ctx.arc(d.x, -d.y, d.s, 0, TAU);
        ctx.fill();
      }
    }

    // blocks
    for (const B of this.blocks) {
      const pos = B.body.getPosition();
      if (pos.x < view.x0 - 3 || pos.x > view.x1 + 3) continue;
      Art.drawBlock(ctx, {
        material: B.mat, shape: B.shape, x: pos.x, y: -pos.y, angle: -B.body.getAngle(),
        w: B.w, h: B.h, r: B.r, hp01: clamp(B.hp / B.maxHp, 0, 1), seed: B.seed, flash: B.flash,
      });
    }

    // captains
    for (const p of this.players) this._drawCaptain(ctx, p);

    // projectiles
    for (const P of this.projectiles) {
      if (P.dead) continue;
      const pos = P.body.getPosition();
      const vel = P.body.getLinearVelocity();
      let angle, flip;
      if (!P.firstHit) {
        flip = vel.x < 0;
        angle = flip ? Math.atan2(vel.y, -vel.x) : Math.atan2(-vel.y, vel.x);
        angle = clamp(angle, -1.1, 1.1);
      } else {
        flip = vel.x < -0.1;
        angle = -P.body.getAngle();
      }
      const state = P.firstHit ? (P.slowT > 0.2 ? 'dizzy' : 'hurt') : 'fly';
      Art.drawBird(ctx, P.kind === 'bird' ? P.type : P.kind, pos.x, -pos.y, P.spec.r, angle, {
        time: this.time, squash: P.squash, flip, state, lookX: flip ? -1 : 1, lookY: 0,
        fuse: P.type === 'black' ? (P.fuse > 0 ? clamp(1 - P.fuse / 1.15, 0.2, 1) : P.fuse < 0 ? 1 : 0) : 0,
      });
    }

    this.fx.draw(ctx);
    this.scene.drawWater(ctx, view, this.time, true);

    // aim guide
    if (this.aim && (this.state === 'aim' || this.state === 'ai-aim')) this._drawAimGuide(ctx, cur);

    // name tags + mini hp bars
    for (const p of this.players) this._drawTag(ctx, p);
    this.fx.drawTexts(ctx, cam.zoom);

    // screen-space overlays
    this.scene.drawAmbient(ctx, W, H, dpr, this.time);
    if (!this.silent) this._drawOffscreen(ctx, dpr);
    if (this.fx.flash > 0.01) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = `rgba(255,250,230,${this.fx.flash})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  _drawCaptain(ctx, p) {
    const pos = p.body.getPosition();
    const x = pos.x, y = -pos.y;
    const isCur = p === this.players[this.turn];
    const aiming = isCur && this.aim && (this.state === 'aim' || this.state === 'ai-aim');
    let pouch = null;
    if (aiming) {
      const a = Art.slingAnchors(x, y, p.facing);
      const pull = this.aim.power * MAX_PULL;
      pouch = { x: a.rest.x - Math.cos(this.aim.angle) * pull, y: a.rest.y + Math.sin(this.aim.angle) * pull };
    }
    const showAmmo = isCur && !p.dead && (this.state === 'aim' || this.state === 'ai-think' || this.state === 'ai-aim' || this.state === 'intro');
    Art.drawCommander(ctx, x, y, {
      team: p.team, facing: p.facing, time: this.time + p.id * 1.7, blink: p.blink > 0 ? 1 : 0,
      hurt: p.hurtT, hp: p.hp / HP_MAX, moving: p.moving, wheelAngle: p.wheel, dead: p.dead,
      pouch, aimPower: aiming ? this.aim.power : 0, mood: aiming ? 'aim' : p.mood,
    }, showAmmo ? (c) => {
      const a = Art.slingAnchors(x, y, p.facing);
      const px = pouch ? pouch.x : a.rest.x, py = pouch ? pouch.y : a.rest.y;
      const spec = BIRDS[p.sel];
      let ang = 0;
      if (pouch) {
        const a2 = this.aim.angle;
        ang = clamp(p.facing > 0 ? -a2 : Math.atan2(Math.sin(a2), -Math.cos(a2)), -0.9, 0.9);
      }
      Art.drawBird(c, p.sel, px, py - spec.r * 0.35, spec.r, ang, {
        time: this.time, flip: p.facing < 0, state: aiming && this.aim.power > 0.6 ? 'fly' : 'idle',
        lookX: p.facing, lookY: 0, blink: 0, squash: pouch ? -this.aim.power * 0.15 : 0,
      });
    } : null);
  }

  _drawTag(ctx, p) {
    if (p.dead) return;
    const pos = p.body.getPosition();
    const z = this.cam.zoom;
    const x = pos.x, y = -pos.y - 2.35;
    const w = 1.7, h = 0.2;
    ctx.save();
    ctx.fillStyle = 'rgba(30,20,20,0.55)';
    roundRect(ctx, x - w / 2 - 0.05, y - 0.05, w + 0.1, h + 0.1, 0.12);
    ctx.fill();
    const k = clamp(p.shownHp / HP_MAX, 0, 1);
    ctx.fillStyle = k > 0.5 ? '#6ee06a' : k > 0.25 ? '#ffcc3d' : '#ff5a4a';
    if (k > 0) {
      roundRect(ctx, x - w / 2, y, w * k, h, 0.1);
      ctx.fill();
    }
    // turn arrow
    if (p === this.players[this.turn] && (this.state === 'aim' || this.state === 'ai-think' || this.state === 'ai-aim')) {
      const bob = Math.sin(this.time * 5) * 0.12;
      ctx.fillStyle = TEAM[p.team].color;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 0.07;
      ctx.beginPath();
      ctx.moveTo(x - 0.28, y - 0.55 + bob);
      ctx.lineTo(x + 0.28, y - 0.55 + bob);
      ctx.lineTo(x, y - 0.2 + bob);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
    void z;
  }

  _drawAimGuide(ctx, p) {
    const a = this.aim;
    const rest = this.restPos(p);
    const v = a.power * VMAX;
    let vx = Math.cos(a.angle) * v, vy = Math.sin(a.angle) * v;
    let x = rest.x, y = rest.y;
    const showGuide = this.opts.guide !== false && !a.ai;
    if (showGuide && a.power > 0.1) {
      // Only the first part of the arc (no wind): skill still matters.
      const steps = 34;
      const h = 1 / 60;
      let n = 0;
      // stop the guide where it would clip terrain or a nearby block (e.g. your own wall)
      const near = this.blocks.filter((B) => {
        const bp = B.body.getPosition();
        return Math.abs(bp.x - rest.x) < 16 && Math.abs(bp.y - rest.y) < 12;
      });
      const probe = planck.Vec2(0, 0);
      const hitsBlock = (px, py) => {
        for (const B of near) {
          const bp = B.body.getPosition();
          if (Math.abs(bp.x - px) > 2 || Math.abs(bp.y - py) > 2) continue;
          for (const [ox, oy] of [[0, 0], [0.3, 0], [-0.3, 0], [0, 0.3], [0, -0.3]]) {
            probe.x = px + ox; probe.y = py + oy;
            if (B.body.getFixtureList().testPoint(probe)) return true;
          }
        }
        return false;
      };
      for (let i = 0; i < 60 * 1.05 && n < steps; i++) {
        vy -= GRAV * h;
        x += vx * h;
        y += vy * h;
        if (this.terrain.solid(x, y) || (i % 2 === 0 && hitsBlock(x, y))) {
          ctx.strokeStyle = 'rgba(255,90,70,0.95)';
          ctx.lineWidth = 0.09;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x - 0.18, -y - 0.18); ctx.lineTo(x + 0.18, -y + 0.18);
          ctx.moveTo(x + 0.18, -y - 0.18); ctx.lineTo(x - 0.18, -y + 0.18);
          ctx.stroke();
          break;
        }
        if (i % 3 === 0) {
          n++;
          const k = 1 - n / steps;
          ctx.fillStyle = `rgba(255,255,255,${0.25 + k * 0.7})`;
          ctx.beginPath();
          ctx.arc(x, -y, 0.06 + k * 0.08, 0, TAU);
          ctx.fill();
        }
      }
    }
    // power / angle label
    if (!a.ai || a.power > 0.05) {
      const pos = p.body.getPosition();
      const deg = Math.round((Math.atan2(Math.sin(a.angle), Math.abs(Math.cos(a.angle))) * 180) / Math.PI);
      const z = this.cam.zoom;
      ctx.save();
      ctx.translate(pos.x, -pos.y - 3.25);
      ctx.scale(1 / z, 1 / z);
      ctx.font = '600 15px Jua, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = `${deg}°  ·  ${Math.round(a.power * 100)}%`;
      const tw = ctx.measureText(label).width + 18;
      ctx.fillStyle = 'rgba(25,18,30,0.72)';
      roundRect(ctx, -tw / 2, -13, tw, 26, 13);
      ctx.fill();
      ctx.fillStyle = a.power > 0.97 ? '#ffd54a' : '#fff';
      ctx.fillText(label, 0, 1);
      ctx.restore();
    }
  }

  _drawOffscreen(ctx, dpr) {
    const W = this.cssW, H = this.cssH;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const mark = (wx, wy, color, label) => {
      const s = this.cam.toScreen(wx, wy);
      const m = 26;
      if (s.x > -10 && s.x < W + 10 && s.y > -10 && s.y < H + 10) return;
      const cx = clamp(s.x, m, W - m), cy = clamp(s.y, m + 40, H - m - 60);
      const ang = Math.atan2(s.y - cy, s.x - cx);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.fillStyle = 'rgba(20,14,24,0.6)';
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, TAU);
      ctx.fill();
      ctx.rotate(ang);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(22, 0);
      ctx.lineTo(12, -7);
      ctx.lineTo(12, 7);
      ctx.closePath();
      ctx.fill();
      ctx.rotate(-ang);
      ctx.fillStyle = '#fff';
      ctx.font = '12px Jua, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 0, 1);
      ctx.restore();
    };
    for (const p of this.players) {
      if (p.dead) continue;
      const pos = p.body.getPosition();
      mark(pos.x, pos.y, TEAM[p.team].color, p.id === 0 ? (this.opts.mode === 'cpu' ? '나' : '1P') : this.opts.mode === 'cpu' ? 'CPU' : '2P');
    }
    if (this.lead && !this.lead.dead && this.state === 'flight') {
      const pos = this.lead.body.getPosition();
      mark(pos.x, pos.y, '#fff', '●');
    }
  }

  _sfx(name, opts) {
    if (!this.silent) Sound.play(name, opts);
  }

  _stretch(t) {
    if (!this.silent) Sound.stretch(t);
  }

  destroy() {
    if (!this.silent) Sound.stretch(null);
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}
