// Sky-forest backdrop: sky, sun or moon with light shafts, layers of distant floating islands
// drifting in the mist, undergrowth behind the playfield, waterfalls spilling off the islands,
// the bottomless sea of clouds underneath, and ambient pollen / falling leaves / mist / fireflies.
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
    const shape = theme.bgTree === 'pine' ? 'pine' : 'round';
    this.far = this._islandLayer(0.18, seed + 1, 13, 0.7, shape, r);
    this.mid = this._islandLayer(0.42, seed + 2, 9.5, 1.0, shape, r);
    this.near = this._islandLayer(0.7, seed + 3, 6, 1.5, shape, r);
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
    const n = theme.ambient === 'firefly' ? 34 : theme.ambient === 'mist' ? 10 : theme.ambient === 'snow' ? 90 : 42;
    for (let i = 0; i < n; i++) this.motes.push(this._mote(true));
    this.frame = this._canopyFrame(r);
    this.shore = null;
    this.brush = null;
  }

  // Called once the landscape exists: undergrowth behind the island tops, and the waterfalls
  // that spill off the outer cliffs.
  setLand(land) {
    const r = rng(this.seed * 7 + 11);
    const h = land.heights;
    const brush = new Path2D();
    const brushHi = new Path2D();
    for (let x = -2; x <= WORLD.W + 2; x += r.range(0.7, 1.4)) {
      if (!land.onIsland(x - 0.8) || !land.onIsland(x + 0.8)) continue;
      const y = h(x);
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
    // a waterfall off the outer cliff of each home island (and one off the middle island, if any)
    const sp = land.spans;
    this.falls = [];
    const add = (x, dir) => this.falls.push({ x, dir, y: h(x) - 0.35, w: r.range(0.32, 0.5), ph: r() * TAU });
    add(sp[0].a + 0.7, -1);
    add(sp[sp.length - 1].b - 0.7, 1);
    if (sp.length === 3) add(r() < 0.5 ? sp[1].a + 0.9 : sp[1].b - 0.9, r() < 0.5 ? -1 : 1);
    for (const f of this.falls) if (f.dir === 1 ? f.x < WORLD.W / 2 : f.x > WORLD.W / 2) f.dir = -f.dir;
    this.reeds = this.pads = null;
  }

  // Distant floating islands: a forested top over an upside-down crag, each bobbing on its own.
  _islandLayer(par, seed, base, scale, shape, r) {
    const n = noise1D(seed);
    const isles = [];
    for (let x = -90 + r.range(0, 8); x <= WORLD.W + 90; ) {
      const w = r.range(2.4, 6.5) * scale;
      const cx = x + w;
      const top = WORLD.SEA + base + 2.5 * n(cx * 0.05) + r.range(-1.2, 1.2) * scale;
      const canopy = new Path2D();
      const hi = new Path2D();
      const rock = new Path2D();
      // the crag: flat-ish top edge, jagged underside narrowing to a point or two
      const deep = w * r.range(0.8, 1.3);
      rock.moveTo(cx - w, -top);
      const steps = 14;
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const d = deep * Math.pow(Math.sin(Math.PI * t), 0.8) * (0.75 + 0.25 * Math.sin(t * 17 + cx)) + (k % 2 ? 0.25 * scale : 0);
        rock.lineTo(cx + w - 2 * w * t, -top + d);
      }
      rock.closePath();
      // trees along the top
      for (let tx = cx - w + 0.5 * scale; tx <= cx + w - 0.5 * scale; tx += r.range(0.9, 1.6) * scale) {
        const s2 = r.range(0.75, 1.2) * scale;
        const g = -top + 0.1;
        if (shape === 'pine') {
          for (let k = 0; k < 3; k++) {
            const ww = (1.0 - k * 0.25) * s2, yy = g - 0.3 * s2 - k * 0.7 * s2;
            canopy.moveTo(tx - ww, yy);
            canopy.lineTo(tx, yy - 1.1 * s2);
            canopy.lineTo(tx + ww, yy);
            canopy.closePath();
            hi.moveTo(tx - ww * 0.5, yy - 0.15 * s2);
            hi.lineTo(tx - 0.05, yy - 1.0 * s2);
            hi.lineTo(tx + ww * 0.05, yy - 0.15 * s2);
            hi.closePath();
          }
        } else {
          const cy = g - 0.9 * s2;
          for (const [dx, dy, rr] of [[-0.45, 0.25, 0.6], [0.45, 0.3, 0.6], [0, -0.2, 0.75]]) {
            canopy.moveTo(tx + dx * s2 + rr * s2, cy + dy * s2);
            canopy.arc(tx + dx * s2, cy + dy * s2, rr * s2, 0, TAU);
            hi.moveTo(tx + dx * s2 - 0.15 * s2 + rr * s2 * 0.5, cy + dy * s2 - 0.2 * s2);
            hi.arc(tx + dx * s2 - 0.15 * s2, cy + dy * s2 - 0.2 * s2, rr * s2 * 0.5, 0, TAU);
          }
        }
      }
      canopy.rect(cx - w, -top - 0.15 * scale, 2 * w, 0.3 * scale);
      // a few vines trailing from the underside
      const vines = new Path2D();
      for (let k = 0; k < 3; k++) {
        const vx = cx + r.range(-0.7, 0.7) * w;
        const t = (cx + w - vx) / (2 * w);
        const vy = -top + deep * Math.pow(Math.sin(Math.PI * t), 0.8) * 0.7;
        vines.moveTo(vx, vy);
        vines.quadraticCurveTo(vx + r.range(-0.4, 0.4) * scale, vy + 0.8 * scale, vx + r.range(-0.2, 0.2), vy + r.range(1, 2.2) * scale);
      }
      isles.push({ canopy, hi, rock, vines, ph: r() * TAU, amp: r.range(0.08, 0.2) * scale, top, deep });
      x = cx + w + r.range(3, 10) * scale;
    }
    return { par, isles };
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
      if (kind === 'leaf' || kind === 'petal') {
        m.y += (kind === 'petal' ? 0.022 : 0.03) * m.v * dt;
        m.x += (wind * 0.012 + Math.sin(m.ph) * 0.012 + (kind === 'petal' ? 0.006 : 0)) * dt * m.v;
      } else if (kind === 'snow') {
        // big flakes near, small ones far: the near ones fall faster and sway more
        m.y += (0.018 + 0.03 * m.s) * dt;
        m.x += (wind * 0.01 * m.s + Math.sin(m.ph * 0.8) * 0.006 * m.s) * dt;
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
        Object.assign(m, this._mote(kind !== 'leaf' && kind !== 'petal' && kind !== 'snow'));
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
    if (t.aurora) this._aurora(ctx, cam, vw, vh, time);
    if (t.rainbow) this._rainbow(ctx, cam, vw, vh);
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
    const layerT = (par, bob = 0) => {
      const ty = vh / 2 + ((cam.y - YREF) * par + YREF + bob) * z;
      ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (vw / 2 - cam.x * par * z), dpr * ty);
    };
    // the cloud sea stretching to the horizon far below
    this._horizon(ctx, vw, vh, dpr, cam, time, layerT);
    // distant floating islands + mist, nearer ones darker and bigger
    this._isles(ctx, this.far, cam, vw, time, layerT, t.far, null, 0, null);
    this._mist(ctx, vw, vh, dpr, cam, this.far.par, WORLD.SEA + 12, 0.9);
    // light shafts fall across the middle distance
    if (t.rays) this._rays(ctx, vw, vh, dpr, sx, sy, time);
    this._isles(ctx, this.mid, cam, vw, time, layerT, t.mid[0], t.mid[1], 0.16, null);
    this._mist(ctx, vw, vh, dpr, cam, this.mid.par, WORLD.SEA + 8, 0.7);
    this._isles(ctx, this.near, cam, vw, time, layerT, t.near[0], t.mid[1], 0.3, t.near[1]);
    this._mist(ctx, vw, vh, dpr, cam, this.near.par, WORLD.SEA + 4.5, 0.8);
    // leaves hanging into the top of the view
    this._frameLeaves(ctx, vw, vh, dpr, cam, time);
  }

  _isles(ctx, layer, cam, vw, time, layerT, color, hiColor, shade, vineColor) {
    const z = cam.zoom;
    for (const is of layer.isles) {
      layerT(layer.par, Math.sin(time * 0.45 + is.ph) * is.amp);
      ctx.fillStyle = color;
      ctx.fill(is.rock);
      if (shade) {
        ctx.fillStyle = `rgba(20,12,30,${shade})`;
        ctx.fill(is.rock);
      }
      if (vineColor) {
        ctx.strokeStyle = vineColor;
        ctx.lineWidth = 0.08;
        ctx.stroke(is.vines);
      }
      ctx.fillStyle = color;
      ctx.fill(is.canopy);
      if (hiColor) {
        ctx.fillStyle = hiColor;
        ctx.globalAlpha = 0.5;
        ctx.fill(is.hi);
        ctx.globalAlpha = 1;
      }
    }
    void z; void vw;
  }

  // Far below and far away: the top of the cloud sea, rolling to the horizon.
  _horizon(ctx, vw, vh, dpr, cam, time, layerT) {
    const a = this.t.abyss;
    const par = 0.3, y = WORLD.SEA + 2.4;
    layerT(par);
    const x0 = cam.x * par - vw / cam.zoom, x1 = cam.x * par + vw / cam.zoom;
    const g = ctx.createLinearGradient(0, -y, 0, -y + 14);
    g.addColorStop(0, a.shade);
    g.addColorStop(1, a.deep);
    ctx.fillStyle = g;
    ctx.fillRect(x0 - 2, -y + 0.6, x1 - x0 + 4, 60);
    ctx.fillStyle = a.shade;
    ctx.beginPath();
    const step = 2.2, off = (time * 0.12) % step;
    for (let x = Math.floor(x0 / step) * step - step; x < x1 + step; x += step) {
      const k = Math.round(x / step);
      const rr = 1.1 + 0.6 * Math.abs(Math.sin(k * 12.9898));
      ctx.moveTo(x + off + rr, -y);
      ctx.arc(x + off, -y + 0.2 * Math.sin(k * 3.1), rr, 0, TAU);
    }
    ctx.fill();
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

  // The cloud sea under the islands (world render space, y down = -worldY). The back layer sits
  // behind the terrain; the front layer is a row of puffs that swallows whatever sinks into it.
  drawAbyss(ctx, view, time, front) {
    const a = this.t.abyss;
    const x0 = Math.floor(view.x0) - 2, x1 = Math.ceil(view.x1) + 2;
    const top = WORLD.SEA;
    if (-top + 3 < -view.y1) return; // the clouds are far below the view
    const bottom = Math.max(-view.y0 + 2, -top + 4);
    if (!front) {
      const g = ctx.createLinearGradient(0, -top - 0.6, 0, -top + 7);
      g.addColorStop(0, a.shade);
      g.addColorStop(1, a.deep);
      ctx.fillStyle = g;
      ctx.fillRect(x0, -top - 0.5, x1 - x0, bottom + top + 0.5);
    }
    const step = front ? 1.35 : 1.7;
    const drift = (time * (front ? 0.35 : -0.2)) % step;
    const rows = front ? [[0.15, 0.75, a.cloud, 0.94]] : [[0.75, 1.0, a.shade, 1], [0.45, 0.8, a.cloud, 0.9]];
    for (const [dy, size, color, alpha] of rows) {
      ctx.fillStyle = color;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      for (let x = Math.floor(x0 / step) * step - step; x < x1 + step; x += step) {
        const k = Math.round(x / step) + (front ? 7 : 0);
        const h = Math.abs(Math.sin(k * 12.9898 + dy * 7));
        const rr = size * (0.7 + 0.5 * h);
        const cx = x + drift, cy = -(top + dy + 0.25 * Math.sin(k * 2.3 + time * 0.6));
        ctx.moveTo(cx + rr, cy);
        ctx.arc(cx, cy, rr, 0, TAU);
      }
      ctx.fill();
    }
    if (front) {
      // inside the clouds: thick white fading into the depths
      const g = ctx.createLinearGradient(0, -top, 0, -top + 5);
      g.addColorStop(0, a.cloud);
      g.addColorStop(1, a.deep);
      ctx.fillStyle = g;
      ctx.globalAlpha = 0.94;
      ctx.fillRect(x0, -top + 0.05, x1 - x0, bottom + top);
    }
    ctx.globalAlpha = 1;
  }

  // Water spilling off the island cliffs into the clouds (gone once its spring is blown away).
  drawFalls(ctx, view, time, terrain) {
    if (!this.falls) return;
    const a = this.t.abyss;
    for (const f of this.falls) {
      if (f.x < view.x0 - 3 || f.x > view.x1 + 3) continue;
      if (!terrain.solid(f.x - f.dir * 0.3, f.y - 0.25)) continue;
      const bottom = WORLD.SEA + 0.3;
      const xAt = (y, side) => f.x + f.dir * (1.1 * Math.sqrt(clamp((f.y - y) / 1.6, 0, 1))) + side * f.w * (0.5 + 0.35 * clamp((f.y - y) / 8, 0, 1));
      ctx.beginPath();
      for (let y = f.y; y >= bottom; y -= 0.4) ctx.lineTo(xAt(y, -1), -y);
      for (let y = bottom; y <= f.y + 0.01; y += 0.4) ctx.lineTo(xAt(y, 1), -y);
      ctx.closePath();
      ctx.fillStyle = a.water;
      ctx.globalAlpha = 0.75;
      ctx.fill();
      // streaks rushing down
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.05;
      ctx.setLineDash([0.5, 0.8]);
      for (const side of [-0.5, 0, 0.5]) {
        ctx.lineDashOffset = -(time * 7 + f.ph + side * 3);
        ctx.beginPath();
        for (let y = f.y; y >= bottom; y -= 0.4) ctx.lineTo(xAt(y, side), -y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      // spray where it meets the clouds
      ctx.fillStyle = a.cloud;
      for (let k = 0; k < 4; k++) {
        const ph = (time * 0.8 + k * 0.25 + f.ph) % 1;
        ctx.globalAlpha = 0.6 * (1 - ph);
        ctx.beginPath();
        ctx.arc(xAt(bottom, 0) + (k - 1.5) * 0.35, -(bottom + ph * 0.8), 0.25 + ph * 0.5, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  // A faint summer rainbow arching over the far side of the sky.
  _rainbow(ctx, cam, vw, vh) {
    const cx = vw * 0.66 - (cam.x - WORLD.W / 2) * cam.zoom * 0.03, cy = vh * 0.95, R = Math.max(vw, vh) * 0.62;
    const cols = ['255,90,90', '255,170,60', '255,230,80', '110,220,110', '90,170,255', '160,120,240'];
    ctx.save();
    ctx.lineWidth = R * 0.022;
    for (let i = 0; i < cols.length; i++) {
      ctx.strokeStyle = `rgba(${cols[i]},0.2)`;
      ctx.beginPath();
      ctx.arc(cx, cy, R - i * ctx.lineWidth, Math.PI * 1.08, Math.PI * 1.92);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Northern lights: a few wavy curtains of green and violet light, slowly rippling.
  _aurora(ctx, cam, vw, vh, time) {
    const shift = -(cam.x - WORLD.W / 2) * cam.zoom * 0.03;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const bands = [
      { y: 0.18, amp: 0.05, len: 0.9, col: [120, 255, 190], a: 0.38, sp: 0.18, ph: 0 },
      { y: 0.27, amp: 0.04, len: 1.3, col: [90, 220, 255], a: 0.26, sp: -0.13, ph: 2.1 },
      { y: 0.12, amp: 0.035, len: 0.7, col: [190, 140, 255], a: 0.24, sp: 0.1, ph: 4.2 },
    ];
    for (const b of bands) {
      const top = [], bot = [];
      for (let i = 0; i <= 24; i++) {
        const u = i / 24, x = u * vw * 1.2 - vw * 0.1 + shift;
        const w = Math.sin(u * TAU * b.len + time * b.sp + b.ph) * b.amp + Math.sin(u * 17 + time * 0.4 + b.ph) * 0.008;
        const y = (b.y + w) * vh;
        const tall = (0.09 + 0.05 * Math.sin(u * 9 + time * 0.3 + b.ph)) * vh;
        top.push([x, y - tall]);
        bot.push([x, y]);
      }
      const g = ctx.createLinearGradient(0, (b.y - 0.16) * vh, 0, (b.y + 0.06) * vh);
      g.addColorStop(0, `rgba(${b.col},0)`);
      g.addColorStop(0.7, `rgba(${b.col},${b.a})`);
      g.addColorStop(1, `rgba(${b.col},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(top[0][0], top[0][1]);
      for (const p of top) ctx.lineTo(p[0], p[1]);
      for (let i = bot.length - 1; i >= 0; i--) ctx.lineTo(bot[i][0], bot[i][1] + 0.02 * vh);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
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
      } else if (kind === 'petal') {
        // a cherry petal: a soft heart-ish oval tumbling as it falls
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(m.ph * 1.3);
        ctx.scale(1, 0.55 + 0.45 * Math.abs(Math.sin(m.ph * 1.7)));
        ctx.fillStyle = m.s > 1.1 ? 'rgba(255,214,228,0.95)' : 'rgba(250,170,200,0.85)';
        ctx.beginPath();
        ctx.moveTo(0, -3.4 * m.s);
        ctx.quadraticCurveTo(3.2 * m.s, -2.4 * m.s, 0, 3 * m.s);
        ctx.quadraticCurveTo(-3.2 * m.s, -2.4 * m.s, 0, -3.4 * m.s);
        ctx.fill();
        ctx.restore();
      } else if (kind === 'snow') {
        ctx.fillStyle = `rgba(255,255,255,${0.55 + 0.35 * Math.min(1, m.s - 0.4)})`;
        ctx.beginPath();
        ctx.arc(x, y, 1.1 + 1.9 * m.s, 0, TAU);
        ctx.fill();
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
