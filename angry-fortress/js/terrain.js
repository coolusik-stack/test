// Destructible terrain: a signed-distance grid (negative = solid) that is carved by
// explosions, contoured with marching squares, turned into planck chain loops for
// physics and into Path2D shapes for rendering. The land is a set of floating islands over a
// bottomless sea of clouds: dig through one and whoever stands on it falls.
import { clamp, lerp, rng, noise1D } from './util.js';

// SEA is the top of the cloud sea: anything that sinks below it has fallen out of the world.
export const WORLD = { W: 72, H: 40, CELL: 0.25, SEA: 1.0, SEA0: 1.0 };

const SDF_MAX = 3;

export class Terrain {
  constructor(opts) {
    const { W, H, CELL } = WORLD;
    this.cell = CELL;
    this.nx = Math.round(W / CELL);
    this.ny = Math.round(H / CELL);
    this.stride = this.nx + 1;
    this.f = new Float32Array((this.nx + 1) * (this.ny + 1));
    this.scar = new Uint8Array((this.nx + 1) * (this.ny + 1));
    this.style = opts.style;
    this.seed = opts.seed;
    this.craters = [];
    this.loops = [];
    this.fixtures = [];
    this.body = null;
    this.version = 0;
    this.heights = opts.heights; // function x -> surface height (for generation)
    this.opLog = []; // every carve since generation, [x, y, r] in centimetres (quantised so peers agree)
    this._generate(opts);
    this.f0 = this.f.slice();
    this.scar0 = this.scar.slice();
    this._contour();
  }

  // ---------- generation ----------
  _generate(opts) {
    const { nx, ny, cell, f, stride } = this;
    const h = opts.heights;
    const under = opts.under || (() => -Infinity); // underside of the island over x (Infinity: open sky)
    for (let i = 0; i <= nx; i++) {
      const x = i * cell;
      const hx = h(x);
      const ux = under(x);
      for (let j = 0; j <= ny; j++) {
        const y = j * cell;
        f[j * stride + i] = clamp(Math.max(y - hx, ux - y), -SDF_MAX, SDF_MAX);
      }
    }
    for (const op of opts.ops || []) this._applyOp(op);
    // Border: everything on the outer ring is air so all contours close.
    for (let i = 0; i <= nx; i++) {
      f[i] = SDF_MAX;
      f[ny * stride + i] = SDF_MAX;
    }
    for (let j = 0; j <= ny; j++) {
      f[j * stride] = SDF_MAX;
      f[j * stride + nx] = SDF_MAX;
    }
  }

