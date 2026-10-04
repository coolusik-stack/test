// One match: physics world, turn flow, damage rules, input and rendering.
import { WORLD, Terrain, buildLandscape, makeDirtPattern } from './terrain.js';
import { THEMES, FORTS } from './levels.js';
import { Scene } from './scene.js';
import { FX } from './fx.js';
import { Camera } from './camera.js';
import * as Art from './art.js';
import Sound from './audio.js';
import { planShot, planMove } from './ai.js';
import { Forest } from './obstacles.js';
import { Haptics } from './haptics.js';
import { ForestEvents } from './events.js';
import { Crew } from './crew.js';
import { PAD_COST, POCKET, SPOT_INFO, spotsAt, hasSpot, padAt, padLaunch, drawSpots } from './spots.js';
import { clamp, rng, lerp, dist } from './util.js';
import {
  GRAV, VMAX, WIND_ACC, MAX_PULL, CART_R, HEAD, HP_MAX, STAMINA, STAMINA_PER_M, MOVE_SPEED,
  MAT, AMMO, KERNEL, POUND_SPEED, HIVE_BLAST, SUPPLY, WIND_LEVELS, TEAM, HIT_K, HIT_CAP, FLOOD_TURN, FLOOD_STEP,
  CLIFF_STOP, THIN_GROUND, CRUMBLE, CLIMB_COST,
} from './config.js';

const planck = window.planck;
const BREAK_SFX = { wood: 'break_wood', stone: 'break_stone', leaf: 'rustle', hive: 'break_wood', mushroom: 'boing', crate: 'break_wood', log: 'break_wood', trunk: 'break_wood' };
const HIT_SFX = { wood: 'hit_wood', stone: 'hit_stone', leaf: 'rustle', hive: 'hit_wood', mushroom: 'boing', crate: 'hit_wood', log: 'hit_wood', trunk: 'hit_wood' };
const BREAK_FX = { wood: 'wood', stone: 'stone', leaf: 'leaf', hive: 'honey', mushroom: 'dust', crate: 'wood', log: 'wood', trunk: 'wood' };
const SENSORS = new Set(['canopy', 'web', 'dandelion', 'drop']);
const FUR = ['#d9642c', '#8a8580']; // captain fur colours for tufts that fly off on hits
const V = (x, y) => planck.Vec2(x, y);
const DT = 1 / 60;
const TAU = Math.PI * 2;
const AMMO_KEYS = Object.keys(AMMO);
const q4 = (v) => Math.round(v * 1e4);
const q3 = (v) => Math.round(v * 1e3);
const q2 = (v) => Math.round(v * 100);

export class Game {
  constructor(canvas, opts, emit, size) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = opts; // {mode:'cpu'|'pvp', difficulty, theme, wind:'off'|'normal'|'strong', timer:0|30, guide:boolean, seed}
    this.emit = emit || (() => {});
    this.seed = opts.seed ?? ((Math.random() * 1e9) | 0);
    this.theme = THEMES[opts.theme] || THEMES.oak;
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
    this.afterStep = []; // work that must wait until the physics world is unlocked
    this.pendingFalls = [];
    this.blastQueue = [];
    this.dentQueue = [];
    this.drillQueue = [];
    this.pointers = new Map();
    this.aim = null;
    this.paused = false;
    this.damageOn = false;
    this.currentTrail = [];
    this.turnTimer = 0;
    this.over = false;
    this.lastTickSec = -1;
    this.silent = !!opts.demo;
    // Lockstep bookkeeping. Everything that changes the match runs in fixed 1/60 s ticks, and at
    // every hand-over (a shot, the end of a turn) the whole world is rebuilt from a snapshot, so
    // two phones replaying the same inputs stay in step.
    this.online = opts.mode === 'online';
    this.simT = 0;
    this.shotTick = 0;
    this.snapSeq = 0;
    this.nextBlockId = 0;
    this.blockSpecs = [];
    this.opMark = 0;
    this.lrng = rng((this.seed ^ 0x9e3779b9) >>> 0);
    this.netGate = null; // watching a friend's shot: last tick their phone has reached
    this.netAb = null; // tick at which their ability fired
    this.netEnd = null; // their end-of-turn snapshot, applied once the replay catches up
    this.netLive = null; // their live pose/aim while they line up a shot
    this._netT = 0;
    this.hold = false; // online: wait in the intro until the friend's state has arrived
    this.lastKind = 'start'; // what the last snapshot hand-over was: start | shot | end | turn
    this.emotes = [];
    this.event = null; // forest event on this turn (gust | rain | acornrain | boar)
    this.killcam = null;
    this.fallcam = null;
    this.dangerT = 0;
    this.beatT = 0;
    this.slowScale = 0.3;
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
    this.terrain = new Terrain({ style: this.theme.ground, seed: this.seed, heights: land.heights, under: land.under, ops: land.ops });
    this.terrain.attach(this.world, planck);
    this.scene.setLand(land);
    this.pattern = makeDirtPattern(this.ctx, this.theme.ground, this.seed);

    // captains
    this.players = [0, 1].map((i) => {
      const x = land.bases[i];
      const y = this.terrain.surfaceY(x) + CART_R + 0.05;
      const p = {
        id: i,
        team: i,
        name: TEAM[i].name,
        isAI: this.opts.demo || (this.opts.mode === 'cpu' && i === 1),
        remote: this.online && i !== this.opts.side,
        body: null,
        hp: HP_MAX,
        shownHp: HP_MAX,
        facing: i === 0 ? 1 : -1,
        ammo: Object.fromEntries(Object.entries(AMMO).map(([k, v]) => [k, v.ammo])),
        sel: 'acorn',
        stamina: STAMINA,
        moveDir: 0,
        wheel: 0,
        hurtT: 0,
        blinkT: r.range(1, 4),
        blink: 0,
        dead: false,
        fell: false, // dropped into the clouds
        falling: false, // on the way down (looks only)
        support: 9, // metres of ground under the cart (looks only)
        edge: false, // standing at a cliff over the clouds (looks only)
        lastTrail: [],
        dmgAcc: 0,
        dmgT: 0,
        moveSoundT: 0,
        mood: 'normal',
        moodT: 0,
        stats: { shots: 0, hits: 0, dmg: 0, blocks: 0 },
      };
      this._captainBody(p, x, y);
      return p;
    });
    if (this.opts.mode === 'pvp') {
      this.players[0].name = '1P ' + TEAM[0].name;
      this.players[1].name = '2P ' + TEAM[1].name;
    } else if (this.opts.mode === 'cpu') {
      this.players[1].name = 'CPU ' + TEAM[1].name;
    }
    if (this.opts.names) this.players.forEach((p, i) => { if (this.opts.names[i]) p.name = this.opts.names[i]; });

    // forts (same blueprint mirrored for fairness), with a random material twist
    const base = FORTS[r.int(0, FORTS.length - 1)];
    const twist = r.pick(['leaf', 'wood', 'leaf', 'mushroom']);
    const fort = { ...base, blocks: base.blocks.map((b) => (b.swap && r() < 0.5 ? { ...b, m: twist } : b)) };
    for (const p of this.players) {
      const fixed = land.forts && land.forts[p.id];
      const back = fixed ? fixed.back : p.body.getPosition().x + p.facing * 3.0;
      this._placeStructure(fort, back, p.facing);
    }
    // trees, webs, dandelions, props and nut baskets across the middle
    this.forest = new Forest(this, r);
    this.forest.populate();
    this.forest.r = this.lrng;
    this.events = new ForestEvents(this);
    this.baseBlockCount = this.nextBlockId;

    this._wireContacts();
    // let everything settle before anyone is watching
    for (let i = 0; i < 150; i++) this._physicsStep(DT, true);
    this.blastQueue.length = this.dentQueue.length = 0;
    for (const p of this.players) p.body.setLinearVelocity(V(0, 0));
    this.damageOn = true;
    this.turn = this.opts.firstTurn ?? 0;
    this.loadSnapshot(this.snapshot());

    // intro camera: sweep from enemy to player 1
    this.cam.resize(this.cssW || 800, this.cssH || 400);
    const p1 = this.players[1].body.getPosition();
    this.cam.x = p1.x; this.cam.y = p1.y + 3; this.cam.zoom = this.cam.baseZoom;
    this.cam.tx = this.cam.x; this.cam.ty = this.cam.y; this.cam.tz = this.cam.zoom;
    this.turn = this.opts.firstTurn ?? 0;
    this.crew = new Crew(this);
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

