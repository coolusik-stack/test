// Forest backdrop: sky, sun or moon with light shafts, layered tree lines with mist,
// undergrowth behind the playfield, a forest stream with reeds and lily pads, and
// ambient pollen / falling leaves / mist / fireflies.
import { rng, noise1D, clamp } from './util.js';
import { WORLD } from './terrain.js';

const YREF = 12; // world height where parallax layers line up with the playfield
const TAU = Math.PI * 2;

export class Scene {
  constructor(theme, seed) {
    this.t = theme;
    this.seed = seed;
    const r = rng(seed * 3 + 5);
    this.r = r;
    this.far = this._forestLine(0.18, seed + 1, 9, 6.5, r);
    this.mid = this._treeLayer(0.42, seed + 2, 5, r, theme.bgTree === 'pine' ? 'pine' : 'round', 1.0);
    this.near = this._treeLayer(0.7, seed + 3, 2.5, r, theme.bgTree === 'pine' ? 'pine' : 'round', 1.9);
    this.clouds = [];
    for (let i = 0; i < (theme.clouds ?? 5); i++) {
      this.clouds.push({
        x: r.range(-30, WORLD.W + 30),
        y: r.range(WORLD.H * 0.5, WORLD.H * 0.8),
        s: r.range(0.8, 1.6),
        p: r.range(0.12, 0.25),
        puffs: Array.from({ length: 5 }, (_, k) => ({ dx: (k - 2) * 1.1 + r.range(-0.3, 0.3), dy: r.range(0, 0.9) * (k === 2 ? 1.4 : 1), rad: r.range(0.9, 1.5) * (k === 2 ? 1.35 : 1) })),
      });
    }
    this.stars = Array.from({ length: 70 }, () => ({ x: r(), y: r() * 0.6, s: r.range(0.8, 1.8), ph: r() * TAU }));
    this.motes = [];
    const n = theme.ambient === 'firefly' ? 34 : theme.ambient === 'mist' ? 10 : 42;
    for (let i = 0; i < n; i++) this.motes.push(this._mote(true));
    this.frame = this._canopyFrame(r);
    this.shore = null;
    this.brush = null;
  }

  // Called once the landscape exists: undergrowth behind the terrain, reeds and lily pads at the shore.
  setLand(land) {
    const r = rng(this.seed * 7 + 11);
    const h = land.heights;
    const brush = new Path2D();
    const brushHi = new Path2D();
    for (let x = -2; x <= WORLD.W + 2; x += r.range(0.7, 1.4)) {
      const y = h(x);
      if (y < WORLD.SEA0 + 0.4) continue;
      const s = r.range(0.7, 1.4);
      const top = -(y + 0.2);
      for (const [dx, dy, rr] of [[-0.6, 0.1, 0.55], [0, -0.35, 0.75], [0.6, 0.05, 0.55]]) {
        brush.moveTo(x + dx * s + rr * s, top + dy * s);
        brush.arc(x + dx * s, top + dy * s, rr * s, 0, TAU);
        brushHi.moveTo(x + dx * s - 0.12 * s + rr * s * 0.55, top + dy * s - 0.15 * s);
        brushHi.arc(x + dx * s - 0.12 * s, top + dy * s - 0.15 * s, rr * s * 0.55, 0, TAU);
      }
    }
    this.brush = { path: brush, hi: brushHi };
    // shore points: where the ground drops into the stream
    const shores = [];
    let prev = h(0) > WORLD.SEA0;
    for (let x = 0.25; x < WORLD.W; x += 0.25) {
      const above = h(x) > WORLD.SEA0 + 0.1;
      if (above !== prev) shores.push({ x, dir: above ? -1 : 1 });
      prev = above;
    }
    this.reeds = [];
    this.pads = [];
    for (const s of shores) {
      for (let k = 0; k < 7; k++) {
        this.reeds.push({ x: s.x + s.dir * r.range(-0.4, 1.6), h: r.range(0.8, 1.7), lean: r.range(-0.15, 0.15), ph: r() * TAU, cat: r() < 0.45 });
      }
      for (let k = 0; k < 3; k++) this.pads.push({ x: s.x + s.dir * r.range(1.8, 5), r: r.range(0.35, 0.6), rot: r() * TAU, flower: r() < 0.35, ph: r() * TAU });
    }
  }