  _applyOp(op) {
    // op: {type:'add'|'sub', shape:'ellipse', x, y, rx, ry}
    const { nx, ny, cell, f, stride } = this;
    const i0 = Math.max(0, Math.floor((op.x - op.rx - 1) / cell));
    const i1 = Math.min(nx, Math.ceil((op.x + op.rx + 1) / cell));
    const j0 = Math.max(0, Math.floor((op.y - op.ry - 1) / cell));
    const j1 = Math.min(ny, Math.ceil((op.y + op.ry + 1) / cell));
    const m = Math.min(op.rx, op.ry);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const dx = (i * cell - op.x) / op.rx;
        const dy = (j * cell - op.y) / op.ry;
        const d = (Math.hypot(dx, dy) - 1) * m;
        const k = j * stride + i;
        if (op.type === 'add') f[k] = Math.min(f[k], clamp(d, -SDF_MAX, SDF_MAX));
        else {
          f[k] = Math.max(f[k], clamp(-d, -SDF_MAX, SDF_MAX));
          if (d < 0.5) this.scar[k] = 1; // no grass inside caves and arches
        }
      }
    }
  }

  // ---------- queries ----------
  sample(x, y) {
    const { cell, nx, ny, f, stride } = this;
    const gx = x / cell, gy = y / cell;
    if (gx < 0 || gy < 0 || gx >= nx || gy >= ny) return SDF_MAX;
    const i = gx | 0, j = gy | 0;
    const tx = gx - i, ty = gy - j;
    const k = j * stride + i;
    const a = f[k], b = f[k + 1], c = f[k + stride], d = f[k + stride + 1];
    return lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
  }

  solid(x, y) {
    return this.sample(x, y) < 0;
  }

  // Highest solid surface at x (or -1 if the column is empty).
  surfaceY(x, fromY = WORLD.H - 0.5) {
    const step = this.cell * 0.5;
    let prev = this.sample(x, fromY);
    for (let y = fromY - step; y > 0; y -= step) {
      const v = this.sample(x, y);
      if (v < 0 && prev >= 0) {
        const t = prev / (prev - v);
        return y + step - t * step;
      }
      prev = v;
    }
    return -1;
  }

  // ---------- destruction ----------
  carve(cx, cy, r) {
    const op = [Math.round(cx * 100), Math.round(cy * 100), Math.round(r * 100)];
    this.opLog.push(op);
    const changed = this._carveRaw(op[0] / 100, op[1] / 100, op[2] / 100);
    this.craters.push({ x: op[0] / 100, y: op[1] / 100, r: op[2] / 100 });
    if (this.craters.length > 80) this.craters.shift();
    if (changed) {
      this._removeDust();
      this._contour();
      this.version++;
    }
    return changed;
  }

  // Several carves at once (a drilled shaft): logged one by one, exactly as rebuild() replays them,
  // but contoured only once.
  carveMany(list) {
    let changed = false;
    for (const [cx, cy, r] of list) {
      const op = [Math.round(cx * 100), Math.round(cy * 100), Math.round(r * 100)];
      this.opLog.push(op);
      if (this._carveRaw(op[0] / 100, op[1] / 100, op[2] / 100)) {
        this._removeDust();
        changed = true;
      }
      this.craters.push({ x: op[0] / 100, y: op[1] / 100, r: op[2] / 100 });
    }
    if (this.craters.length > 80) this.craters.splice(0, this.craters.length - 80);
    if (changed) {
      this._contour();
      this.version++;
    }
    return changed;
  }

  // How much solid ground is under (x, y0): metres of contiguous solid starting within `gap`
  // below y0 (0 when there is only air there).
  thicknessBelow(x, y0, gap = 0.6, max = 8) {
    const step = this.cell;
    let y = y0 - 0.1;
    const lowest = y0 - gap;
    while (y > lowest && this.sample(x, y) >= 0) y -= step;
    if (y <= lowest) return 0;
    const top = y;
    while (y > top - max && y > 0 && this.sample(x, y) < 0) y -= step;
    return top - y;
  }

  // Throw away every carve and replay `ops` from the freshly generated ground (used when a
  // peer's authoritative history differs from ours). Same order, same dust pass, same result.
  rebuild(ops) {
    this.f.set(this.f0);
    this.scar.set(this.scar0);
    this.opLog = ops.map((o) => [o[0], o[1], o[2]]);
    this.craters = [];
    for (const o of this.opLog) {
      if (this._carveRaw(o[0] / 100, o[1] / 100, o[2] / 100)) this._removeDust();
      this.craters.push({ x: o[0] / 100, y: o[1] / 100, r: o[2] / 100 });
    }
    if (this.craters.length > 80) this.craters.splice(0, this.craters.length - 80);
    this._contour();
    this.version++;
  }

  _carveRaw(cx, cy, r) {
    const { nx, ny, cell, f, stride, scar } = this;
    const pad = 0.6;
    const i0 = Math.max(1, Math.floor((cx - r - pad) / cell));
    const i1 = Math.min(nx - 1, Math.ceil((cx + r + pad) / cell));
    const j0 = Math.max(1, Math.floor((cy - r - pad) / cell));
    const j1 = Math.min(ny - 1, Math.ceil((cy + r + pad) / cell));
    let changed = false;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(i * cell - cx, j * cell - cy);
        const k = j * stride + i;
        if (d < r + pad) scar[k] = 1;
        const v = r - d;
        if (v > f[k]) {
          if (f[k] < 0) changed = true;
          f[k] = Math.min(v, SDF_MAX);
        }
      }
    }
    return changed;
  }

  // Drop tiny floating crumbs so they don't turn into physics slivers.
  _removeDust() {
    // cheap pass: isolated solid grid points with no solid neighbours become air
    const { nx, ny, f, stride } = this;
    for (let j = 1; j < ny; j++) {
      for (let i = 1; i < nx; i++) {
        const k = j * stride + i;
        if (f[k] >= 0) continue;
        if (f[k - 1] >= 0 && f[k + 1] >= 0 && f[k - stride] >= 0 && f[k + stride] >= 0) f[k] = 0.05;
      }
    }
  }

  // ---------- marching squares ----------
  _contour() {
    const { nx, ny, cell, f, stride } = this;
    const next = new Map(); // edgeKey -> {to, x, y} ; x,y = point at "from" key
    const pt = new Map();
    const edgePoint = (key) => {
      let p = pt.get(key);
      if (p) return p;
      const vertical = key & 1;
      const idx = key >> 1;
      const i = idx % stride;
      const j = (idx / stride) | 0;
      const a = f[j * stride + i];
      if (vertical) {
        const b = f[(j + 1) * stride + i];
        const t = a / (a - b);
        p = { x: i * cell, y: (j + clamp(t, 0, 1)) * cell };
      } else {
        const b = f[j * stride + i + 1];
        const t = a / (a - b);
        p = { x: (i + clamp(t, 0, 1)) * cell, y: j * cell };
      }
      pt.set(key, p);
      return p;
    };
    const hKey = (i, j) => (j * stride + i) * 2;
    const vKey = (i, j) => (j * stride + i) * 2 + 1;
    const cr = [0, 0, 0, 0]; // crossing types per edge: 0 none, 1 exit(in->out), 2 enter(out->in)
    const keys = [0, 0, 0, 0];
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * stride + i;
        const bl = f[k] < 0, br = f[k + 1] < 0, tr = f[k + stride + 1] < 0, tl = f[k + stride] < 0;
        if (bl === br && br === tr && tr === tl) continue;
        // CCW edges: bottom(bl->br), right(br->tr), top(tr->tl), left(tl->bl)
        const c = [bl, br, tr, tl];
        keys[0] = hKey(i, j);
        keys[1] = vKey(i + 1, j);
        keys[2] = hKey(i, j + 1);
        keys[3] = vKey(i, j);
        for (let e = 0; e < 4; e++) {
          const a = c[e], b = c[(e + 1) & 3];
          cr[e] = a === b ? 0 : a ? 1 : 2;
        }
        let centerIn = false;
        let nExit = 0;
        for (let e = 0; e < 4; e++) if (cr[e] === 1) nExit++;
        if (nExit === 2) {
          centerIn = (f[k] + f[k + 1] + f[k + stride] + f[k + stride + 1]) * 0.25 < 0;
        }
        for (let e = 0; e < 4; e++) {
          if (cr[e] !== 1) continue;
          // find partner enter: next CCW if centerIn (or single pair), else previous
          let partner = -1;
          if (nExit === 1 || centerIn) {
            for (let s = 1; s < 4; s++) {
              const q = (e + s) & 3;
              if (cr[q] === 2) { partner = q; break; }
            }
          } else {
            for (let s = 1; s < 4; s++) {
              const q = (e - s + 4) & 3;
              if (cr[q] === 2) { partner = q; break; }
            }
          }
          if (partner >= 0) next.set(keys[e], keys[partner]);
        }
      }
    }
    // Trace loops
    const loops = [];
    const visited = new Set();
    for (const start of next.keys()) {
      if (visited.has(start)) continue;
      const loop = [];
      let key = start;
      let guard = 0;
      while (!visited.has(key) && guard++ < 200000) {
        visited.add(key);
        const p = edgePoint(key);
        loop.push(p.x, p.y);
        const nk = next.get(key);
        if (nk === undefined) break;
        key = nk;
      }
      if (loop.length >= 8) loops.push(simplifyLoop(loop, 0.03));
    }
    this.loops = loops.filter((l) => l.length >= 8 && Math.abs(loopArea(l)) > 0.15);
    this._buildRender();
  }

  // ---------- physics ----------
  attach(world, planck) {
    this.world = world;
    this.planck = planck;
    this.body = world.createBody({ type: 'static' });
    this.body.setUserData({ kind: 'terrain' });
    this.fixtures = [];
    this._buildFixtures();
  }

  syncPhysics() {
    if (!this.body || this._builtVersion === this.version) return;
    for (const fx of this.fixtures) this.body.destroyFixture(fx);
    this.fixtures.length = 0;
    this._buildFixtures();
  }

  _buildFixtures() {
    const { planck } = this;
    for (const l of this.loops) {
      const verts = [];
      let px = Infinity, py = Infinity;
      for (let n = 0; n < l.length; n += 2) {
        const x = l[n], y = l[n + 1];
        if (Math.hypot(x - px, y - py) < 0.03) continue;
        verts.push(planck.Vec2(x, y));
        px = x; py = y;
      }
      // closing vertex must not coincide with the first
      while (verts.length > 3) {
        const a = verts[0], b = verts[verts.length - 1];
        if (Math.hypot(a.x - b.x, a.y - b.y) < 0.03) verts.pop();
        else break;
      }
      if (verts.length < 3) continue;
      try {
        const fx = this.body.createFixture(planck.Chain(verts, true), { friction: 0.9, restitution: 0.08 });
        this.fixtures.push(fx);
      } catch (e) {
        /* degenerate loop — skip */
      }
    }
    this._builtVersion = this.version;
  }

  // ---------- rendering ----------
  _buildRender() {
    const path = new Path2D();
    const holes = new Path2D();
    const grass = new Path2D();
    const tufts = new Path2D();
    const fern = new Path2D(), fernHi = new Path2D();
    const bush = new Path2D(), bushHi = new Path2D();
    const clover = new Path2D(), needles = new Path2D();
    const roots = new Path2D(), vines = new Path2D(), vineLeaves = new Path2D();
    const flowers = [], shrooms = [], leaves = [];
    const { stride, cell, scar } = this;
    const st = this.style;
    const decor = st.decor || [];
    // Decor is keyed to fixed world slots so it stays put when craters rebuild the mesh.
    const seed = this.seed;
    const hash = (i, k) => {
      let h = Math.imul(i ^ (seed * 374761393), 668265263) ^ Math.imul(k + 1, 2246822519);
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    };
    const SLOT = 0.3;
    const isScar = (x, y) => {
      const i = Math.round(x / cell), j = Math.round(y / cell);
      return scar[j * stride + i] === 1;
    };
    const addDecor = (slot, tx, ty) => {
      const kind = decor[Math.floor(hash(slot, 3) * decor.length)];
      const s = 0.8 + hash(slot, 4) * 0.5;
      const y = -ty + 0.03;
      if (kind === 'fern') {
        for (let f = -2; f <= 2; f++) {
          const a = -Math.PI / 2 + f * 0.42;
          const L = (0.55 - Math.abs(f) * 0.08) * s;
          const ex = tx + Math.cos(a) * L, ey = y + Math.sin(a) * L;
          fern.moveTo(tx, y);
          fern.quadraticCurveTo(tx + Math.cos(a - 0.3) * L * 0.6, y + Math.sin(a - 0.3) * L * 0.6, ex, ey);
          fern.quadraticCurveTo(tx + Math.cos(a + 0.3) * L * 0.6, y + Math.sin(a + 0.3) * L * 0.6, tx + 0.02, y);
          if (f <= 0) {
            fernHi.moveTo(tx, y - 0.02);
            fernHi.quadraticCurveTo(tx + Math.cos(a - 0.2) * L * 0.5, y + Math.sin(a - 0.2) * L * 0.5, ex * 0.35 + tx * 0.65, ey * 0.35 + y * 0.65);
            fernHi.lineTo(tx + 0.02, y - 0.02);
          }
        }
      } else if (kind === 'bush') {
        for (const [dx, dy, rr] of [[-0.22, -0.12, 0.2], [0.2, -0.13, 0.2], [0, -0.26, 0.24]]) {
          bush.moveTo(tx + dx * s + rr * s, y + dy * s);
          bush.arc(tx + dx * s, y + dy * s, rr * s, 0, Math.PI * 2);
          bushHi.moveTo(tx + dx * s - 0.05 * s + rr * s * 0.5, y + dy * s - 0.06 * s);
          bushHi.arc(tx + dx * s - 0.05 * s, y + dy * s - 0.06 * s, rr * s * 0.5, 0, Math.PI * 2);
        }
      } else if (kind === 'clover') {
        for (const [dx, dy] of [[-0.07, -0.08], [0.07, -0.08], [0, -0.17]]) {
          clover.moveTo(tx + dx + 0.07, y + dy);
          clover.arc(tx + dx, y + dy, 0.07, 0, Math.PI * 2);
        }
      } else if (kind === 'mushroom' || kind === 'glowshroom') {
        const cols = st.mushrooms || ['#e5452f'];
        shrooms.push({ x: tx, y, s: 0.14 * s, c: cols[Math.floor(hash(slot, 5) * cols.length)], glow: kind === 'glowshroom', spots: hash(slot, 6) < 0.6 });
      } else if (kind === 'leaves') {
        const cols = st.leaves || ['#e0662a'];
        for (let q = 0; q < 3; q++) leaves.push({ x: tx + (hash(slot, 7 + q) - 0.5) * 0.5, y: y - 0.02, rot: hash(slot, 10 + q) * 3, c: cols[Math.floor(hash(slot, 13 + q) * cols.length)], s: 0.12 + hash(slot, 16 + q) * 0.06 });
      } else if (kind === 'needles') {
        for (let q = 0; q < 5; q++) {
          const nx = tx + (hash(slot, 20 + q) - 0.5) * 0.6, a = hash(slot, 25 + q) * Math.PI;
          needles.moveTo(nx - Math.cos(a) * 0.1, y - 0.02 - Math.sin(a) * 0.03);
          needles.lineTo(nx + Math.cos(a) * 0.1, y - 0.02 + Math.sin(a) * 0.03);
        }
      } else if (kind === 'flower' && st.flowers) {
        flowers.push({ x: tx, y: y - 0.2, c: st.flowers[Math.floor(hash(slot, 8) * st.flowers.length)], s: 0.06 + hash(slot, 9) * 0.04 });
      }
    };
    for (const l of this.loops) {
      const n = l.length;
      path.moveTo(l[0], -l[1]);
      for (let k = 2; k < n; k += 2) path.lineTo(l[k], -l[k + 1]);
      path.closePath();
      if (loopArea(l) < 0) {
        holes.moveTo(l[0], -l[1]);
        for (let k = 2; k < n; k += 2) holes.lineTo(l[k], -l[k + 1]);
        holes.closePath();
      }
      // grass on up-facing, un-scarred segments
      let drawing = false;
      for (let k = 0; k < n; k += 2) {
        const x0 = l[k], y0 = l[k + 1];
        const x1 = l[(k + 2) % n], y1 = l[(k + 3) % n];
        const dx = x1 - x0, dy = y1 - y0;
        const len = Math.hypot(dx, dy) || 1;
        const nyUp = -dx / len; // outward (right-hand) normal y component
        const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
        if (nyUp < -0.45 && !isScar(mx, my)) {
          // roots and vines dangling from the underside of the island
          const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
          for (let slot = Math.ceil(lo / SLOT); slot * SLOT < hi; slot++) {
            if (hash(slot, 31) > 0.34) continue;
            const tx = slot * SLOT;
            const t = (tx - x0) / dx;
            if (t < 0 || t > 1) continue;
            const ty = -(y0 + dy * t) - 0.04;
            const L = 0.35 + Math.pow(hash(slot, 32), 1.6) * 1.9;
            const bend = (hash(slot, 33) - 0.5) * 0.7 * L;
            if (hash(slot, 34) < 0.55) {
              roots.moveTo(tx, ty);
              roots.quadraticCurveTo(tx + bend, ty + L * 0.55, tx + bend * 0.4, ty + L);
            } else {
              vines.moveTo(tx, ty);
              vines.quadraticCurveTo(tx - bend, ty + L * 0.5, tx - bend * 0.2, ty + L * 1.15);
              for (let q = 1; q <= 3; q++) {
                const u = q / 3.6, lx = tx - bend * u * (1.6 - u) * 0.9, ly = ty + L * 1.15 * u, side = q % 2 ? 1 : -1;
                vineLeaves.moveTo(lx, ly);
                vineLeaves.ellipse(lx + side * 0.09, ly, 0.11, 0.055, side * 0.5, 0, Math.PI * 2);
              }
            }
          }
        }
        const ok = nyUp > 0.42 && !isScar(mx, my) && my > WORLD.SEA0 - 0.2;
        if (!ok) { drawing = false; continue; }
        if (!drawing) { grass.moveTo(x0, -y0); drawing = true; }
        grass.lineTo(x1, -y1);
        // tufts and decor on fixed slots inside this segment's x-span
        const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
        for (let slot = Math.ceil(lo / SLOT); slot * SLOT < hi; slot++) {
          const tx = slot * SLOT + (hash(slot, 0) - 0.5) * 0.12;
          const t = (tx - x0) / dx;
          if (t < 0 || t > 1) continue;
          const ty = y0 + dy * t;
          const hgt = 0.14 + hash(slot, 1) * 0.16;
          const lean = (hash(slot, 2) - 0.5) * 0.12;
          tufts.moveTo(tx - 0.07, -ty + 0.02);
          tufts.lineTo(tx + lean - 0.03, -ty - hgt);
          tufts.lineTo(tx, -ty + 0.02);
          tufts.lineTo(tx + lean + 0.06, -ty - hgt * 0.75);
          tufts.lineTo(tx + 0.07, -ty + 0.02);
          tufts.closePath();
          if (decor.length && hash(slot, 11) < 0.16) addDecor(slot, tx, ty);
        }
      }
    }
    this.path = path;
    this.holePath = holes;
    this.grassPath = grass;
    this.tuftPath = tufts;
    this.flowers = flowers;
    this.decor = { fern, fernHi, bush, bushHi, clover, needles, shrooms, leaves };
    this.hanging = { roots, vines, vineLeaves };
  }

  draw(ctx, style, pattern, view) {
    const s = style;
    ctx.save();
    // enclosed caves read as dark hollows, not windows to the sky
    ctx.fillStyle = s.cave || 'rgba(30,16,8,0.82)';
    ctx.fill(this.holePath);
    ctx.fillStyle = pattern || s.dirt;
    ctx.fill(this.path, 'evenodd');
    // depth darkening + inner bevel + scorch, all clipped to the solid
    ctx.save();
    ctx.clip(this.path, 'evenodd');
    if (!this._depthGrad) {
      const g = ctx.createLinearGradient(0, -22, 0, 0);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, s.deep || 'rgba(20,8,0,0.45)');
      this._depthGrad = g;
    }
    ctx.fillStyle = this._depthGrad;
    ctx.fillRect(-2, -WORLD.H, WORLD.W + 4, WORLD.H + 2);
    ctx.lineWidth = 0.55;
    ctx.strokeStyle = s.bevel || 'rgba(0,0,0,0.2)';
    ctx.stroke(this.path);
    for (const c of this.craters) {
      if (view && (c.x + c.r + 1 < view.x0 || c.x - c.r - 1 > view.x1 || c.y + c.r + 1 < view.y0 || c.y - c.r - 1 > view.y1)) continue;
      const g = ctx.createRadialGradient(c.x, -c.y, c.r * 0.9, c.x, -c.y, c.r + 0.75);
      g.addColorStop(0, s.scorch || 'rgba(40,20,10,0.75)');
      g.addColorStop(1, 'rgba(40,20,10,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c.x, -c.y, c.r + 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.lineWidth = 0.09;
    ctx.strokeStyle = s.outline;
    ctx.stroke(this.path);
    const hg = this.hanging;
    if (hg) {
      ctx.lineCap = 'round';
      ctx.strokeStyle = s.root || '#3e2210';
      ctx.lineWidth = 0.075;
      ctx.stroke(hg.roots);
      ctx.strokeStyle = s.grassDark;
      ctx.lineWidth = 0.045;
      ctx.stroke(hg.vines);
      ctx.fillStyle = s.grass;
      ctx.fill(hg.vineLeaves);
    }
    // undergrowth rooted on the surface (drawn under the grass band)
    const d = this.decor;
    if (d) {
      ctx.fillStyle = s.grassDark;
      ctx.fill(d.bush);
      ctx.fill(d.fern);
      ctx.fillStyle = s.grass;
      ctx.globalAlpha = 0.8;
      ctx.fill(d.bushHi);
      ctx.fill(d.fernHi);
      ctx.globalAlpha = 1;
    }
    // grass band
    ctx.lineWidth = 0.42;
    ctx.strokeStyle = s.grassDark;
    ctx.stroke(this.grassPath);
    ctx.fillStyle = s.grassDark;
    ctx.fill(this.tuftPath);
    ctx.lineWidth = 0.3;
    ctx.strokeStyle = s.grass;
    ctx.save();
    ctx.translate(0, -0.05);
    ctx.stroke(this.grassPath);
    ctx.fillStyle = s.grass;
    ctx.fill(this.tuftPath);
    ctx.lineWidth = 0.08;
    ctx.strokeStyle = s.grassLight;
    ctx.translate(0, -0.09);
    ctx.stroke(this.grassPath);
    ctx.restore();
    for (const fl of this.flowers) {
      ctx.fillStyle = fl.c;
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(fl.x + Math.cos(a) * fl.s, fl.y + Math.sin(a) * fl.s, fl.s * 0.75, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#ffe066';
      ctx.beginPath();
      ctx.arc(fl.x, fl.y, fl.s * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    if (d) this._drawSmallDecor(ctx, d, s);
    ctx.restore();
  }

  _drawSmallDecor(ctx, d, s) {
    ctx.fillStyle = s.grassLight;
    ctx.globalAlpha = 0.9;
    ctx.fill(d.clover);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#8a5a2e';
    ctx.lineWidth = 0.025;
    ctx.stroke(d.needles);
    for (const lf of d.leaves) {
      ctx.save();
      ctx.translate(lf.x, lf.y);
      ctx.rotate(lf.rot);
      ctx.fillStyle = lf.c;
      ctx.beginPath();
      ctx.ellipse(0, 0, lf.s, lf.s * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    for (const m of d.shrooms) {
      if (m.glow) {
        const g = ctx.createRadialGradient(m.x, m.y - m.s, 0, m.x, m.y - m.s, m.s * 4);
        g.addColorStop(0, m.c + '88');
        g.addColorStop(1, m.c + '00');
        ctx.fillStyle = g;
        ctx.fillRect(m.x - m.s * 4, m.y - m.s * 5, m.s * 8, m.s * 8);
      }
      ctx.fillStyle = '#f2e6cc';
      ctx.fillRect(m.x - m.s * 0.28, m.y - m.s * 1.1, m.s * 0.56, m.s * 1.1);
      ctx.fillStyle = m.c;
      ctx.beginPath();
      ctx.ellipse(m.x, m.y - m.s * 1.1, m.s, m.s * 0.7, 0, Math.PI, Math.PI * 2);
      ctx.closePath();
      ctx.fill();
      if (m.spots) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.arc(m.x - m.s * 0.35, m.y - m.s * 1.4, m.s * 0.14, 0, Math.PI * 2);
        ctx.arc(m.x + m.s * 0.3, m.y - m.s * 1.5, m.s * 0.11, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

// ---------- helpers ----------
function loopArea(l) {
  let a = 0;
  const n = l.length;
  for (let k = 0; k < n; k += 2) {
    const x0 = l[k], y0 = l[k + 1], x1 = l[(k + 2) % n], y1 = l[(k + 3) % n];
    a += x0 * y1 - x1 * y0;
  }
  return a / 2;
}

// Greedy decimation: drop points that sit within eps of the line between neighbours.
function simplifyLoop(l, eps) {
  let pts = l;
  for (let pass = 0; pass < 3; pass++) {
    const out = [];
    const n = pts.length;
    if (n <= 8) return pts;
    let lastX = pts[n - 2], lastY = pts[n - 1];
    for (let k = 0; k < n; k += 2) {
      const x = pts[k], y = pts[k + 1];
      const nx = pts[(k + 2) % n], ny = pts[(k + 3) % n];
      const dx = nx - lastX, dy = ny - lastY;
      const len = Math.hypot(dx, dy);
      const d = len < 1e-6 ? Math.hypot(x - lastX, y - lastY) : Math.abs((x - lastX) * dy - (y - lastY) * dx) / len;
      if (d < eps && len < 1.2) continue; // drop
      out.push(x, y);
      lastX = x; lastY = y;
    }
    if (out.length === pts.length) return out;
    pts = out;
  }
  return pts;
}

// ---------- map generation ----------
// Produces a height function, the islands' undersides and SDF ops for a given theme layout.
// Every map floats over the cloud sea: two home islands (or one long ridge), and whatever the
// theme puts in the middle. Each island is an upside-down mountain: a flat top to stand on, a
// rocky underside that is thickest in the middle and thins out toward the cliffs at its ends.
export function buildLandscape(layout, seed) {
  const { W } = WORLD;
  const r = rng(seed);
  const n1 = noise1D(seed + 11);
  const n2 = noise1D(seed + 23);
  const nU = noise1D(seed + 37);
  const bases = [W * 0.17 + r.range(-1.2, 1.2), W * 0.83 + r.range(-1.2, 1.2)];
  const baseH = [r.range(layout.baseMin, layout.baseMax), r.range(layout.baseMin, layout.baseMax)];
  const mid = W / 2 + r.range(-1.5, 1.5);
  const midH = r.range(layout.midMin, layout.midMax);
  const ends = [bases[0] - 6.5, bases[1] + 6.5]; // outer cliffs of the two home islands
  const HOME = layout.home ?? 3.6; // ground under each captain at the start
  // control points for the big shape
  const cps = [
    [ends[0] - 2, baseH[0] - 2.4],
    [ends[0] + 2.4, baseH[0] - 0.2],
    [bases[0] - 3, baseH[0]],
    [bases[0] + 7, baseH[0]],
  ];
  const features = {};
  const plateaus = [
    [bases[0] - 3, bases[0] + 7, baseH[0]],
    [bases[1] - 7, bases[1] + 3, baseH[1]],
  ];
  // islands: [left x, right x, max thickness, profile exponent (small = blunt, thick to the edges)]
  let spans;
  const homeSpans = (inner, D = HOME, p = 0.55) => [[ends[0], Math.min(bases[0] + 8.5, mid - inner), D, p], [Math.max(bases[1] - 8.5, mid + inner), ends[1], D, p]];
  if (layout.mid === 'gorge') {
    // a bottomless canyon between two big landmasses, flat rims on both sides for a log bridge
    const rim = midH, gap = 2.6, lip = 1.9;
    cps.push(
      [mid - 10, lerp(baseH[0], rim, 0.5)], [mid - gap - lip, rim], [mid - gap, rim], [mid - gap + 1.0, rim - 3],
      [mid + gap - 1.0, rim - 3], [mid + gap, rim], [mid + gap + lip, rim], [mid + 10, lerp(baseH[1], rim, 0.5)],
    );
    plateaus.push([mid - gap - lip, mid - gap, rim], [mid + gap, mid + gap + lip, rim]);
    features.bridge = { x: mid, y: rim, span: (gap + lip * 0.55) * 2 };
    // thick enough under each captain, deeper toward the canyon
    const D = (a, b, x) => HOME / Math.sqrt(Math.sin(Math.PI * (x - a) / (b - a)));
    spans = [[ends[0], mid - gap, D(ends[0], mid - gap, bases[0]), 0.5], [mid + gap, ends[1], D(mid + gap, ends[1], bases[1]), 0.5]];
  } else if (layout.mid === 'mesa') {
    // a big floating mountain in the middle: room on top for a landmark, thick enough to tunnel through
    const top = midH;
    cps.push([mid - 8.6, lerp(baseH[0], top, 0.22)], [mid - 6, top], [mid + 6, top], [mid + 8.6, lerp(baseH[1], top, 0.22)]);
    plateaus.push([mid - 6, mid + 6, top]);
    spans = homeSpans(13.6);
    spans.splice(1, 0, [mid - 9.8, mid + 9.8, 9.5, 0.6]);
  } else if (layout.mid === 'valley') {
    cps.push([mid - 7, lerp(baseH[0], midH, 0.5)], [mid, midH], [mid + 7, lerp(baseH[1], midH, 0.5)]);
    spans = homeSpans(15.5);
    spans.splice(1, 0, [mid - 7.6, mid + 7.6, 6.2, 0.6]);
  } else {
    // one long ridge floating end to end
    const a0 = lerp(baseH[0], midH, 0.55), a1 = lerp(baseH[1], midH, 0.55);
    cps.push([mid - 7, a0], [mid, midH], [mid + 7, a1]);
    if (layout.ledges) {
      // little flat steps on both slopes near the top, each holding a boulder
      const d = layout.ledges;
      const at = (a, t) => lerp(a, midH, (1 - Math.cos(t * Math.PI)) / 2);
      const hl = at(a0, (7 - d) / 7), hr = at(a1, (7 - d) / 7);
      cps.push([mid - d - 0.9, hl], [mid - d + 0.9, hl], [mid + d - 0.9, hr], [mid + d + 0.9, hr]);
      plateaus.push([mid - d - 0.9, mid - d + 0.9, hl], [mid + d - 0.9, mid + d + 0.9, hr]);
      features.lips = [{ x: mid - d - 0.75, y: hl }, { x: mid + d + 0.75, y: hr }];
      // each boulder sits at the uphill end of its step: a clean hit still sends it rolling
      features.boulders = [{ x: mid - d + 0.4, y: hl, dir: 1 }, { x: mid + d - 0.4, y: hr, dir: -1 }];
    }
    const t0 = (bases[0] - ends[0]) / (ends[1] - ends[0]);
    spans = [[ends[0], ends[1], HOME / Math.pow(Math.sin(Math.PI * t0), 0.4), 0.4]];
  }
  cps.push([bases[1] - 7, baseH[1]], [bases[1] + 3, baseH[1]], [ends[1] - 2.4, baseH[1] - 0.2], [ends[1] + 2, baseH[1] - 2.4]);
  cps.sort((a, b) => a[0] - b[0]);
  const heights = (x) => {
    let k = 0;
    while (k < cps.length - 2 && cps[k + 1][0] < x) k++;
    const [x0, y0] = cps[k];
    const [x1, y1] = cps[k + 1];
    const t = clamp((x - x0) / (x1 - x0), 0, 1);
    let h = lerp(y0, y1, (1 - Math.cos(t * Math.PI)) / 2);
    let flat = 0;
    for (const [a, b] of plateaus) {
      const d = x < a ? a - x : x > b ? x - b : 0;
      flat = Math.max(flat, clamp(1 - d / 2.5, 0, 1));
    }
    const detail = n1(x * 0.16) * layout.rough + n2(x * 0.7) * layout.rough * 0.22;
    return h + detail * (1 - flat * 0.92);
  };
  spans = spans.map(([a, b, D, p]) => ({ a, b, D, p }));
  // the rocky underside: thickest in the middle of each island, jagged, never thinner than a lip
  const under = (x) => {
    for (const s of spans) {
      if (x <= s.a || x >= s.b) continue;
      const k = Math.sin(Math.PI * (x - s.a) / (s.b - s.a));
      const d = s.D * Math.pow(k, s.p) + (nU(x * 0.55) * 0.55 + nU(x * 1.7 + 9) * 0.18) * k;
      return heights(x) - Math.max(0.08, d);
    }
    return Infinity;
  };
  const onIsland = (x) => under(x) < Infinity;
  const ops = [];
  // hanging crags under the islands (never right under a captain: that ground is fair game)
  for (const s of spans) {
    const w = s.b - s.a;
    const n = w > 18 ? 2 : 1;
    for (let c = 0; c < n; c++) {
      let x = lerp(s.a, s.b, n === 1 ? r.range(0.3, 0.7) : c === 0 ? r.range(0.18, 0.38) : r.range(0.62, 0.82));
      for (const bx of bases) if (Math.abs(x - bx) < 3.2) x = bx + Math.sign(x - bx || 1) * 3.2;
      if (!onIsland(x)) continue;
      const uy = under(x);
      // long enough to look like a crag, never long enough to dip into the clouds
      const ry = Math.min(r.range(1.3, 2.3) * Math.min(1.4, s.D / 5), (uy - WORLD.SEA - 2.6) / 1.5), rx = r.range(0.7, 1.2);
      if (ry < 0.6) continue;
      ops.push({ type: 'add', x, y: uy - ry * 0.35, rx, ry });
      ops.push({ type: 'add', x: x + r.range(-0.6, 0.6), y: uy - ry * 0.9, rx: rx * 0.5, ry: ry * 0.6 });
    }
  }
  if (layout.arch) {
    ops.push({ type: 'sub', x: mid, y: midH * 0.55, rx: 2.6, ry: 1.9 });
  }
  if (layout.spire) {
    ops.push({ type: 'add', x: mid, y: midH + 2.5, rx: 1.1, ry: 3.2 });
  }
  if (layout.tunnel) {
    // a squirrel tunnel straight through the floating mountain, open at both slopes: a flat,
    // well-aimed shot goes right through
    // low in the mountain's flank: a thick roof over it and solid rock under the floor, so it
    // reads as a tunnel and not as two islands stacked up
    const wall = lerp(Math.max(baseH[0], baseH[1]), midH, 0.22);
    const ty = layout.mid === 'mesa' ? wall + 1.1 : midH - 2.8;
    let xa = mid, xb = mid;
    while (xa > mid - 16 && heights(xa) > ty + 0.4) xa -= 0.25;
    while (xb < mid + 16 && heights(xb) > ty + 0.4) xb += 0.25;
    for (let x = xa - 1.2; x <= xb + 1.2; x += 0.5) ops.push({ type: 'sub', x, y: ty, rx: 1.05, ry: 1.05 });
    features.tunnel = { x: mid, y: ty, xa, xb };
    features.giant = { x: mid };
  }
  if (layout.spire) features.spire = { x: mid };
  // a little rock lip on the downhill edge of each boulder step (round stones roll on any tilt)
  for (const l of features.lips || []) ops.push({ type: 'add', x: l.x, y: l.y + 0.12, rx: 0.42, ry: 0.4 });
  if (layout.islands) {
    // two small sky islets, mirrored, each carrying a nut basket
    features.islands = [];
    for (const side of [-1, 1]) {
      const ix = mid + side * layout.islands, iy = midH + 6.8;
      ops.push({ type: 'add', x: ix, y: iy, rx: 2.9, ry: 0.75 });
      ops.push({ type: 'add', x: ix, y: iy - 0.7, rx: 1.9, ry: 0.8 });
      ops.push({ type: 'add', x: ix + side * 0.3, y: iy - 1.4, rx: 0.9, ry: 0.6 });
      features.islands.push({ x: ix, y: iy + 0.75 });
    }
    features.bounce = [{ x: mid - 3.4 }, { x: mid + 3.4 }];
  }
  return { heights, under, onIsland, spans, ops, bases, baseH, mid, midH, features };
}

// Tileable dirt texture as a CanvasPattern mapped at 64px per meter.
export function makeDirtPattern(ctx, style, seed) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const r = rng(seed);
  g.fillStyle = style.dirt;
  g.fillRect(0, 0, S, S);
  // soft blotches
  for (let n = 0; n < 60; n++) {
    const x = r() * S, y = r() * S, rad = 10 + r() * 30;
    g.fillStyle = r() < 0.5 ? style.dirtLight : style.dirtDark;
    g.globalAlpha = 0.12 + r() * 0.12;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      g.beginPath();
      g.ellipse(x + ox, y + oy, rad, rad * (0.5 + r() * 0.3), r() * 3, 0, Math.PI * 2);
      g.fill();
    }
  }
  // strata lines
  g.globalAlpha = 0.18;
  g.strokeStyle = style.dirtDark;
  g.lineWidth = 3;
  for (let n = 0; n < 4; n++) {
    const y0 = (n + 0.5) * (S / 4) + r.range(-8, 8);
    g.beginPath();
    for (let x = 0; x <= S; x += 8) g.lineTo(x, y0 + Math.sin((x / S) * Math.PI * 2 * (1 + (n % 2))) * 5);
    g.stroke();
  }
  // pebbles
  g.globalAlpha = 1;
  for (let n = 0; n < 34; n++) {
    const x = r() * S, y = r() * S, rw = 3 + r() * 7, rh = rw * (0.55 + r() * 0.35), rot = r() * 3;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      g.fillStyle = style.pebbleDark;
      g.beginPath();
      g.ellipse(x + ox + 1, y + oy + 1.5, rw, rh, rot, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = r() < 0.5 ? style.pebble : style.pebble2 || style.pebble;
      g.beginPath();
      g.ellipse(x + ox, y + oy, rw, rh, rot, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.beginPath();
      g.ellipse(x + ox - rw * 0.3, y + oy - rh * 0.35, rw * 0.35, rh * 0.25, rot, 0, Math.PI * 2);
      g.fill();
    }
  }
  // tree roots winding through the soil
  if (style.root) {
    g.globalAlpha = 0.55;
    g.strokeStyle = style.root;
    g.lineCap = 'round';
    for (let n = 0; n < 5; n++) {
      let x = r() * S, y = r() * S, a = r() * Math.PI * 2, w = 5 + r() * 4;
      const pts = [[x, y, w]];
      for (let k = 0; k < 14; k++) {
        a += (r() - 0.5) * 0.9;
        x += Math.cos(a) * 12; y += Math.sin(a) * 12;
        w *= 0.9;
        pts.push([x, y, w]);
      }
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
        for (let k = 1; k < pts.length; k++) {
          g.lineWidth = pts[k][2];
          g.beginPath();
          g.moveTo(pts[k - 1][0] + ox, pts[k - 1][1] + oy);
          g.lineTo(pts[k][0] + ox, pts[k][1] + oy);
          g.stroke();
        }
      }
    }
    // a few acorns some squirrel buried and forgot
    g.globalAlpha = 0.9;
    for (let n = 0; n < 3; n++) {
      const x = r() * S, y = r() * S, rot = r() * 3;
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
        g.save();
        g.translate(x + ox, y + oy);
        g.rotate(rot);
        g.fillStyle = '#b86f33';
        g.beginPath(); g.ellipse(0, 3, 6, 7.5, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#5e3818';
        g.beginPath(); g.ellipse(0, -2.5, 7, 3.8, 0, 0, Math.PI * 2); g.fill();
        g.restore();
      }
    }
    g.globalAlpha = 1;
  }
  const pat = ctx.createPattern(c, 'repeat');
  try {
    pat.setTransform(new DOMMatrix().scale(1 / 64));
  } catch (e) {
    /* older browsers: pattern at 1px per meter would be wrong, fall back to flat */
    return null;
  }
  return pat;
}