  _makeBlock(mat, shape, x, y, w, h, rad, angle = 0, o = {}) {
    const M = MAT[mat];
    const id = o.id ?? this.nextBlockId;
    this.nextBlockId = Math.max(this.nextBlockId, id + 1);
    if (!this.blockSpecs[id]) this.blockSpecs[id] = { mat, shape, w, h, r: rad };
    const body = this.world.createBody({ type: 'dynamic', position: V(x, y), angle, angularDamping: 0.1, linearDamping: 0.05, awake: o.awake ?? true });
    const fix = shape === 'circle' ? planck.Circle(rad) : planck.Box(w / 2, h / 2);
    body.createFixture(fix, { density: M.density, friction: M.friction, restitution: M.restitution });
    const area = shape === 'circle' ? Math.PI * rad * rad : w * h;
    const maxHp = M.hp * clamp(0.6 + area * 0.9, 0.7, 1.8);
    const seed = (Math.imul(id + 1, 2654435761) ^ this.seed) >>> 12;
    const blk = { id, body, mat, shape, w, h, r: rad, hp: o.hp ?? maxHp, maxHp, seed, flash: 0, dead: false, lastHitBy: -1 };
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
      // fall damage: judged from the captain's speed when it lands, not from solver impulses
      for (const [s, o] of [[a, b], [b, a]]) {
        if (s.kind !== 'captain' || (o.kind !== 'terrain' && o.kind !== 'block') || !this.damageOn) continue;
        const p = s.ref;
        const vy = -p.body.getLinearVelocity().y;
        if (vy > 6) this._sfx('land', { vol: clamp(vy / 14, 0.3, 1) });
        if (vy > 7.5 && !p.dead && !p.padFlight && this.simT - (p.projHitT ?? -9) > 0.3) { // a pad bounce lands soft
          const dmg = (vy - 7.5) * 2.5;
          const attacker = this.state === 'flight' || this.state === 'settle' ? this.players[this.turn] : null;
          this.pendingFalls.push({ p, dmg, attacker: attacker === p ? null : attacker });
        }
      }
      // a beehive cut loose from its branch bursts when it lands
      for (const [s, o] of [[a, b], [b, a]]) {
        if (s.kind === 'block' && s.ref.dropped && !s.ref.dead && !SENSORS.has(o.kind)) {
          s.ref.dropped = false;
          this._damageBlock(s.ref, 999, true);
        }
      }
      for (const [s, o] of [[a, b], [b, a]]) {
        if (s.kind !== 'proj') continue;
        const P = s.ref;
        if (P.dead) continue;
        if (SENSORS.has(o.kind)) {
          if (o.kind === 'drop') this.events.onDropHit(P);
          else this.forest.onSensor(P, o);
          continue;
        }
        if (o.kind === 'captain' && o.ref === P.owner && P.t < 0.45) continue;
        const vel = P.body.getLinearVelocity();
        const speed = Math.hypot(vel.x, vel.y);
        if (!P.firstHit && o.kind !== 'bumper') { // a toadstool bounce keeps the nut "in flight"
          P.firstHit = true;
          P.hitT = 0;
          P.squash = 0.22;
          P.impactSpeed = speed;
          const pos = P.body.getPosition();
          if (P.kind === 'kernel') {
            this.blastQueue.push({ x: pos.x, y: pos.y, spec: P.spec.blast, owner: P.owner, proj: P, kind: 'kernel' });
          } else if (P.pound) {
            // into the ground it bores; anything else (a captain, a fort) takes the blow head-on
            if (o.kind === 'terrain' && P.spec.drill) this.drillQueue.push(P);
            else this.blastQueue.push({ x: pos.x, y: pos.y - P.spec.r * 0.5, spec: P.spec.blast, owner: P.owner, proj: P, kind: 'pound' });
          } else if (P.kind === 'nut' && P.type === 'burr') {
            P.fuse = o.kind === 'captain' ? 0.05 : 1.15;
            this._sfx('fuse');
          } else if (o.kind === 'terrain' && speed > 6 && P.spec.dent) {
            this.dentQueue.push({ x: pos.x + vel.x / speed * P.spec.r, y: pos.y + vel.y / speed * P.spec.r, r: P.spec.dent * clamp(speed / 20, 0.6, 1.2) });
          }
        }
        if (speed > 3) {
          if (o.kind === 'terrain') this._sfx(speed > 9 ? 'thud' : 'bounce', { vol: clamp(speed / 18, 0.25, 1) });
          else if (o.kind === 'bumper') {
            o.ref.flash = 1;
            this._sfx('boing', { vol: clamp(speed / 12, 0.4, 1), pitch: 0.8 });
            this._hap('block', 'mushroom');
          }
          else if (o.kind === 'block') {
            if (o.ref.mat === 'mushroom') this._sfx('boing', { vol: clamp(speed / 14, 0.3, 1), pitch: 0.9 + Math.random() * 0.3 });
            else this._sfx('nut_hit', { vol: clamp(speed / 20, 0.25, 0.9), pitch: 1.3 - P.spec.r });
          }
          if (o.kind === 'captain') this._sfx('squeak_hurt');
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
    if (s.kind === 'tree') {
      const mul = o.kind === 'proj' ? (o.ref.spec.mul?.log ?? 1) : 0.6;
      const dmg = Math.max(0, imp - 2) * 5 * mul;
      if (dmg > 1) {
        const from = o.kind === 'proj' ? o.ref.body.getPosition().x : null;
        this.forest.damageTree(s.ref, dmg, from);
        if (o.kind === 'proj') this._sfx('tree_shake', { vol: 0.5 });
      }
      return;
    }
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
        p.projHitT = this.simT;
        if (dmg > 4) {
          p.hurtT = 1;
          const pos = p.body.getPosition();
          this.fx.burst(pos.x, pos.y + 0.6, 'fur', 8, { color: FUR[p.team], speed: 5 });
          this.fx.burst(pos.x, pos.y + 1.2, 'star', 5, { speed: 4 });
        }
      } else if (o.kind === 'block') {
        // a bird slamming a block into the captain is already counted as the bird's hit
        if (this.simT - (p.projHitT ?? -9) < 0.3) return;
        dmg = Math.min(25, Math.max(0, imp - 2.5) * 1.2);
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
      const kind = BREAK_FX[B.mat] || 'wood';
      const n = B.shape === 'circle' ? 10 : Math.round(6 + (B.w + B.h) * 5);
      const jitter = Math.max(B.w || B.r * 2, B.h || B.r * 2) * 0.6;
      this.fx.burst(pos.x, pos.y, kind, n, { speed: 5, jitter });
      this.fx.burst(pos.x, pos.y, 'dust', 4, { speed: 1.5 });
      if (B.mat === 'wood') { this.fx.burst(pos.x, pos.y, 'leaf', 3, { speed: 2.5, jitter }); this._sfx('rustle', { vol: 0.5 }); }
      this._sfx(BREAK_SFX[B.mat], { vol: 0.9 });
      this._hap('block', B.mat);
      const shooter = this.players[this.turn];
      if (B.lastHitBy >= 0 || fromProj) shooter.stats.blocks++;
      if (B.mat === 'hive') this.blastQueue.push({ x: pos.x, y: pos.y, spec: HIVE_BLAST, owner: shooter, kind: 'hive' });
      if (B.hanging && B.hanging.hive) { B.hanging.hive.joint = null; B.hanging.hive.released = true; } // joint dies with the body
      if (B.mat === 'crate' && pos.y > WORLD.SEA) this._reward(shooter, pos);
    } else if (B.hanging && B.hanging.hive && !B.hanging.hive.released && fromProj) {
      const tree = B.hanging;
      this.afterStep.push(() => this.forest._releaseHive(tree));
    } else if (dmg > 6 && B.mat !== 'mushroom') {
      this._sfx(HIT_SFX[B.mat], { vol: clamp(dmg / 40, 0.2, 1) });
    }
  }

  // Breaking a nut basket hands the shooter a bonus special nut.
  _reward(p, pos) {
    const type = SUPPLY[Math.floor(this.lrng() * SUPPLY.length)];
    p.ammo[type] = (p.ammo[type] || 0) + 1;
    this.fx.burst(pos.x, pos.y, 'nutbit', 8, { speed: 5 });
    this.fx.burst(pos.x, pos.y, 'star', 6, { speed: 4 });
    this.fx.text(pos.x, pos.y + 1.2, `+1 ${Art.AMMO_INFO[type].name}!`, '#9ff27a', 0.9, { life: 1.8 });
    this._sfx('pickup');
    this.emit('hud');
  }

  _hurt(p, dmg, attacker) {
    if (p.dead || dmg <= 0) return;
    dmg = Math.min(dmg, p.hp);
    if (dmg >= 1.5) this._hap(this.isMine(p) ? 'hurt' : 'hit', dmg);
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
    }
    if (dmg >= 6) {
      const pos = p.body.getPosition();
      this.fx.burst(pos.x, pos.y + HEAD.y + 0.1, 'nutbit', Math.min(6, 1 + Math.round(dmg / 8)), { speed: 5, dir: Math.PI / 2 });
    }
    p.mood = 'scared';
    p.moodT = 1.5;
    const enemy = this.players[1 - p.id];
    if (!enemy.dead) { enemy.mood = 'happy'; enemy.moodT = 1.8; }
    if (dmg >= 6 && this.crew) {
      this.crew.react(p, 'hurt', { dmg });
      if (attacker && attacker !== p) this.crew.react(attacker, 'hit');
    }
    if (p.hp <= 0.01) this._kill(p, false);
  }

  _kill(p, fell) {
    if (p.dead) return;
    p.dead = true;
    p.hp = 0;
    p.fell = fell;
    const pos = p.body.getPosition();
    if (fell) {
      // swallowed by the clouds
      this._sfx('poof', { vol: 1 });
      this.fx.burst(pos.x, WORLD.SEA + 0.4, 'cloud', 16, { speed: 5, color: this.theme.abyss.cloud, jitter: 1 });
      this.fx.burst(pos.x, WORLD.SEA + 0.6, 'fur', 10, { color: FUR[p.team], speed: 5 });
      this.fx.text(pos.x, WORLD.SEA + 3.2, '추락!', '#ffe45c', 1.6, { life: 2 });
      this.fx.shake(0.35);
      if (this.damageOn) this.emit('fall', { player: p.id, by: this.players[this.turn] === p ? null : this.turn });
    } else {
      this._sfx('squeak_ko');
      this.fx.burst(pos.x, pos.y + 0.5, 'fur', 16, { color: FUR[p.team], speed: 7 });
      this.fx.burst(pos.x, pos.y + 1.0, 'nutbit', 6, { speed: 6, dir: Math.PI / 2 });
      this.fx.burst(pos.x, pos.y + 1.4, 'star', 8, { speed: 5 });
      this.fx.text(pos.x, pos.y + 2.6, 'K.O.!', '#ffe45c', 1.4, { life: 1.8 });
    }
    this.slowmo(0.8);
    this._hap('ko', this.isMine(p));
  }

  // A captain has nothing left under them: slow the world down and follow them all the way into
  // the clouds. Presentation only (the fall itself is plain physics, judged at the cloud line).
  _startFall(p) {
    p.falling = true;
    this.crew?.react(p, 'fall');
    p.mood = 'scared';
    p.moodT = 4;
    const pos = p.body.getPosition();
    this.slowmo(1.1, 0.3);
    this.fallcam = { p, t: 3 };
    this._sfx('fall');
    this._hap('fall');
    this.fx.text(pos.x, pos.y + 2.3, '으아아!', '#ffffff', 1.0, { life: 1.3 });
    this.fx.burst(pos.x, pos.y - CART_R, 'dirt', 8, { speed: 3, color: this.theme.ground.dirtDark });
  }

  // Metres of ground under a captain, and whether one wheel already hangs over the clouds.
  _footing(p) {
    const t = this.terrain, pos = p.body.getPosition();
    const by = pos.y - CART_R + 0.05;
    const support = t.thicknessBelow(pos.x, by, 0.5);
    const hangs = (dx) => t.thicknessBelow(pos.x + dx, by, 0.5) === 0 && t.surfaceY(pos.x + dx, by) < WORLD.SEA + 0.3;
    return { support, edge: hangs(-0.75) || hangs(0.75), by };
  }

  slowmo(sec, scale = 0.3) {
    this.slowT = Math.max(this.slowT, sec);
    this.slowScale = Math.min(this.slowT > sec ? this.slowScale : 1, scale);
  }

