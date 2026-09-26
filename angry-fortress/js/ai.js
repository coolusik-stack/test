// CPU opponent: brute-force ballistic search over angle × power using the same
// integrator as the physics engine, then scores each landing per bird type.
import { GRAV, VMAX, WIND_ACC, BIRDS, EGG, CART_R, HEAD } from './config.js';
import { WORLD } from './terrain.js';

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
  const enemy = game.players[1 - me.id];
  const ep = enemy.body.getPosition();
  const mp = me.body.getPosition();
  const dir = Math.sign(ep.x - mp.x) || -1;
  const saved = me.facing;
  me.facing = dir;
  const rest = game.restPos(me);
  me.facing = saved;

  const windK = prof.wind[0] + Math.random() * (prof.wind[1] - prof.wind[0]);
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

  const r = 0.36;
  const sim = (x, y, vx, vy, rad, maxT, selfCheck) => {
    const steps = Math.round(maxT / H);
    for (let i = 1; i <= steps; i++) {
      vx += wax * H;
      vy -= GRAV * H;
      x += vx * H;
      y += vy * H;
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

  const blastDmg = (x, y, spec) => {
    const d = Math.max(0, Math.min(Math.hypot(x - ep.x, y - ep.y) - CART_R * 0.6, Math.hypot(x - ep.x, y - ep.y - HEAD.y) - HEAD.r * 0.6));
    const self = Math.max(0, Math.hypot(x - mp.x, y - mp.y) - CART_R * 0.6);
    let v = d < spec.r ? spec.dmg * Math.pow(1 - d / spec.r, 0.8) : 0;
    if (self < spec.r + 0.8) v -= 60;
    return v;
  };

  const types = ['red'];
  for (const t of ['black', 'white', 'blue']) if (me.ammo[t] > 0) types.push(t);

  let best = null;
  let closest = null;
  for (let deg = 10; deg <= 82; deg += 1.6) {
    const a = (deg * Math.PI) / 180;
    const angle = dir > 0 ? a : Math.PI - a;
    for (let pw = 0.32; pw <= 1.0001; pw += 0.022) {
      const v = pw * VMAX;
      const vx0 = Math.cos(angle) * v, vy0 = Math.sin(angle) * v;
      const hit = sim(rest.x, rest.y, vx0, vy0, r, 7, true);
      const d = Math.hypot(hit.x - ep.x, hit.y - ep.y);
      if (hit.kind !== 'water' && hit.kind !== 'out' && hit.kind !== 'self' && hit.kind !== 'none') {
        const selfD = Math.hypot(hit.x - mp.x, hit.y - mp.y);
        if (selfD > 4 && (!closest || d < closest.d)) closest = { d, angle, power: pw, type: 'red', abilityAt: null };
      }
      for (const type of types) {
        let dmg = 0;
        let abilityAt = null;
        if (hit.kind === 'self') dmg = -40;
        else if (type === 'red') {
          if (hit.kind === 'enemy') dmg = 28;
          else if (hit.kind === 'terrain' || hit.kind === 'block') dmg = d < 1.8 ? 12 * (1 - d / 1.8) : 0;
        } else if (type === 'black') {
          if (hit.kind === 'enemy') dmg = BIRDS.black.blast.dmg + 6;
          else if (hit.kind === 'terrain' || hit.kind === 'block') {
            dmg = blastDmg(hit.x, hit.y, BIRDS.black.blast);
            abilityAt = Math.max(0.1, hit.t - H * 2);
          }
          dmg -= 8; // save bombs for when they matter
        } else if (type === 'blue') {
          if (hit.kind === 'enemy') dmg = 22;
          else if (hit.kind === 'terrain' || hit.kind === 'block') dmg = d < 2.2 ? 20 * (1 - d / 2.2) : 0;
          abilityAt = hit.t * 0.62;
          dmg -= 4;
        } else if (type === 'white') {
          // find the moment we pass above the enemy and simulate the egg from there
          let x = rest.x, y = rest.y, vx = vx0, vy = vy0, tc = -1;
          let px = x;
          for (let i = 1; i * H < hit.t; i++) {
            vx += wax * H; vy -= GRAV * H; x += vx * H; y += vy * H;
            if ((px - ep.x) * (x - ep.x) <= 0 && y > ep.y + 1.2) { tc = i * H; break; }
            px = x;
          }
          if (tc > 0) {
            const e = sim(x, y - 0.45, vx * 0.15, -16, EGG.r, 4, false);
            if (e.kind === 'enemy') dmg = EGG.blast.dmg;
            else if (e.kind !== 'water' && e.kind !== 'out') dmg = blastDmg(e.x, e.y, EGG.blast);
            abilityAt = tc;
          } else if (hit.kind === 'enemy') dmg = 25;
          dmg -= 6;
        }
        if (dmg > 0 && hit.kind === 'block' && d < 4) dmg += 2;
        if (!best || dmg > best.dmg) best = { dmg, angle, power: pw, type, abilityAt };
      }
    }
  }

  let plan = best && best.dmg > 2 ? best : closest || { angle: dir > 0 ? 0.8 : Math.PI - 0.8, power: 0.75, type: 'red', abilityAt: null };
  // if we are just chipping at the fort, a bomb helps clear it
  if ((!best || best.dmg <= 2) && me.ammo.black > 0 && Math.random() < prof.special) {
    plan = { ...plan, type: 'black', abilityAt: null };
  }
  // less skilled CPUs don't always use specials
  if (plan.type !== 'red' && Math.random() > prof.special) plan = { ...plan, type: 'red', abilityAt: null };

  // human-like error that shrinks as the CPU "learns" the range
  const learn = Math.max(prof.learn, 1.35 - 0.15 * me.stats.shots);
  const angErr = ((gauss() * prof.sa * Math.PI) / 180) * learn;
  const pwErr = gauss() * prof.sp * learn;
  return {
    type: plan.type,
    angle: plan.angle + angErr * (dir > 0 ? 1 : -1),
    power: Math.min(1, Math.max(0.2, plan.power + pwErr)),
    abilityAt: plan.abilityAt,
  };
}
