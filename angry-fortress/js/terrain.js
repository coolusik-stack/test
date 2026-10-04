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
  if (layout.fixed) return buildFixed(layout.fixed, seed);
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

// ---------- hand-made maps ----------
// Fixed, mirrored layouts where every spot means something (see spots.js). Each map is described
// for its left half (x ≤ 36) and mirrored: the top surface and each island's underside as [x, y]
// points joined by cosine curves, then carves, crags, spots and landmarks per side. Only small
// things vary between matches (wind, fort design, decor); the shapes stay put so players can
// learn them. Slopes a cart has to drive up stay at 1:2 or gentler (steeper ones read as walls).
const FIXED = {
  // 도토리 숲 — hide, look, or cross? Home island, from the outer cliff inward: fort hill with a
  // dead-end burrow dug into its face (mouth toward the enemy: lobs land on the roof, flat shots
  // go in and out) · start · lookout hump · acorn tree at the front · mushroom pad to the middle
  // island. Middle island: one flat crown under the great oak and a pad home at each end.
  oak: {
    top: [
      [2.0, 13.6], [3.2, 16.4], [8.6, 16.4], [9.9, 12.0], [13.6, 12.0], [17.6, 14.0], [19.6, 14.0], [23.6, 12.0], [26.6, 12.0], [27.3, 11.4],
      [30.6, 14.4], [31.2, 15.4], [36, 15.4],
    ],
    flat: [[3.4, 8.4], [9.9, 13.6], [17.6, 19.6], [23.6, 26.6], [31.2, 36]],
    islands: [
      { a: 2.1, b: 27.2, under: [[2.1, 13.0], [3.4, 10.6], [6.0, 9.0], [9.6, 8.6], [11.6, 8.4], [15.0, 8.4], [18.6, 8.8], [21.5, 8.8], [24.4, 9.4], [25.9, 10.1], [27.2, 11.3]] },
      { a: 30.7, b: 36, under: [[30.7, 14.2], [31.8, 12.6], [34.0, 10.4], [36.0, 8.4]] },
    ],
    base: 11.8, baseH: 12, midH: 15.4,
    side({ X, span, side, team, ops, spots, forts }) {
      // the burrow: dug into the face of the fort hill, a dead end big enough for a cart
      for (let x = 6.4; x <= 10.6 + 0.01; x += 0.4) ops.push({ type: 'sub', x: X(x), y: 13.2, rx: 1.2, ry: 1.2 });
      // crags hanging under the home island (never under the start or the burrow)
      ops.push({ type: 'add', x: X(4.2), y: 9.0, rx: 0.8, ry: 1.6 });
      ops.push({ type: 'add', x: X(4.5), y: 7.9, rx: 0.4, ry: 0.9 });
      ops.push({ type: 'add', x: X(20.2), y: 8.3, rx: 0.7, ry: 1.1 });
      spots.push({ kind: 'burrow', team, range: span(6.2, 9.4), sign: X(11.0), floor: 12.0 });
      spots.push({ kind: 'high', team, range: span(17.8, 19.4), sign: X(20.4) });
      spots.push({ kind: 'tree', team, range: span(23.6, 25.2), sign: X(23.1) });
      spots.push({ kind: 'pad', team, range: span(25.4, 26.5), dir: side, to: { x: X(34.4), y: 15.4 }, apex: 19.6 });
      spots.push({ kind: 'pad', team: -1, range: span(31.3, 32.4), dir: -side, to: { x: X(12.0), y: 12.0 }, apex: 21.2 });
      forts.push({ back: X(4.6), facing: side });
    },
    center({ M, W, ops, spots }) {
      // the great crag under the middle island
      ops.push({ type: 'add', x: M, y: 7.0, rx: 1.5, ry: 2.4 });
      ops.push({ type: 'add', x: M + 0.4, y: 5.2, rx: 0.65, ry: 1.3 });
      spots.push({ kind: 'crown', team: -1, range: [32.6, W - 32.6], sign: null, signs: [33.0, W - 33.0] });
    },
    features: (W, M) => ({
      trees: [
        { x: M, kind: 'oak', giant: true, h: 7.6, canopyR: 3.5, hpMul: 2, nuts: 6, hive: true, web: false, room: 3.2 },
        { x: 24.4, kind: 'oak', h: 4.7, canopyR: 1.85, nuts: 5, hive: false, web: false, room: 1.5 },
        { x: W - 24.4, kind: 'oak', h: 4.7, canopyR: 1.85, nuts: 5, hive: false, web: false, room: 1.5 },
      ],
    }),
  },

  // 단풍 협곡 — cross, or cut? One landmass split by a bottomless canyon, joined only by a thin
  // earth bridge. From the outer cliff: fort · a rock floating just over the ground behind the
  // start (a roof overhead, open on both sides: somewhere to fall back to) · start · the maple
  // tree · a bluff at the canyon rim (lookout) · the bridge. The bridge is under 2 m thick: stand
  // on it and the ground cracks; a hit nearby drops it, and once it is gone the two sides can't
  // reach each other again.
  maple: {
    top: [[2.0, 11.2], [3.0, 13.0], [23.5, 13.0], [27.5, 15.0], [30.4, 15.0], [32.0, 14.2], [36, 14.2]],
    flat: [[3.0, 23.5], [27.5, 30.4], [32.0, 36]],
    islands: [
      {
        a: 2.1, b: 36, calm: [30.4, 36], // the bridge's underside stays even, so its thickness is what it says
        under: [[2.1, 11.6], [3.4, 10.0], [7, 9.6], [11, 9.4], [15, 9.4], [19, 9.0], [23, 8.6], [27, 8.2], [29.0, 8.6], [30.8, 10.2], [32.0, 12.2], [36, 12.4]],
      },
    ],
    base: 15.0, baseH: 13, midH: 14.2,
    side({ X, span, side, team, ops, spots, forts }) {
      // the floating rock: a little sky island hovering a hand's width over a cart's head, reaching
      // well out toward the enemy so lobs coming down at an angle still land on it
      ops.push({ type: 'add', x: X(10.0), y: 17.1, rx: 2.8, ry: 1.3 });
      ops.push({ type: 'add', x: X(10.2), y: 16.2, rx: 1.9, ry: 0.65 });
      ops.push({ type: 'add', x: X(10.4), y: 15.8, rx: 0.6, ry: 0.35 });
      ops.push({ type: 'add', x: X(6.0), y: 8.6, rx: 0.9, ry: 1.6 });
      ops.push({ type: 'add', x: X(6.3), y: 7.2, rx: 0.45, ry: 0.9 });
      ops.push({ type: 'add', x: X(19.0), y: 7.8, rx: 0.9, ry: 1.5 });
      ops.push({ type: 'add', x: X(26.0), y: 7.2, rx: 1.0, ry: 1.6 });
      ops.push({ type: 'add', x: X(26.4), y: 5.8, rx: 0.45, ry: 0.9 });
      spots.push({
        kind: 'burrow', team, range: span(7.6, 10.2), sign: X(13.3), floor: 13.0,
        label: { name: '뜬바위 그늘', desc: '머리 위에 뜬 바위가 위에서 오는 공격을 막아 줘요. 양옆은 뚫려 있어 낮게 쏜 건 그대로 들어와요' },
      });
      spots.push({ kind: 'tree', team, range: span(20.5, 22.5), sign: X(19.8), label: { name: '단풍 명당' } });
      spots.push({ kind: 'high', team, range: span(27.7, 29.5), sign: X(30.0), label: { name: '벼랑 전망대', desc: '조준선이 두 배로 길어져요. 바로 앞은 협곡이에요' } });
      forts.push({ back: X(3.4), facing: side });
    },
    center({ W, spots }) {
      spots.push({ kind: 'bridge', team: -1, range: [32.4, W - 32.4], sign: null, signs: [31.8, W - 31.8] });
    },
    features: (W, M) => ({
      trees: [21.5, W - 21.5].map((x) => ({ x, kind: 'maple', h: 4.6, canopyR: 1.9, nuts: 5, hive: false, web: false, room: 1.5 })),
      crates: [{ x: M }], // a nut basket in the middle of the bridge
    }),
  },

  // 소나무 언덕 — king of the hill. One ridge from end to end. From the outer cliff: fort · start
  // · a hollow with a pine tree in it (a nut every turn, but the hill in front gets in the way of
  // your shots) · the climb · a ledge halfway up (lookout) · the summit under the great pine
  // (lookout + a nut every turn), three turns of climbing away and in plain view of both sides.
  pine: {
    top: [[2.2, 10.8], [3.4, 12.6], [11.0, 12.6], [14.6, 10.8], [16.2, 10.8], [20.2, 12.8], [25.0, 15.2], [28.0, 15.2], [32.6, 17.5], [36, 17.5]],
    flat: [[3.4, 11.0], [14.6, 16.2], [25.0, 28.0], [32.6, 36]],
    islands: [{ a: 2.3, b: 36, under: [[2.3, 11.0], [3.6, 9.8], [8, 9.0], [11, 8.9], [14, 8.0], [16, 7.6], [20, 7.6], [26, 7.0], [32, 6.2], [36, 5.8]] }],
    base: 9.4, baseH: 12.6, midH: 17.5,
    side({ X, span, side, team, ops, spots, forts }) {
      ops.push({ type: 'add', x: X(6.0), y: 7.6, rx: 1.0, ry: 1.7 });
      ops.push({ type: 'add', x: X(6.3), y: 6.0, rx: 0.5, ry: 1.0 });
      ops.push({ type: 'add', x: X(17.0), y: 5.6, rx: 1.0, ry: 1.7 });
      ops.push({ type: 'add', x: X(24.0), y: 4.8, rx: 1.1, ry: 1.8 });
      ops.push({ type: 'add', x: X(24.4), y: 3.4, rx: 0.5, ry: 0.9 });
      spots.push({ kind: 'tree', team, range: span(14.4, 16.4), sign: X(13.4), label: { name: '솔방울 명당', desc: '내 차례가 시작될 때마다 특수 견과 +1. 움푹 꺼진 데라 앞 오르막이 내 샷을 자주 막아요' } });
      spots.push({ kind: 'high', team, range: span(25.3, 27.7), sign: X(24.4), label: { name: '전망 턱' } });
      forts.push({ back: X(4.0), facing: side });
    },
    center({ M, W, ops, spots }) {
      ops.push({ type: 'add', x: M, y: 3.6, rx: 1.4, ry: 2.2 });
      spots.push({
        kind: 'crown', team: -1, range: [32.8, W - 32.8], sign: null, signs: [32.3, W - 32.3],
        label: { name: '솔방울 고지', desc: '조준선 두 배 + 내 차례마다 특수 견과 +1. 양쪽 어디서나 다 보여요' },
      });
    },
    features: (W, M) => ({
      trees: [
        { x: M, kind: 'pine', giant: true, h: 7.4, canopyR: 2.6, hpMul: 2, nuts: 6, hive: true, web: false, room: 2.4 },
        ...[15.4, W - 15.4].map((x) => ({ x, kind: 'pine', h: 4.6, canopyR: 1.8, nuts: 5, hive: false, web: false, room: 1.5 })),
      ],
    }),
  },

  // 반딧불 밤숲 — hop the islands. Home island: fort · start · a glowing mushroom pad that throws
  // you up to a small floating islet (lookout; thin, so it breaks under you) with a pad at each
  // end: back home, or down to the middle island. The middle island is split by a rock spire
  // (a nut basket on top); at its foot is the firefly tree (a nut every turn, flat shots from the
  // far side hit the spire), with a pad home at the outer edge.
  night: {
    top: [[2.4, 12.0], [3.4, 13.6], [15.4, 13.6], [16.6, 12.6], [28.2, 12.0], [29.2, 13.0], [34.8, 13.0], [35.4, 18.4], [36, 19.0]],
    flat: [[3.4, 15.4], [29.2, 34.8]],
    islands: [
      { a: 2.6, b: 16.4, under: [[2.6, 13.0], [3.8, 11.2], [7, 10.0], [11, 9.8], [14, 10.2], [16.4, 12.4]] },
      { a: 28.6, b: 36, under: [[28.6, 12.2], [30, 10.4], [33, 9.2], [36, 7.2]] },
    ],
    base: 9.6, baseH: 13.6, midH: 13.0,
    side({ X, span, side, team, ops, spots, forts }) {
      // the floating islet: flat on top, thick in the middle, thin at the ends
      ops.push({ type: 'add', x: X(22.0), y: 19.0, rx: 3.2, ry: 0.6 });
      ops.push({ type: 'add', x: X(22.0), y: 18.3, rx: 2.2, ry: 0.8 });
      ops.push({ type: 'add', x: X(22.3), y: 17.5, rx: 1.1, ry: 0.6 });
      ops.push({ type: 'add', x: X(22.2), y: 16.8, rx: 0.4, ry: 0.5 });
      ops.push({ type: 'add', x: X(6.5), y: 8.4, rx: 0.9, ry: 1.4 });
      ops.push({ type: 'add', x: X(6.8), y: 7.2, rx: 0.45, ry: 0.8 });
      ops.push({ type: 'add', x: X(32.0), y: 7.6, rx: 0.9, ry: 1.5 });
      const islet = 21; // look for its top from here down (it floats over the gap)
      spots.push({ kind: 'pad', team, range: span(13.6, 14.7), dir: side, to: { x: X(21.0), y: 19.55 }, apex: 23.2 });
      spots.push({ kind: 'pad', team, range: span(19.4, 20.2), dir: -side, to: { x: X(9.6), y: 13.6 }, apex: 23.0, top: islet });
      spots.push({
        kind: 'high', team, range: span(20.5, 23.5), sign: X(23.7), top: islet,
        label: { name: '반딧불 섬', desc: '조준선이 두 배로 길어져요. 작고 얇아서 잘 무너져요' },
      });
      spots.push({ kind: 'pad', team, range: span(23.8, 24.6), dir: side, to: { x: X(31.8), y: 13.0 }, apex: 22.6, top: islet });
      spots.push({ kind: 'pad', team, range: span(29.0, 30.0), dir: -side, to: { x: X(9.6), y: 13.6 }, apex: 25.0 });
      spots.push({ kind: 'tree', team, range: span(30.8, 33.4), sign: X(33.9), label: { name: '반딧불 명당', desc: '내 차례가 시작될 때마다 특수 견과 +1. 건너편에서 낮게 쏜 건 바위 기둥이 막아 줘요' } });
      forts.push({ back: X(3.8), facing: side });
    },
    center({ M, ops }) {
      // the spire's overhanging cap
      ops.push({ type: 'add', x: M, y: 19.0, rx: 1.5, ry: 0.55 });
      ops.push({ type: 'add', x: M, y: 6.0, rx: 1.2, ry: 2.0 });
    },
    features: (W, M) => ({
      trees: [32.0, W - 32.0].map((x) => ({ x, kind: 'chestnut', h: 4.4, canopyR: 1.8, nuts: 5, hive: false, web: false, room: 1.5 })),
      crates: [{ x: M }], // on top of the spire
    }),
  },
};

