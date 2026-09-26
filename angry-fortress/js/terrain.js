// Destructible terrain: a signed-distance grid (negative = solid) that is carved by
// explosions, contoured with marching squares, turned into planck chain loops for
// physics and into Path2D shapes for rendering.
import { clamp, lerp, rng, noise1D } from './util.js';

export const WORLD = { W: 72, H: 40, CELL: 0.25, SEA: 2.6, SEA0: 2.6 };

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
    this._generate(opts);
    this._contour();
  }

  // ---------- generation ----------
  _generate(opts) {
    const { nx, ny, cell, f, stride } = this;
    const h = opts.heights;
    for (let i = 0; i <= nx; i++) {
      const x = i * cell;
      const hx = h(x);
      for (let j = 0; j <= ny; j++) {
        const y = j * cell;
        f[j * stride + i] = clamp(y - hx, -SDF_MAX, SDF_MAX);
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
    this.craters.push({ x: cx, y: cy, r });
    if (this.craters.length > 80) this.craters.shift();
    if (changed) {
      this._removeDust();
      this._contour();
      this.version++;
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
    const flowers = [];
    const r = rng(this.seed * 7 + this.version * 13 + 1);
    const { stride, cell, scar } = this;
    const isScar = (x, y) => {
      const i = Math.round(x / cell), j = Math.round(y / cell);
      return scar[j * stride + i] === 1;
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
      let acc = 0;
      for (let k = 0; k < n; k += 2) {
        const x0 = l[k], y0 = l[k + 1];
        const x1 = l[(k + 2) % n], y1 = l[(k + 3) % n];
        const dx = x1 - x0, dy = y1 - y0;
        const len = Math.hypot(dx, dy) || 1;
        const nyUp = -dx / len; // outward (right-hand) normal y component
        const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
        const ok = nyUp > 0.42 && !isScar(mx, my) && my > WORLD.SEA - 0.2;
        if (ok) {
          if (!drawing) { grass.moveTo(x0, -y0); drawing = true; }
          grass.lineTo(x1, -y1);
          // tufts
          acc += len;
          while (acc > 0.32) {
            acc -= 0.32 + r() * 0.2;
            const t = r();
            const tx = x0 + dx * t, ty = y0 + dy * t;
            const hgt = 0.14 + r() * 0.16;
            const lean = (r() - 0.5) * 0.12;
            tufts.moveTo(tx - 0.07, -ty + 0.02);
            tufts.lineTo(tx + lean - 0.03, -ty - hgt);
            tufts.lineTo(tx, -ty + 0.02);
            tufts.lineTo(tx + lean + 0.06, -ty - hgt * 0.75);
            tufts.lineTo(tx + 0.07, -ty + 0.02);
            tufts.closePath();
            if (this.style.flowers && r() < 0.07) {
              flowers.push({ x: tx + (r() - 0.5) * 0.1, y: -ty - 0.16 - r() * 0.1, c: r.pick(this.style.flowers), s: 0.06 + r() * 0.04 });
            }
          }
        } else {
          drawing = false;
        }
      }
    }
    this.path = path;
    this.holePath = holes;
    this.grassPath = grass;
    this.tuftPath = tufts;
    this.flowers = flowers;
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
    ctx.restore();
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
// Produces a height function + SDF ops for a given theme layout.
export function buildLandscape(layout, seed) {
  const { W, SEA } = WORLD;
  const r = rng(seed);
  const n1 = noise1D(seed + 11);
  const n2 = noise1D(seed + 23);
  const bases = [W * 0.17 + r.range(-1.5, 1.5), W * 0.83 + r.range(-1.5, 1.5)];
  const baseH = [r.range(layout.baseMin, layout.baseMax), r.range(layout.baseMin, layout.baseMax)];
  const mid = W / 2 + r.range(-3, 3);
  const midH = r.range(layout.midMin, layout.midMax);
  // control points for the big shape
  const cps = [
    [-1, -2],
    [2.2, SEA - 1.5],
    [5.5, baseH[0] - 1.5],
    [bases[0] - 3, baseH[0]],
    [bases[0] + 7, baseH[0]],
  ];
  if (layout.mid === 'twin') {
    cps.push([mid - 8, midH], [mid - 1.5, lerp(baseH[0], baseH[1], 0.5) - 2.5], [mid + 1.5, lerp(baseH[0], baseH[1], 0.5) - 2.5], [mid + 8, midH]);
  } else if (layout.mid === 'valley') {
    cps.push([mid - 7, lerp(baseH[0], midH, 0.5)], [mid, midH], [mid + 7, lerp(baseH[1], midH, 0.5)]);
  } else {
    cps.push([mid - 7, lerp(baseH[0], midH, 0.55)], [mid, midH], [mid + 7, lerp(baseH[1], midH, 0.55)]);
  }
  cps.push([bases[1] - 7, baseH[1]], [bases[1] + 3, baseH[1]], [W - 5.5, baseH[1] - 1.5], [W - 2.2, SEA - 1.5], [W + 1, -2]);
  cps.sort((a, b) => a[0] - b[0]);
  const plateaus = [
    [bases[0] - 3, bases[0] + 7, baseH[0]],
    [bases[1] - 7, bases[1] + 3, baseH[1]],
  ];
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
  const ops = [];
  if (layout.arch) {
    ops.push({ type: 'sub', x: mid, y: midH * 0.55, rx: 2.6, ry: 1.9 });
  }
  if (layout.island) {
    const ix = mid + r.range(-4, 4);
    const iy = midH + r.range(5, 7);
    ops.push({ type: 'add', x: ix, y: iy, rx: 3.2, ry: 0.9 });
    ops.push({ type: 'add', x: ix + 0.4, y: iy - 0.7, rx: 2.2, ry: 0.9 });
  }
  if (layout.caves) {
    for (let c = 0; c < layout.caves; c++) {
      const cx = lerp(bases[0] + 9, bases[1] - 9, r());
      const hy = heights(cx);
      ops.push({ type: 'sub', x: cx, y: hy - r.range(2.5, 4), rx: r.range(1.4, 2.4), ry: r.range(0.8, 1.2) });
    }
  }
  if (layout.spire) {
    ops.push({ type: 'add', x: mid, y: midH + 2.5, rx: 1.1, ry: 3.2 });
  }
  return { heights, ops, bases, baseH, mid, midH };
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
  const pat = ctx.createPattern(c, 'repeat');
  try {
    pat.setTransform(new DOMMatrix().scale(1 / 64));
  } catch (e) {
    /* older browsers: pattern at 1px per meter would be wrong, fall back to flat */
    return null;
  }
  return pat;
}