  // ------------------------------------------------------------------ explosions
  _explode(x, y, spec, owner, kind = 'nut', extra = null) {
    const { r, dmg, crater, push } = spec;
    if (crater) {
      const weak = this._weakFooting(x, y, Math.max(r, crater) + 1.2);
      this.terrain.carve(x, y, crater);
      this._crumble(weak);
    }
    if (kind === 'hive') {
      // no fireball: a honey splash and an angry swarm
      this.fx.burst(x, y, 'honey', 16, { speed: 6 });
      this.fx.swarm(x, y, r);
      this._sfx('buzz');
      this._sfx('honey', { vol: 0.8 });
      this.fx.text(x, y + 1.2, '윙윙!', '#ffd23a', 0.8, { life: 1.1 });
    } else if (kind === 'drill') {
      // a muffled blast deep in the island, dirt shooting out of the shaft
      const mouth = extra && extra.mouth != null ? extra.mouth : y + 2.8;
      this.fx.add({ x, y, vx: 0, vy: 0, type: 'ring', life: 0.4, size: 0.4, grow: r * 4, color: 'rgba(255,230,190,0.8)', g: 0, drag: 0 });
      this.fx.burst(x, mouth, 'dirt', 18, { speed: 10, spread: 0.18, color: this.theme.ground.dirtDark });
      this.fx.burst(x, mouth, 'dust', 8, { speed: 3, color: 'rgba(200,170,130,0.8)' });
      this.fx.burst(x, y, 'dirt', 10, { speed: 6, color: this.theme.ground.dirt });
      this._sfx('explode_big', { vol: 0.75, pitch: 0.65 });
      this._sfx('crack', { vol: 0.8, pitch: 0.7 });
    } else if (kind === 'pound') {
      this.fx.add({ x, y, vx: 0, vy: 0, type: 'ring', life: 0.45, size: 0.4, grow: r * 5, color: 'rgba(255,245,220,0.95)', g: 0, drag: 0 });
      this.fx.burst(x, y, 'dust', 10, { speed: 4, color: 'rgba(230,210,180,0.85)' });
      this.fx.burst(x, y, 'shell', 8, { speed: 6 });
      this._sfx('crack');
      this._sfx('explode_small', { vol: 0.9, pitch: 0.8 });
    } else {
      this.fx.explosion(x, y, r * 0.8);
      if (kind === 'burr') {
        this.fx.burst(x, y, 'needle', 22, { speed: 11 });
        this.fx.burst(x, y, 'nutbit', 5, { speed: 7 });
        this._sfx('spikes');
      }
      if (kind === 'kernel') this._sfx('crack', { vol: 0.5, pitch: 1.3 });
      this._sfx(r > 1.6 ? 'explode_big' : 'explode_small');
    }
    if (crater > 0.6) this.fx.burst(x, y, 'dirt', Math.round(8 + crater * 6), { speed: 7 + r * 2, color: this.theme.ground.dirtDark });
    this.fx.shake(0.12 + r * 0.1);
    this._hap('boom', r);
    if (r > 1.6) this.slowmo(0.18);
    // captains
    for (const p of this.players) {
      if (p.dead) continue;
      const pos = p.body.getPosition();
      const d = Math.max(0, Math.min(dist(x, y, pos.x, pos.y) - CART_R * 0.6, dist(x, y, pos.x, pos.y + HEAD.y) - HEAD.r * 0.6));
      if (d < r) {
        // behind a wall of earth (a burrow roof, a ridge) a blast loses most of its bite
        const cover = this._covered(x, y, pos.x, pos.y + 0.35) ? 0.35 : 1;
        const k = (1 - d / r) * cover;
        this._hurt(p, dmg * Math.pow(k, 0.8), owner);
        const dx = pos.x - x, dy = pos.y - y + 0.6;
        const l = Math.hypot(dx, dy) || 1;
        const m = p.body.getMass();
        const kb = this.event === 'rain' ? 0.3 : 0.14; // wet ground: carts slide much further
        p.body.applyLinearImpulse(V((dx / l) * push * kb * k * m, (dy / l) * push * kb * k * m + 1.5 * k * m), p.body.getPosition(), true);
      }
    }
    this.forest.onExplosion(x, y, r, dmg, owner);
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

  // The walnut bit into the ground: bore a shaft straight down, then burst at the bottom.
  _drill(P) {
    if (P.dead || P.drilling) return;
    const { depth, r } = P.spec.drill;
    const pos = P.body.getPosition();
    const x = pos.x, y0 = pos.y + P.spec.r * 0.5;
    const list = [];
    for (let d = 0; d <= depth + 0.01; d += 0.45) list.push([x, y0 - d, r]);
    const weak = this._weakFooting(x, y0 - depth / 2, 2.4);
    this.terrain.carveMany(list);
    this._crumble(weak);
    P.drilling = true;
    P.drillEnd = { x, y: y0 - depth, mouth: y0 };
    P.fuse = 0.22;
    P.body.setLinearVelocity(V(0, -15));
    P.body.setAngularVelocity(18);
    this.fx.burst(x, y0, 'dirt', 14, { speed: 7, spread: 0.3, color: this.theme.ground.dirtDark });
    this.fx.burst(x, y0, 'dust', 6, { speed: 2 });
    this.fx.shake(0.18);
    this._sfx('drill');
    this._hap('drill');
    this._wakeAround(x, y0 - depth / 2, depth + 2);
  }

  // Captains already standing on a cracked crust (thinner than CRUMBLE) near a hit. Checked before
  // the hit digs anything, so ground only gives way once it has had a turn to show its cracks.
  _weakFooting(x, y, reach) {
    const out = [];
    for (const p of this.players) {
      if (p.dead) continue;
      const pos = p.body.getPosition();
      if (Math.abs(pos.x - x) > reach || Math.abs(pos.y - y) > reach + 1.5) continue;
      const t = this.terrain.thicknessBelow(pos.x, pos.y - CART_R + 0.05, 0.5);
      if (t > 0 && t < CRUMBLE) out.push(p);
    }
    return out;
  }

  // A cracked crust breaks under the cart the moment something hits close by (part of the
  // simulation: both phones break the same crust on the same tick).
  _crumble(weak) {
    for (const p of weak) {
      if (p.dead) continue;
      const pos = p.body.getPosition();
      const by = pos.y - CART_R + 0.05;
      const t = this.terrain.thicknessBelow(pos.x, by, 0.5);
      if (!(t > 0 && t < CRUMBLE)) continue;
      const top = this.terrain.surfaceY(pos.x, by + 0.2);
      this.terrain.carve(pos.x, top - t / 2, 1.05);
      this._wakeAround(pos.x, pos.y, 2);
      this.fx.burst(pos.x, top - t, 'dirt', 14, { speed: 4, dir: -Math.PI / 2, color: this.theme.ground.dirtDark });
      this.fx.burst(pos.x, top, 'dust', 6, { speed: 2 });
      this.fx.text(pos.x, pos.y + 2.2, '우지끈!', '#ffd28a', 1.0, { life: 1.2 });
      this._sfx('crack', { vol: 1, pitch: 0.75 });
      this._sfx('break_stone', { vol: 0.6, pitch: 0.7 });
    }
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
    body.createFixture(planck.Circle(spec.r), { density: spec.density, friction: 0.55, restitution: 0.28, filterGroupIndex: -1 });
    body.setLinearVelocity(V(vx, vy));
    const P = { kind, type, spec, owner, body, t: 0, firstHit: false, hitT: 0, squash: 0, used: false, fuse: 0, slowT: 0, dead: false, trailT: 0, blink: 0, dealt: 0 };
    body.setUserData({ kind: 'proj', ref: P });
    this.projectiles.push(P);
    return P;
  }

  launch(power, angle) {
    // angle: radians in world space (0 = right, ccw)
    const p = this.players[this.turn];
    if (p.dead || this.state !== 'aim' || p.remote || p.padFlight) return;
    const type = p.sel;
    if (p.ammo[type] <= 0) return;
    // the shot starts from a canonical rebuild so the friend's phone can replay it exactly
    const snap = this.snapshot();
    this.loadSnapshot(snap);
    this.lastKind = 'shot';
    this._fire(power, angle);
    if (this.online) this.emit('net', { t: 'shot', q: snap.q, n: this.turnNo, snap, pw: power, an: angle, sel: type });
  }

  _fire(power, angle) {
    const p = this.players[this.turn];
    const type = p.sel;
    p.ammo[type]--;
    const spec = AMMO[type];
    const rest = this.restPos(p);
    const v = power * VMAX;
    const vx = Math.cos(angle) * v, vy = Math.sin(angle) * v;
    if (Math.abs(vx) > 0.5) p.facing = vx > 0 ? 1 : -1;
    const P = this._spawnProjectile('nut', type, spec, p, rest.x, rest.y, vx, vy);
    this.lead = P;
    this.events.onLaunch();
    const target = this.players[1 - this.turn];
    this.shotTargetHp = target.hp;
    this.shotMinD = 99;
    this.nearMissShown = false;
    this.killcam = null;
    this.killcamUsed = false;
    p.stats.shots++;
    this.crew?.react(p, 'fire');
    this.currentTrail = [];
    this.shotPower = power;
    this._stretch(null);
    this._sfx('launch', { vol: 0.6 + power * 0.5 });
    this._sfx('chitter', { vol: 0.8, pitch: p.team ? 0.92 : 1.12 });
    if (p.remote || p.isAI) this._hap('friendLaunch');
    else this._hap('launch', power);
    this.fx.burst(rest.x, rest.y, 'leaf', 3, { speed: 2 });
    this.aim = null;
    this.setState('flight');
    // fall back to acorns when this nut ran out
    if (p.ammo[type] <= 0) p.sel = 'acorn';
    this.emit('fired', { player: p.id, type });
  }

  restPos(p) {
    const pos = p.body.getPosition();
    const a = Art.slingAnchors(pos.x, -pos.y, p.facing);
    return { x: a.rest.x, y: -a.rest.y };
  }

  activateAbility(fromAI = false, fromNet = false) {
    const P = this.lead;
    if (!P || P.dead || P.used || P.kind !== 'nut') return false;
    if (P.owner.isAI !== fromAI) return false; // humans can't fire the CPU's ability (and vice versa)
    if (P.owner.remote && !fromNet) return false; // nor their friend's
    const spec = P.spec;
    if (!spec.ability) return false;
    if (P.firstHit && spec.ability !== 'boom') return false;
    P.used = true;
    if (P.caught > 0) this.forest.release(P);
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
      // the shell cracks open and three kernels fan out
      const base = Math.atan2(vel.y, vel.x);
      for (const da of [-0.2, 0, 0.2]) {
        const m = this._spawnProjectile('kernel', 'kernel', KERNEL, P.owner, pos.x, pos.y, Math.cos(base + da) * sp, Math.sin(base + da) * sp);
        m.t = 1;
        if (da === 0) this.lead = m;
      }
      this._sfx('crack');
      this._sfx('split', { vol: 0.6 });
      this.fx.burst(pos.x, pos.y, 'shell', 8, { speed: 4 });
      this.fx.burst(pos.x, pos.y, 'star', 4, { speed: 4 });
    } else if (spec.ability === 'boom') {
      P.fuse = 0.001;
    } else if (spec.ability === 'pound') {
      // stop dead in the air, then slam straight down
      P.pound = true;
      P.body.setLinearVelocity(V(0, -POUND_SPEED));
      P.body.setAngularVelocity(0);
      this._sfx('pound');
      this.fx.add({ x: pos.x, y: pos.y, vx: 0, vy: 0, type: 'ring', life: 0.3, size: 0.3, grow: 2.5, color: 'rgba(255,255,255,0.9)', g: 0, drag: 0 });
      this.fx.burst(pos.x, pos.y, 'star', 4, { speed: 3 });
    }
    this._sfx('ability', { vol: 0.5 });
    if (!fromAI && !fromNet) this._hap('ability', spec.ability);
    if (this.online && !fromNet) this.emit('net', { t: 'ab', q: this.snapSeq, k: this.shotTick });
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
    const r = rng((this.seed + Math.imul(this.turnNo, 7919)) >>> 0); // both phones roll the same wind
    const prev = this.wind;
    this.wind = this.windMax ? Math.round((r() * 2 - 1) * this.windMax) : 0;
    this.event = this.events.kindFor(this.turnNo);
    const eventFirst = this.events.onTurnStart(this.turnNo); // gust, wet carts, the drop; true = the boar runs now
    this._spotReward(p);
    if (Math.abs(this.wind - prev) >= 3) this._sfx('wind', { vol: 0.6 });
    p.stamina = STAMINA;
    p.moveDir = 0;
    this.aiMoved = false;
    this.aiMoveGen = this.aiMove = null;
    this.turnTimer = this.opts.timer || 0;
    let flood = null;
    if (this.turnNo > FLOOD_TURN) {
      this.seaTarget += FLOOD_STEP;
      flood = this.turnNo === FLOOD_TURN + 1 ? '구름이 차오릅니다!' : null;
    }
    this.lastTickSec = -1;
    const pos = p.body.getPosition();
    this.cam.manual = 0;
    this.cam.focus(pos.x + p.facing * 5, pos.y + 1.2, this.cam.baseZoom, 3);
    this.lead = null;
    this.netGate = this.netAb = this.netEnd = this.netLive = null;
    this.setState(eventFirst ? 'event' : p.isAI ? 'ai-think' : p.remote ? 'remote' : 'aim');
    const ev = this.events.info(this.turnNo);
    if (ev.starting || ev.next) this._sfx('alert');
    else this._sfx('turn');
    this.emit('turn', { player: p.id, name: p.name, isAI: p.isAI, remote: p.remote, wind: this.wind, turnNo: this.turnNo, flood, ev });
    if (!p.dead) {
      // warn whoever is about to play when the ground under them is giving way
      const f = this._footing(p);
      const risky = f.edge || (f.support > 0 && f.support < THIN_GROUND);
      if (risky) this.crew?.react(p, 'danger');
      else if (Math.abs(this.wind) >= 8) this.crew?.react(p, 'gust');
      else this.crew?.react(p, 'turn');
      if (risky && !p.isAI && !p.remote) {
        this.emit('danger', { edge: f.edge, thin: f.support > 0 && f.support < THIN_GROUND });
        this._hap('edge');
      }
    }
    if (p.isAI) {
      this.aiPlan = null;
    }
  }

