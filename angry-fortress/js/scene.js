// Backdrop: sky, sun, parallax hills with decor, drifting clouds, ambient particles, water/lava.
import { rng, noise1D } from './util.js';
import { WORLD } from './terrain.js';

const YREF = 12; // world height where parallax layers line up with the playfield

export class Scene {
  constructor(theme, seed) {
    this.t = theme;
    this.seed = seed;
    const r = rng(seed * 3 + 5);
    this.layers = [
      this._makeLayer(0.25, theme.far[0], seed + 1, 14, 5.5, false, r),
      this._makeLayer(0.45, theme.far[1], seed + 2, 9, 3.5, true, r),
    ];
    this.clouds = [];
    for (let i = 0; i < 9; i++) {
      this.clouds.push({
        x: r.range(-30, WORLD.W + 30),
        y: r.range(WORLD.H * 0.4, WORLD.H * 0.72),
        s: r.range(0.8, 1.7),
        p: r.range(0.35, 0.7),
        puffs: Array.from({ length: 5 }, (_, k) => ({ dx: (k - 2) * 1.1 + r.range(-0.3, 0.3), dy: r.range(0, 0.9) * (k === 2 ? 1.4 : 1), rad: r.range(0.9, 1.5) * (k === 2 ? 1.35 : 1) })),
      });
    }
    this.motes = [];
    for (let i = 0; i < 46; i++) this.motes.push(this._mote(r, true));
    this.r = r;
  }

  _makeLayer(par, color, seed, amp, base, decor, r) {
    const n = noise1D(seed);
    const n2 = noise1D(seed + 99);
    const path = new Path2D();
    const deco = new Path2D();
    const x0 = -80, x1 = WORLD.W + 80;
    const hAt = (x) => WORLD.SEA + base + amp * (0.55 * (n(x * 0.035) * 0.5 + 0.5) + 0.45 * Math.pow(Math.abs(n2(x * 0.018)), 1.4)) ;
    path.moveTo(x0, 30);
    for (let x = x0; x <= x1; x += 0.6) path.lineTo(x, -hAt(x));
    path.lineTo(x1, 30);
    path.closePath();
    if (decor) {
      const kind = this.t.decor;
      for (let x = x0; x <= x1; x += r.range(1.2, 3.4)) {
        const y = -hAt(x) + 0.2;
        const s = r.range(0.7, 1.25);
        if (kind === 'maple') {
          // lumpy three-ball canopy on a slim trunk
          deco.rect(x - 0.09 * s, y - 1.2 * s, 0.18 * s, 1.2 * s);
          for (const [dx, dy, rr] of [[-0.45, 1.35, 0.55], [0.45, 1.4, 0.55], [0, 1.85, 0.62]]) {
            deco.moveTo(x + dx * s + rr * s, y - dy * s);
            deco.arc(x + dx * s, y - dy * s, rr * s, 0, Math.PI * 2);
          }
        } else if (kind === 'tree') {
          deco.rect(x - 0.1 * s, y - 1.1 * s, 0.2 * s, 1.1 * s);
          deco.moveTo(x + 0.75 * s, y - 1.3 * s);
          deco.arc(x, y - 1.3 * s, 0.75 * s, 0, Math.PI * 2);
          deco.moveTo(x + 0.55 * s, y - 1.95 * s);
          deco.arc(x, y - 1.95 * s, 0.55 * s, 0, Math.PI * 2);
        } else if (kind === 'pine') {
          for (let k = 0; k < 3; k++) {
            const w = (0.9 - k * 0.22) * s, yy = y - (0.5 + k * 0.6) * s;
            deco.moveTo(x - w, yy);
            deco.lineTo(x, yy - 1.0 * s);
            deco.lineTo(x + w, yy);
            deco.closePath();
          }
          deco.rect(x - 0.1 * s, y - 0.5 * s, 0.2 * s, 0.5 * s);
        } else if (kind === 'cactus') {
          if (r() < 0.55) continue;
          deco.roundRect ? deco.roundRect(x - 0.18 * s, y - 2.0 * s, 0.36 * s, 2.0 * s, 0.18 * s) : deco.rect(x - 0.18 * s, y - 2.0 * s, 0.36 * s, 2.0 * s);
          if (deco.roundRect) {
            deco.roundRect(x - 0.75 * s, y - 1.35 * s, 0.26 * s, 0.75 * s, 0.13 * s);
            deco.roundRect(x - 0.75 * s, y - 0.86 * s, 0.6 * s, 0.24 * s, 0.12 * s);
            deco.roundRect(x + 0.45 * s, y - 1.6 * s, 0.26 * s, 0.7 * s, 0.13 * s);
            deco.roundRect(x + 0.12 * s, y - 1.12 * s, 0.6 * s, 0.24 * s, 0.12 * s);
          }
        } else {
          deco.moveTo(x + 0.8 * s, y);
          deco.ellipse(x, y, 0.8 * s, 0.9 * s, 0, Math.PI, Math.PI * 2);
          deco.closePath();
        }
      }
    }
    return { par, color, path, deco };
  }

