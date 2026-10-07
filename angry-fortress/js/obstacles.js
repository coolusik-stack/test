// Forest obstacles that react to shots: acorn trees (shake loose nuts, topple when broken),
// spider webs (catch a nut for a moment), dandelions (flip the wind), beehives hung from
// branches (drop when the tree is hit) and nut baskets (bonus ammo). Also places the
// neutral props and each side's home tree.
import * as Art from './art.js';
import { WORLD } from './terrain.js';
import { PROPS, CRATE } from './levels.js';
import { TREE, WEB_HOLD, FALLNUT, AMMO } from './config.js';
import { clamp, lerp } from './util.js';

const planck = window.planck;
const V = (x, y) => planck.Vec2(x, y);
const NUT_OF = { oak: 'acorn', maple: 'acorn', pine: 'pinenut', chestnut: 'burr' };

export class Forest {
  constructor(game, rng) {
    this.g = game;
    this.r = rng;
    this.trees = [];
    this.webs = [];
    this.dandelions = [];
    this.stumps = [];
    this.bumpers = []; // giant toadstools anchored in the ground: nuts spring off them
    this.homes = [];
    this.terrainVersion = -1;
  }

  // ------------------------------------------------------------------ placement
  populate() {
    const g = this.g, r = this.r;
    const land = g.land;
    for (const p of g.players) {
      const x = p.body.getPosition().x - p.facing * 2.9;
      this.homes.push({ x, y: g.terrain.surfaceY(x), team: p.team, facing: p.facing, seed: r.int(1, 9999) });
    }
    this.taken = [];
    // a hand-made map: everything that matters is already where it was designed to be
    this._placeFeatures(land.features || {});
    this.terrainVersion = g.terrain.version;
  }

  // Each map's landmarks (see maps.js): its trees and nut baskets, and any boulders, log bridge or
  // bounce mushrooms it asks for.
  _placeFeatures(f) {
    const g = this.g, t = g.terrain;
    if (f.spire) this.taken.push([f.spire.x - 1.8, f.spire.x + 1.8]);
    if (f.tunnel) this.taken.push([f.tunnel.xa - 2, f.tunnel.xa + 1], [f.tunnel.xb - 1, f.tunnel.xb + 2]); // keep the mouths clear
    if (f.giant) {
      this._placeTree(f.giant.x, 'oak', { force: true, giant: true, h: 7.6, canopyR: 3.5, hp: TREE.hp * 2, nuts: 6, hive: true, web: false });
      this.taken.push([f.giant.x - 3.2, f.giant.x + 3.2]);
    }
    // a hand-made map's trees, exactly where they were designed to stand
    for (const o of f.trees || []) {
      this._placeTree(o.x, o.kind, { ...o, force: true, hp: TREE.hp * (o.hpMul || 1) });
      this.taken.push([o.x - o.room, o.x + o.room]);
    }
    if (f.bridge) {
      const b = f.bridge;
      const y = Math.max(t.surfaceY(b.x - b.span / 2 + 0.3), t.surfaceY(b.x + b.span / 2 - 0.3));
      g._makeBlock('log', 'box', b.x, y + 0.25, b.span, 0.46, 0);
      g._makeBlock('crate', 'box', b.x, y + 0.5 + 0.31, 0.76, 0.6, 0); // a basket right in the middle
      this.taken.push([b.x - b.span / 2 - 0.6, b.x + b.span / 2 + 0.6]);
    }
    for (const o of f.boulders || []) {
      g._makeBlock('stone', 'circle', o.x, t.surfaceY(o.x) + 0.72, 0, 0, 0.7);
      this.taken.push([o.x - 1.3, o.x + 1.3]);
    }
    for (const o of [...(f.islands || []), ...(f.crates || [])]) g._makeBlock('crate', 'box', o.x, t.surfaceY(o.x) + 0.32, 0.76, 0.6, 0);
    for (const o of f.bounce || []) {
      const b = { x: o.x, ground: t.surfaceY(o.x), seed: this.r.int(1, 9999), flash: 0 };
      this._bumperBody(b);
      this.bumpers.push(b);
      this.taken.push([o.x - 1.4, o.x + 1.4]);
    }
  }