function cosInterp(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let k = 1; k < pts.length; k++) {
    if (x <= pts[k][0]) {
      const [x0, y0] = pts[k - 1], [x1, y1] = pts[k];
      const t = (x - x0) / (x1 - x0);
      return lerp(y0, y1, (1 - Math.cos(t * Math.PI)) / 2);
    }
  }
  return pts[pts.length - 1][1];
}

function buildFixed(id, seed) {
  const def = FIXED[id];
  const { W } = WORLD;
  const M = W / 2;
  const n1 = noise1D(seed + 11), nU = noise1D(seed + 37);
  const mirror = (x) => (x <= M ? x : W - x);
  // keep spots and paths dead flat; let the rest of the grass undulate a little
  const heights = (x) => {
    const mx = mirror(x);
    let h = cosInterp(def.top, mx);
    if (!def.flat.some(([a, b]) => mx > a - 0.2 && mx < b + 0.2)) h += n1(x * 0.5) * 0.12;
    return h;
  };
  // an island that reaches the middle is one island, mirrored onto itself
  const islandAt = (mx) => def.islands.find((i) => mx > i.a && (i.b >= M || mx < i.b));
  const under = (x) => {
    const mx = mirror(x);
    const isl = islandAt(mx);
    if (!isl) return Infinity;
    const calm = isl.calm && mx > isl.calm[0] && mx < isl.calm[1] ? 0.15 : 1;
    return cosInterp(isl.under, mx) + nU(x * 0.6) * 0.35 * calm;
  };
  const onIsland = (x) => under(x) < Infinity;
  const spans = [];
  for (const i of def.islands) {
    if (i.b >= M) spans.push({ a: i.a, b: W - i.a });
    else spans.push({ a: i.a, b: i.b }, { a: W - i.b, b: W - i.a });
  }
  spans.sort((p, q) => p.a - q.a);
  // where each spot is (what it does lives in spots.js)
  const ops = [], spots = [], forts = [];
  for (const side of [1, -1]) {
    const X = (x) => (side > 0 ? x : W - x);
    const span = (a, b) => (side > 0 ? [a, b] : [W - b, W - a]);
    def.side({ X, span, side, team: side > 0 ? 0 : 1, ops, spots, forts });
  }
  def.center({ M, W, ops, spots });
  return {
    heights, under, onIsland, spans, ops, bases: [def.base, W - def.base], baseH: [def.baseH, def.baseH], mid: M, midH: def.midH,
    features: { ...def.features(W, M), fixed: true }, spots, forts, fixed: id,
  };
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