  _forestLine(par, seed, amp, base, r) {
    const n = noise1D(seed);
    const path = new Path2D();
    const x0 = -90, x1 = WORLD.W + 90;
    const hAt = (x) => WORLD.SEA + base + amp * (0.5 + 0.5 * n(x * 0.03));
    path.moveTo(x0, 40);
    for (let x = x0; x <= x1; x += 1) path.lineTo(x, -hAt(x));
    path.lineTo(x1, 40);
    path.closePath();
    // canopy bumps along the ridge read as a distant tree line
    for (let x = x0; x <= x1; x += r.range(0.9, 1.6)) {
      const rr = r.range(0.9, 1.7);
      path.moveTo(x + rr, -hAt(x) - rr * 0.35);
      path.arc(x, -hAt(x) - rr * 0.35, rr, 0, TAU);
    }
    return { par, path };
  }

  _treeLayer(par, seed, base, r, shape, scale) {
    const n = noise1D(seed);
    const body = new Path2D();
    const hi = new Path2D();
    const trunks = new Path2D();
    const x0 = -90, x1 = WORLD.W + 90;
    const gAt = (x) => WORLD.SEA + base + 2.5 * n(x * 0.04);
    body.moveTo(x0, 40);
    for (let x = x0; x <= x1; x += 1) body.lineTo(x, -gAt(x));
    body.lineTo(x1, 40);
    body.closePath();
    for (let x = x0; x <= x1; x += r.range(2.2, 4.2) * scale) {
      const g = -gAt(x) + 0.3;
      const s = r.range(0.8, 1.25) * scale;
      const th = r.range(2.6, 4) * s;
      trunks.rect(x - 0.16 * s, g - th, 0.32 * s, th);
      if (shape === 'pine') {
        for (let k = 0; k < 4; k++) {
          const w = (1.5 - k * 0.3) * s, yy = g - th * 0.45 - k * 0.95 * s;
          body.moveTo(x - w, yy);
          body.lineTo(x, yy - 1.5 * s);
          body.lineTo(x + w, yy);
          body.closePath();
          hi.moveTo(x - w * 0.55, yy - 0.2 * s);
          hi.lineTo(x - 0.05 * s, yy - 1.35 * s);
          hi.lineTo(x + w * 0.05, yy - 0.2 * s);
          hi.closePath();
        }
      } else {
        const cy = g - th - 0.5 * s;
        for (const [dx, dy, rr] of [[-0.9, 0.3, 1.0], [0.9, 0.35, 1.0], [0, -0.45, 1.25], [-0.2, 0.55, 0.9]]) {
          body.moveTo(x + dx * s + rr * s, cy + dy * s);
          body.arc(x + dx * s, cy + dy * s, rr * s, 0, TAU);
          hi.moveTo(x + dx * s - 0.25 * s + rr * s * 0.55, cy + dy * s - 0.3 * s);
          hi.arc(x + dx * s - 0.25 * s, cy + dy * s - 0.3 * s, rr * s * 0.55, 0, TAU);
        }
      }
    }
    return { par, body, hi, trunks, groundAt: gAt };
  }

  // Leaf clusters hanging into the top of the backdrop (screen space, gentle parallax).
  _canopyFrame(r) {
    const blobs = [];
    // only in the two top corners, like branches reaching in from outside the frame
    for (let i = 0; i < 16; i++) {
      const left = i % 2 === 0;
      const u = left ? r.range(-0.04, 0.16) : r.range(0.84, 1.04);
      const v = r.range(-0.03, 0.07) + (left ? u : 1 - u) * -0.15;
      blobs.push({ u, v, rad: r.range(0.035, 0.065), ph: r() * TAU });
    }
    return blobs;
  }