  // Try x, then nudge left/right; returns the x used (number) or null.
  _tryAround(x, place, spread) {
    for (const dx of [0, 0.8, -0.8, 1.6, -1.6, 2.4, -2.4].filter((d) => Math.abs(d) <= spread)) {
      const xx = x + dx;
      if (place(xx)) return xx;
    }
    return null;
  }

  _free(a, b) {
    return this.taken.every(([p, q]) => b < p || a > q);
  }

  _flat(x, w, tol) {
    const t = this.g.terrain;
    let lo = Infinity, hi = -Infinity;
    for (let k = -1; k <= 1; k += 0.5) {
      const y = t.surfaceY(x + (k * w) / 2);
      if (y < WORLD.SEA + 0.8) return null;
      lo = Math.min(lo, y);
      hi = Math.max(hi, y);
    }
    return hi - lo <= tol ? hi : null;
  }

  _placeTree(x, kind, o = {}) {
    const g = this.g, r = this.r;
    const canopyR = o.canopyR ?? r.range(1.9, 2.4);
    if (!o.force && !this._free(x - canopyR * 0.7, x + canopyR * 0.7)) return false;
    const ground = o.force ? g.terrain.surfaceY(x) : this._flat(x, 1.2, 0.7);
    if (ground == null) return false;
    const h = o.h ?? r.range(5.0, 6.2);
    const hp = o.hp ?? TREE.hp;
    const tree = {
      x, ground, h, canopyR, kind, nuts: o.nuts ?? r.int(3, 6), hp, maxHp: hp,
      shake: 0, seed: r.int(1, 99999), dead: false, hive: null, web: null, giant: !!o.giant,
    };
    this._treeBodies(tree);
    this.trees.push(tree);
    this.taken.push([x - canopyR * 0.7, x + canopyR * 0.7]);
    const a = this.anchors(tree);
    // a beehive hanging from a branch on a rope
    if (o.hive ?? r() < 0.4) {
      const hive = g._makeBlock('hive', 'box', a.branch.x, a.branch.y - 1.3, 0.66, 0.66);
      tree.hive = { block: hive, blockId: hive.id, joint: null, released: false };
      this._hangHive(tree, hive);
    }
    // a spider web between trunk and branch
    if (o.web ?? r() < 0.45) {
      const web = { x: a.web.x, y: a.web.y, r: 0.95, tree, broken: 0, wobble: 0, holding: null, seed: r.int(1, 9999) };
      this._webBody(web);
      tree.web = web;
      this.webs.push(web);
    }
    return true;
  }

  _treeBodies(tree) {
    const g = this.g;
    const trunkH = tree.h - tree.canopyR * 0.35;
    tree.body = g.world.createBody({ type: 'static', position: V(tree.x, tree.ground) });
    // standing trunks stop nuts and blocks, but carts drive past in front of them
    tree.body.createFixture(planck.Box(0.32, trunkH / 2 + 0.2, V(0, trunkH / 2 - 0.2), 0), { friction: 0.8, filterCategoryBits: 0x0002 });
    tree.body.setUserData({ kind: 'tree', ref: tree });
    tree.canopy = g.world.createBody({ type: 'static', position: V(tree.x, tree.ground + tree.h) });
    tree.canopy.createFixture(planck.Circle(tree.canopyR * 0.85), { isSensor: true });
    tree.canopy.setUserData({ kind: 'canopy', ref: tree });
  }

  _hangHive(tree, hive) {
    const a = this.anchors(tree);
    tree.hive.joint = this.g.world.createJoint(new planck.RopeJoint({
      bodyA: tree.body, bodyB: hive.body,
      localAnchorA: V(a.branch.x - tree.x, a.branch.y - tree.ground), localAnchorB: V(0, 0.33), maxLength: 1.0,
    }));
    tree.hive.block = hive;
    hive.hanging = tree;
  }

  _webBody(web) {
    web.body = this.g.world.createBody({ type: 'static', position: V(web.x, web.y) });
    web.body.createFixture(planck.Circle(web.r * 0.9), { isSensor: true });
    web.body.setUserData({ kind: 'web', ref: web });
  }

