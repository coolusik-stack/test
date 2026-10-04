// CPU opponent: brute-force ballistic search over angle × power using the same
// integrator as the physics engine, then scores each landing per bird type. Besides damage it
// weighs how much ground a shot takes out from under the other captain: on floating islands,
// digging someone out is a win. Before it shoots it may drive somewhere better (planMove).
import { GRAV, VMAX, WIND_ACC, AMMO, POUND_SPEED, CART_R, HEAD, THIN_GROUND, CRUMBLE, CLIFF_STOP, STAMINA_PER_M, CLIMB_COST, SUPPLY } from './config.js';
import { WORLD } from './terrain.js';
import { hasSpot, spotsAt, padAt, PAD_COST, POCKET } from './spots.js';

const H = 1 / 60;
// sa/sp: angle (deg) and power error; learn: error floor as the CPU zeroes in over its shots.
const PROFILE = {
  easy: { sa: 5.5, sp: 0.065, wind: [0, 0.45], special: 0.35, learn: 0.8 },
  normal: { sa: 3.0, sp: 0.035, wind: [0.75, 1.1], special: 0.65, learn: 0.55 },
  hard: { sa: 1.0, sp: 0.013, wind: [0.95, 1.05], special: 1, learn: 0.4 },
};

function gauss() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function planShot(game, me, difficulty) {
  const prof = PROFILE[difficulty] || PROFILE.normal;
  const windK = prof.wind[0] + Math.random() * (prof.wind[1] - prof.wind[0]);
  const { best, closest, dir } = searchShots(game, me, { windK });
  let plan = best && best.dmg > 2 ? best : closest || { angle: dir > 0 ? 0.8 : Math.PI - 0.8, power: 0.75, type: 'acorn', abilityAt: null };
  // if we are just chipping at the fort, a bomb helps clear it
  if ((!best || best.dmg <= 2) && me.ammo.burr > 0 && Math.random() < prof.special) {
    plan = { ...plan, type: 'burr', abilityAt: null };
  }
  // less skilled CPUs don't always use specials
  if (plan.type !== 'acorn' && Math.random() > prof.special) plan = { ...plan, type: 'acorn', abilityAt: null };

  // human-like error that shrinks as the CPU "learns" the range; a lookout steadies the hand
  let learn = Math.max(prof.learn, 1.35 - 0.15 * me.stats.shots);
  if (hasSpot(game.land, me.body.getPosition().x, 'high', 'crown')) learn *= 0.6;
  const angErr = ((gauss() * prof.sa * Math.PI) / 180) * learn;
  const pwErr = gauss() * prof.sp * learn;
  return {
    type: plan.type,
    angle: plan.angle + angErr * (dir > 0 ? 1 : -1),
    power: Math.min(1, Math.max(0.2, plan.power + pwErr)),
    abilityAt: plan.abilityAt,
  };
}

