// Destructible terrain: a signed-distance grid (negative = solid) that is carved by
// explosions, contoured with marching squares, turned into planck chain loops for
// physics and into Path2D shapes for rendering. The land is a set of floating islands over a
// bottomless sea of clouds: dig through one and whoever stands on it falls.
import { clamp, lerp, rng, noise1D } from './util.js';
import { MAPS } from './maps.js';

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
    this.backs = opts.backs || []; // tunnels open at both ends: drawn dark inside while their roof stands
    this.paints = opts.paints || []; // ground of another stuff: an igloo's snow bricks, a rainbow of rock
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
    const rim = new Path2D(), drips = new Path2D(); // the underside's sky-lit edge, and moss or icicles hanging off it
    const flowers = [], shrooms = [], leaves = [], sunflowers = [];
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
      } else if (kind === 'sunflower') {
        sunflowers.push({ x: tx, y, h: (0.95 + hash(slot, 40) * 0.55) * s, lean: (hash(slot, 41) - 0.5) * 0.25, face: hash(slot, 42) < 0.5 ? -1 : 1 });
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
          rim.moveTo(x0, -y0);
          rim.lineTo(x1, -y1);
          // roots and vines dangling from the underside of the island
          const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
          for (let slot = Math.ceil(lo / SLOT); slot * SLOT < hi; slot++) {
            if (hash(slot, 41) > 0.5) continue;
            const tx = slot * SLOT + (hash(slot, 42) - 0.5) * 0.2;
            const t = (tx - x0) / dx;
            if (t < 0 || t > 1) continue;
            const ty = -(y0 + dy * t) - 0.06;
            if (st.drip === 'ice') {
              // icicles: thin, a few long ones
              const L = 0.15 + Math.pow(hash(slot, 43), 2.2) * 0.75, w = 0.05 + hash(slot, 44) * 0.06;
              drips.moveTo(tx - w, ty);
              drips.lineTo(tx + (hash(slot, 45) - 0.5) * 0.05, ty + L);
              drips.lineTo(tx + w, ty);
              drips.closePath();
            } else {
              // moss: a soft scalloped fringe, now and then a longer tuft
              const rr = 0.09 + hash(slot, 43) * 0.1, L = hash(slot, 44) < 0.25 ? 0.18 + hash(slot, 45) * 0.3 : 0;
              drips.moveTo(tx + rr, ty);
              drips.ellipse(tx, ty, rr, rr * 0.9 + L * 0.5, 0, 0, Math.PI);
            }
          }
          for (let slot = Math.ceil(lo / SLOT); slot * SLOT < hi; slot++) {
            if (hash(slot, 31) > 0.2) continue;
            const tx = slot * SLOT;
            const t = (tx - x0) / dx;
            if (t < 0 || t > 1) continue;
            const ty = -(y0 + dy * t) - 0.04;
            const L = 0.3 + Math.pow(hash(slot, 32), 1.6) * 1.3;
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
          // sparse: a plant here and there (a sunflower field stays a sunflower field)
          if (decor.length && hash(slot, 11) < (decor[Math.floor(hash(slot, 3) * decor.length)] === 'sunflower' ? 0.14 : 0.065)) addDecor(slot, tx, ty);
        }
      }
    }
    // a tunnel is open to the sky at both ends, so it is not a hole: fill it column by column from
    // its floor (which may climb) up to the underside of its roof, wherever the roof still stands
    // (a colored back gets its own path)
    const backPaths = [];
    for (const b of this.backs) {
      const into = b.color ? new Path2D() : holes;
      for (let x = b.x0; x <= b.x1 + 0.001; x += 0.25) {
        const cx = x + 0.125;
        let y = b.y0 + 0.1, floor = null, top = null;
        for (; y <= b.y1 + 0.6; y += 0.1) if (!this.solid(cx, y)) { floor = y; break; }
        if (floor == null) continue;
        for (; y <= b.y1 + 0.6; y += 0.1) if (this.solid(cx, y)) { top = y; break; }
        if (top != null) into.rect(x - 0.01, -(top + 0.15), 0.27, top - floor + 0.45);
      }
      if (b.color) backPaths.push({ path: into, color: b.color });
    }
    this.backPaths = backPaths;
    this.path = path;
    this.holePath = holes;
    this.grassPath = grass;
    this.tuftPath = tufts;
    this.flowers = flowers;
    this.sunflowers = sunflowers;
    this.decor = { fern, fernHi, bush, bushHi, clover, needles, shrooms, leaves };
    this.hanging = { roots, vines, vineLeaves, rim, drips };
  }

  // Part of the ground painted as something else (already clipped to what's left of the ground):
  // 'snow' packed snow bricks inside an ellipse (only above `above`, if given), 'rainbow' bands
  // following an elliptical arch.
  _paint(ctx, p) {
    ctx.save();
    if (p.kind === 'snow') {
      if (p.above != null) { ctx.beginPath(); ctx.rect(p.x - p.rx - 1, -(p.y + p.ry + 1), p.rx * 2 + 2, p.y + p.ry + 1 - p.above); ctx.clip(); }
      ctx.beginPath();
      ctx.ellipse(p.x, -p.y, p.rx, p.ry, 0, 0, Math.PI * 2);
      ctx.clip();
      const g = ctx.createLinearGradient(0, -(p.y + p.ry), 0, -(p.y - p.ry));
      g.addColorStop(0, '#fbfdff');
      g.addColorStop(1, '#cfdeee');
      ctx.fillStyle = g;
      ctx.fillRect(p.x - p.rx, -(p.y + p.ry), p.rx * 2, p.ry * 2);
      // the blocks: rows of bricks, each row offset by half a brick
      ctx.beginPath();
      for (let row = 0, y = p.y - p.ry; y < p.y + p.ry; row++, y += 0.62) {
        ctx.moveTo(p.x - p.rx, -y);
        ctx.lineTo(p.x + p.rx, -y);
        for (let x = p.x - p.rx + (row % 2 ? 0.5 : 0); x < p.x + p.rx; x += 1.0) {
          ctx.moveTo(x, -y);
          ctx.lineTo(x, -(y + 0.62));
        }
      }
      ctx.strokeStyle = 'rgba(140,170,205,0.6)';
      ctx.lineWidth = 0.05;
      ctx.stroke();
    } else if (p.kind === 'rainbow') {
      const cols = ['#ff8a8a', '#ffbf6a', '#ffe680', '#9de08c', '#86c4ff', '#b79cf2'];
      const w = p.w / cols.length;
      ctx.lineWidth = w * 1.02;
      cols.forEach((c, i) => {
        const off = p.w / 2 - w * (i + 0.5);
        ctx.strokeStyle = c;
        ctx.beginPath();
        ctx.ellipse(p.x, -p.y, p.rx + off, p.ry + off, 0, Math.PI, Math.PI * 2);
        ctx.stroke();
      });
    }
    ctx.restore();
  }

  // The stone under the topsoil: everything more than ~1.2–1.8 m below the original surface (the
  // terrain clip keeps it inside whatever ground is left).
  _stoneLayer() {
    const p = new Path2D(), h = this.heights, n = noise1D(this.seed + 91);
    p.moveTo(-2, 2);
    for (let x = -2; x <= WORLD.W + 2; x += 0.25) p.lineTo(x, -(h(x) - 1.5 - n(x * 0.35) * 0.35 - Math.sin(x * 1.7) * 0.08));
    p.lineTo(WORLD.W + 2, 2);
    p.closePath();
    return p;
  }

  draw(ctx, style, pattern, view) {
    const s = style;
    ctx.save();
    // enclosed caves read as dark hollows, not windows to the sky
    ctx.fillStyle = s.cave || 'rgba(30,16,8,0.82)';
    ctx.fill(this.holePath);
    for (const bp of this.backPaths) { ctx.fillStyle = bp.color; ctx.fill(bp.path); }
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
    // below the topsoil: a band of stone, its upper edge following the original surface
    if (!this._rock) this._rock = makeRockPattern(ctx, s, this.seed);
    if (!this._rockPath) this._rockPath = this._stoneLayer();
    ctx.fillStyle = this._rock;
    ctx.fill(this._rockPath);
    // soil spilling over the top of the stone, so the two blend instead of meeting at a line
    ctx.lineWidth = 0.7;
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = pattern || s.dirt;
    ctx.stroke(this._rockPath);
    ctx.globalAlpha = 1;
    ctx.fillStyle = this._depthGrad;
    ctx.fillRect(-2, -WORLD.H, WORLD.W + 4, WORLD.H + 2);
    // the underside catches a little light from the sky below
    if (this.hanging) {
      ctx.lineWidth = 0.55;
      ctx.strokeStyle = s.rim || 'rgba(205,232,255,0.32)';
      ctx.stroke(this.hanging.rim);
    }
    for (const p of this.paints) this._paint(ctx, p);
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
      ctx.fillStyle = s.drip === 'ice' ? 'rgba(232,244,255,0.92)' : s.grassDark;
      ctx.fill(hg.drips);
      if (s.drip === 'ice') { ctx.lineWidth = 0.025; ctx.strokeStyle = 'rgba(150,185,220,0.8)'; ctx.stroke(hg.drips); }
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
    if (this.sunflowers && this.sunflowers.length) this._drawSunflowers(ctx, view);
    if (d) this._drawSmallDecor(ctx, d, s);
    ctx.restore();
  }

  // tall sunflowers standing in the grass, heads nodding toward the sun
  _drawSunflowers(ctx, view) {
    ctx.save();
    ctx.lineCap = 'round';
    for (const f of this.sunflowers) {
      if (view && (f.x < view.x0 - 2 || f.x > view.x1 + 2)) continue;
      const hx = f.x + f.lean, hy = f.y - f.h;
      ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.quadraticCurveTo(f.x + f.lean * 0.2, f.y - f.h * 0.5, hx, hy);
      ctx.strokeStyle = '#2f6e1e'; ctx.lineWidth = 0.09; ctx.stroke();
      ctx.strokeStyle = '#5aa83a'; ctx.lineWidth = 0.05; ctx.stroke();
      for (const [u, side] of [[0.45, -1], [0.62, 1]]) {
        const lx = f.x + f.lean * u * u, ly = f.y - f.h * u;
        ctx.beginPath(); ctx.ellipse(lx + side * 0.17, ly + 0.02, 0.19, 0.08, side * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = '#4e9a2e'; ctx.fill(); ctx.lineWidth = 0.025; ctx.strokeStyle = '#1f4a10'; ctx.stroke();
      }
      ctx.save(); ctx.translate(hx, hy); ctx.rotate(f.face * 0.25);
      ctx.beginPath();
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        ctx.moveTo(0, 0);
        ctx.ellipse(Math.cos(a) * 0.2, Math.sin(a) * 0.2, 0.13, 0.055, a, 0, Math.PI * 2);
      }
      ctx.fillStyle = '#ffcc1f'; ctx.fill(); ctx.lineWidth = 0.022; ctx.strokeStyle = '#b07a08'; ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 0.14, 0, Math.PI * 2);
      ctx.fillStyle = '#6a3a14'; ctx.fill(); ctx.strokeStyle = '#3a1c06'; ctx.stroke();
      ctx.beginPath(); ctx.arc(-0.04, -0.04, 0.05, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,220,150,0.35)'; ctx.fill();
      ctx.restore();
    }
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
// The battlefield of a map (see maps.js), whole, left to right. `flip` swaps the two homes: every
// x becomes W − x and the left home's team becomes the right one's, so a match can put either
// player on either side of a map that is not a mirror image.
export function buildLandscape(layout, seed, flip = false) {
  const { W } = WORLD;
  const raw = MAPS[layout.fixed](W);
  const def = flip ? flipped(raw, W) : raw;
  const n1 = noise1D(seed + 11), nU = noise1D(seed + 37);
  // keep spots and roads dead flat; let the rest of the grass undulate a little
  const heights = (x) => {
    let h = cosInterp(def.top, x);
    if (!def.flat.some(([a, b]) => x > a - 0.2 && x < b + 0.2)) h += n1(x * 0.5) * 0.12;
    return h;
  };
  const islandAt = (x) => def.islands.find((i) => x > i.a && x < i.b);
  const under = (x) => {
    const isl = islandAt(x);
    if (!isl) return Infinity;
    const calm = isl.calm && x > isl.calm[0] && x < isl.calm[1] ? 0.15 : 1;
    return cosInterp(isl.under, x) + nU(x * 0.6) * 0.35 * calm;
  };
  const onIsland = (x) => under(x) < Infinity;
  const spans = def.islands.map((i) => ({ a: i.a, b: i.b })).sort((p, q) => p.a - q.a);
  return {
    heights, under, onIsland, spans, ops: def.ops, bases: def.bases, mid: W / 2,
    features: { ...(def.features || {}), fixed: true }, spots: def.spots, forts: def.forts,
    fixed: layout.fixed, backs: def.backs || [], paints: def.paints || [], flip,
  };
}