  _dandelionBody(d) {
    d.body = this.g.world.createBody({ type: 'static', position: V(d.x, d.ground + d.h) });
    d.body.createFixture(planck.Circle(0.55), { isSensor: true });
    d.body.setUserData({ kind: 'dandelion', ref: d });
  }

  // Anchored toadstool: a springy cap on a stem. Indestructible, so it never needs saving.
  _bumperBody(b) {
    b.body = this.g.world.createBody({ type: 'static', position: V(b.x, b.ground) });
    b.body.createFixture(planck.Circle(V(0, 1.0), 0.78), { friction: 0.3, restitution: 1.05 });
    b.body.createFixture(planck.Box(0.25, 0.5, V(0, 0.4), 0), { friction: 0.6, restitution: 0.4 });
    b.body.setUserData({ kind: 'bumper', ref: b });
  }

  _stumpFor(tree) {
    const stump = { x: tree.x, ground: tree.ground, w: 0.95, h: 0.6, kind: tree.kind, seed: tree.seed };
    stump.body = this.g.world.createBody({ type: 'static', position: V(tree.x, tree.ground) });
    stump.body.createFixture(planck.Box(0.45, 0.4, V(0, 0.2), 0), { friction: 0.9 });
    stump.body.setUserData({ kind: 'stump' });
    this.stumps.push(stump);
    return stump;
  }

  // ------------------------------------------------------------------ lockstep state
  state() {
    return {
      t: this.trees.map((t) => [Math.round(t.hp * 100), t.nuts, t.dead ? 1 : 0, t.hive ? (t.hive.released ? 2 : 1) : 0]),
      w: this.webs.map((w) => (w.torn ? 1 : 0)),
      d: this.dandelions.map((d) => (d.done ? 1 : 0)),
    };
  }

  // Recreate every static forest body in the game's fresh world (blocks already exist).
  load(s, blockById) {
    this.stumps = [];
    this.trees.forEach((tree, i) => {
      const [hp, nuts, dead, hive] = s.t[i];
      tree.hp = hp / 100;
      tree.nuts = nuts;
      tree.dead = !!dead;
      tree.body = tree.canopy = null;
      if (tree.dead) this._stumpFor(tree);
      else this._treeBodies(tree);
      if (tree.hive) {
        const blk = blockById.get(tree.hive.blockId);
        tree.hive.joint = null;
        tree.hive.released = hive === 2 || !blk || tree.dead;
        if (blk) {
          tree.hive.block = blk;
          blk.hanging = tree;
          if (!tree.hive.released) this._hangHive(tree, blk);
        }
      }
    });
    this.webs.forEach((web, i) => {
      web.holding = null;
      web.body = null;
      web.torn = !!s.w[i];
      if (web.torn) web.broken = Math.max(web.broken, 0.001);
      else { web.broken = 0; this._webBody(web); }
    });
    for (const b of this.bumpers) this._bumperBody(b);
    this.dandelions.forEach((d, i) => {
      d.body = null;
      d.done = d.blowing = !!s.d[i];
      if (!d.done) { d.blown = 0; this._dandelionBody(d); }
    });
    this.terrainVersion = this.g.terrain.version;
  }

  // Branch and web points in world space (y up). The branch tip comes from the art module when
  // it provides one; the web always sits beside the trunk at mid height so shots can reach it.
  anchors(tree) {
    const side = tree.seed % 2 ? 1 : -1;
    let branch = { x: tree.x + side * 1.5, y: tree.ground + tree.h - tree.canopyR * 0.55 };
    if (Art.treeAnchors) {
      const a = Art.treeAnchors(this._artTree(tree));
      branch = { x: a.branch.x, y: -a.branch.y };
    }
    const wside = -(Math.sign(branch.x - tree.x) || side); // opposite the hive branch
    const webY = tree.ground + Math.max(1.7, (tree.h - tree.canopyR) * 0.6);
    return { branch, web: { x: tree.x + wside * 1.3, y: webY } };
  }