// Brute-force ballistic search for the best shot. `at` pretends the cart stands somewhere else
// (the move planner asks "what could I hit from over there?"); `coarse` skips the refine pass.
function searchShots(game, me, { windK = 1, at = null, coarse = false } = {}) {
  const enemy = game.players[1 - me.id];
  const ep = enemy.body.getPosition();
  const real = me.body.getPosition();
  const mp = at || { x: real.x, y: real.y };
  const dir = Math.sign(ep.x - mp.x) || -1;
  const saved = me.facing;
  me.facing = dir;
  const r0 = game.restPos(me);
  me.facing = saved;
  const rest = { x: r0.x - real.x + mp.x, y: r0.y - real.y + mp.y };

  const wax = game.wind * WIND_ACC * windK;
  const terrain = game.terrain;

  // bucket blocks by x for fast lookup
  const buckets = new Map();
  const addOb = (ob) => {
    for (let bx = Math.floor((ob.x - ob.rad - 0.5) / 2); bx <= Math.floor((ob.x + ob.rad + 0.5) / 2); bx++) {
      if (!buckets.has(bx)) buckets.set(bx, []);
      buckets.get(bx).push(ob);
    }
  };
  for (const B of game.blocks) {
    const p = B.body.getPosition();
    if (B.shape === 'circle') { addOb({ x: p.x, y: p.y, rad: B.r }); continue; }
    // boxes become a row of circles along their long axis (planks are long and thin)
    const a = B.body.getAngle();
    const long = Math.max(B.w, B.h), short = Math.min(B.w, B.h);
    const ax = B.w >= B.h ? Math.cos(a) : -Math.sin(a);
    const ay = B.w >= B.h ? Math.sin(a) : Math.cos(a);
    const rad = short * 0.55 + 0.02;
    const n = Math.max(1, Math.ceil((long - short) / (short * 0.8)) + 1);
    for (let k = 0; k < n; k++) {
      const t = n === 1 ? 0 : (k / (n - 1) - 0.5) * (long - short);
      addOb({ x: p.x + ax * t, y: p.y + ay * t, rad: n === 1 ? Math.hypot(B.w, B.h) * 0.5 : rad });
    }
  }

  // forest: trunks, webs and stumps block; canopies slow a nut down once
  const forest = game.forest ? game.forest.aiObstacles() : { solid: [], soft: [] };
  for (const ob of forest.solid) addOb(ob);
  const soft = forest.soft;

  const r = 0.36;
  const sim = (x, y, vx, vy, rad, maxT, selfCheck) => {
    const steps = Math.round(maxT / H);
    let entered = 0;
    for (let i = 1; i <= steps; i++) {
      vx += wax * H;
      vy -= GRAV * H;
      x += vx * H;
      y += vy * H;
      for (let k = 0; k < soft.length; k++) {
        const c = soft[k];
        if (!(entered & (1 << k)) && Math.abs(x - c.x) < c.rad + rad && Math.hypot(x - c.x, y - c.y) < c.rad + rad) {
          entered |= 1 << k;
          vx *= c.slow;
          vy *= c.slow;
        }
      }
      const t = i * H;
      if (y < WORLD.SEA) return { x, y, t, vx, vy, kind: 'water' };
      if (x < -6 || x > WORLD.W + 6) return { x, y, t, vx, vy, kind: 'out' };
      if (y < WORLD.H && terrain.sample(x, y) < rad * 0.8) return { x, y, t, vx, vy, kind: 'terrain' };
      if (Math.hypot(x - ep.x, y - ep.y) < CART_R + rad || Math.hypot(x - ep.x, y - ep.y - HEAD.y) < HEAD.r + rad) return { x, y, t, vx, vy, kind: 'enemy' };
      if (selfCheck && t > 0.45 && (Math.hypot(x - mp.x, y - mp.y) < CART_R + rad || Math.hypot(x - mp.x, y - mp.y - HEAD.y) < HEAD.r + rad)) return { x, y, t, vx, vy, kind: 'self' };
      const list = buckets.get(Math.floor(x / 2));
      if (list) {
        for (const ob of list) {
          if (Math.abs(x - ob.x) < ob.rad + rad && Math.abs(y - ob.y) < ob.rad + rad && Math.hypot(x - ob.x, y - ob.y) < ob.rad + rad) {
            return { x, y, t, vx, vy, kind: 'block' };
          }
        }
      }
    }
    return { x, y, t: maxT, vx, vy, kind: 'none' };
  };

  // ---- digging: how much of the island under the enemy a set of removed circles takes away
  const eb = ep.y - CART_R + 0.05; // bottom of their cart
  const solidAfter = (x, y, rem) => {
    if (terrain.sample(x, y) >= 0) return false;
    for (const c of rem) if ((x - c[0]) * (x - c[0]) + (y - c[1]) * (y - c[1]) < c[2] * c[2]) return false;
    return true;
  };
  // [thickness of the ground right under the cart, where that ground ends]
  const supportAfter = (x, rem) => {
    let y = eb - 0.1;
    while (y > eb - 0.5 && !solidAfter(x, y, rem)) y -= 0.25;
    if (y <= eb - 0.5) return [0, y];
    const top = y;
    while (y > top - 8 && y > 0 && solidAfter(x, y, rem)) y -= 0.25;
    return [top - y, y];
  };
  const caughtBelow = (x, from, rem) => {
    for (let y = from - 0.1; y > WORLD.SEA; y -= 0.3) if (solidAfter(x, y, rem)) return true;
    return false;
  };
  const COLS = [-0.5, 0, 0.5];
  const before = COLS.map((dx) => supportAfter(ep.x + dx, [])[0]);
  // falling behind makes the CPU go for the island instead of the captain
  const behind = 1 + Math.max(0, (me.hp - enemy.hp) < 0 ? (enemy.hp - me.hp) / 35 : 0);
  const digScore = (rem) => {
    if (!rem.some((c) => Math.abs(c[0] - ep.x) < c[2] + 0.8 && c[1] - c[2] < eb)) return 0;
    const after = COLS.map((dx) => supportAfter(ep.x + dx, rem));
    const t = after.map((a) => a[0]);
    // nothing left, or an already-cracked crust that this hit breaks: the cart drops through
    if (t[1] === 0 || (before[1] > 0 && before[1] < CRUMBLE) || t.filter((v) => v === 0).length >= 2) {
      const caught = COLS.some((dx, k) => caughtBelow(ep.x + dx, after[k][1], rem));
      return caught ? 14 : enemy.hp + 40;
    }
    let lost = 0;
    for (let k = 0; k < 3; k++) lost += Math.max(0, before[k] - t[k]) / 3;
    const thin = Math.min(...t);
    return (lost * 5 + (thin < THIN_GROUND ? (THIN_GROUND - thin) * 9 : 0)) * behind;
  };
  const drillRem = (x, y) => {
    const D = AMMO.walnut.drill, rem = [];
    for (let d = 0; d <= D.depth + 0.01; d += 0.45) rem.push([x, y - d, D.r]);
    rem.push([x, y - D.depth, AMMO.walnut.blast.crater]);
    return rem;
  };

  const blastDmg = (x, y, spec) => {
    const d = Math.max(0, Math.min(Math.hypot(x - ep.x, y - ep.y) - CART_R * 0.6, Math.hypot(x - ep.x, y - ep.y - HEAD.y) - HEAD.r * 0.6));
    const self = Math.max(0, Math.hypot(x - mp.x, y - mp.y) - CART_R * 0.6);
    let v = d < spec.r ? spec.dmg * Math.pow(1 - d / spec.r, 0.8) : 0;
    if (v > 0 && game._covered(x, y, ep.x, ep.y + 0.35)) v *= 0.35; // they sit under a roof of solid ground
    if (self < spec.r + 0.8) v -= 60;
    return v;
  };

  const types = ['acorn'];
  for (const t of ['burr', 'walnut', 'peanut']) if (me.ammo[t] > 0) types.push(t);

  let best = null;
  let closest = null;
  // Scores one launch for every available bird; returns a ranking value that also
  // rewards near misses so the refine pass knows where to look.
  const evalShot = (deg, pw) => {
    const a = (deg * Math.PI) / 180;
    const angle = dir > 0 ? a : Math.PI - a;
    const v = pw * VMAX;
    const vx0 = Math.cos(angle) * v, vy0 = Math.sin(angle) * v;
    const hit = sim(rest.x, rest.y, vx0, vy0, r, 7, true);
    const d = Math.hypot(hit.x - ep.x, hit.y - ep.y);
    if (hit.kind !== 'water' && hit.kind !== 'out' && hit.kind !== 'self' && hit.kind !== 'none') {
      const selfD = Math.hypot(hit.x - mp.x, hit.y - mp.y);
      if (selfD > 4 && (!closest || d < closest.d)) closest = { d, angle, power: pw, type: 'acorn', abilityAt: null };
    }
    let top = -Infinity;
    for (const type of types) {
      let dmg = 0;
      let abilityAt = null;
      if (hit.kind === 'self') dmg = -40;
      else if (type === 'acorn') {
        if (hit.kind === 'enemy') dmg = 28;
        else if (hit.kind === 'terrain' || hit.kind === 'block') dmg = d < 1.8 ? 12 * (1 - d / 1.8) : 0;
        if (hit.kind === 'terrain' && d < 4) {
          const sp = Math.hypot(hit.vx, hit.vy) || 1;
          const rr = AMMO.acorn.dent * Math.min(1.2, Math.max(0.6, sp / 20));
          dmg += digScore([[hit.x + (hit.vx / sp) * r, hit.y + (hit.vy / sp) * r, rr]]);
        }
      } else if (type === 'burr') {
        if (hit.kind === 'enemy') dmg = AMMO.burr.blast.dmg + 6;
        else if (hit.kind === 'terrain' || hit.kind === 'block') {
          dmg = blastDmg(hit.x, hit.y, AMMO.burr.blast);
          if (hit.kind === 'terrain' && d < 5) dmg += digScore([[hit.x, hit.y, AMMO.burr.blast.crater]]);
          abilityAt = Math.max(0.1, hit.t - H * 2);
        }
        dmg -= 8; // save bombs for when they matter
      } else if (type === 'peanut') {
        if (hit.kind === 'enemy') dmg = 22;
        else if (hit.kind === 'terrain' || hit.kind === 'block') dmg = d < 2.2 ? 20 * (1 - d / 2.2) : 0;
        abilityAt = hit.t * 0.62;
        dmg -= 4;
      } else if (type === 'walnut') {
        // slam straight down from above the enemy (a head-on hit), or just beside them, where
        // the walnut drills into the ground and blows the island out from under them
        const OFFS = [0, -0.9, 0.9, -1.5, 1.5];
        const found = new Map();
        let x = rest.x, y = rest.y, vx = vx0, vy = vy0, px = x;
        for (let i = 1; i * H < hit.t && found.size < OFFS.length; i++) {
          vx += wax * H; vy -= GRAV * H; x += vx * H; y += vy * H;
          for (const o of OFFS) {
            const gx = ep.x + o;
            if (!found.has(o) && (px - gx) * (x - gx) <= 0 && y > ep.y + 1.2) found.set(o, { x, y, t: i * H });
          }
          px = x;
        }
        let bestW = -Infinity;
        for (const c of found.values()) {
          const e = sim(c.x, c.y, 0, -POUND_SPEED, AMMO.walnut.r, 4, false);
          let v = 0;
          if (e.kind === 'enemy') v = AMMO.walnut.blast.dmg + 4;
          else if (e.kind === 'terrain') {
            const by = e.y - AMMO.walnut.drill.depth;
            v = blastDmg(e.x, by, AMMO.walnut.blast) + digScore(drillRem(e.x, e.y));
          } else if (e.kind === 'block') v = blastDmg(e.x, e.y, AMMO.walnut.blast);
          if (v > bestW) { bestW = v; abilityAt = c.t; }
        }
        if (found.size) dmg = bestW;
        else if (hit.kind === 'enemy') dmg = 26;
        dmg -= 6;
      }
      if (dmg > 0 && hit.kind === 'block' && d < 4) dmg += 2;
      if (!best || dmg > best.dmg) best = { dmg, angle, power: pw, type, abilityAt };
      top = Math.max(top, dmg);
    }
    const near = hit.kind === 'terrain' || hit.kind === 'block' || hit.kind === 'enemy' ? Math.max(0, 8 - d) : 0;
    return top + near;
  };

  // coarse grid, then refine around the three most promising spots
  const coarseList = [];
  const dDeg = coarse ? 5 : 3, dPw = coarse ? 0.07 : 0.04;
  for (let deg = 10; deg <= 82; deg += dDeg) {
    for (let pw = 0.32; pw <= 1.0001; pw += dPw) coarseList.push({ deg, pw, score: evalShot(deg, pw) });
  }
  if (!coarse) {
    coarseList.sort((a, b) => b.score - a.score);
    const seeds = [];
    for (const c of coarseList) {
      if (seeds.length >= 3) break;
      if (seeds.every((q) => Math.abs(q.deg - c.deg) > 4 || Math.abs(q.pw - c.pw) > 0.06)) seeds.push(c);
    }
    for (const c of seeds) {
      for (let deg = c.deg - 3; deg <= c.deg + 3.001; deg += 0.75) {
        if (deg < 5 || deg > 86) continue;
        for (let pw = c.pw - 0.04; pw <= c.pw + 0.0401; pw += 0.01) {
          if (pw < 0.25 || pw > 1) continue;
          evalShot(deg, pw);
        }
      }
    }
  }
  return { best, closest, dir };
}