// A map seen in a mirror (see buildLandscape).
function flipped(d, W) {
  const fx = (x) => W - x;
  const fr = ([a, b]) => [W - b, W - a];
  const team = (t) => (t < 0 ? t : 1 - t);
  const pts = (l) => l.map(([x, y]) => [fx(x), y]).reverse();
  const o = { ...d };
  o.top = pts(d.top);
  o.flat = d.flat.map(fr);
  o.islands = d.islands.map((i) => ({ ...i, a: fx(i.b), b: fx(i.a), under: pts(i.under), calm: i.calm && fr(i.calm) }));
  o.bases = [fx(d.bases[1]), fx(d.bases[0])];
  o.ops = d.ops.map((op) => ({ ...op, x: fx(op.x) }));
  o.spots = d.spots.map((s) => ({
    ...s, team: team(s.team), range: fr(s.range),
    sign: s.sign == null ? s.sign : fx(s.sign), signs: s.signs && s.signs.map(fx),
    dir: s.dir && -s.dir, to: s.to && { ...s.to, x: fx(s.to.x) },
  }));
  o.forts = [d.forts[1], d.forts[0]].map((f) => ({ ...f, back: fx(f.back), facing: -f.facing }));
  const f = d.features || {};
  o.features = { ...f, trees: (f.trees || []).map((t) => ({ ...t, x: fx(t.x) })), crates: (f.crates || []).map((c) => ({ ...c, x: fx(c.x) })) };
  o.backs = (d.backs || []).map((b) => ({ ...b, x0: fx(b.x1), x1: fx(b.x0) }));
  o.paints = (d.paints || []).map((p) => ({ ...p, x: fx(p.x) }));
  return o;
}

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