  _artTree(tree) {
    return { x: tree.x, y: -tree.ground, h: tree.h, canopyR: tree.canopyR, kind: tree.kind, nuts: tree.nuts, shake: tree.shake, time: this.g.time, hp01: clamp(tree.hp / tree.maxHp, 0, 1), seed: tree.seed };
  }

  _placeDandelion(x) {
    const g = this.g;
    if (!this._free(x - 0.5, x + 0.5)) return false;
    const ground = this._flat(x, 0.6, 0.6);
    if (ground == null) return false;
    const d = { x, ground, h: 1.1, headR: 0.45, blown: 0, blowing: false, seed: this.r.int(1, 9999) };
    this._dandelionBody(d);
    this.dandelions.push(d);
    this.taken.push([x - 0.5, x + 0.5]);
    return true;
  }

  _placeProp(x) {
    const r = this.r;
    const total = PROPS.reduce((s, p) => s + (p.weight || 1), 0);
    let pick = r() * total, prop = PROPS[0];
    for (const p of PROPS) { pick -= p.weight || 1; if (pick <= 0) { prop = p; break; } }
    return this._placeStructure(prop, x, 0.9);
  }

  _placeStructure(bp, x, tol) {
    const facing = x < WORLD.W / 2 ? 1 : -1;
    const xs = bp.blocks.map((b) => x + facing * b.x);
    const minX = Math.min(...xs) - 0.6, maxX = Math.max(...xs) + 0.6;
    if (!this._free(minX, maxX)) return false;
    const ground = this._flat((minX + maxX) / 2, maxX - minX, tol);
    if (ground == null) return false;
    this.g._placeStructure(bp, x, facing);
    this.taken.push([minX, maxX]);
    return true;
  }

  // ------------------------------------------------------------------ reactions
  // Called from begin-contact (world locked): only queue work.
  onSensor(P, obj) {
    const g = this.g;
    if (obj.kind === 'canopy') {
      const tree = obj.ref;
      if (tree.dead) return;
      P.canopies = P.canopies || new Set();
      if (P.canopies.has(tree)) return;
      P.canopies.add(tree);
      g.afterStep.push(() => this._hitCanopy(tree, P));
    } else if (obj.kind === 'web') {
      const web = obj.ref;
      if (web.broken || web.holding || P.caught || P.kind === 'fallnut') return;
      g.afterStep.push(() => this._catch(web, P));
    } else if (obj.kind === 'dandelion') {
      const d = obj.ref;
      if (d.blowing) return;
      d.blowing = true;
      g.afterStep.push(() => this._blowDandelion(d, P.body.getLinearVelocity().x));
    }
  }

  _hitCanopy(tree, P) {
    const g = this.g;
    if (P.dead || tree.dead) return;
    const pos = P.body.getPosition();
    const v = P.body.getLinearVelocity();
    const sp = Math.hypot(v.x, v.y);
    P.body.setLinearVelocity(V(v.x * TREE.slow, v.y * TREE.slow));
    tree.shake = 1;
    g.fx.burst(pos.x, pos.y, 'leaf', 10, { speed: 4, jitter: 0.6 });
    g._sfx('tree_shake', { vol: clamp(sp / 18, 0.4, 1) });
    this._dropNuts(tree, sp > 14 ? 2 : 1, P.owner);
    if (tree.hive && !tree.hive.released && (sp > 10 || this.r() < 0.6)) this._releaseHive(tree);
  }

  _dropNuts(tree, n, owner) {
    const g = this.g;
    n = Math.min(n + (this.r() < 0.35 ? 1 : 0), tree.nuts, TREE.maxDrop);
    for (let i = 0; i < n; i++) {
      tree.nuts--;
      const x = tree.x + this.r.range(-0.6, 0.6) * tree.canopyR;
      const y = tree.ground + tree.h - this.r.range(0.1, 0.5) * tree.canopyR;
      const q = g._spawnProjectile('fallnut', NUT_OF[tree.kind] || 'acorn', FALLNUT, owner || g.players[g.turn], x, y, this.r.range(-1, 1), -1);
      q.t = 1;
      setTimeout(() => g._sfx('nut_drop', { pitch: 0.9 + i * 0.12 }), i * 90);
    }
  }