  _mote(r, init) {
    return {
      x: r(), y: init ? r() : -0.05,
      s: r.range(0.5, 1.2),
      ph: r() * 6.28,
      v: r.range(0.6, 1.2),
    };
  }

  update(dt, wind) {
    for (const c of this.clouds) {
      c.x += (0.25 + wind * 0.09) * dt;
      if (c.x > WORLD.W + 60) c.x = -50;
      if (c.x < -60) c.x = WORLD.W + 50;
    }
    const kind = this.t.ambient;
    for (const m of this.motes) {
      m.ph += dt * 1.5;
      const fall = kind === 'ember' ? -0.035 : kind === 'dust' ? 0.004 : kind === 'leaf' ? 0.025 : 0.04;
      m.y += fall * m.v * dt;
      m.x += (wind * 0.012 + Math.sin(m.ph) * 0.01) * dt * m.v;
      if (m.y > 1.05 || m.y < -0.08 || m.x > 1.08 || m.x < -0.08) {
        Object.assign(m, this._mote(this.r, false));
        if (kind === 'ember') m.y = 1.05;
        if (m.x < 0 || m.x > 1) m.x = this.r();
        if (kind === 'dust') { m.y = this.r(); m.x = wind > 0 ? -0.05 : 1.05; }
      }
    }
  }