// ------------------------------------------------------------------ positioning
// Before it shoots, the CPU may drive somewhere better: off cracking ground and away from the
// edge, up to a lookout, into the burrow, under the nut tree, or across a mushroom pad.
// A generator so the work spreads over a few ticks: each yield is one place looked at.
// Returns { x, dir } to drive to, or null to stay put.
const MOVE = {
  // chance: thinks about moving at all; notice: sees the ground cracking under it
  easy: { chance: 0.4, notice: 0.35, noise: 9, spots: 0.5, look: 3 },
  normal: { chance: 0.75, notice: 0.7, noise: 4, spots: 0.85, look: 5 },
  hard: { chance: 1, notice: 1, noise: 1.2, spots: 1, look: 6 },
};

export function* planMove(game, me, difficulty) {
  const prof = MOVE[difficulty] || MOVE.normal;
  const ter = game.terrain, land = game.land;
  const pos = me.body.getPosition();
  const x0 = pos.x, foot0 = pos.y - CART_R;

  // 1. where the cart can get to this turn, walking the ground the way the cart drives it
  const cands = [{ x: x0, foot: foot0, dist: 0, dir: 0, pad: false }];
  for (const dir of [-1, 1]) {
    let x = x0, foot = foot0, stam = me.stamina, dist = 0, pad = false, since = 0;
    for (let guard = 0; guard < 500 && stam > STAMINA_PER_M * 0.5; guard++) {
      const p = padAt(land, x, dir);
      if (p) {
        // one bounce at most, and only when there is stamina left to pay for it
        if (pad || stam < PAD_COST) break;
        stam -= PAD_COST;
        pad = true;
        x = p.to.x;
        foot = ter.surfaceY(x, p.to.y + 1.5);
        if (foot < 0) break;
        cands.push({ x, foot, dist, dir, pad });
        since = 0;
        continue;
      }
      const nx = x + dir * 0.25;
      if (nx < 1 || nx > WORLD.W - 1) break;
      if (ter.solid(nx, foot + 0.35)) break; // a wall (or a slope too steep to climb)
      const gy = ter.surfaceY(nx, foot + 0.35);
      if (gy < WORLD.SEA + 0.3 || foot - gy > CLIFF_STOP) break; // the cart would brake here
      stam -= (0.25 + CLIMB_COST * Math.max(0, gy - foot)) * STAMINA_PER_M; // as the cart pays it
      x = nx;
      foot = gy;
      dist += 0.25;
      since += 0.25;
      if (since >= 0.5) { cands.push({ x, foot, dist, dir, pad }); since = 0; }
    }
  }
  yield;

  // 2. a quick look at every place: will the ground hold, is it near an edge, what spot is it
  const openPocket = SUPPLY.some((t) => (me.ammo[t] || 0) < POCKET);
  const hurt = Math.max(0, (60 - me.hp) / 60); // low on health: hide more
  // what standing on each kind of spot is worth for one turn, in rough points of damage
  const worth = (kind) => prof.spots * ({
    high: 6,
    crown: 6 + (openPocket ? 7 : 0),
    tree: openPocket ? 8 : 0,
    burrow: 6 + 10 * hurt,
  }[kind] || 0);
  const island = (x) => (land.spans || []).findIndex((sp) => x > sp.a && x < sp.b);
  const quick = (c) => {
    let v = 0;
    const th = Math.min(...[-0.45, 0, 0.45].map((dx) => ter.thicknessBelow(c.x + dx, c.foot + 0.1)));
    if (th < CRUMBLE) v -= 45;
    else if (th < THIN_GROUND) v -= (THIN_GROUND - th) * 14;
    const edge = edgeDist(ter, c.x, c.foot);
    if (edge < 1.8) v -= (1.8 - edge) * 7;
    const here = spotsAt(land, c.x).filter((s) => s.kind !== 'pad');
    for (const s of here) {
      if (s.kind === 'burrow' && !game._covered(c.x, c.foot + 3.2, c.x, c.foot + 1)) continue; // roof gone
      v += worth(s.kind);
    }
    // a step toward somewhere good next turn (on this island, or across a pad from it)
    if (land.spots) {
      let next = 0;
      const isl = island(c.x);
      for (const s of land.spots) {
        if (here.includes(s)) continue;
        const mid = (s.range[0] + s.range[1]) / 2;
        if (s.kind === 'pad') {
          if (island(mid) !== isl || Math.abs(mid - c.x) > 7) continue;
          for (const t of spotsAt(land, s.to.x)) if (t.kind !== 'pad') next = Math.max(next, worth(t.kind) * 0.3);
        } else if (island(mid) === isl && Math.abs(mid - c.x) < 7.5) next = Math.max(next, worth(s.kind) * 0.4);
      }
      v += next;
    }
    v -= c.dist * 0.35 + (c.pad ? 1.5 : 0);
    return v;
  };
  for (const c of cands) c.q = quick(c) + (c.dist ? (Math.random() - 0.5) * prof.noise : 0);

  // 3. the most promising few get a proper look: what could the CPU hit from there?
  const stay = cands[0];
  const pool = cands.slice(1).sort((a, b) => b.q - a.q);
  const short = [stay];
  for (const c of pool) {
    if (short.length >= prof.look) break;
    if (short.every((s) => Math.abs(s.x - c.x) > 1.2)) short.push(c);
  }
  for (const c of short) {
    const { best } = searchShots(game, me, { at: { x: c.x, y: c.foot + CART_R }, coarse: true });
    c.atk = Math.max(-10, Math.min(60, best ? best.dmg : -10));
    c.score = c.q + c.atk * 0.6;
    yield;
  }
  if (Math.random() > prof.chance && (stay.q > -20 || Math.random() > prof.notice)) return null; // not this turn
  let pick = stay;
  for (const c of short) if (c.score > pick.score) pick = c;
  if (pick === stay || pick.score < stay.score + 3) return null;
  return { x: pick.x, dir: pick.dir, pad: pick.pad };
}

// How far along the ground to the nearest drop the cart would not survive (or a wall).
function edgeDist(ter, x, foot) {
  let near = 9;
  for (const dir of [-1, 1]) {
    let f = foot;
    for (let d = 0.25; d <= 2; d += 0.25) {
      const nx = x + dir * d;
      if (ter.solid(nx, f + 0.35)) break;
      const gy = ter.surfaceY(nx, f + 0.35);
      if (gy < WORLD.SEA + 0.3 || f - gy > 1.2) { near = Math.min(near, d); break; }
      f = gy;
    }
  }
  return near;
}