  _releaseHive(tree) {
    const g = this.g;
    const h = tree.hive;
    if (!h || h.released) return;
    h.released = true;
    if (h.joint) { g.world.destroyJoint(h.joint); h.joint = null; }
    if (!h.block.dead) {
      h.block.dropped = true;
      h.block.body.setAwake(true);
      g._sfx('rope_snap');
      const p = h.block.body.getPosition();
      g.fx.text(p.x, p.y + 0.8, '툭!', '#ffd23a', 0.7, { life: 0.9 });
    }
  }

  _catch(web, P) {
    const g = this.g;
    if (P.dead || web.broken || web.holding) return;
    web.holding = P;
    web.wobble = 1;
    P.caught = WEB_HOLD;
    P.web = web;
    P.body.setGravityScale(0);
    P.body.setLinearVelocity(V(0, 0));
    P.body.setAngularVelocity(0);
    const pos = P.body.getPosition();
    g._sfx('web');
    g.fx.text(pos.x, pos.y + 0.9, '끈적!', '#f4f4ff', 0.75, { life: 1.0 });
  }

  // Let go of a caught nut (hold time over, or the player used its ability).
  release(P) {
    const g = this.g;
    const web = P.web;
    P.caught = 0;
    P.web = null;
    if (!P.dead) P.body.setGravityScale(1);
    if (web) this._tearWeb(web);
    g._sfx('web_tear', { vol: 0.8 });
  }

  _tearWeb(web) {
    if (web.torn) return;
    web.torn = true;
    web.holding = null;
    if (web.body) { this.g.world.destroyBody(web.body); web.body = null; }
  }

  _blowDandelion(d, vx) {
    const g = this.g;
    if (d.blown >= 1 || d.done) return;
    d.done = true;
    const prev = g.wind;
    g.wind = prev ? -prev : vx >= 0 ? 4 : -4;
    g.fx.burst(d.x, d.ground + d.h, 'seed', 18, { speed: 2.5 });
    g.fx.text(d.x, d.ground + d.h + 1.1, '바람 반전!', '#ffffff', 0.85, { life: 1.4 });
    g._sfx('seeds');
    g.emit('wind', { wind: g.wind });
    if (d.body) { g.world.destroyBody(d.body); d.body = null; }
  }

  // ------------------------------------------------------------------ damage
  damageTree(tree, dmg, fromX) {
    if (tree.dead || dmg <= 0) return;
    tree.hp -= dmg;
    tree.shake = Math.max(tree.shake, clamp(dmg / 40, 0.3, 1));
    if (tree.hp <= 0) {
      tree.dead = true;
      const dir = fromX == null ? (this.r() < 0.5 ? -1 : 1) : Math.sign(tree.x - fromX) || 1;
      this.g.afterStep.push(() => this._topple(tree, dir));
    }
  }

  onExplosion(x, y, r, dmg, owner) {
    for (const tree of this.trees) {
      if (tree.dead) continue;
      // distance to the trunk segment and to the canopy
      const ty = clamp(y, tree.ground, tree.ground + tree.h);
      const dTrunk = Math.hypot(x - tree.x, y - ty) - 0.35;
      const dCanopy = Math.hypot(x - tree.x, y - (tree.ground + tree.h)) - tree.canopyR;
      if (dCanopy < r * 0.8) {
        tree.shake = 1;
        this._dropNuts(tree, 2, owner);
        if (tree.hive && !tree.hive.released) this._releaseHive(tree);
      }
      if (dTrunk < r) this.damageTree(tree, dmg * 2.2 * (1 - Math.max(0, dTrunk) / r), x);
    }
    for (const web of this.webs) {
      if (!web.torn && Math.hypot(x - web.x, y - web.y) < r + web.r) {
        if (web.holding) this.release(web.holding);
        else this._tearWeb(web);
      }
    }
    for (const d of this.dandelions) {
      if (!d.done && Math.hypot(x - d.x, y - (d.ground + d.h)) < r + 0.4) this._blowDandelion(d, d.x - x);
    }
  }