  // Screen-space backdrop. cam: {x,y,zoom}; vw/vh in CSS px.
  drawBack(ctx, cam, vw, vh, dpr, time) {
    const t = this.t;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = ctx.createLinearGradient(0, 0, 0, vh);
    g.addColorStop(0, t.sky[0]);
    g.addColorStop(0.55, t.sky[1]);
    g.addColorStop(1, t.sky[2]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, vw, vh);
    // sun / moon
    const sx = vw * t.sun.x - (cam.x - WORLD.W / 2) * cam.zoom * 0.05;
    const sy = vh * t.sun.y + (cam.y - 14) * cam.zoom * 0.04;
    const sr = Math.max(26, Math.min(vw, vh) * 0.075);
    const glow = ctx.createRadialGradient(sx, sy, sr * 0.6, sx, sy, sr * 3.2);
    glow.addColorStop(0, t.sun.glow);
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sx - sr * 3.2, sy - sr * 3.2, sr * 6.4, sr * 6.4);
    ctx.fillStyle = t.sun.color;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
    if (t.sun.moon) {
      ctx.fillStyle = 'rgba(200,150,170,0.35)';
      ctx.beginPath(); ctx.arc(sx - sr * 0.3, sy - sr * 0.2, sr * 0.22, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(sx + sr * 0.35, sy + sr * 0.3, sr * 0.14, 0, 7); ctx.fill();
    }
    // stars for night sky
    if (t.sun.moon) {
      const r = rng(77);
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 60; i++) {
        const x = r() * vw, y = r() * vh * 0.55;
        ctx.globalAlpha = 0.3 + 0.5 * Math.abs(Math.sin(time * (0.5 + r()) + i));
        ctx.fillRect(x, y, 1.6, 1.6);
      }
      ctx.globalAlpha = 1;
    }
    // clouds (behind hills)
    for (const c of this.clouds) this._drawCloud(ctx, c, cam, vw, vh, dpr);
    // hills
    for (const L of this.layers) {
      const z = cam.zoom;
      const ty = vh / 2 + ((cam.y - YREF) * L.par + YREF) * z;
      ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (vw / 2 - cam.x * L.par * z), dpr * ty);
      ctx.fillStyle = L.color;
      ctx.fill(L.path);
      ctx.fill(L.deco);
    }
  }

  _drawCloud(ctx, c, cam, vw, vh, dpr) {
    const z = cam.zoom;
    const px = vw / 2 + (c.x - cam.x * c.p) * z;
    const py = vh / 2 + ((cam.y - YREF) * c.p + YREF - c.y) * z;
    const s = c.s * z;
    if (px < -8 * s || px > vw + 8 * s) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = this.t.cloudShade;
    ctx.beginPath();
    for (const p of c.puffs) {
      ctx.moveTo(px + p.dx * s + p.rad * s, py - p.dy * s + 0.25 * s);
      ctx.arc(px + p.dx * s, py - p.dy * s + 0.25 * s, p.rad * s, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.fillStyle = this.t.cloud;
    ctx.beginPath();
    for (const p of c.puffs) {
      ctx.moveTo(px + p.dx * s + p.rad * s * 0.94, py - p.dy * s);
      ctx.arc(px + p.dx * s, py - p.dy * s, p.rad * s * 0.94, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  // Water in world render space (y down = -worldY). Back layer sits behind terrain.
  drawWater(ctx, view, time, front) {
    const s = this.t.sea;
    const x0 = Math.floor(view.x0) - 1, x1 = Math.ceil(view.x1) + 1;
    const bottom = Math.min(-WORLD.SEA + 40, -view.y0 + 2);
    const phase = front ? 0 : 1.7;
    const amp = s.lava ? 0.09 : 0.13;
    const yAt = (x) => -(WORLD.SEA + Math.sin(x * 0.85 + time * 1.5 + phase) * amp + Math.sin(x * 0.33 - time * 0.9 + phase) * amp * 0.8 + (front ? -0.08 : 0.1));
    ctx.beginPath();
    ctx.moveTo(x0, bottom);
    for (let x = x0; x <= x1; x += 0.35) ctx.lineTo(x, yAt(x));
    ctx.lineTo(x1, bottom);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -WORLD.SEA, 0, -WORLD.SEA + 6);
    g.addColorStop(0, front ? s.top : s.bottom);
    g.addColorStop(1, s.bottom);
    ctx.globalAlpha = front ? (s.lava ? 0.92 : 0.82) : 1;
    ctx.fillStyle = g;
    ctx.fill();
    ctx.globalAlpha = 1;
    if (front) {
      ctx.lineWidth = 0.12;
      ctx.strokeStyle = s.foam;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      for (let x = x0; x <= x1; x += 0.35) {
        const y = yAt(x);
        if (x === x0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      // glints / bubbles
      ctx.fillStyle = s.foam;
      for (let k = Math.floor(x0 / 2.2); k < x1 / 2.2; k++) {
        const bx = k * 2.2 + Math.sin(k * 12.9) * 0.9;
        const life = (time * (s.lava ? 0.5 : 0.35) + Math.abs(Math.sin(k * 7.1))) % 1;
        const by = yAt(bx) + 0.4 + (s.lava ? (1 - life) * 0.8 : 0.3);
        ctx.globalAlpha = Math.sin(life * Math.PI) * (s.lava ? 0.9 : 0.5);
        if (s.lava) {
          ctx.beginPath();
          ctx.arc(bx, by, 0.12 + life * 0.08, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(bx - 0.35, by, 0.7 * (1 - life * 0.5), 0.06);
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  drawAmbient(ctx, vw, vh, dpr, time) {
    const kind = this.t.ambient;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const m of this.motes) {
      const x = m.x * vw, y = kind === 'ember' || kind === 'dust' ? m.y * vh : m.y * vh;
      if (kind === 'snow') {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.arc(x, y, 1.6 * m.s + 0.6, 0, Math.PI * 2);
        ctx.fill();
      } else if (kind === 'ember') {
        ctx.fillStyle = `rgba(255,${150 + Math.floor(80 * Math.sin(m.ph))},60,${0.5 + 0.4 * Math.sin(m.ph * 2)})`;
        ctx.fillRect(x, y, 2.2 * m.s, 2.2 * m.s);
      } else if (kind === 'leaf') {
        if (m.s < 0.8) continue;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.sin(m.ph) * 1.2);
        const leaves = this.t.leaf || ['rgba(120,200,80,0.7)'];
        ctx.fillStyle = leaves[Math.floor(m.s * 97) % leaves.length];
        ctx.beginPath();
        ctx.ellipse(0, 0, 4 * m.s, 1.8 * m.s, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        ctx.fillStyle = 'rgba(255,230,190,0.35)';
        ctx.fillRect(x, y, 3 * m.s, 1.2);
      }
    }
  }
}