const hex2 = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const rgba = (c, a) => `rgba(${hex2(c).join(',')},${a})`;
const mixHex = (a, b, t) => '#' + hex2(a).map((v, i) => Math.round(v + (hex2(b)[i] - v) * t).toString(16).padStart(2, '0')).join('');

// Tileable stone texture for the island's deep rock, 64px per meter: packed boulders of mixed size,
// each with a lit top and a shaded bottom, in the soil's own tones pulled toward warm grey.
export function makeRockPattern(ctx, style, seed) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const r = rng(seed + 7);
  const base = mixHex(style.dirtDark, '#7d7680', 0.45);
  const joint = mixHex(base, '#1e1a1c', 0.35);
  const tones = [base, mixHex(base, style.dirt, 0.35), mixHex(base, '#8a8590', 0.25)];
  g.fillStyle = joint;
  g.fillRect(0, 0, S, S);
  // pack boulders: biggest first, each kept off the others
  const stones = [];
  for (let tries = 0; tries < 1400 && stones.length < 60; tries++) {
    const rad = stones.length < 12 ? 22 + r() * 16 : 9 + r() * 14;
    const x = r() * S, y = r() * S;
    let ok = true;
    for (const q of stones) {
      for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
        if (Math.hypot(x - q.x - ox, y - q.y - oy) < rad + q.rad + 2) ok = false;
      }
      if (!ok) break;
    }
    if (ok) stones.push({ x, y, rad, sq: 0.7 + r() * 0.25, rot: (r() - 0.5) * 0.6, tone: tones[Math.floor(r() * tones.length)] });
  }
  for (const q of stones) {
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      const x = q.x + ox, y = q.y + oy;
      if (x < -q.rad * 2 || x > S + q.rad * 2 || y < -q.rad * 2 || y > S + q.rad * 2) continue;
      g.fillStyle = q.tone;
      g.beginPath(); g.ellipse(x, y, q.rad, q.rad * q.sq, q.rot, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.16)'; // shaded underside
      g.beginPath(); g.ellipse(x + 1, y + q.rad * q.sq * 0.35, q.rad * 0.85, q.rad * q.sq * 0.55, q.rot, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.13)'; // lit top
      g.beginPath(); g.ellipse(x - q.rad * 0.2, y - q.rad * q.sq * 0.4, q.rad * 0.55, q.rad * q.sq * 0.28, q.rot, 0, Math.PI * 2); g.fill();
    }
  }
  const pat = ctx.createPattern(c, 'repeat');
  if (pat.setTransform) pat.setTransform(new DOMMatrix().scale(1 / 64));
  return pat;
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