  _topple(tree, dir) {
    const g = this.g;
    if (tree.body) { g.world.destroyBody(tree.body); tree.body = null; }
    if (tree.canopy) { g.world.destroyBody(tree.canopy); tree.canopy = null; }
    if (tree.hive && !tree.hive.released) this._releaseHive(tree);
    if (tree.web) {
      if (tree.web.holding) this.release(tree.web.holding);
      this._tearWeb(tree.web);
    }
    this._dropNuts(tree, tree.nuts, g.players[g.turn]);
    // stump stays behind
    this._stumpFor(tree);
    // the felled trunk is a heavy dynamic log that crashes down
    const len = Math.max(2.4, tree.h - 0.2);
    const B = g._makeBlock('trunk', 'box', tree.x, tree.ground + 0.65 + len / 2, len, 0.7, 0, Math.PI / 2);
    B.treeKind = tree.kind;
    g.blockSpecs[B.id].treeKind = tree.kind;
    B.lastHitBy = g.turn;
    B.body.setAngularVelocity(-dir * 0.7);
    B.body.setLinearVelocity(V(dir * 0.8, 0));
    g.fx.burst(tree.x, tree.ground + tree.h, 'leaf', 26, { speed: 5, jitter: tree.canopyR });
    g.fx.burst(tree.x, tree.ground + 0.6, 'wood', 12, { speed: 5 });
    g.fx.text(tree.x, tree.ground + tree.h + 1.6, '나무가 쓰러진다!', '#ffe45c', 0.9, { life: 1.6 });
    g.fx.shake(0.3);
    g._sfx('timber');
    g._hap('topple');
  }

  // ------------------------------------------------------------------ per frame (looks only)
  update(dt) {
    for (const tree of this.trees) tree.shake = Math.max(0, tree.shake - dt * 1.6);
    for (const web of this.webs) {
      web.wobble = Math.max(0, web.wobble - dt * 2);
      if (web.torn) web.broken = Math.min(1, web.broken + dt * 3);
    }
    for (const d of this.dandelions) if (d.done) d.blown = Math.min(1, d.blown + dt * 2.5);
    for (const b of this.bumpers) b.flash = Math.max(0, b.flash - dt * 4);
  }

  // ------------------------------------------------------------------ per physics tick
  tick() {
    const g = this.g;
    // trees lose their footing when the ground under them is blown away
    if (g.terrain.version !== this.terrainVersion) {
      this.terrainVersion = g.terrain.version;
      for (const tree of this.trees) {
        if (tree.dead) continue;
        const t = g.terrain;
        const y = tree.ground - 0.3;
        if (!t.solid(tree.x, y) && !t.solid(tree.x - 0.35, y) && !t.solid(tree.x + 0.35, y)) {
          tree.dead = true;
          g.afterStep.push(() => this._topple(tree, this.r() < 0.5 ? -1 : 1));
        }
      }
      for (const d of this.dandelions) {
        if (!d.done && !g.terrain.solid(d.x, d.ground - 0.2)) this._blowDandelion(d, 0);
      }
    }
  }

  // Keep a caught nut pinned in the web; called every physics step.
  holdCaught(P, dt) {
    P.caught -= dt;
    P.body.setLinearVelocity(V(0, 0));
    if (P.caught <= 0) this.release(P);
  }

  // Obstacles the CPU planner should know about (world space).
  aiObstacles() {
    const solid = [], soft = [];
    for (const tree of this.trees) {
      if (tree.dead) continue;
      for (let y = tree.ground + 0.4; y < tree.ground + tree.h - tree.canopyR * 0.4; y += 0.6) solid.push({ x: tree.x, y, rad: 0.38 });
      soft.push({ x: tree.x, y: tree.ground + tree.h, rad: tree.canopyR * 0.85, slow: TREE.slow });
    }
    for (const web of this.webs) if (!web.torn) solid.push({ x: web.x, y: web.y, rad: web.r * 0.9 });
    for (const s of this.stumps) solid.push({ x: s.x, y: s.ground + 0.25, rad: 0.5 });
    for (const b of this.bumpers) solid.push({ x: b.x, y: b.ground + 1.0, rad: 0.8 });
    return { solid, soft };
  }