  // Standing on a 명당 (the acorn tree, the great oak's crown) when your turn starts: a special nut.
  // Seeded by the turn, so both phones hand out the same nut.
  _spotReward(p) {
    if (p.dead || !this.land.spots) return;
    const pos = p.body.getPosition();
    if (!hasSpot(this.land, pos.x, 'tree', 'crown') || Math.abs(p.body.getLinearVelocity().y) > 1) return;
    const r = rng(((this.seed ^ 0x7ee5) + Math.imul(this.turnNo, 977)) >>> 0);
    const open = SUPPLY.filter((t) => (p.ammo[t] || 0) < POCKET);
    if (!open.length) return;
    const type = open[Math.floor(r() * open.length)];
    p.ammo[type] = (p.ammo[type] || 0) + 1;
    this.fx.burst(pos.x, pos.y + 2.2, 'nutbit', 6, { speed: 3 });
    this.fx.text(pos.x, pos.y + 2.9, `명당! +1 ${Art.AMMO_INFO[type].name}`, '#ffe45c', 0.85, { life: 1.8 });
    this._sfx('pickup', { vol: 0.8 });
    this.crew?.react(p, 'drop');
    this.emit('hud');
  }

  endTurn() {
    const shooter = this.players[this.turn];
    if ((shooter.turnDmg || 0) >= 3) shooter.stats.hits++;
    shooter.turnDmg = 0;
    const k = this.shotTick;
    const snap = this.snapshot();
    this.loadSnapshot(snap);
    this.lastKind = 'end';
    if (this.online) this.emit('net', { t: 'end', q: snap.q, n: this.turnNo, k, snap });
    this._afterTurn();
  }

  // The friend's phone finished its turn: once our replay has reached the same tick, adopt
  // their snapshot and move on exactly as they did.
  _netFinish() {
    const msg = this.netEnd;
    this.netEnd = this.netGate = this.netAb = null;
    this.aim = null;
    if (window.__afNetDebug) (this.netDiffs || (this.netDiffs = [])).push(diffSnaps(this.snapshot(), msg.snap));
    this.loadSnapshot(msg.snap);
    this.lastKind = 'end';
    this._afterTurn();
  }

  // Pick a turn back up after a resync (nobody has fired in it yet, as far as both phones agree).
  _resumeTurn() {
    const p = this.players[this.turn];
    this.netGate = this.netAb = this.netEnd = this.netLive = null;
    this.aim = null;
    this.lead = null;
    this.turnTimer = this.opts.timer || 0;
    this.setState(p.isAI ? 'ai-think' : p.remote ? 'remote' : 'aim');
    this.emit('turn', { player: p.id, name: p.name, isAI: p.isAI, remote: p.remote, wind: this.wind, turnNo: this.turnNo, resumed: true });
  }

  // State for a friend who (re)joined this match: our last hand-over snapshot with the whole
  // carve history, and what happened after it.
  syncPayload() {
    let after = this.lastKind;
    const s = this.lastSnap;
    if (after === 'shot' && this.players[s.tu].remote) {
      // we were replaying *their* shot and their phone lost it: void it, they shoot again
      this.loadSnapshot(s);
      this._resumeTurn();
      after = this.lastKind = 'turn';
    }
    const upto = s.o[0] + (s.o.length - 1) / 3;
    const o = [0];
    for (const op of this.terrain.opLog.slice(0, upto)) o.push(op[0], op[1], op[2]);
    return { after, snap: { ...s, o } };
  }

  applySync(y) {
    this.hold = false;
    this.loadSnapshot(y.snap);
    this.lastKind = y.after;
    if (y.after === 'start') return; // still in the intro, same as them
    if (y.after === 'end') { this._afterTurn(); return; }
    if (y.after === 'shot') this.snapSeq = y.snap.q - 1; // their shot is still flying: replay it
    this._resumeTurn();
  }

  // A quick emote bubble over a captain.
  showEmote(playerId, e) {
    this.emotes = this.emotes.filter((m) => m.p !== playerId);
    this.emotes.push({ p: playerId, e, t: 0 });
    this._sfx('chitter', { vol: 0.7, pitch: this.players[playerId].team ? 0.95 : 1.15 });
  }