  _mote(init) {
    const r = this.r;
    return { x: r(), y: init ? r() : -0.05, s: r.range(0.5, 1.2), ph: r() * TAU, v: r.range(0.6, 1.2), blink: r() * TAU };
  }

  update(dt, wind) {
    for (const c of this.clouds) {
      c.x += (0.2 + wind * 0.06) * dt;
      if (c.x > WORLD.W + 60) c.x = -50;
      if (c.x < -60) c.x = WORLD.W + 50;
    }
    const kind = this.t.ambient;
    for (const m of this.motes) {
      m.ph += dt * (kind === 'firefly' ? 0.9 : 1.5);
      m.blink += dt * 2.2;
      if (kind === 'leaf') {
        m.y += 0.03 * m.v * dt;
        m.x += (wind * 0.012 + Math.sin(m.ph) * 0.012) * dt * m.v;
      } else if (kind === 'pollen') {
        m.y += Math.sin(m.ph * 0.7) * 0.006 * dt - 0.004 * dt;
        m.x += (wind * 0.006 + Math.cos(m.ph * 0.5) * 0.006) * dt;
      } else if (kind === 'firefly') {
        m.y += Math.sin(m.ph * 1.3) * 0.02 * dt;
        m.x += (Math.cos(m.ph) * 0.02 + wind * 0.003) * dt;
      } else {
        m.x += (0.006 + wind * 0.004) * dt * m.v;
      }
      if (m.y > 1.05 || m.y < -0.08 || m.x > 1.1 || m.x < -0.1) {
        Object.assign(m, this._mote(kind !== 'leaf'));
        if (kind === 'mist') m.x = wind >= 0 ? -0.1 : 1.1;
      }
    }
  }