  // Static bodies the aim guide should stop at.
  solidBodies() {
    const out = [];
    for (const tree of this.trees) if (tree.body) out.push(tree.body);
    for (const s of this.stumps) if (s.body) out.push(s.body);
    for (const b of this.bumpers) if (b.body) out.push(b.body);
    return out;
  }

  // ------------------------------------------------------------------ drawing
  drawBehind(ctx) {
    if (!Art.drawHomeTree) return;
    for (const h of this.homes) Art.drawHomeTree(ctx, { x: h.x, y: -h.y, team: h.team, facing: h.facing, time: this.g.time, seed: h.seed, season: this.g.theme.season, wind: this.g.wind });
  }

  drawFront(ctx, view) {
    const g = this.g;
    const inView = (x, pad) => x > view.x0 - pad && x < view.x1 + pad;
    for (const s of this.stumps) {
      if (!inView(s.x, 2)) continue;
      if (Art.drawStump) Art.drawStump(ctx, { x: s.x, y: -s.ground, w: s.w, h: s.h, kind: s.kind, seed: s.seed });
    }
    for (const b of this.bumpers) {
      if (!inView(b.x, 2)) continue;
      const sq = b.flash * 0.12; // a squash when something bounces off
      Art.drawBlock(ctx, { material: 'mushroom', shape: 'box', x: b.x, y: -(b.ground + 0.8 - sq * 0.8), angle: 0, w: 1.7 * (1 + sq), h: 1.7 * (1 - sq), hp01: 1, seed: b.seed, flash: 0 });
    }
    for (const tree of this.trees) {
      if (tree.dead || !inView(tree.x, tree.canopyR + 1)) continue;
      if (Art.drawTree) Art.drawTree(ctx, this._artTree(tree));
      else this._fallbackTree(ctx, tree);
    }
    // ropes for hanging hives
    ctx.strokeStyle = '#6b4a2a';
    ctx.lineWidth = 0.05;
    ctx.lineCap = 'round';
    for (const tree of this.trees) {
      const h = tree.hive;
      if (!h || h.released || !h.joint || h.block.dead) continue;
      const a = h.joint.getAnchorA(), b = h.joint.getAnchorB();
      ctx.beginPath();
      ctx.moveTo(a.x, -a.y);
      ctx.quadraticCurveTo((a.x + b.x) / 2 + 0.05, -(a.y + b.y) / 2 + 0.05, b.x, -b.y);
      ctx.stroke();
    }
    for (const web of this.webs) {
      if (web.broken >= 1 || !inView(web.x, 2)) continue;
      const tree = web.tree;
      const anchors = [
        { x: tree.x + Math.sign(web.x - tree.x) * 0.3, y: -(web.y + 0.4) },
        { x: tree.x + Math.sign(web.x - tree.x) * 0.3, y: -(web.y - 0.7) },
        { x: web.x + Math.sign(web.x - tree.x) * 0.5, y: -(tree.ground + tree.h - tree.canopyR * 0.75) },
      ];
      if (Art.drawWeb) Art.drawWeb(ctx, { x: web.x, y: -web.y, r: web.r, anchors, broken: web.broken, wobble: web.wobble, time: g.time, seed: web.seed });
    }
    for (const d of this.dandelions) {
      if (!inView(d.x, 1)) continue;
      if (Art.drawDandelion) Art.drawDandelion(ctx, { x: d.x, y: -d.ground, h: d.h, headR: d.headR, blown: d.blown, time: g.time, seed: d.seed });
    }
  }

  _fallbackTree(ctx, tree) {
    ctx.fillStyle = '#6b4a2a';
    ctx.fillRect(tree.x - 0.35, -(tree.ground + tree.h), 0.7, tree.h);
    ctx.fillStyle = '#4f9a45';
    ctx.beginPath();
    ctx.arc(tree.x, -(tree.ground + tree.h), tree.canopyR, 0, Math.PI * 2);
    ctx.fill();
  }
}

export { NUT_OF, AMMO };