  _afterTurn() {
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
    this.fallcam = null;
    for (const p of this.players) this.crew?.react(p, p === winner ? 'win' : 'lose');
    this.setState('over');
    const humanWon = winner && !winner.isAI;
    this._sfx(winner ? (this.opts.mode === 'cpu' && !humanWon ? 'lose' : 'win') : 'lose');
    if (winner) {
      const pos = winner.body.getPosition();
      this.cam.focus(pos.x, pos.y + 2, this.cam.baseZoom * 1.25, 2);
      winner.mood = 'happy';
      winner.moodT = 99;
    }
    this.overSent = false;
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
      players: this.players.map((p) => ({ name: p.name, hp: Math.ceil(p.hp), fell: p.fell, ...p.stats, dmg: Math.round(p.stats.dmg) })),
    };
  }

  skipTurn() {
    if (this.state !== 'aim') return;
    this.aim = null;
    this._stretch(null);
    this.emit('banner', { text: '시간 초과!', sub: '턴이 넘어갑니다' });
    this.setState('settle');
  }


  // ------------------------------------------------------------------ snapshots (lockstep)
  // The whole match as small integers: captains, live blocks, forest state and the terrain
  // carves since the last snapshot. `full` sends the entire carve history (for a rejoin).
  snapshot(full = false) {
    // deferred structural work (a toppling tree, dead bodies) must not straddle a snapshot
    if (this.afterStep.length) for (const job of this.afterStep.splice(0)) job();
    this._flushKills();
    const P = this.players.map((p) => {
      const b = p.body, pos = b.getPosition(), v = b.getLinearVelocity();
      return [q4(pos.x), q4(pos.y), q3(v.x), q3(v.y), q2(p.hp), (p.dead ? 1 : 0) | (p.fell ? 2 : 0) | (b.isAwake() ? 4 : 0),
        p.facing, q2(p.stamina), AMMO_KEYS.map((k) => (p.ammo[k] === Infinity ? -1 : p.ammo[k])), p.stats.shots, p.stats.hits, q2(p.stats.dmg), p.stats.blocks, AMMO_KEYS.indexOf(p.sel)];
    });
    const B = [], S = {};
    for (const blk of this.blocks) {
      if (blk.dead) continue;
      const b = blk.body, pos = b.getPosition(), aw = b.isAwake();
      const e = [blk.id, q4(pos.x), q4(pos.y), q4(b.getAngle()), q2(blk.hp), (aw ? 1 : 0) | (blk.dropped ? 2 : 0)];
      if (aw) {
        const v = b.getLinearVelocity();
        e.push(q3(v.x), q3(v.y), q3(b.getAngularVelocity()));
      }
      B.push(e);
      if (blk.id >= this.baseBlockCount) {
        const sp = this.blockSpecs[blk.id];
        S[blk.id] = [sp.mat, sp.shape, q4(sp.w || 0), q4(sp.h || 0), q4(sp.r || 0), sp.treeKind || ''];
      }
    }
    const base = full ? 0 : Math.min(this.opMark, this.terrain.opLog.length);
    const o = [base];
    for (const op of this.terrain.opLog.slice(base)) o.push(op[0], op[1], op[2]);
    return {
      q: this.snapSeq + 1, n: this.turnNo, tu: this.turn, w: this.wind,
      sea: [q4(WORLD.SEA), q4(this.seaTarget)], nb: this.nextBlockId,
      p: P, b: B, s: S, f: this.forest.state(), ev: this.events.state(), o,
    };
  }

  // Tear the physics world down and rebuild it from a snapshot. Both phones do this at every
  // hand-over, so they start each shot from identical bodies (same order, no stale contacts).
  loadSnapshot(s) {
    this.event = this.events ? this.events.kindFor(s.n) : null;
    const log = this.terrain.opLog;
    const base = s.o[0], n = (s.o.length - 1) / 3;
    let same = log.length === base + n;
    for (let i = 0; same && i < n; i++) {
      const a = log[base + i];
      same = a[0] === s.o[1 + i * 3] && a[1] === s.o[2 + i * 3] && a[2] === s.o[3 + i * 3];
    }
    if (!same) {
      const ops = log.slice(0, Math.min(base, log.length));
      for (let i = 0; i < n; i++) ops.push([s.o[1 + i * 3], s.o[2 + i * 3], s.o[3 + i * 3]]);
      this.historyGap = log.length < base;
      this.terrain.rebuild(ops);
    }
    this.opMark = this.terrain.opLog.length;

    this.world = new planck.World({ gravity: V(0, -GRAV) });
    this.terrain.attach(this.world, planck);
    this._wireContacts();
    s.p.forEach((e, i) => {
      const p = this.players[i];
      this._captainBody(p, e[0] / 1e4, e[1] / 1e4, !!(e[5] & 4));
      if (e[5] & 4) p.body.setLinearVelocity(V(e[2] / 1e3, e[3] / 1e3));
      p.hp = e[4] / 100;
      p.dead = !!(e[5] & 1);
      p.fell = !!(e[5] & 2);
      p.falling = false;
      p.facing = e[6];
      p.stamina = e[7] / 100;
      AMMO_KEYS.forEach((k, j) => { p.ammo[k] = e[8][j] < 0 ? Infinity : e[8][j]; }); // JSON has no Infinity
      p.stats.shots = e[9]; p.stats.hits = e[10]; p.stats.dmg = e[11] / 100; p.stats.blocks = e[12];
      if (e[13] >= 0) p.sel = AMMO_KEYS[e[13]];
      p.moveDir = 0;
      p.moving = false;
      p.turnDmg = 0;
      p.projHitT = -9;
    });
    this.blocks = [];
    for (const e of s.b) {
      const id = e[0];
      let sp = this.blockSpecs[id];
      const x = s.s && s.s[id];
      if (!sp && x) sp = this.blockSpecs[id] = { mat: x[0], shape: x[1], w: x[2] / 1e4, h: x[3] / 1e4, r: x[4] / 1e4, treeKind: x[5] || undefined };
      if (!sp) continue;
      const B = this._makeBlock(sp.mat, sp.shape, e[1] / 1e4, e[2] / 1e4, sp.w, sp.h, sp.r, e[3] / 1e4, { id, awake: !!(e[5] & 1), hp: e[4] / 100 });
      if (sp.treeKind) B.treeKind = sp.treeKind;
      if (e[5] & 2) B.dropped = true;
      if (e.length > 6) {
        B.body.setLinearVelocity(V(e[6] / 1e3, e[7] / 1e3));
        B.body.setAngularVelocity(e[8] / 1e3);
      }
    }
    this.nextBlockId = Math.max(this.nextBlockId, s.nb);
    this.forest.load(s.f, new Map(this.blocks.map((b) => [b.id, b])));
    if (this.events) this.events.load(s.ev);
    // nothing transient survives a hand-over
    this.projectiles = [];
    this.lead = null;
    this.killQueue.length = this.afterStep.length = this.pendingFalls.length = 0;
    this.blastQueue.length = this.dentQueue.length = this.drillQueue.length = 0;
    this.turnNo = s.n;
    this.turn = s.tu;
    this.wind = s.w;
    WORLD.SEA = s.sea[0] / 1e4;
    this.seaTarget = s.sea[1] / 1e4;
    this.snapSeq = s.q;
    this.shotTick = 0;
    this.lrng = rng((this.seed ^ Math.imul(s.q + 1, 0x9e3779b1)) >>> 0);
    this.forest.r = this.lrng;
    this.lastSnap = s;
  }

  _captainBody(p, x, y, awake = true) {
    // heavy cart: direct hits hurt but shouldn't shove the captain off the island
    const body = this.world.createBody({ type: 'dynamic', position: V(x, y), fixedRotation: true, linearDamping: this.event === 'rain' ? 0.08 : 0.35, awake });
    body.createFixture(planck.Circle(CART_R), { density: 5.0, friction: 1.2, restitution: 0.02, filterMaskBits: 0xfffd });
    body.createFixture(planck.Circle(V(0, HEAD.y), HEAD.r), { density: 0.6, friction: 0.6, restitution: 0.05, filterMaskBits: 0xfffd });
    body.setUserData({ kind: 'captain', ref: p });
    p.body = body;
    return body;
  }

  _flushKills() {
    if (!this.killQueue.length) return;
    for (const body of this.killQueue) {
      if (body._destroyed) continue;
      body._destroyed = true;
      this.world.destroyBody(body);
    }
    this.killQueue.length = 0;
    this.blocks = this.blocks.filter((b) => !b.dead);
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  // ------------------------------------------------------------------ online (friend's phone)
  // Their shot: rebuild from the snapshot they fired from and replay it, never running past the
  // tick their phone has reported (so an ability tap lands on exactly the same tick).
  netShot(m) {
    if (m.q <= this.snapSeq || this.over) return;
    const p = this.players[m.snap.tu];
    if (!p || !p.remote) return;
    this.loadSnapshot(m.snap);
    this.lastKind = 'shot';
    p.sel = m.sel;
    this.aim = null;
    this._fire(m.pw, m.an);
    this.netGate = Math.max(0, this.netGate ?? 0);
    this.netAb = null;
    this.netEnd = null;
  }

  netProgress(m) {
    if (m.q !== this.snapSeq || this.netGate == null) return;
    this.netGate = Math.max(this.netGate, m.k);
    if (m.ab != null && m.ab >= 0 && this._abQ !== m.q) {
      this._abQ = m.q; // arm their ability once per shot
      this.netAb = m.ab;
      this.netGate = Math.max(this.netGate, m.ab);
    }
  }

  netEndTurn(m) {
    if (m.q <= this.snapSeq || this.over) return;
    this.netEnd = m;
    if (this.netGate != null) this.netGate = Math.max(this.netGate, m.k);
  }

  netLiveUpdate(m) {
    if (m.n !== this.turnNo) return;
    this.netLive = m;
  }

  _applyNetLive(realDt) {
    const L = this.netLive;
    const p = this.players[this.turn];
    if (!L || !p.remote || p.dead) return;
    const pos = p.body.getPosition();
    const k = 1 - Math.exp(-10 * realDt);
    const nx = lerp(pos.x, L.x, k), ny = lerp(pos.y, L.y, k);
    p.wheel += (nx - pos.x) / 0.28;
    p.moving = Math.abs(L.x - pos.x) > 0.03;
    p.body.setTransform(V(nx, ny), 0);
    p.facing = L.f;
    if (L.sel && p.ammo[L.sel] > 0) p.sel = L.sel;
    this.aim = L.pw > 0.04 ? { ai: true, remote: true, power: L.pw, angle: L.an } : null;
  }

  // What this phone tells the friend's phone every frame (throttled): live aim while it is our
  // turn to shoot, and how far our replay-authoritative simulation has run during a shot.
  _netOut(realDt) {
    const p = this.players[this.turn];
    if (!p || p.remote || this.over) return;
    this._netT -= realDt;
    if (this._netT > 0) return;
    this._netT = 0.09;
    if (this.state === 'aim') {
      const pos = p.body.getPosition();
      const a = this.aim;
      this.emit('net', {
        t: 'live', n: this.turnNo, x: Math.round(pos.x * 100) / 100, y: Math.round(pos.y * 100) / 100, f: p.facing,
        pw: a ? Math.round(a.power * 100) / 100 : 0, an: a ? Math.round(a.angle * 100) / 100 : 0, sel: p.sel,
      });
    } else if (this.state === 'flight' || this.state === 'settle') {
      this.emit('net', { t: 'fl', q: this.snapSeq, k: this.shotTick });
    }
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
    return this.state === 'aim' && !p.isAI && !p.remote && !p.dead && !this.paused && !p.padFlight;
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
    this.cam.focus(pos.x + p.facing * 5, pos.y + 1.2, this.cam.baseZoom, 4);
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
    // ratchet clicks while pulling back, a hard click at full power
    const notch = Math.floor(a.power * 14);
    if (notch > (a.notch ?? 0) && a.power < 0.98) this._hap('pull', a.power);
    a.notch = notch;
    if (a.power > 0.98 && !a.maxed) { a.maxed = true; this._hap('pullMax'); }
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
    this._hap('select');
    this._sfx('chitter', { vol: 0.35, pitch: p.team ? 0.95 : 1.15 });
    return true;
  }

  // ------------------------------------------------------------------ simulation
  update(realDt) {
    if (this.paused) return;
    realDt = Math.min(realDt, 0.05);
    this._frameDt = realDt;
    if (this.slowT > 0) {
      this.slowT -= realDt;
      this.timeScale = lerp(this.timeScale, this.slowScale, 0.3);
    } else {
      this.slowScale = 0.3;
      this.timeScale = lerp(this.timeScale, 1, 0.15);
    }
    const dt = realDt * this.timeScale;
    this.time += realDt;
    this.stateT += dt;
    this._updateState(dt, realDt);
    if (this.state === 'remote') this._applyNetLive(realDt);
    this.acc += dt;
    let steps = 0, maxSteps = 4;
    const replay = this.netGate != null;
    if (replay && this.netGate - this.shotTick > 24) { maxSteps = 12; this.acc += DT * 3; } // catch up after a hiccup
    if (this.state === 'remote') this.acc = 0; // the friend's phone owns this turn
    while (this.acc >= DT && steps < maxSteps) {
      if (replay && this.shotTick >= this.netGate) { this.acc = Math.min(this.acc, DT); break; }
      if (replay && this.netAb != null && this.netAb <= this.shotTick) { this.netAb = null; this.activateAbility(false, true); }
      this._physicsStep(DT, false);
      this.acc -= DT;
      steps++;
    }
    if (steps === maxSteps) this.acc = 0;
    this._updateActors(dt, realDt);
    this.crew.update(realDt);
    this.forest.update(dt);
    for (const m of this.emotes) m.t += realDt;
    if (this.emotes.length) this.emotes = this.emotes.filter((m) => m.t < 2.4);
    if (this.online) this._netOut(realDt);
    this.scene.update(realDt, this.wind);
    this.fx.update(dt);
    this._updateCamera(realDt);
    this.cam.update(realDt);
  }

  _physicsStep(dt, warmup) {
    if (!warmup) this._tickControls(dt);
    // wind + per-projectile bookkeeping
    for (const P of this.projectiles) {
      if (P.dead) continue;
      P.t += dt;
      if (P.caught > 0) { this.forest.holdCaught(P, dt); continue; }
      if (!P.firstHit && this.wind) {
        const m = P.body.getMass();
        P.body.applyForceToCenter(V(this.wind * WIND_ACC * m, 0), true);
      }
    }
    this.world.step(dt, 8, 3);
    // process deferred actions
    if (this.afterStep.length) {
      const jobs = this.afterStep.splice(0);
      for (const job of jobs) job();
    }
    if (this.pendingFalls.length) {
      for (const f of this.pendingFalls) this._hurt(f.p, f.dmg, f.attacker);
      this.pendingFalls.length = 0;
    }
    if (this.dentQueue.length) {
      for (const d of this.dentQueue) {
        const weak = this._weakFooting(d.x, d.y, d.r + 1.0);
        this.terrain.carve(d.x, d.y, d.r);
        this._crumble(weak);
        this._hap('dent');
        this.fx.burst(d.x, d.y, 'dirt', 8, { speed: 5, color: this.theme.ground.dirtDark });
        this.fx.burst(d.x, d.y, 'dust', 4, { speed: 1.2 });
        this.fx.shake(0.08);
        this._wakeAround(d.x, d.y, d.r + 2);
      }
      this.dentQueue.length = 0;
    }
    if (this.drillQueue.length) {
      for (const P of this.drillQueue) this._drill(P);
      this.drillQueue.length = 0;
    }
    let guard = 0;
    while (this.blastQueue.length && guard++ < 20) {
      const b = this.blastQueue.shift();
      if (b.proj) {
        if (b.proj.dead) continue;
        b.proj.dead = true;
        this.killQueue.push(b.proj.body);
      }
      if (!warmup) this._explode(b.x, b.y, b.spec, b.owner, b.kind, b);
    }
    this._flushKills();
    this.terrain.syncPhysics();
    // the cloud sea and the edges of the world: whatever goes in is gone
    for (const B of this.blocks) {
      const pos = B.body.getPosition();
      if (pos.y < WORLD.SEA - 0.6 || pos.x < -6 || pos.x > WORLD.W + 6) {
        B.dead = true;
        this.killQueue.push(B.body);
        if (!warmup && pos.y < WORLD.SEA) this._cloudPoof(pos.x, 0.8);
      }
    }
    for (const p of this.players) {
      if (p.dead) continue;
      const pos = p.body.getPosition();
      if (pos.y < WORLD.SEA - 0.2 || pos.x < -3 || pos.x > WORLD.W + 3) {
        if (!warmup) this._kill(p, true);
      }
    }
    if (warmup) return;
    this._tickProjectiles(dt);
    this.events.tick(dt);
    this.shotTick++;
    this.simT += dt;
    if (WORLD.SEA < this.seaTarget) WORLD.SEA = Math.min(this.seaTarget, WORLD.SEA + dt * 0.4);
    this.forest.tick();
  }

  // Driving the cart (only the phone whose turn it is ever does this).
  _tickControls(dt) {
    for (const p of this.players) {
      const v = p.body.getLinearVelocity();
      if (p.padFlight) {
        // bouncing across: land once the cart has come down and stopped falling
        p.padFlight.t += dt;
        if (p.padFlight.t > 0.3 && Math.abs(v.y) < 1 && this._touching(p)) {
          p.padFlight = null;
          p.body.setLinearDamping(this.event === 'rain' ? 0.08 : 0.35);
          p.body.setLinearVelocity(V(v.x * 0.2, v.y));
          const pos = p.body.getPosition();
          this.fx.burst(pos.x, pos.y - CART_R, 'dust', 8, { speed: 2.5 });
          this._sfx('land', { vol: 0.7 });
          this._hap('dent');
        }
        continue;
      }
      const moving = p === this.players[this.turn] && (this.state === 'aim' || this.state === 'ai-move') && p.moveDir && p.stamina > 0 && !p.dead && !p.remote;
      if (moving) {
        const grounded = Math.abs(v.y) < 2.5;
        const pad = grounded && p.stamina >= PAD_COST ? padAt(this.land, p.body.getPosition().x, p.moveDir) : null;
        if (pad) {
          this._padJump(p, pad);
          continue;
        }
        if (grounded && this._cliffAhead(p)) {
          // the cart digs its heels in at the edge instead of driving off into the clouds
          p.body.setLinearVelocity(V(0, v.y));
          p.moveDir = 0;
          p.moving = false;
          const pos = p.body.getPosition();
          this.fx.burst(pos.x + p.facing * 0.6, pos.y - CART_R + 0.1, 'dust', 4, { speed: 1.5 });
          this.fx.burst(pos.x + p.facing * 0.9, pos.y - CART_R, 'dirt', 3, { speed: 1.2, dir: -Math.PI / 2, color: this.theme.ground.dirtDark });
          this._sfx('brake');
          this._hap('edge');
          this.emit('cliff');
          continue;
        }
        if (grounded) {
          const vx = v.x, vy = v.y; // what the cart actually did last step (v is live)
          p.body.setLinearVelocity(V(p.moveDir * MOVE_SPEED, vy));
          // the gauge pays for ground covered, plus a bit for every metre climbed
          p.stamina = Math.max(0, p.stamina - (Math.abs(vx) + CLIMB_COST * Math.max(0, vy)) * dt * STAMINA_PER_M);
          p.wheel += vx * dt / 0.28;
          p.moveSoundT -= dt;
          if (p.moveSoundT <= 0) { p.moveSoundT = 0.26; this._sfx('move', { vol: 0.5 }); }
          if (Math.random() < 0.3) {
            const pos = p.body.getPosition();
            this.fx.burst(pos.x - p.moveDir * 0.5, pos.y - CART_R + 0.05, 'dust', 1, { speed: 0.8 });
          }
        }
        p.moving = true;
      } else if (p.moving && !p.remote) {
        if (!p.dead) p.body.setLinearVelocity(V(v.x * 0.2, v.y));
        p.moving = false;
      }
    }
  }

  _touching(p) {
    for (let ce = p.body.getContactList(); ce; ce = ce.next) if (ce.contact.isTouching()) return true;
    return false;
  }

  // Is there solid ground between a blast and a captain? (Ignores the ends, where the blast sits
  // in its own crater and the cart sits on its own ground.)
  _covered(ax, ay, bx, by) {
    const d = Math.hypot(bx - ax, by - ay);
    const n = Math.floor((d - 0.95) / 0.2);
    for (let i = 0; i < n; i++) {
      const k = (0.45 + i * 0.2) / d;
      if (this.terrain.solid(ax + (bx - ax) * k, ay + (by - ay) * k)) return true;
    }
    return false;
  }

  // Boing: a mushroom pad throws the cart across to the next island.
  _padJump(p, pad) {
    const pos = p.body.getPosition();
    const v = padLaunch(pad, pos.x, pos.y);
    p.stamina -= PAD_COST;
    p.body.setLinearDamping(0);
    p.body.setLinearVelocity(V(v.vx, v.vy));
    p.padFlight = { t: 0 };
    p.moveDir = 0;
    p.moving = false;
    p.facing = pad.dir;
    pad.squash = 1;
    this.fx.burst(pos.x, pos.y - CART_R, 'dust', 6, { speed: 3 });
    this._sfx('boing', { vol: 1, pitch: 0.75 });
    this._sfx('whoosh', { vol: 0.5 });
    this._hap('launch', 0.6);
    this.crew?.react(p, 'pad');
    this.emit('pad');
  }

  // Is the ground about to end in front of a moving cart (a drop into the clouds, or one deep
  // enough to hurt)? A wall or a slope going up is not a cliff.
  _cliffAhead(p) {
    const t = this.terrain, pos = p.body.getPosition();
    const foot = pos.y - CART_R;
    const ax = pos.x + p.moveDir * (CART_R + 0.35);
    if (t.solid(ax, foot + 0.5)) return false;
    const gy = t.surfaceY(ax, foot + 0.5);
    return gy < WORLD.SEA + 0.3 || foot - gy > CLIFF_STOP;
  }

  // Fuses, spent nuts and splashes: part of the simulation, so they run per tick.
  _tickProjectiles(dt) {
    for (const P of this.projectiles) {
      if (P.dead) continue;
      const pos = P.body.getPosition();
      const vel = P.body.getLinearVelocity();
      const sp = Math.hypot(vel.x, vel.y);
      if (P.fuse > 0) {
        P.fuse -= dt;
        if (P.fuse <= 0) {
          const d = P.drillEnd;
          if (d) this.blastQueue.push({ x: d.x, y: d.y, spec: P.spec.blast, owner: P.owner, proj: P, kind: 'drill', mouth: d.mouth });
          else this.blastQueue.push({ x: pos.x, y: pos.y, spec: P.spec.blast, owner: P.owner, proj: P, kind: P.type === 'burr' ? 'burr' : 'nut' });
          P.fuse = -1;
        }
      }
      if (P.firstHit) {
        P.hitT += dt;
        P.slowT = sp < 0.7 ? P.slowT + dt : 0;
        const done = (P.kind === 'nut' || P.kind === 'fallnut') && !(P.kind === 'nut' && P.type === 'burr') && (P.slowT > 0.6 || P.hitT > 4.5);
        const blackDone = P.kind === 'nut' && P.type === 'burr' && P.fuse === 0 && P.hitT > 3;
        if (done || blackDone) this._poof(P);
      } else if (P.t > 14 || this.shotTick > 16 * 60) {
        this._poof(P);
      }
      if (pos.y < WORLD.SEA - 0.3) {
        this._cloudPoof(pos.x, 0.5);
        if (P === this.lead && P.kind === 'nut' && !P.firstHit && !this.silent) this.crew?.react(P.owner, 'whiff');
        P.dead = true;
        this.killQueue.push(P.body);
      } else if (pos.x < -6 || pos.x > WORLD.W + 6) {
        P.dead = true;
        this.killQueue.push(P.body);
      }
    }
    if (this.lead && this.lead.dead) {
      const alive = this.projectiles.filter((q) => !q.dead);
      this.lead = alive[0] || null;
    }
  }

  // Something sank into the cloud sea.
  _cloudPoof(x, size) {
    this.fx.burst(x, WORLD.SEA + 0.3, 'cloud', Math.round(6 + 8 * size), { speed: 3 * size + 1, color: this.theme.abyss.cloud, jitter: 0.6 * size });
    this._sfx('poof', { vol: clamp(size, 0.35, 1) });
  }

  _updateState(dt, realDt) {
    const p = this.players[this.turn];
    if (p.remote && this.netEnd && (this.state === 'remote' || this.state === 'intro' || this.shotTick >= this.netEnd.k)) {
      this._netFinish();
      return;
    }
    if (!p.remote && (this.players[0].dead || this.players[1].dead) && (this.state === 'intro' || this.state === 'aim' || this.state === 'ai-think' || this.state === 'ai-move' || this.state === 'ai-aim' || this.state === 'event')) {
      // e.g. drove off a cliff, or sank while the turn banner was up: the turn is over
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
        if (this.stateT > 2.4 && !this.hold) this.startTurn();
        break;
      }
      case 'event': {
        // the boar is charging across; everyone waits and watches
        if (!this.events.boar) this.setState(p.isAI ? 'ai-think' : p.remote ? 'remote' : 'aim');
        break;
      }
      case 'aim': {
        if (this.turnTimer > 0 && !p.padFlight) {
          this.turnTimer -= realDt;
          const sec = Math.ceil(this.turnTimer);
          if (sec <= 5 && sec !== this.lastTickSec && sec > 0) {
            this.lastTickSec = sec;
            this._sfx('tick');
            this._hap('heartbeat', 0.45 + (5 - sec) * 0.12); // the clock runs out: the heart speeds up
          }
          if (this.turnTimer <= 0) this.skipTurn();
        }
        break;
      }
      case 'ai-think': {
        if (!this.aiMoved) {
          // first a look around: is there a better place to shoot from? (a few ticks of thinking)
          this.aiMoveGen ||= planMove(this, p, this.opts.difficulty || 'normal');
          const r = this.aiMoveGen.next();
          if (!r.done) break;
          this.aiMoveGen = null;
          this.aiMoved = true;
          if (r.value && !p.dead) {
            const x = p.body.getPosition().x;
            this.aiMove = { ...r.value, lastX: x, still: 0, flew: false };
            p.moveDir = p.facing = r.value.dir;
            this.setState('ai-move');
            break;
          }
        }
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
      case 'ai-move': {
        // drive to the chosen place; stop there, when out of stamina, at a cliff or when stuck
        const m = this.aiMove;
        if (p.padFlight) { m.flew = true; p.moveDir = 0; break; }
        const pos = p.body.getPosition();
        let done = (m.x - pos.x) * m.dir <= 0.12 || p.stamina <= 0 || this.stateT > 9;
        if (m.flew) { m.flew = false; m.still = 0; } // just landed off a pad: keep going
        else if (!p.moveDir) done = true; // braked at a cliff
        if (Math.abs(pos.x - m.lastX) < 0.01) m.still += dt; else m.still = 0;
        m.lastX = pos.x;
        if (m.still > 0.7) done = true;
        if (done) {
          p.moveDir = 0;
          this.aiMove = null;
          this._aiArrived(p);
          this.setState('ai-think');
        } else p.moveDir = m.dir;
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
          this.activateAbility(true);
        }
        if (this.projectiles.length === 0 && this.blastQueue.length === 0) {
          this._checkNearMiss(true);
          this.setState('settle');
        }
        break;
      }
      case 'over': {
        if (!this.overSent && this.stateT > 1.6) {
          this.overSent = true;
          this.emit('over', this.result());
        }
        break;
      }
      case 'settle': {
        if (p.remote) {
          if (this.projectiles.length) this.setState('flight');
          break; // their phone decides when the turn is over
        }
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
      if (!p.moving) p.wheel += p.body.getLinearVelocity().x * dt / 0.28;
    }
    for (const B of this.blocks) B.flash = Math.max(0, B.flash - realDt * 5);
    // projectiles lifecycle
    for (const P of this.projectiles) {
      if (P.dead) continue;
      P.squash *= Math.exp(-8 * realDt);
      if (P.dash) P.dash = Math.max(0, P.dash - realDt);
      const pos = P.body.getPosition();
      // trail
      if (P === this.lead || P.kind === 'kernel') {
        P.trailT -= dt;
        if (P.trailT <= 0 && !P.firstHit) {
          P.trailT = 0.045;
          if (P === this.lead) {
            this.currentTrail.push({ x: pos.x, y: pos.y, s: this.currentTrail.length % 3 === 0 ? 0.13 : 0.07 });
          }
          if (P.pound) this.fx.add({ x: pos.x, y: pos.y + 0.3, vx: 0, vy: 0, type: 'trailpuff', life: 0.25, size: 0.16, color: 'rgba(255,255,255,0.85)', g: 0, drag: 0 });
          if (P.dash) this.fx.add({ x: pos.x, y: pos.y, vx: 0, vy: 0, type: 'trailpuff', life: 0.3, size: 0.18, color: 'rgba(255,240,160,0.8)', g: 0, drag: 0 });
        }
      }
    }
    if (this.state === 'flight' || this.state === 'settle') {
      const p = this.players[this.turn];
      if (this.currentTrail.length) p.lastTrail = this.currentTrail;
    }
    this._tension(realDt);
    this._watchFooting(realDt);
    this._watchSpot();
  }

  // The make-or-break moments: a nut closing in on the other captain slows time (and zooms in when
  // it could finish them), a close miss gets an "아깝다!", and a low-HP captain feels its heart
  // pound while a nut is incoming. Presentation only: none of this touches the simulation.
  _tension(realDt) {
    const target = this.players[1 - this.turn];
    let danger = false;
    if (this.state === 'flight' && !target.dead && !this.silent) {
      const tp = target.body.getPosition();
      const tx = tp.x, ty = tp.y + HEAD.y * 0.5;
      for (const P of this.projectiles) {
        if (P.dead || (P.kind !== 'nut' && P.kind !== 'kernel')) continue;
        const pos = P.body.getPosition(), vel = P.body.getLinearVelocity();
        const dx = tx - pos.x, dy = ty - pos.y, d = Math.hypot(dx, dy);
        const closing = dx * vel.x + dy * vel.y > 0;
        this.shotMinD = Math.min(this.shotMinD ?? 99, d);
        if (closing && d < 14 && target.hp <= 30) danger = true;
        const sp = Math.hypot(vel.x, vel.y) || 1;
        const aimed = (dx * vel.x + dy * vel.y) / (d * sp) > 0.82; // really heading at them
        if (closing && !P.firstHit && !P.caught) {
          const potential = (P.kind === 'kernel' ? 12 : HIT_CAP) + (P.spec.blast ? P.spec.blast.dmg : 0);
          if (!this.killcamUsed && d < 3.6 && aimed && target.hp <= potential) {
            // this one could end it (once per shot, however many kernels)
            this.killcamUsed = true;
            P.tense = true;
            this.slowmo(0.9, 0.2);
            this.killcam = { p: target, t: 1.1 };
            this._sfx('whoosh');
            this._hap('heartbeat', 1);
          } else if (!P.tense && d < 3) {
            P.tense = true;
            this.slowmo(0.35, 0.5);
          }
        }
      }
      this._checkNearMiss(false);
    }
    // heart pounding while a nut flies at a captain on its last legs
    this.dangerT = clamp(this.dangerT + (danger ? realDt * 3 : -realDt * 2), 0, 1);
    if (danger) {
      this.beatT -= realDt;
      if (this.beatT <= 0) {
        this.beatT = 0.62;
        if (this.isMine(target) || this.opts.mode === 'pvp') {
          this._sfx('heartbeat', { vol: 0.8 });
          this._hap('heartbeat', 0.85);
        }
      }
    } else this.beatT = 0;
    if (this.killcam && (this.killcam.t -= realDt) <= 0) this.killcam = null;
    if (this.fallcam && (this.fallcam.t -= realDt) <= 0) this.fallcam = null;
  }

  // The CPU drove somewhere: say so in the world when that somewhere is a spot.
  _aiArrived(p) {
    if (this.silent || p.dead) return;
    const pos = p.body.getPosition();
    const s = spotsAt(this.land, pos.x).find((q) => q.kind !== 'pad');
    if (!s) return;
    const info = SPOT_INFO[s.kind];
    this.fx.text(pos.x, pos.y + 2.9, `${info.icon} ${info.name} 차지!`, info.color, 0.7, { life: 1.8 });
    this._sfx('select', { vol: 0.5 });
  }

  // Tell whoever is about to shoot what the spot under them does, when they step onto one.
  _watchSpot() {
    const p = this.players[this.turn];
    if (!this.land.spots || this.silent || p.dead || p.isAI || p.remote || this.state !== 'aim' || p.padFlight) return;
    const s = spotsAt(this.land, p.body.getPosition().x).find((q) => q.kind !== 'pad');
    const key = s ? s.kind : '';
    if (key === p.spotKey) return;
    p.spotKey = key;
    if (s) {
      const info = SPOT_INFO[s.kind];
      this.emit('spot', { text: `${info.icon} ${info.name}: ${info.desc}` });
      this._sfx('select', { vol: 0.5 });
    }
  }

  // Who is about to drop, who stands on cracking ground, who teeters at a cliff. Looks only.
  _watchFooting(realDt) {
    const live = this.damageOn && !this.silent && this.state !== 'intro';
    for (const p of this.players) {
      if (p.dead) { p.falling = false; continue; }
      const pos = p.body.getPosition(), v = p.body.getLinearVelocity();
      if (p.falling) {
        if (v.y > -1) { p.falling = false; if (this.fallcam && this.fallcam.p === p) this.fallcam = null; }
        continue;
      }
      if (live && v.y < -3.5 && !p.padFlight) {
        const by = pos.y - CART_R - 0.05;
        if ([-0.5, 0, 0.5].every((dx) => this.terrain.surfaceY(pos.x + dx, by) < WORLD.SEA + 0.3)) {
          this._startFall(p);
          continue;
        }
      }
      if (Math.abs(v.y) > 0.5) continue;
      const f = this._footing(p);
      p.support = f.support;
      p.edge = f.edge;
      const aiming = this.aim && p === this.players[this.turn];
      if (f.edge && live && !aiming && p.mood !== 'happy') { p.mood = 'scared'; p.moodT = 0.4; }
      // thin ground sheds crumbs from the underside of the island
      const thin = f.support > 0 && f.support < THIN_GROUND;
      p.crumbT = (p.crumbT || 0) - realDt;
      if (thin && live && p.crumbT <= 0) {
        p.crumbT = 0.25 + f.support * 0.35;
        const y = f.by - f.support - 0.1;
        this.fx.add({ x: pos.x + (Math.random() - 0.5) * 1.2, y, vx: (Math.random() - 0.5) * 0.4, vy: -0.5, type: 'rock', life: 1.2, size: 0.05 + Math.random() * 0.07, color: this.theme.ground.dirtDark, g: 0.7, drag: 0.3, rot: Math.random() * TAU, vr: 4 });
      }
    }
  }

  // It came within a whisker and did no harm. `landed`: the shot is over (all nuts gone).
  _checkNearMiss(landed) {
    if (this.nearMissShown || this.silent || (this.shotMinD ?? 99) > 1.7) return;
    const target = this.players[1 - this.turn];
    if (target.dead || target.hp < (this.shotTargetHp ?? 0) - 0.5) return;
    if (!landed) {
      const lead = this.lead;
      if (!lead || lead.dead) return;
      const tp = target.body.getPosition(), pos = lead.body.getPosition();
      if (Math.hypot(tp.x - pos.x, tp.y + 0.4 - pos.y) < this.shotMinD + 1.4) return; // not past it yet
    }
    this.nearMissShown = true;
    const tp = target.body.getPosition();
    this.fx.text(tp.x, tp.y + 2.9, '아깝다!', '#ffffff', 1.1, { life: 1.5 });
    this.crew?.react(this.players[this.turn], 'miss');
    this._sfx('sigh');
    this._hap('nearMiss');
    target.mood = 'scared';
    target.moodT = 1.2;
  }

  _poof(P) {
    if (P.dead) return;
    P.dead = true;
    this.killQueue.push(P.body);
    const pos = P.body.getPosition();
    // the spent nut cracks and crumbles away
    this.fx.burst(pos.x, pos.y, 'shell', 6, { speed: 3 });
    this.fx.burst(pos.x, pos.y, 'dust', 5, { speed: 1.4, color: 'rgba(255,255,255,0.9)' });
    this._sfx('crack', { vol: 0.35, pitch: 1.3 });
  }

  _updateCamera(realDt) {
    if (this.state === 'event' && this.events.boar) {
      const b = this.events.boar;
      this.cam.focus(b.x + b.dir * 3, b.y + 2.5, this.cam.baseZoom * 0.95, 5);
      return;
    }
    if (this.fallcam) {
      // ride along with a captain dropping into the clouds
      const pos = this.fallcam.p.body.getPosition();
      this.cam.focus(pos.x, Math.max(pos.y, WORLD.SEA + 1.5) + 0.8, this.cam.baseZoom * 1.1, 7);
      return;
    }
    if (this.killcam && this.lead && !this.lead.dead) {
      // lean in on the moment of truth
      const tp = this.killcam.p.body.getPosition(), pos = this.lead.body.getPosition();
      this.cam.focus((tp.x + pos.x) / 2, (tp.y + pos.y) / 2 + 1, this.cam.baseZoom * 1.45, 6);
      return;
    }
    if (this.cam.manual > 0 && this.state !== 'flight') return;
    const cur = this.players[this.turn];
    if (cur.padFlight && !cur.dead) {
      // a bounce across the gap: keep the cart and the far island in frame
      const pos = cur.body.getPosition(), v = cur.body.getLinearVelocity();
      this.cam.focus(pos.x + v.x * 0.5, Math.max(pos.y, 13) + 0.5, this.cam.baseZoom * 0.8, 4);
      return;
    }
    if (this.state === 'ai-move' && this.aiMove && !cur.dead) {
      const pos = cur.body.getPosition();
      this.cam.focus(pos.x + this.aiMove.dir * 3, pos.y + 1.2, this.cam.baseZoom, 3);
      return;
    }
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
    this.scene.drawAbyss(ctx, view, this.time, false);
    this.scene.drawBackTrees(ctx, view, this.time);
    this.forest.drawBehind(ctx);
    this.terrain.draw(ctx, this.theme.ground, this.pattern, view);
    for (const p of this.players) this._drawCracks(ctx, p);
    this.scene.drawFalls(ctx, view, this.time, this.terrain);
    this.forest.drawFront(ctx, view);

    const cur = this.players[this.turn];
    // previous shot trail
    if ((this.state === 'aim' || this.state === 'ai-aim' || this.state === 'remote') && cur.lastTrail.length) {
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
      if (B.mat === 'trunk' && Art.drawFallenTree) {
        Art.drawFallenTree(ctx, { x: pos.x, y: -pos.y, angle: -B.body.getAngle(), len: B.w, kind: B.treeKind, seed: B.seed });
        continue;
      }
      Art.drawBlock(ctx, {
        material: B.mat === 'trunk' ? 'log' : B.mat, shape: B.shape, x: pos.x, y: -pos.y, angle: -B.body.getAngle(),
        w: B.w, h: B.h, r: B.r, hp01: clamp(B.hp / B.maxHp, 0, 1), seed: B.seed, flash: B.flash,
      });
    }

    this.events.drawWorld(ctx, this.time, this._frameDt || 0.016);

    // spots (strips, signs, pads), then captains and their 깡단
    drawSpots(ctx, this, view);
    this.crew.drawBack(ctx);
    for (const p of this.players) this._drawCaptain(ctx, p);
    this.crew.drawFront(ctx);

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
      Art.drawNut(ctx, P.kind === 'kernel' ? 'kernel' : P.type, pos.x, -pos.y, P.spec.r, angle, {
        time: this.time, squash: P.squash, flip, state, lookX: flip ? -1 : 1, lookY: 0,
        fuse: P.kind === 'nut' && P.type === 'burr' ? (P.fuse > 0 ? clamp(1 - P.fuse / 1.15, 0.2, 1) : P.fuse < 0 ? 1 : 0) : 0,
        pound: !!P.pound,
      });
    }

    this.fx.draw(ctx);
    this.scene.drawAbyss(ctx, view, this.time, true);

    // aim guide
    if (this.aim && (this.state === 'aim' || this.state === 'ai-aim' || this.state === 'remote')) this._drawAimGuide(ctx, cur);

    // name tags + mini hp bars
    for (const p of this.players) this._drawTag(ctx, p);
    for (const m of this.emotes) this._drawEmote(ctx, m);
    this.fx.drawTexts(ctx, cam.zoom);
    this.crew.drawBubbles(ctx, cam.zoom);

    // screen-space overlays
    this.scene.drawAmbient(ctx, W, H, dpr, this.time);
    this.events.drawScreen(ctx, W, H, dpr, this.time, this._frameDt || 0.016);
    if (this.dangerT > 0.01) {
      // red pulse at the edges while a low-HP captain is in danger
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const pulse = 0.75 + 0.25 * Math.sin(this.time * 10);
      const gr = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.7);
      gr.addColorStop(0, 'rgba(200,20,20,0)');
      gr.addColorStop(1, `rgba(200,20,20,${0.42 * this.dangerT * pulse})`);
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, W, H);
    }
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
    const aiming = isCur && this.aim && (this.state === 'aim' || this.state === 'ai-aim' || this.state === 'remote');
    let pouch = null;
    if (aiming) {
      const a = Art.slingAnchors(x, y, p.facing);
      const pull = this.aim.power * MAX_PULL;
      pouch = { x: a.rest.x - Math.cos(this.aim.angle) * pull, y: a.rest.y + Math.sin(this.aim.angle) * pull };
    }
    const showAmmo = isCur && !p.dead && (this.state === 'aim' || this.state === 'ai-think' || this.state === 'ai-move' || this.state === 'ai-aim' || this.state === 'intro' || this.state === 'remote');
    Art.drawCommander(ctx, x, y, {
      team: p.team, facing: p.facing, time: this.time + p.id * 1.7, blink: p.blink > 0 ? 1 : 0,
      hurt: p.hurtT, hp: p.hp / HP_MAX, moving: p.moving, wheelAngle: p.wheel, dead: p.dead,
      pouch, aimPower: aiming ? this.aim.power : 0, mood: aiming ? 'aim' : p.mood,
    }, showAmmo ? (c) => {
      const a = Art.slingAnchors(x, y, p.facing);
      const px = pouch ? pouch.x : a.rest.x, py = pouch ? pouch.y : a.rest.y;
      const spec = AMMO[p.sel];
      let ang = 0;
      if (pouch) {
        const a2 = this.aim.angle;
        ang = clamp(p.facing > 0 ? -a2 : Math.atan2(Math.sin(a2), -Math.cos(a2)), -0.9, 0.9);
      }
      Art.drawNut(c, p.sel, px, py - spec.r * 0.35, spec.r, ang, {
        time: this.time, flip: p.facing < 0, state: aiming && this.aim.power > 0.6 ? 'fly' : 'idle',
        lookX: p.facing, lookY: 0, blink: 0, squash: pouch ? -this.aim.power * 0.15 : 0,
      });
    } : null);
  }

  // Ground giving way under a captain: cracks running from the wheels down through the island.
  _drawCracks(ctx, p) {
    if (p.dead || p.falling || !(p.support > 0 && p.support < THIN_GROUND)) return;
    const k = clamp((THIN_GROUND - p.support) / 1.3, 0.25, 1);
    const pos = p.body.getPosition();
    const top = -(pos.y - CART_R + 0.02), depth = p.support;
    const r = rng(p.id * 977 + 13);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = `rgba(25,10,4,${0.55 + 0.4 * k})`;
    ctx.lineWidth = 0.075 + 0.04 * k;
    ctx.beginPath();
    const n = 2 + Math.round(k * 3);
    for (let c = 0; c < n; c++) {
      let x = pos.x + (c - (n - 1) / 2) * 0.45, y = top;
      ctx.moveTo(x, y);
      const steps = 4 + Math.round(k * 3);
      for (let i = 0; i < steps; i++) {
        x += (r() - 0.5) * 0.5;
        y += (depth * (0.4 + 0.6 * k)) / steps;
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    if (k > 0.6) {
      // a glint of sky through the worst of it
      ctx.strokeStyle = `rgba(255,255,255,${0.25 * Math.max(0, Math.sin(this.time * 6))})`;
      ctx.lineWidth = 0.03;
      ctx.stroke();
    }
    ctx.restore();
  }

  _drawTag(ctx, p) {
    if (p.dead) return;
    const pos = p.body.getPosition();
    const z = this.cam.zoom;
    const x = pos.x, y = -pos.y - 2.6; // above the 깡이 sitting on the hat
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
    if (p === this.players[this.turn] && (this.state === 'aim' || this.state === 'ai-think' || this.state === 'ai-move' || this.state === 'ai-aim' || this.state === 'remote')) {
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

  _drawEmote(ctx, m) {
    const p = this.players[m.p];
    const pos = p.body.getPosition();
    const z = this.cam.zoom;
    const pop = m.t < 0.18 ? m.t / 0.18 : m.t > 2.1 ? Math.max(0, (2.4 - m.t) / 0.3) : 1;
    const s = (0.6 + 0.4 * pop) / z;
    ctx.save();
    ctx.translate(pos.x + p.facing * 0.2, -pos.y - 3.35 - Math.sin(Math.min(1, m.t * 3)) * 0.3);
    ctx.scale(s, s);
    ctx.globalAlpha = Math.min(1, pop * 1.4);
    ctx.fillStyle = '#fffaf0';
    ctx.strokeStyle = '#2b1a12';
    ctx.lineWidth = 3;
    roundRect(ctx, -30, -30, 60, 52, 18);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-8, 21); ctx.lineTo(0, 34); ctx.lineTo(8, 21);
    ctx.fill();
    ctx.stroke();
    ctx.fillRect(-9, 17, 18, 5);
    ctx.font = '34px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000';
    ctx.fillText(m.e, 0, -3);
    ctx.restore();
  }

  _drawAimGuide(ctx, p) {
    const a = this.aim;
    const rest = this.restPos(p);
    const v = a.power * VMAX;
    let vx = Math.cos(a.angle) * v, vy = Math.sin(a.angle) * v;
    let x = rest.x, y = rest.y;
    const showGuide = this.opts.guide !== false && !a.ai;
    if (showGuide && a.power > 0.1) {
      // Only the first part of the arc (no wind): skill still matters. A lookout shows twice as much.
      const far = hasSpot(this.land, p.body.getPosition().x, 'high', 'crown');
      const steps = far ? 68 : 34;
      const h = 1 / 60;
      let n = 0;
      // stop the guide where it would clip terrain or a nearby block (e.g. your own wall)
      const solids = this.forest.solidBodies();
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
        for (const body of solids) {
          for (let f = body.getFixtureList(); f; f = f.getNext()) {
            if (f.isSensor()) continue;
            for (const [ox, oy] of [[0, 0], [0.3, 0], [-0.3, 0]]) {
              probe.x = px + ox; probe.y = py + oy;
              if (f.testPoint(probe)) return true;
            }
          }
        }
        return false;
      };
      for (let i = 0; i < 60 * (far ? 2.1 : 1.05) && n < steps; i++) {
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
      mark(pos.x, pos.y, TEAM[p.team].color, this.tagOf(p));
    }
    if (this.lead && !this.lead.dead && this.state === 'flight') {
      const pos = this.lead.body.getPosition();
      mark(pos.x, pos.y, '#fff', '●');
    }
    const drop = this.events.drop;
    if (drop) mark(drop.x, drop.showY ?? drop.y, '#ffd21f', '🎁');
  }

  // Short label for a captain: 나 / CPU / 친구 / 1P / 2P
  tagOf(p) {
    if (this.online) return p.remote ? '친구' : '나';
    if (this.opts.mode === 'cpu') return p.isAI ? 'CPU' : '나';
    return p.id === 0 ? '1P' : '2P';
  }

  _sfx(name, opts) {
    if (!this.silent) Sound.play(name, opts);
  }

  _stretch(t) {
    if (!this.silent) Sound.stretch(t);
  }

  // haptics, from this phone's point of view (see haptics.js)
  _hap(name, ...args) {
    if (!this.silent && this.damageOn) Haptics[name](...args);
  }

  // Whose side is "me" for haptics: my captain online / vs CPU; the shooter when sharing one phone.
  isMine(p) {
    if (this.online) return !p.remote;
    if (this.opts.mode === 'cpu') return !p.isAI;
    return p === this.players[this.turn];
  }

  // Drop any in-progress touches/aim (pause, app switch). Keeps a CPU aim untouched.
  cancelInput() {
    this.pointers.clear();
    this.pinch = null;
    if (this.aim && !this.aim.ai) this.aim = null;
    for (const p of this.players) if (!p.isAI) p.moveDir = 0;
    this._stretch(null);
  }

  destroy() {
    if (!this.silent) Sound.stretch(null);
  }
}

// How far our replay drifted from the shooter's result (debug/tests only).
function diffSnaps(a, b) {
  let pos = 0, hp = 0;
  a.p.forEach((e, i) => { pos = Math.max(pos, Math.abs(e[0] - b.p[i][0]), Math.abs(e[1] - b.p[i][1])); hp = Math.max(hp, Math.abs(e[4] - b.p[i][4])); });
  const bm = new Map(b.b.map((e) => [e[0], e]));
  let missing = 0;
  for (const e of a.b) {
    const o = bm.get(e[0]);
    if (!o) { missing++; continue; }
    bm.delete(e[0]);
    pos = Math.max(pos, Math.abs(e[1] - o[1]), Math.abs(e[2] - o[2]));
  }
  missing += bm.size;
  return { pos: pos / 1e4, hp: hp / 100, missing, ops: a.o.length === b.o.length && a.o.every((v, i) => v === b.o[i]) };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}