  // ---------------------------------------------------------------- backdrop (screen space)
  drawBack(ctx, cam, vw, vh, dpr, time) {
    const t = this.t;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, vh);
    g.addColorStop(0, t.sky[0]);
    g.addColorStop(0.55, t.sky[1]);
    g.addColorStop(1, t.sky[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, vw, vh);
    if (t.night) {
      ctx.fillStyle = '#fff';
      for (const s of this.stars) {
        ctx.globalAlpha = 0.35 + 0.45 * Math.abs(Math.sin(time * 0.8 + s.ph));
        ctx.fillRect(s.x * vw, s.y * vh, s.s, s.s);
      }
      ctx.globalAlpha = 1;
    }
    // sun / moon
    const sx = vw * t.sun.x - (cam.x - WORLD.W / 2) * cam.zoom * 0.04;
    const sy = vh * t.sun.y + (cam.y - 14) * cam.zoom * 0.03;
    const sr = Math.max(24, Math.min(vw, vh) * 0.07);
    const glow = ctx.createRadialGradient(sx, sy, sr * 0.6, sx, sy, sr * 3.6);
    glow.addColorStop(0, t.sun.glow);
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sx - sr * 3.6, sy - sr * 3.6, sr * 7.2, sr * 7.2);
    ctx.fillStyle = t.sun.color;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, TAU);
    ctx.fill();
    if (t.sun.moon) {
      ctx.fillStyle = 'rgba(190,190,220,0.35)';
      ctx.beginPath(); ctx.arc(sx - sr * 0.3, sy - sr * 0.2, sr * 0.22, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(sx + sr * 0.35, sy + sr * 0.3, sr * 0.14, 0, TAU); ctx.fill();
    }
    for (const c of this.clouds) this._drawCloud(ctx, c, cam, vw, vh, dpr);
    const z = cam.zoom;
    const layerT = (par) => {
      const ty = vh / 2 + ((cam.y - YREF) * par + YREF) * z;
      ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (vw / 2 - cam.x * par * z), dpr * ty);
    };
    // distant tree line + mist
    layerT(this.far.par);
    ctx.fillStyle = t.far;
    ctx.fill(this.far.path);
    this._mist(ctx, vw, vh, dpr, cam, this.far.par, WORLD.SEA + 13, 0.9);
    // light shafts fall across the middle distance
    if (t.rays) this._rays(ctx, vw, vh, dpr, sx, sy, time);
    // mid trees
    layerT(this.mid.par);
    ctx.fillStyle = t.mid[0];
    ctx.fill(this.mid.trunks);
    ctx.fill(this.mid.body);
    ctx.fillStyle = t.mid[1];
    ctx.globalAlpha = 0.55;
    ctx.fill(this.mid.hi);
    ctx.globalAlpha = 1;
    this._mist(ctx, vw, vh, dpr, cam, this.mid.par, WORLD.SEA + 7.5, 0.7);
    // near trees
    layerT(this.near.par);
    ctx.fillStyle = t.near[1];
    ctx.fill(this.near.trunks);
    ctx.fillStyle = t.near[0];
    ctx.fill(this.near.body);
    ctx.fillStyle = t.mid[1];
    ctx.globalAlpha = 0.35;
    ctx.fill(this.near.hi);
    ctx.globalAlpha = 1;
    this._mist(ctx, vw, vh, dpr, cam, this.near.par, WORLD.SEA + 4.5, 0.8);
    // leaves hanging into the top of the view
    this._frameLeaves(ctx, vw, vh, dpr, cam, time);
  }

  _mist(ctx, vw, vh, dpr, cam, par, worldY, strength) {
    const z = cam.zoom;
    const y = vh / 2 + ((cam.y - YREF) * par + YREF - worldY) * z;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const band = Math.max(40, 5 * z);
    const g = ctx.createLinearGradient(0, y - band, 0, y + band * 1.4);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.55, this.t.mist);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalAlpha = strength;
    ctx.fillStyle = g;
    ctx.fillRect(0, y - band, vw, band * 2.4);
    ctx.globalAlpha = 1;
  }

  _rays(ctx, vw, vh, dpr, sx, sy, time) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = this.t.rays;
    const len = Math.hypot(vw, vh) * 1.2;
    for (let i = 0; i < 6; i++) {
      const a = Math.PI * 0.5 + (sx > vw / 2 ? 0.35 : -0.35) + (i - 2.5) * 0.12;
      const w = 0.025 + (i % 3) * 0.012;
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(time * 0.4 + i * 1.7);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + Math.cos(a - w) * len, sy + Math.sin(a - w) * len);
      ctx.lineTo(sx + Math.cos(a + w) * len, sy + Math.sin(a + w) * len);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  _frameLeaves(ctx, vw, vh, dpr, cam, time) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const base = Math.min(vw, vh);
    const leaf = this.t.mid[0], hi = this.t.mid[1];
    for (const pass of [0, 1]) {
      ctx.fillStyle = pass ? hi : leaf;
      ctx.globalAlpha = pass ? 0.5 : 0.95;
      ctx.beginPath();
      for (const b of this.frame) {
        const x = b.u * vw + Math.sin(time * 0.5 + b.ph) * 2;
        const y = b.v * vh + Math.cos(time * 0.6 + b.ph) * 1.5;
        const rr = b.rad * base * (pass ? 0.5 : 1);
        const ox = pass ? -rr * 0.5 : 0, oy = pass ? -rr * 0.5 : 0;
        ctx.moveTo(x + ox + rr, y + oy);
        ctx.ellipse(x + ox, y + oy, rr, rr * 0.8, b.ph, 0, TAU);
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  _drawCloud(ctx, c, cam, vw, vh, dpr) {
    const z = cam.zoom;
    const px = vw / 2 + (c.x - cam.x * c.p) * z * 0.8;
    const py = vh / 2 + ((cam.y - YREF) * c.p + YREF - c.y) * z;
    const s = c.s * z;
    if (px < -8 * s || px > vw + 8 * s) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = this.t.cloudShade;
    ctx.beginPath();
    for (const p of c.puffs) {
      ctx.moveTo(px + p.dx * s + p.rad * s, py - p.dy * s + 0.25 * s);
      ctx.arc(px + p.dx * s, py - p.dy * s + 0.25 * s, p.rad * s, 0, TAU);
    }
    ctx.fill();
    ctx.fillStyle = this.t.cloud;
    ctx.beginPath();
    for (const p of c.puffs) {
      ctx.moveTo(px + p.dx * s + p.rad * s * 0.94, py - p.dy * s);
      ctx.arc(px + p.dx * s, py - p.dy * s, p.rad * s * 0.94, 0, TAU);
    }
    ctx.fill();
  }

  // ---------------------------------------------------------------- playfield plane (world space)
  // Undergrowth that sits just behind the terrain surface.
  drawBackTrees(ctx) {
    if (!this.brush) return;
    ctx.fillStyle = this.t.ground.grassDark;
    ctx.globalAlpha = this.t.night ? 0.7 : 0.55;
    ctx.fill(this.brush.path);
    ctx.fillStyle = this.t.ground.grass;
    ctx.globalAlpha = 0.35;
    ctx.fill(this.brush.hi);
    ctx.globalAlpha = 1;
  }

  // Reeds and cattails where the ground meets the stream.
  drawShore(ctx, view, time) {
    if (!this.reeds) return;
    const color = this.t.sea.reed;
    ctx.lineCap = 'round';
    for (const rd of this.reeds) {
      if (rd.x < view.x0 - 2 || rd.x > view.x1 + 2) continue;
      const sway = Math.sin(time * 1.3 + rd.ph) * 0.08 + rd.lean;
      const bx = rd.x, by = -(WORLD.SEA - 0.3);
      const tx = bx + sway * rd.h, ty = by - rd.h;
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.07;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + sway * rd.h * 0.3, by - rd.h * 0.6, tx, ty);
      ctx.stroke();
      // a blade leaf
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx - 0.3, by - rd.h * 0.5, bx - 0.25 + sway, by - rd.h * 0.8);
      ctx.quadraticCurveTo(bx - 0.1, by - rd.h * 0.45, bx + 0.05, by);
      ctx.fill();
      if (rd.cat) {
        ctx.fillStyle = '#7a4a26';
        ctx.beginPath();
        ctx.ellipse(tx, ty + 0.18, 0.07, 0.2, sway * 0.5, 0, TAU);
        ctx.fill();
      }
    }
  }

  // Stream water in world render space (y down = -worldY). Back layer sits behind terrain.
  drawWater(ctx, view, time, front) {
    const s = this.t.sea;
    const x0 = Math.floor(view.x0) - 1, x1 = Math.ceil(view.x1) + 1;
    const bottom = Math.min(-WORLD.SEA + 40, -view.y0 + 2);
    const phase = front ? 0 : 1.7;
    const amp = 0.1;
    const yAt = (x) => -(WORLD.SEA + Math.sin(x * 0.85 + time * 1.4 + phase) * amp + Math.sin(x * 0.33 - time * 0.8 + phase) * amp * 0.8 + (front ? -0.08 : 0.1));
    ctx.beginPath();
    ctx.moveTo(x0, bottom);
    for (let x = x0; x <= x1; x += 0.35) ctx.lineTo(x, yAt(x));
    ctx.lineTo(x1, bottom);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -WORLD.SEA, 0, -WORLD.SEA + 6);
    g.addColorStop(0, front ? s.top : s.bottom);
    g.addColorStop(1, s.bottom);
    ctx.globalAlpha = front ? 0.82 : 1;
    ctx.fillStyle = g;
    ctx.fill();
    ctx.globalAlpha = 1;
    if (!front) return;
    ctx.lineWidth = 0.1;
    ctx.strokeStyle = s.foam;
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    for (let x = x0; x <= x1; x += 0.35) {
      const y = yAt(x);
      if (x === x0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    // shimmering reflections
    ctx.fillStyle = s.foam;
    for (let k = Math.floor(x0 / 1.9); k < x1 / 1.9; k++) {
      const bx = k * 1.9 + Math.sin(k * 12.9) * 0.8;
      const life = (time * 0.35 + Math.abs(Math.sin(k * 7.1))) % 1;
      ctx.globalAlpha = Math.sin(life * Math.PI) * 0.45;
      ctx.fillRect(bx - 0.35, yAt(bx) + 0.35 + (k % 3) * 0.35, 0.7 * (1 - life * 0.5), 0.05);
    }
    ctx.globalAlpha = 1;
    // lily pads bob on the surface
    if (this.pads) {
      for (const p of this.pads) {
        if (p.x < view.x0 - 1 || p.x > view.x1 + 1) continue;
        const y = yAt(p.x) + 0.02 + Math.sin(time * 1.1 + p.ph) * 0.02;
        ctx.save();
        ctx.translate(p.x, y);
        ctx.scale(1, 0.38);
        ctx.fillStyle = '#3f8f3a';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, p.r, p.rot + 0.3, p.rot + TAU - 0.3);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(160,220,110,0.5)';
        ctx.beginPath();
        ctx.arc(-p.r * 0.25, -p.r * 0.2, p.r * 0.45, 0, TAU);
        ctx.fill();
        ctx.restore();
        if (p.flower) {
          ctx.fillStyle = '#ffd0e4';
          for (let i = 0; i < 5; i++) {
            const a = (i / 5) * TAU;
            ctx.beginPath();
            ctx.ellipse(p.x + Math.cos(a) * 0.1, y - 0.1 + Math.sin(a) * 0.05, 0.09, 0.05, a, 0, TAU);
            ctx.fill();
          }
          ctx.fillStyle = '#ffd24d';
          ctx.beginPath();
          ctx.arc(p.x, y - 0.1, 0.05, 0, TAU);
          ctx.fill();
        }
      }
    }
  }

  // ---------------------------------------------------------------- ambient (screen space, in front)
  drawAmbient(ctx, vw, vh, dpr, time) {
    const kind = this.t.ambient;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (kind === 'firefly') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const m of this.motes) {
        const a = 0.25 + 0.75 * Math.max(0, Math.sin(m.blink));
        const x = m.x * vw, y = (0.25 + m.y * 0.7) * vh;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 9 * m.s);
        g.addColorStop(0, `rgba(230,255,140,${0.9 * a})`);
        g.addColorStop(1, 'rgba(230,255,140,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - 10 * m.s, y - 10 * m.s, 20 * m.s, 20 * m.s);
      }
      ctx.restore();
      return;
    }
    for (const m of this.motes) {
      const x = m.x * vw, y = m.y * vh;
      if (kind === 'leaf') {
        if (m.s < 0.75) continue;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.sin(m.ph) * 1.2);
        const leaves = this.t.leaf || ['rgba(120,200,80,0.7)'];
        ctx.fillStyle = leaves[Math.floor(m.s * 97) % leaves.length];
        ctx.beginPath();
        ctx.ellipse(0, 0, 4.5 * m.s, 2 * m.s, 0, 0, TAU);
        ctx.fill();
        ctx.restore();
      } else if (kind === 'pollen') {
        ctx.fillStyle = `rgba(255,250,200,${0.35 + 0.35 * Math.sin(m.blink)})`;
        ctx.beginPath();
        ctx.arc(x, y, 1.4 * m.s + 0.4, 0, TAU);
        ctx.fill();
      } else if (kind === 'mist') {
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.beginPath();
        ctx.ellipse(x, y * 0.6 + vh * 0.35, vw * 0.22 * m.s, vh * 0.05 * m.s, 0, 0, TAU);
        ctx.fill();
      }
    }
    void clamp;
  }
}
