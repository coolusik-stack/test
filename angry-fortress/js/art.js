// =====================================================================
//  엥그리 포트리스 (Angry Fortress) — procedural vector art module
//  Theme: two squirrel villages fling angry-cute nuts from twig slingshots.
//  ES module, no dependencies. Render space: 1 unit = 1 m, x right, y down.
//  Every public draw function saves/restores the context state.
// =====================================================================

export const AMMO_TYPES = ['acorn', 'pinenut', 'peanut', 'burr', 'walnut'];
export const AMMO_INFO = {
  acorn:   { name: '도토리', desc: '묵직한 기본탄', color: '#b8702e' },
  pinenut: { name: '잣',     desc: '터치: 초고속 돌진', color: '#f0d8a8' },
  peanut:  { name: '땅콩',   desc: '터치: 알맹이 셋으로 분열', color: '#d9a86a' },
  burr:    { name: '밤송이', desc: '터치: 가시 대폭발', color: '#7cb342' },
  walnut:  { name: '호두',   desc: '터치: 내리꽂혀 땅을 뚫어요', color: '#9c6b3f' },
};
export const CART = { radius: 0.75 };

// ---------------------------------------------------------------------
//  small helpers
// ---------------------------------------------------------------------
const TAU = Math.PI * 2;
const PI = Math.PI;
const EMPTY = Object.freeze({});
const LIGHT_X = -0.56, LIGHT_Y = -0.83;        // direction toward the light (render space)

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function frac(v) { return v - Math.floor(v); }
function hash(a, b) { return frac(Math.sin(a * 127.1 + b * 311.7) * 43758.5453); }

const _rgb = new Map();
function rgb(hex) {
  let c = _rgb.get(hex);
  if (!c) {
    let h = hex.charAt(0) === '#' ? hex.slice(1) : hex;
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    _rgb.set(hex, c);
  }
  return c;
}
const _mix = new Map();
function mix(a, b, t) {
  if (t <= 0) return a;
  if (t >= 1) return b;
  t = Math.round(t * 64) / 64;
  const k = a + b + t;
  let v = _mix.get(k);
  if (v) return v;
  const A = rgb(a), B = rgb(b);
  v = '#';
  for (let i = 0; i < 3; i++) v += Math.round(A[i] + (B[i] - A[i]) * t).toString(16).padStart(2, '0');
  if (_mix.size > 6000) _mix.clear();
  _mix.set(k, v);
  return v;
}
function rgba(hex, a) {
  const c = rgb(hex);
  return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (Math.round(a * 1000) / 1000) + ')';
}

// Seeded PRNG (mulberry32)
function rng(seed) {
  let s = ((seed | 0) ^ 0x2c9277b5) >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Per-context gradient cache (only for gradients defined in a local/unit space)
const _gcache = new WeakMap();
function cgrad(ctx, key, make) {
  let m = _gcache.get(ctx);
  if (!m) { m = new Map(); _gcache.set(ctx, m); }
  let g = m.get(key);
  if (!g) {
    if (m.size > 800) m.clear();
    g = make();
    m.set(key, g);
  }
  return g;
}

// Palette tinting (captain hurt flash) with a small cache
const _palCache = new Map();
function tintPal(P, fields, tint, amt) {
  if (amt <= 0.01) return P;
  const q = Math.round(amt * 24) / 24;
  const k = (P.fur || P.body) + P.line + tint + q;
  let T = _palCache.get(k);
  if (T) return T;
  T = Object.assign({}, P);
  for (const f of fields) if (P[f]) T[f] = mix(P[f], tint, q);
  if (_palCache.size > 500) _palCache.clear();
  _palCache.set(k, T);
  return T;
}

function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function starPath(ctx, x, y, R, r, n, rot) {
  for (let i = 0; i < n * 2; i++) {
    const a = rot + i * PI / n - PI / 2, rr = (i & 1) ? r : R;
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath();
}

// Tapered quadratic "limb" path (fork arms, stems)
function taperPath(ctx, x0, y0, cx, cy, x1, y1, w0, w1, n, capStart, capEnd) {
  const L = [], R = [];
  let dx0 = 0, dy0 = 0, dx1 = 0, dy1 = 0;
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    const px = u * u * x0 + 2 * u * t * cx + t * t * x1;
    const py = u * u * y0 + 2 * u * t * cy + t * t * y1;
    let dx = 2 * u * (cx - x0) + 2 * t * (x1 - cx), dy = 2 * u * (cy - y0) + 2 * t * (y1 - cy);
    const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    if (i === 0) { dx0 = dx; dy0 = dy; }
    if (i === n) { dx1 = dx; dy1 = dy; }
    const w = (w0 + (w1 - w0) * Math.pow(t, 0.9)) / 2;
    L.push(px - dy * w, py + dx * w);
    R.push(px + dy * w, py - dx * w);
  }
  ctx.moveTo(L[0], L[1]);
  for (let i = 1; i <= n; i++) ctx.lineTo(L[i * 2], L[i * 2 + 1]);
  if (capEnd && w1 > 0.0001) {
    const ex = x1 + dx1 * w1 * 0.75, ey = y1 + dy1 * w1 * 0.75;
    ctx.quadraticCurveTo(ex - dy1 * w1 * 0.5, ey + dx1 * w1 * 0.5, ex, ey);
    ctx.quadraticCurveTo(ex + dy1 * w1 * 0.5, ey - dx1 * w1 * 0.5, R[n * 2], R[n * 2 + 1]);
  } else ctx.lineTo(R[n * 2], R[n * 2 + 1]);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(R[i * 2], R[i * 2 + 1]);
  if (capStart && w0 > 0.0001) {
    const sx = x0 - dx0 * w0 * 0.75, sy = y0 - dy0 * w0 * 0.75;
    ctx.quadraticCurveTo(sx + dy0 * w0 * 0.5, sy - dx0 * w0 * 0.5, sx, sy);
    ctx.quadraticCurveTo(sx - dy0 * w0 * 0.5, sy + dx0 * w0 * 0.5, L[0], L[1]);
  }
  ctx.closePath();
}


// A simple leaf along +x from (x,y): length L, width W
function drawLeaf(ctx, x, y, ang, L, W, lw, col, dark) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(L * 0.22, -W * 0.66, L * 0.68, -W * 0.52, L, 0);
  ctx.bezierCurveTo(L * 0.68, W * 0.52, L * 0.22, W * 0.66, 0, 0);
  ctx.closePath();
  const g = ctx.createLinearGradient(0, -W / 2, 0, W / 2);
  g.addColorStop(0, mix(col || '#6cbf3a', '#ffffff', 0.25)); g.addColorStop(1, mix(col || '#6cbf3a', '#1e4a08', 0.3));
  ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = lw; ctx.strokeStyle = dark || '#2c5410'; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(L * 0.04, 0); ctx.quadraticCurveTo(L * 0.5, -W * 0.05, L * 0.9, 0);
  for (const t of [0.3, 0.52, 0.72]) {
    ctx.moveTo(L * t, -W * 0.02); ctx.lineTo(L * (t + 0.12), -W * 0.26 * (1 - t * 0.5));
    ctx.moveTo(L * t, W * 0.02); ctx.lineTo(L * (t + 0.12), W * 0.26 * (1 - t * 0.5));
  }
  ctx.strokeStyle = 'rgba(235,255,200,0.6)'; ctx.lineWidth = lw * 0.55; ctx.lineCap = 'round'; ctx.stroke();
  ctx.restore();
}


// ---------------------------------------------------------------------
//  Shared nut palettes & silhouettes (unit space: radius ~1, facing +x).
//  Also used by the forest/blocks code (crates, tree nuts, home-tree piles).
// ---------------------------------------------------------------------
const NP = {
  acorn: {
    body: '#c47c3a', hi: '#f4bd7e', lo: '#86481a', rim: '#5a2c0c', line: '#3a1c06', lid: '#b06c30',
    brow: '#2e1406', blush: '#ff8a8a', bounce: '#ffcf96',
    cap: '#8e6438', capHi: '#d2a66c', capLo: '#553518', capLine: '#2c1806', stem: '#6e4622',
  },
  pinenut: {
    body: '#f0d8a8', hi: '#fffbf2', lo: '#c8a468', rim: '#9a7a44', line: '#5a3e1c', lid: '#e2c690',
    brow: '#4a3016', blush: '#ff9a9a', bounce: '#fff6dc', tip: '#9a6230',
  },
  peanut: {
    body: '#d9a86a', hi: '#f8dca4', lo: '#a4723a', rim: '#7a5222', line: '#4a2c0e', lid: '#c8924e',
    brow: '#3a220a', blush: '#ff8a8a', bounce: '#ffe2ae',
  },
  burr: {
    body: '#7cb342', hi: '#c6ea88', lo: '#4a7a1c', rim: '#2e5410', line: '#1d3808', bounce: '#dcf2a8',
    spike: '#b9d65a', spikeTip: '#f3f8c8', lining: '#f5f0cf', liningLo: '#c9d68a',
  },
  chestnut: {
    body: '#8e4c22', hi: '#e09a60', lo: '#4e2410', line: '#2a1206', lid: '#7a3e18', brow: '#1e0c04',
    blush: '#ff8a8a', hilum: '#efdcae',
  },
  walnut: {
    body: '#a0703f', hi: '#dcae7a', lo: '#5e3a1a', rim: '#3e2410', line: '#2a160a', lid: '#8e6034',
    brow: '#24120a', blush: '#ff8a8a', bounce: '#ecc699',
  },
  kernel: {
    body: '#f2c6a2', hi: '#fff4ea', lo: '#c98e68', rim: '#a0664a', line: '#5a321c', lid: '#e2ae8a',
    brow: '#4a2614', blush: '#ff7f95', bounce: '#fff2e4',
  },
};

// --- silhouettes
function acornBodyPath(ctx) {
  ctx.moveTo(-0.84, -0.44);
  ctx.bezierCurveTo(-0.98, 0.3, -0.52, 0.86, 0.02, 1.04);
  ctx.bezierCurveTo(0.56, 0.86, 1.0, 0.3, 0.86, -0.44);
  ctx.quadraticCurveTo(0.0, -0.64, -0.84, -0.44);
  ctx.closePath();
}
function acornCapPath(ctx) {
  ctx.moveTo(-1.02, -0.3);
  ctx.bezierCurveTo(-1.06, -1.12, 1.06, -1.16, 1.04, -0.36);
  ctx.quadraticCurveTo(0.02, -0.06, -1.02, -0.3);
  ctx.closePath();
}
function pinenutPath(ctx) {
  ctx.moveTo(1.28, 0.02);
  ctx.bezierCurveTo(0.92, -0.44, 0.42, -0.7, -0.18, -0.7);
  ctx.bezierCurveTo(-0.78, -0.68, -1.0, -0.32, -1.0, 0.02);
  ctx.bezierCurveTo(-1.0, 0.38, -0.74, 0.7, -0.18, 0.7);
  ctx.bezierCurveTo(0.42, 0.7, 0.92, 0.46, 1.28, 0.02);
  ctx.closePath();
}
const PEA = (() => {
  const B = [-0.48, 0.06], rb = 0.56, F = [0.36, -0.02], rf = 0.64;
  const dx = F[0] - B[0], dy = F[1] - B[1], d = Math.hypot(dx, dy);
  const a = (d * d + rb * rb - rf * rf) / (2 * d), hh = Math.sqrt(rb * rb - a * a);
  const ux = dx / d, uy = dy / d, nx = -uy, ny = ux;
  const mx = B[0] + ux * a, my = B[1] + uy * a;
  const It = [mx - nx * hh, my - ny * hh], Ib = [mx + nx * hh, my + ny * hh];
  const del = 0.3;
  const aFt = Math.atan2(It[1] - F[1], It[0] - F[0]) + del, aFb = Math.atan2(Ib[1] - F[1], Ib[0] - F[0]) - del;
  const aBb = Math.atan2(Ib[1] - B[1], Ib[0] - B[0]) + del, aBt = Math.atan2(It[1] - B[1], It[0] - B[0]) + TAU - del;
  return {
    B, rb, F, rf, aFt, aFb, aBb, aBt,
    fs: [F[0] + Math.cos(aFt) * rf, F[1] + Math.sin(aFt) * rf],
    bs: [B[0] + Math.cos(aBb) * rb, B[1] + Math.sin(aBb) * rb],
    ct: [It[0], It[1] + 0.07], cb: [Ib[0], Ib[1] - 0.07],
  };
})();
function peanutPath(ctx) {
  const Q = PEA;
  ctx.moveTo(Q.fs[0], Q.fs[1]);
  ctx.arc(Q.F[0], Q.F[1], Q.rf, Q.aFt, Q.aFb);
  ctx.quadraticCurveTo(Q.cb[0], Q.cb[1], Q.bs[0], Q.bs[1]);
  ctx.arc(Q.B[0], Q.B[1], Q.rb, Q.aBb, Q.aBt);
  ctx.quadraticCurveTo(Q.ct[0], Q.ct[1], Q.fs[0], Q.fs[1]);
  ctx.closePath();
}
const WAL_PTS = (() => {
  const k = 16, pts = [];
  for (let i = 0; i < k; i++) {
    const a = i * TAU / k, r = 0.955 + 0.045 * Math.sin(i * 2.7 + 0.6) * Math.cos(i * 1.3);
    pts.push([Math.cos(a) * r, Math.sin(a) * r * 0.98]);
  }
  return pts;
})();
function walnutPath(ctx) {
  const P = WAL_PTS, k = P.length;
  const m = (i) => [(P[i % k][0] + P[(i + 1) % k][0]) / 2, (P[i % k][1] + P[(i + 1) % k][1]) / 2];
  const s = m(k - 1);
  ctx.moveTo(s[0], s[1]);
  for (let i = 0; i < k; i++) { const e = m(i); ctx.quadraticCurveTo(P[i][0], P[i][1], e[0], e[1]); }
  ctx.closePath();
}
function kernelPath(ctx) {
  ctx.moveTo(-0.96, 0.02);
  ctx.bezierCurveTo(-0.96, -0.6, -0.34, -0.86, 0.18, -0.84);
  ctx.bezierCurveTo(0.74, -0.82, 1.0, -0.46, 1.0, 0.0);
  ctx.bezierCurveTo(1.0, 0.5, 0.62, 0.84, 0.06, 0.82);
  ctx.bezierCurveTo(-0.5, 0.8, -0.96, 0.56, -0.96, 0.02);
  ctx.closePath();
}

// ---------------------------------------------------------------------
//  Simple flat style (captains + nuts): cached Path2D silhouettes, one shade tone,
//  one chunky outline, no gradients. Same-colour strokes are batched into one path.
// ---------------------------------------------------------------------
const _p2 = new Map();
function P2(key, build) {
  let p = _p2.get(key);
  if (!p) {
    if (_p2.size > 300) _p2.clear();
    p = new Path2D(); build(p); _p2.set(key, p);
  }
  return p;
}
// Shade crescent (shape minus a copy shrunk toward the light), cached. Filled with 'evenodd' over one
// flat fill it gives the same two-tone look as fill2 but paints far fewer pixels.
function shadeCrescent(key, base, gx, gy, cx, cy, off, k) {
  if (typeof DOMMatrix === 'undefined') return null;
  return P2(key, (p) => {
    p.addPath(base);
    p.addPath(base, new DOMMatrix().translate(cx + gx * off, cy + gy * off).scale(k, k).translate(-cx, -cy));
  });
}
// two-tone fill: whole shape in the shade colour, then the lit colour shrunk toward the light
function fill2(ctx, path, c, d, gx, gy, cx, cy, off, k) {
  ctx.fillStyle = d; ctx.fill(path);
  ctx.save();
  ctx.translate(cx + gx * off, cy + gy * off); ctx.scale(k, k); ctx.translate(-cx, -cy);
  ctx.fillStyle = c; ctx.fill(path);
  ctx.restore();
}

// ---------------------------------------------------------------------
//  Nut ammo (unit space: collision radius = 1, facing +x)
// ---------------------------------------------------------------------
const NUT_INK = '#24160e';
function burrBallPath(p) { p.moveTo(0.8, 0); p.arc(0, 0, 0.8, 0, TAU); p.closePath(); }
function pinenutTipPath(p) {
  p.moveTo(0.74, -0.46);
  p.bezierCurveTo(0.96, -0.36, 1.12, -0.18, 1.28, 0.02);
  p.bezierCurveTo(1.12, 0.22, 0.96, 0.4, 0.74, 0.48);
  p.quadraticCurveTo(0.84, 0.0, 0.74, -0.46);
  p.closePath();
}
function walnutOutlinePath(p) {
  walnutPath(p);
  p.moveTo(-0.08, -0.94); p.bezierCurveTo(-0.3, -0.42, -0.3, 0.42, -0.08, 0.94);
}
// eyes [x0, y0, x1, y1], er = eye dot radius, mouth [x, y], cy = shape centre y, stars = dizzy star height
const NUT = {
  acorn:   { c: '#cf8644', d: '#a5622c', o: '#4a2408', acc: '#8e6036', path: acornBodyPath, eyes: [0.04, 0.22, 0.46, 0.2], er: 0.14, mouth: [0.3, 0.56], cy: 0.25, stars: -1.4 },
  pinenut: { c: '#f4e0b4', d: '#d6b378', o: '#6a4a22', acc: '#b27a40', path: pinenutPath, eyes: [0.1, -0.1, 0.48, -0.12], er: 0.13, mouth: [0.6, 0.24], cy: 0, stars: -1.0 },
  peanut:  { c: '#e0b476', d: '#bb894a', o: '#5a3814', path: peanutPath, eyes: [0.22, -0.1, 0.6, -0.12], er: 0.13, mouth: [0.5, 0.28], cy: 0, stars: -1.0 },
  burr:    { c: '#8ec64e', d: '#5f9c30', o: '#2a4a10', acc: '#43721a', path: burrBallPath, eyes: [0.0, -0.02, 0.4, -0.04], er: 0.14, mouth: [0.22, 0.32], cy: 0, stars: -1.5 },
  walnut:  { c: '#ae7e50', d: '#855830', o: '#3a200c', path: walnutPath, olPath: walnutOutlinePath, eyes: [0.14, -0.02, 0.56, -0.04], er: 0.15, mouth: [0.38, 0.4], cy: 0, stars: -1.3, grumpy: true },
  kernel:  { c: '#f6cdaa', d: '#dba27c', o: '#6a3a1e', path: kernelPath, eyes: [0.04, -0.08, 0.52, -0.1], er: 0.17, mouth: [0.3, 0.32], cy: 0, stars: -1.2, cute: true },
};

function nutFace(ctx, N, st, blink, lx, ly, lw, time, pound) {
  const E = N.eyes, er = N.er;
  let tilt = N.grumpy ? 0.6 : 1, eye = 'dot';
  if (st === 'fly') tilt = 1.7;
  else if (st === 'hurt') { eye = 'x'; tilt = -1.2; }
  else if (st === 'dizzy') { eye = 'spiral'; tilt = 0.3; }
  if (pound) tilt = 2.1;
  if (eye === 'dot' && blink > 0.55) eye = 'line';
  const lid = (N.grumpy && st !== 'fly') || pound;
  const ox = lx * 0.07, oy = ly * 0.06;
  // eye fills (+ open mouth in the same ink)
  ctx.beginPath();
  if (eye === 'dot') {
    const bk = 1 - clamp(blink, 0, 1) * 0.8;
    for (let i = 0; i < 2; i++) {
      const ex = E[i * 2] + ox, ey = E[i * 2 + 1] + oy, r = er * (i ? 0.9 : 1) * (st === 'fly' ? 0.9 : 1);
      if (lid) { ctx.moveTo(ex + r, ey - r * 0.2); ctx.arc(ex, ey - r * 0.2, r, 0, PI); ctx.closePath(); }
      else { ctx.moveTo(ex + r, ey); ctx.ellipse(ex, ey, r, r * bk, 0, 0, TAU); }
    }
  }
  const M = N.mouth;
  if (st === 'fly' && !pound) { ctx.moveTo(M[0] + 0.09, M[1] + 0.02); ctx.ellipse(M[0], M[1] + 0.02, 0.09, 0.1, 0, 0, TAU); }
  ctx.fillStyle = NUT_INK; ctx.fill();
  if (eye === 'dot' && blink < 0.55) {
    ctx.beginPath();
    for (let i = 0; i < 2; i++) {
      const ex = E[i * 2] + ox, ey = E[i * 2 + 1] + oy, r = er * 0.36;
      const hx = ex - er * 0.35, hy = lid ? ey : ey - er * 0.38;
      ctx.moveTo(hx + r, hy); ctx.arc(hx, hy, r, 0, TAU);
    }
    ctx.fillStyle = '#ffffff'; ctx.fill();
  }
  // strokes: brows, closed/x/spiral eyes, line mouths — one path
  ctx.beginPath();
  if (!(N.cute && st === 'idle')) {
    for (let i = 0; i < 2; i++) {
      const ex = E[i * 2], ey = E[i * 2 + 1], d = i ? -1 : 1, yb = ey - er - 0.13;
      ctx.moveTo(ex - d * 0.16, yb - 0.08 * tilt); ctx.lineTo(ex + d * 0.12, yb + 0.08 * tilt);
    }
  }
  for (let i = 0; i < 2; i++) {
    const ex = E[i * 2], ey = E[i * 2 + 1], d = i ? -1 : 1;
    if (eye === 'line') { ctx.moveTo(ex - er, ey + 0.02); ctx.quadraticCurveTo(ex, ey + er * 0.8, ex + er, ey + 0.02); }
    else if (eye === 'x') { ctx.moveTo(ex - d * er, ey - er); ctx.lineTo(ex + d * er * 0.9, ey); ctx.lineTo(ex - d * er, ey + er); }
    else if (eye === 'spiral') {
      for (let j = 0; j <= 9; j++) {
        const t = j / 9, a = time * 7 * d + t * TAU * 1.15, rr = 0.03 + t * er * 1.45;
        if (j) ctx.lineTo(ex + Math.cos(a) * rr, ey + Math.sin(a) * rr); else ctx.moveTo(ex + Math.cos(a) * rr, ey + Math.sin(a) * rr);
      }
    }
  }
  if (pound) { ctx.moveTo(M[0] - 0.12, M[1]); ctx.lineTo(M[0] + 0.12, M[1] - 0.02); }
  else if (st === 'hurt') { ctx.moveTo(M[0] - 0.13, M[1]); ctx.lineTo(M[0] - 0.04, M[1] - 0.05); ctx.lineTo(M[0] + 0.04, M[1] + 0.02); ctx.lineTo(M[0] + 0.13, M[1] - 0.03); }
  else if (st === 'dizzy') { ctx.moveTo(M[0] + 0.07, M[1]); ctx.arc(M[0], M[1], 0.07, 0, TAU); }
  else if (st === 'idle' && (N.cute || N === NUT.peanut)) { ctx.moveTo(M[0] - 0.1, M[1] - 0.02); ctx.quadraticCurveTo(M[0], M[1] + 0.08, M[0] + 0.1, M[1] - 0.02); }
  ctx.strokeStyle = NUT_INK; ctx.lineWidth = lw * 1.15; ctx.stroke();
  if (st === 'dizzy') {
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = time * 4 + i * TAU / 3;
      starPath(ctx, 0.1 + Math.cos(a) * 0.62, N.stars + Math.sin(a) * 0.16, 0.16, 0.07, 5, a * 0.5);
    }
    ctx.fillStyle = '#ffd83a'; ctx.fill();
  }
}

function burrSpikes(ctx, N, fz, time, lw) {
  if (fz > 0) {
    ctx.beginPath(); ctx.arc(0, 0, 1.45 + 0.1 * Math.sin(time * 17), 0, TAU);
    ctx.fillStyle = 'rgba(255,150,50,' + (0.32 * fz).toFixed(3) + ')'; ctx.fill();
  }
  const n = 18, grow = 1 + 0.35 * fz, vib = fz * 0.04;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = i * TAU / n + Math.sin(time * 40 + i) * vib, len = ((i & 1) ? 1.02 : 1.12) * grow;
    ctx.moveTo(Math.cos(a) * 0.6, Math.sin(a) * 0.6); ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
  }
  ctx.strokeStyle = fz > 0 ? mix(N.acc, '#c0400e', fz * 0.7) : N.acc; ctx.lineWidth = 0.15; ctx.stroke();
  if (fz > 0.3) {
    const k = Math.floor(time * 12);
    ctx.beginPath();
    for (let j = 0; j < 5; j++) {
      const i = Math.floor(hash(j, k) * n), a = i * TAU / n, len = ((i & 1) ? 1.02 : 1.12) * grow, s = 0.22 * fz;
      starPath(ctx, Math.cos(a) * len, Math.sin(a) * len, s, s * 0.3, 4, 0.3);
    }
    ctx.fillStyle = '#fff3a0'; ctx.fill();
  }
}

// downward pound speed lines above the walnut (render space, one stroke)
function drawPoundLines(ctx, x, y, r, time) {
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const ph = frac(time * 2.4 + i * 0.29), px = x + (i - 1.5) * r * 0.5;
    const top = y - r * (1.25 + (1 - ph) * 1.0 + (i & 1) * 0.25);
    ctx.moveTo(px, top); ctx.lineTo(px, top + r * (0.45 + 0.25 * (i & 1)));
  }
  ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = r * 0.08; ctx.stroke();
  ctx.restore();
}

export function drawNut(ctx, type, x, y, r, angle, s) {
  s = s || EMPTY;
  if (!(r > 0)) return;
  angle = angle || 0;
  const key = NUT[type] ? type : 'acorn', N = NUT[key];
  const time = +s.time || 0, flip = !!s.flip, st = s.state || 'idle';
  const sq = clamp(+s.squash || 0, -0.6, 0.6);
  const breath = st === 'idle' ? Math.sin(time * 3.1 + x * 1.7) * 0.02 : 0;
  const sx = (1 + sq) * (1 - breath * 0.5), sy = (1 - sq) * (1 + breath);
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const lx0 = +s.lookX || 0, ly0 = +s.lookY || 0;
  let lx = lx0 * ca + ly0 * sa, ly = -lx0 * sa + ly0 * ca;
  if (flip) lx = -lx;
  const lm = Math.hypot(lx, ly);
  if (lm > 1) { lx /= lm; ly /= lm; }
  let gx = LIGHT_X * ca + LIGHT_Y * sa;
  const gy = -LIGHT_X * sa + LIGHT_Y * ca;
  if (flip) gx = -gx;
  const lw = 0.045 * Math.sqrt(clamp(r, 0.1, 2) / 0.38) / r;
  const fz = key === 'burr' ? clamp(+s.fuse || 0, 0, 1) : 0;
  const c = fz > 0 ? mix(N.c, '#ff8a3a', fz * 0.6) : N.c, d = fz > 0 ? mix(N.d, '#d8481a', fz * 0.6) : N.d;
  const pound = key === 'walnut' && !!s.pound;
  if (pound) drawPoundLines(ctx, x, y, r, time);
  ctx.save();
  ctx.translate(x, y);
  if (angle) ctx.rotate(angle);
  ctx.scale(sx * r * (flip ? -1 : 1), sy * r);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const body = P2('nut:' + key, N.path);
  if (key === 'burr') burrSpikes(ctx, N, fz, time, lw);
  if (key === 'acorn') {
    ctx.beginPath(); ctx.moveTo(0.02, -0.82); ctx.quadraticCurveTo(0.04, -1.12, 0.24, -1.24);
    ctx.strokeStyle = N.o; ctx.lineWidth = 0.17; ctx.stroke();
  }
  fill2(ctx, body, c, d, gx, gy, 0, N.cy, 0.1, 0.9);
  if (key === 'pinenut') { ctx.fillStyle = N.acc; ctx.fill(P2('nut:pinetip', pinenutTipPath)); }
  ctx.strokeStyle = N.o; ctx.lineWidth = lw;
  ctx.stroke(N.olPath ? P2('nut:ol:' + key, N.olPath) : body);
  if (key === 'acorn') {
    const cap = P2('nut:acorncap', acornCapPath);
    ctx.fillStyle = N.acc; ctx.fill(cap); ctx.stroke(cap);
  }
  nutFace(ctx, N, st, +s.blink || 0, lx, ly, lw, time, pound);
  ctx.restore();
}

// ---------------------------------------------------------------------
//  Commander: chibi squirrel captain in a wooden tub slingshot cart
//  (commander-local metres: +x = facing, origin = physics body centre)
// ---------------------------------------------------------------------
const SL_BACK = [0.52, -1.14], SL_FRONT = [1.04, -1.12], SL_REST = [0.78, -1.02];
const FORK_CROTCH = [0.79, -0.54], FORK_BASE = [0.7, 0.16];

export function slingAnchors(x, y, facing) {
  const f = facing < 0 ? -1 : 1;
  return {
    back: { x: x + f * SL_BACK[0], y: y + SL_BACK[1] },
    front: { x: x + f * SL_FRONT[0], y: y + SL_FRONT[1] },
    rest: { x: x + f * SL_REST[0], y: y + SL_REST[1] },
  };
}

const HEAD_X = -0.06, HEAD_Y = -0.8, HEAD_K = 0.58;       // head centre and head-unit scale (m)
const CAP_LW = 0.05;                                      // uniform captain outline (m)
const CAPT = [
  { // 참나무단 — red squirrel 토리
    fur: '#f07c3c', furD: '#cc5a22', cream: '#ffeedd', ear: '#ffb09c', line: '#4a1c08', ink: '#2a1208',
    tail: '#ee7a3a', tailL: '#ffc08c', nose: '#5a2014', team: '#f0572f', tuft: null,
  },
  { // 솔숲단 — grey squirrel 솔이 (long ear tufts)
    fur: '#968e88', furD: '#736b66', cream: '#f7f3ef', ear: '#f0b4aa', line: '#2a2320', ink: '#1c1410',
    tail: '#8c847e', tailL: '#cbc3bd', nose: '#2e2420', team: '#2f9be8', tuft: '#3a302c',
  },
];
const TUB = { c: '#cd9254', d: '#a86e38', line: '#3e240e', wheel: '#a06e40', hub: '#5a3a1c' };
const SLING = { wood: '#a2703c', line: '#3e240e', band: '#7c2e1c', pouch: '#6e4424' };

// --- head-unit shapes (head radius ~1, facing +x)
function headPath(p, puff) {
  const w = 1.03 + 0.16 * puff;
  p.moveTo(0, -0.98);
  p.bezierCurveTo(0.62, -0.98, 1.0, -0.58, 1.02, -0.06);
  p.bezierCurveTo(w, 0.52, 0.64, 0.94, 0.02, 0.94);
  p.bezierCurveTo(-0.62, 0.94, -w, 0.52, -1.02, -0.06);
  p.bezierCurveTo(-1.0, -0.58, -0.62, -0.98, 0, -0.98);
  p.closePath();
}
function earShape(p, bx, by, ang, L, W) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const X = (u, v) => bx + u * c - v * s, Y = (u, v) => by + u * s + v * c;
  p.moveTo(X(0, -W / 2), Y(0, -W / 2));
  p.quadraticCurveTo(X(L * 0.62, -W * 0.56), Y(L * 0.62, -W * 0.56), X(L, 0), Y(L, 0));
  p.quadraticCurveTo(X(L * 0.62, W * 0.56), Y(L * 0.62, W * 0.56), X(0, W / 2), Y(0, W / 2));
  p.closePath();
}
function tuftShape(p, bx, by, ang, L) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const X = (u, v) => bx + u * c - v * s, Y = (u, v) => by + u * s + v * c;
  p.moveTo(X(L * 0.72, -0.1), Y(L * 0.72, -0.1));
  p.quadraticCurveTo(X(L * 1.2, -0.22), Y(L * 1.2, -0.22), X(L * 1.62, -0.12), Y(L * 1.62, -0.12));
  p.quadraticCurveTo(X(L * 1.24, 0.0), Y(L * 1.24, 0.0), X(L * 1.44, 0.16), Y(L * 1.44, 0.16));
  p.quadraticCurveTo(X(L * 1.02, 0.14), Y(L * 1.02, 0.14), X(L * 0.72, 0.1), Y(L * 0.72, 0.1));
  p.closePath();
}
const EARS = [[-0.6, -0.58, -2.3], [0.36, -0.76, -1.25]];
function earsPath(p) { for (const e of EARS) earShape(p, e[0], e[1], e[2], 0.52, 0.44); }
function earsInPath(p) { for (const e of EARS) earShape(p, e[0] + Math.cos(e[2]) * 0.1, e[1] + Math.sin(e[2]) * 0.1, e[2], 0.33, 0.22); }
function tuftsPath(p) { for (const e of EARS) tuftShape(p, e[0], e[1], e[2], 0.52); }
function capPath(p) {
  p.moveTo(-0.07, -1.02); p.quadraticCurveTo(-0.06, -1.24, 0.12, -1.36); p.lineTo(0.2, -1.28); p.quadraticCurveTo(0.08, -1.2, 0.09, -1.04); p.closePath();
  p.moveTo(-0.88, -0.56);
  p.bezierCurveTo(-0.92, -1.24, 0.76, -1.32, 0.82, -0.64);
  p.quadraticCurveTo(-0.02, -0.44, -0.88, -0.56);
  p.closePath();
}
function bandPath(p) {
  p.moveTo(-0.88, -0.56);
  p.quadraticCurveTo(-0.02, -0.44, 0.82, -0.64);
  p.lineTo(0.8, -0.82);
  p.quadraticCurveTo(-0.02, -0.64, -0.88, -0.76);
  p.closePath();
}
function hatOutlinePath(p) {
  capPath(p);
  p.moveTo(0.8, -0.82); p.quadraticCurveTo(-0.02, -0.64, -0.88, -0.76);
}
function muzzlePath(p) { p.moveTo(0.9, 0.36); p.ellipse(0.54, 0.36, 0.36, 0.29, -0.08, 0, TAU); p.closePath(); }

function captainFace(s) {
  const mood = s.mood || 'normal';
  const hp = s.hp == null ? 1 : +s.hp;
  const hurt = clamp(+s.hurt || 0, 0, 1);
  const o = {
    eye: 'open', blink: clamp(+s.blink || 0, 0, 1), tilt: 1, browUp: 0, mouth: 'w', puff: 0,
    sweat: false, bandage: false, stars: false, tremble: 0, paw: 'rest', flop: false, llx: 0.8, lly: 0.05,
  };
  if (mood === 'aim') { o.eye = 'squint'; o.tilt = 1.9; o.browUp = -0.04; o.mouth = 'flat'; o.llx = 1; o.lly = -0.4; }
  else if (mood === 'happy') { o.eye = 'happy'; o.tilt = -0.5; o.browUp = 0.06; o.mouth = 'grin'; o.paw = 'wave'; }
  else if (mood === 'scared') { o.eye = 'wide'; o.tilt = -1.5; o.browUp = 0.08; o.mouth = 'o'; o.tremble = 1; o.sweat = true; o.llx = 0.2; o.lly = -0.2; }
  if (hp < 0.35) {
    o.bandage = true; o.sweat = true;
    if (mood !== 'happy') o.tilt = Math.min(o.tilt, -0.6);
  }
  if (hp < 0.15) { o.eye = 'spiral'; o.stars = true; o.mouth = 'o'; }
  if (hurt > 0.01) {
    o.puff = hurt;
    if (hurt > 0.15) { o.eye = 'x'; o.tilt = -1.3; o.mouth = 'tight'; }
  }
  if (s.dead) {
    o.eye = 'dead'; o.mouth = 'tongue'; o.tilt = -0.8; o.browUp = 0; o.puff = 0;
    o.sweat = false; o.stars = false; o.tremble = 0; o.flop = true; o.paw = 'limp';
  }
  return o;
}

// eyes, brows and mouth (head-unit space)
const EYE_POS = [[0.13, 0.04, 1], [0.6, 0.01, 0.88]];
function captainFaceFeatures(ctx, P, o, time) {
  const ink = P.ink, ex0 = o.llx * 0.05, ey0 = o.lly * 0.05;
  const closed = o.eye === 'open' || o.eye === 'squint' || o.eye === 'wide' ? o.blink > 0.55 : false;
  // fills: eye ovals + nose (+ open mouths)
  ctx.beginPath();
  if (!closed && (o.eye === 'open' || o.eye === 'squint' || o.eye === 'wide')) {
    const sc = o.eye === 'wide' ? 1.2 : 1, sq = o.eye === 'squint' ? 0.5 : 1, bk = 1 - o.blink * 0.8;
    for (const e of EYE_POS) {
      const rx = 0.165 * e[2] * sc, ry = 0.22 * sc * sq * bk, cx = e[0] + ex0, cy = e[1] + ey0 + (o.eye === 'squint' ? 0.05 : 0);
      ctx.moveTo(cx + rx, cy); ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
    }
  }
  ctx.moveTo(1.0, 0.14); ctx.ellipse(0.91, 0.14, 0.09, 0.07, 0.2, 0, TAU);
  ctx.fillStyle = ink; ctx.fill();
  // highlights
  if (!closed && (o.eye === 'open' || o.eye === 'wide')) {
    const hr = o.eye === 'wide' ? 0.1 : 0.08;
    ctx.beginPath();
    for (const e of EYE_POS) { const hx = e[0] + ex0 - 0.05, hy = e[1] + ey0 - 0.08; ctx.moveTo(hx + hr, hy); ctx.arc(hx, hy, hr, 0, TAU); }
    ctx.fillStyle = '#ffffff'; ctx.fill();
  }
  // open mouths
  const m = o.mouth;
  if (m === 'grin' || m === 'o' || m === 'tongue') {
    ctx.beginPath();
    if (m === 'grin') { ctx.moveTo(0.66, 0.28); ctx.quadraticCurveTo(0.82, 0.32, 0.98, 0.26); ctx.quadraticCurveTo(0.95, 0.54, 0.8, 0.53); ctx.quadraticCurveTo(0.66, 0.5, 0.66, 0.28); ctx.closePath(); }
    else if (m === 'o') { ctx.moveTo(0.9, 0.38); ctx.ellipse(0.83, 0.38, 0.07, 0.09, 0, 0, TAU); }
    else { ctx.moveTo(0.96, 0.34); ctx.ellipse(0.84, 0.36, 0.12, 0.08, 0, 0, TAU); }
    ctx.fillStyle = '#6a1a1a'; ctx.fill();
    if (m !== 'o') {
      ctx.beginPath(); ctx.ellipse(m === 'grin' ? 0.82 : 0.86, m === 'grin' ? 0.46 : 0.46, 0.08, m === 'grin' ? 0.05 : 0.09, 0, 0, TAU);
      ctx.fillStyle = '#ff7a92'; ctx.fill();
    }
  }
  // strokes: brows, non-oval eyes, line mouths
  ctx.beginPath();
  const t = o.tilt, yb = -0.32 - o.browUp;
  ctx.moveTo(-0.02, yb - 0.06 * t); ctx.lineTo(0.28, yb + 0.06 * t);
  ctx.moveTo(0.46, yb + 0.06 * t - 0.02); ctx.lineTo(0.72, yb - 0.06 * t - 0.03);
  for (const e of EYE_POS) {
    const cx = e[0], cy = e[1], d = e === EYE_POS[0] ? 1 : -1;
    if (closed) { ctx.moveTo(cx - 0.15, cy); ctx.quadraticCurveTo(cx, cy + 0.14, cx + 0.15, cy); }
    else if (o.eye === 'happy') { ctx.moveTo(cx - 0.15, cy + 0.06); ctx.quadraticCurveTo(cx, cy - 0.16, cx + 0.15, cy + 0.06); }
    else if (o.eye === 'x') { ctx.moveTo(cx - d * 0.15, cy - 0.15); ctx.lineTo(cx + d * 0.12, cy); ctx.lineTo(cx - d * 0.15, cy + 0.15); }
    else if (o.eye === 'dead') { ctx.moveTo(cx - 0.13, cy - 0.13); ctx.lineTo(cx + 0.13, cy + 0.13); ctx.moveTo(cx + 0.13, cy - 0.13); ctx.lineTo(cx - 0.13, cy + 0.13); }
    else if (o.eye === 'spiral') {
      for (let j = 0; j <= 12; j++) {
        const u = j / 12, a = time * 7 * d + u * TAU * 1.7, rr = 0.015 + u * 0.16;
        if (j) ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); else ctx.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      }
    }
  }
  if (m === 'w') { ctx.moveTo(0.7, 0.3); ctx.quadraticCurveTo(0.76, 0.39, 0.83, 0.3); ctx.quadraticCurveTo(0.9, 0.39, 0.96, 0.3); }
  else if (m === 'flat') { ctx.moveTo(0.72, 0.34); ctx.lineTo(0.94, 0.31); }
  else if (m === 'tight') { ctx.moveTo(0.68, 0.34); ctx.lineTo(0.75, 0.29); ctx.lineTo(0.82, 0.35); ctx.lineTo(0.89, 0.29); ctx.lineTo(0.96, 0.34); }
  else if (m === 'grin') { ctx.moveTo(0.66, 0.28); ctx.quadraticCurveTo(0.82, 0.32, 0.98, 0.26); ctx.quadraticCurveTo(0.95, 0.54, 0.8, 0.53); ctx.quadraticCurveTo(0.66, 0.5, 0.66, 0.28); }
  else if (m === 'o') { ctx.moveTo(0.9, 0.38); ctx.ellipse(0.83, 0.38, 0.07, 0.09, 0, 0, TAU); }
  ctx.strokeStyle = ink; ctx.lineWidth = 0.09; ctx.stroke();
}

// Head with ears, hat and face, in head-unit space. hat=false skips the hat (dead: drawn askew by caller)
function drawCaptainHead(ctx, team, P, o, gx, gy, time, lw) {
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // ears (behind the head)
  if (P.tuft) { const tp = P2('cap:tufts', tuftsPath); ctx.fillStyle = P.tuft; ctx.fill(tp); ctx.strokeStyle = P.line; ctx.lineWidth = lw; ctx.stroke(tp); }
  const ears = P2('cap:ears', earsPath);
  ctx.fillStyle = P.fur; ctx.fill(ears);
  ctx.fillStyle = P.ear; ctx.fill(P2('cap:earsIn', earsInPath));
  ctx.strokeStyle = P.line; ctx.lineWidth = lw; ctx.stroke(ears);
  // head: two-tone + cream muzzle + blush
  const q = Math.round((o.puff || 0) * 6) / 6;
  const head = P2('cap:head' + q, (p) => headPath(p, q));
  const cres = shadeCrescent('cap:headShade' + q + (gx > 0 ? 'r' : 'l'), head, gx, gy, 0, 0, 0.08, 0.92);
  if (cres) { ctx.fillStyle = P.fur; ctx.fill(head); ctx.fillStyle = P.furD; ctx.fill(cres, 'evenodd'); }
  else fill2(ctx, head, P.fur, P.furD, gx, gy, 0, 0, 0.08, 0.92);
  ctx.fillStyle = P.cream; ctx.fill(P2('cap:muzzle', muzzlePath));
  const bs = 1 + 0.6 * q;
  ctx.beginPath();
  ctx.moveTo(-0.16 + 0.2 * bs, 0.36); ctx.ellipse(-0.16, 0.36, 0.2 * bs, 0.11 * bs, 0, 0, TAU);
  ctx.moveTo(0.96, 0.24); ctx.ellipse(0.88, 0.24, 0.08, 0.06, 0, 0, TAU);
  ctx.fillStyle = 'rgba(255,110,140,' + (0.45 + 0.25 * q).toFixed(2) + ')'; ctx.fill();
  ctx.strokeStyle = P.line; ctx.lineWidth = lw; ctx.stroke(head);
  captainFaceFeatures(ctx, P, o, time);
  // hat: acorn cap with a team-coloured band
  if (o.hat !== false) drawCaptainHat(ctx, P, lw, o.dead);
}
function drawCaptainHat(ctx, P, lw, askew) {
  ctx.save();
  if (askew) { ctx.translate(-0.22, -0.06); ctx.rotate(-0.38); }
  const cap = P2('cap:cap', capPath);
  ctx.fillStyle = '#9c6c3c'; ctx.fill(cap);
  ctx.fillStyle = P.team; ctx.fill(P2('cap:band', bandPath));
  ctx.strokeStyle = P.line; ctx.lineWidth = lw; ctx.stroke(P2('cap:hatOL', hatOutlinePath));
  ctx.restore();
}

// --- tail: one clean two-tone S-curl (commander-local metres), cached as Path2D
const TAIL_S = [[-0.44, -0.06], [-1.08, -0.06], [-1.26, -0.72], [-0.96, -0.97], [-0.66, -1.2], [-0.74, -1.64], [-1.1, -1.54]];
const TAIL_WID = [[0, 0.32], [0.3, 0.52], [0.55, 0.48], [0.82, 0.42], [1, 0.3]];
function tailW(u) {
  for (let i = 1; i < TAIL_WID.length; i++) {
    if (u <= TAIL_WID[i][0]) { const a = TAIL_WID[i - 1], b = TAIL_WID[i], t = (u - a[0]) / (b[0] - a[0]); return a[1] + (b[1] - a[1]) * t; }
  }
  return 0.3;
}
function cubicPt(p0, p1, p2, p3, t) {
  const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
}
function tailShape(p, wmul) {
  const S = TAIL_S, N = 12, pts = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, seg = u < 0.5 ? 0 : 1, t = seg ? (u - 0.5) * 2 : u * 2;
    pts.push(seg ? cubicPt(S[3], S[4], S[5], S[6], t) : cubicPt(S[0], S[1], S[2], S[3], t));
  }
  const L = [], R = [];
  for (let i = 0; i <= N; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(N, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1]; const d = Math.hypot(tx, ty) || 1; tx /= d; ty /= d;
    const w = tailW(i / N) * wmul / 2;
    L.push([pts[i][0] - ty * w, pts[i][1] + tx * w]); R.push([pts[i][0] + ty * w, pts[i][1] - tx * w]);
  }
  p.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < N; i++) p.quadraticCurveTo(L[i][0], L[i][1], (L[i][0] + L[i + 1][0]) / 2, (L[i][1] + L[i + 1][1]) / 2);
  const e = pts[N], q = pts[N - 1];
  let tx = e[0] - q[0], ty = e[1] - q[1]; const dd = Math.hypot(tx, ty) || 1; tx /= dd; ty /= dd;
  const w = tailW(1) * wmul / 2;
  p.quadraticCurveTo(L[N][0] + tx * w * 1.3, L[N][1] + ty * w * 1.3, e[0] + tx * w * 1.15, e[1] + ty * w * 1.15);
  p.quadraticCurveTo(R[N][0] + tx * w * 1.3, R[N][1] + ty * w * 1.3, R[N][0], R[N][1]);
  for (let i = N - 1; i > 0; i--) p.quadraticCurveTo(R[i][0], R[i][1], (R[i][0] + R[i - 1][0]) / 2, (R[i][1] + R[i - 1][1]) / 2);
  p.lineTo(R[0][0], R[0][1]);
  p.closePath();
}
function drawCaptainTail(ctx, P, rot) {
  ctx.save();
  ctx.translate(TAIL_S[0][0], TAIL_S[0][1]); ctx.rotate(rot); ctx.translate(-TAIL_S[0][0], -TAIL_S[0][1]);
  const outer = P2('cap:tail', (p) => tailShape(p, 1));
  ctx.fillStyle = P.tail; ctx.fill(outer);
  ctx.save(); ctx.translate(0.05, -0.04);
  ctx.fillStyle = P.tailL; ctx.fill(P2('cap:tailIn', (p) => tailShape(p, 0.42)));
  ctx.restore();
  ctx.strokeStyle = P.line; ctx.lineWidth = CAP_LW; ctx.lineJoin = 'round'; ctx.stroke(outer);
  ctx.restore();
}

// --- tub cart
function tubPath(p) {
  p.moveTo(-0.76, -0.2); p.lineTo(0.72, -0.2); p.lineTo(0.62, 0.3);
  p.quadraticCurveTo(0.6, 0.44, 0.44, 0.44); p.lineTo(-0.48, 0.44);
  p.quadraticCurveTo(-0.64, 0.44, -0.66, 0.3); p.closePath();
}
function tubShadePath(p) {
  p.moveTo(-0.68, 0.2); p.lineTo(0.64, 0.2); p.lineTo(0.62, 0.3);
  p.quadraticCurveTo(0.6, 0.44, 0.44, 0.44); p.lineTo(-0.48, 0.44);
  p.quadraticCurveTo(-0.64, 0.44, -0.66, 0.3); p.closePath();
}
function rimPath(p) { roundRectPath(p, -0.82, -0.29, 1.6, 0.15, 0.075); }
function tubOutlinePath(p) {
  p.moveTo(0.73, -0.15); p.lineTo(0.62, 0.3);
  p.quadraticCurveTo(0.6, 0.44, 0.44, 0.44); p.lineTo(-0.48, 0.44);
  p.quadraticCurveTo(-0.64, 0.44, -0.66, 0.3); p.lineTo(-0.77, -0.15);
  p.moveTo(-0.66, 0.03); p.lineTo(0.68, 0.03);
  rimPath(p);
}
const WHEELS = [[-0.44, 0.47], [0.42, 0.47]], WHEEL_R = 0.28;
function wheelsPath(p) { for (const w of WHEELS) { p.moveTo(w[0] + WHEEL_R, w[1]); p.arc(w[0], w[1], WHEEL_R, 0, TAU); } }
function drawTubCart(ctx, lw, wheelAng, bounce) {
  ctx.save(); ctx.translate(0, bounce);
  ctx.fillStyle = TUB.c; ctx.fill(P2('cart:tub', (p) => { tubPath(p); rimPath(p); }));
  ctx.fillStyle = TUB.d; ctx.fill(P2('cart:shade', tubShadePath));
  ctx.strokeStyle = TUB.line; ctx.lineWidth = lw; ctx.stroke(P2('cart:ol', tubOutlinePath));
  ctx.restore();
  // plain wheels (cross spokes show the rotation)
  const wp = P2('cart:wheels', wheelsPath);
  ctx.fillStyle = TUB.wheel; ctx.fill(wp);
  ctx.beginPath();
  const c = Math.cos(wheelAng) * WHEEL_R * 0.8, s = Math.sin(wheelAng) * WHEEL_R * 0.8;
  for (const w of WHEELS) { ctx.moveTo(w[0] - c, w[1] - s); ctx.lineTo(w[0] + c, w[1] + s); ctx.moveTo(w[0] + s, w[1] - c); ctx.lineTo(w[0] - s, w[1] + c); }
  ctx.strokeStyle = TUB.hub; ctx.lineWidth = 0.07; ctx.stroke();
  ctx.strokeStyle = TUB.line; ctx.lineWidth = lw; ctx.stroke(wp);
}
function drawPaws(ctx, P, lw, pose, time, dx, dy) {
  ctx.beginPath();
  let back = [-0.3 + dx, -0.27 + dy], front = [0.18 + dx, -0.27 + dy];
  if (pose === 'wave') back = [-0.72 + dx, -0.7 + dy - Math.abs(Math.sin(time * 9)) * 0.12];
  else if (pose === 'limp') front = [0.24 + dx, -0.2 + dy];
  for (const q of [back, front]) { ctx.moveTo(q[0] + 0.12, q[1]); ctx.ellipse(q[0], q[1], 0.12, 0.1, 0, 0, TAU); }
  ctx.fillStyle = P.fur; ctx.fill();
  ctx.strokeStyle = P.line; ctx.lineWidth = CAP_LW; ctx.stroke();
}
function drawSimpleSweat(ctx, x, y, time) {
  const ph = frac(time * 0.8);
  ctx.save(); ctx.translate(x, y + ph * 0.16);
  ctx.globalAlpha = ph < 0.8 ? 1 : (1 - ph) * 5;
  ctx.beginPath(); ctx.moveTo(0, -0.18); ctx.quadraticCurveTo(0.1, -0.02, 0.1, 0.04); ctx.arc(0, 0.04, 0.1, 0, PI); ctx.quadraticCurveTo(-0.1, -0.02, 0, -0.18); ctx.closePath();
  ctx.fillStyle = '#bfeaff'; ctx.fill(); ctx.strokeStyle = '#2f79ad'; ctx.lineWidth = 0.05; ctx.stroke();
  ctx.restore();
}
function drawSimpleBandage(ctx, lw) {
  ctx.beginPath(); leafShapeAt(ctx, -0.58, -0.3, 0.26, 0.13, -0.9);
  ctx.fillStyle = '#7cc44a'; ctx.fill(); ctx.strokeStyle = '#2c5410'; ctx.lineWidth = lw; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-0.76, -0.14); ctx.lineTo(-0.42, -0.46);
  ctx.strokeStyle = '#f4e2c0'; ctx.lineWidth = 0.1; ctx.stroke();
}
function drawSimpleStars(ctx, time) {
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = time * 4 + i * TAU / 3;
    starPath(ctx, Math.cos(a) * 0.85, -1.45 + Math.sin(a) * 0.2, 0.16, 0.07, 5, a * 0.5);
  }
  ctx.fillStyle = '#ffd83a'; ctx.fill();
}

// --- slingshot
function forkPath(ctx, crotch, cx, cy, tip, base) {
  if (base) { ctx.moveTo(base[0], base[1]); ctx.lineTo(crotch[0], crotch[1]); }
  else ctx.moveTo(crotch[0], crotch[1]);
  ctx.quadraticCurveTo(cx, cy, tip[0], tip[1]);
}
function strokeFork(ctx, lw) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = SLING.line; ctx.lineWidth = 0.14 + lw * 1.6; ctx.stroke();
  ctx.strokeStyle = SLING.wood; ctx.lineWidth = 0.14; ctx.stroke();
}

export function drawCommander(ctx, x, y, s, drawAmmo) {
  s = s || EMPTY;
  const f = s.facing < 0 ? -1 : 1;
  const team = s.team ? 1 : 0;
  const time = +s.time || 0;
  const lw = CAP_LW;
  const moving = !!s.moving, dead = !!s.dead;
  const aim = clamp(+s.aimPower || 0, 0, 1);
  const fo = captainFace(s);
  const hurt = clamp(+s.hurt || 0, 0, 1);
  const bounce = moving ? -Math.abs(Math.sin(time * 13)) * 0.035 : 0;
  const capBounce = moving ? -Math.abs(Math.sin(time * 13 - 0.7)) * 0.07 : 0;
  const breath = dead ? 0 : Math.sin(time * 2.4) * 0.015;
  let shake = 0;
  if (hurt > 0.01) shake += Math.sin(time * 61) * 0.04 * hurt;
  if (fo.tremble) shake += Math.sin(time * 47) * 0.012;
  const wheelAng = s.wheelAngle != null ? (+s.wheelAngle || 0) : (moving ? time * 7 : 0);
  const gxLocal = LIGHT_X * f;
  let P = CAPT[team];
  if (hurt > 0.01) {
    const tint = Math.sin(time * 38) > 0 ? '#ffffff' : '#ff3030';
    P = tintPal(P, ['fur', 'furD', 'cream', 'ear', 'tail', 'tailL'], tint, hurt * 0.5);
  }
  const cy0 = bounce + capBounce;

  ctx.save();
  // ---------- back layer
  ctx.save();
  ctx.translate(x, y); ctx.scale(f, 1);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.save(); ctx.translate(shake, cy0);
  drawCaptainTail(ctx, P, fo.flop ? 0.28 : Math.sin(time * 2.1) * 0.045);
  ctx.restore();
  // fork stem + back arm (behind the captain; the tub hides the stem foot)
  ctx.beginPath();
  forkPath(ctx, [FORK_CROTCH[0], FORK_CROTCH[1] + bounce], 0.56, -0.74 + bounce, [SL_BACK[0], SL_BACK[1] + bounce], [FORK_BASE[0], FORK_BASE[1] + bounce]);
  strokeFork(ctx, lw);
  // head
  ctx.save();
  ctx.translate(HEAD_X + shake, HEAD_Y + cy0);
  if (dead) { ctx.translate(0, 0.5); ctx.rotate(-0.28); ctx.translate(0, -0.5); }
  ctx.scale(HEAD_K * (1 - breath * 0.5), HEAD_K * (1 + breath));
  const ho = { eye: fo.eye, blink: fo.blink, tilt: fo.tilt, browUp: fo.browUp, mouth: fo.mouth, puff: fo.puff, llx: fo.llx, lly: fo.lly, dead };
  const hlw = lw / HEAD_K;
  drawCaptainHead(ctx, team, P, ho, gxLocal, LIGHT_Y, time, hlw);
  if (fo.bandage) drawSimpleBandage(ctx, hlw);
  if (fo.sweat) drawSimpleSweat(ctx, 1.02, -0.42, time);
  if (fo.stars) drawSimpleStars(ctx, time);
  ctx.restore();
  // tub, paws, wheels
  drawTubCart(ctx, lw, wheelAng * f, bounce);
  drawPaws(ctx, P, lw, fo.paw, time, shake, bounce + capBounce * 0.4);
  ctx.restore();

  // ---------- sling (render space)
  const bk = { x: x + f * SL_BACK[0], y: y + SL_BACK[1] + bounce };
  const fr = { x: x + f * SL_FRONT[0], y: y + SL_FRONT[1] + bounce };
  let px, py;
  if (s.pouch && isFinite(s.pouch.x) && isFinite(s.pouch.y)) { px = +s.pouch.x; py = +s.pouch.y; }
  else { px = x + f * SL_REST[0]; py = y + SL_REST[1] + bounce; }
  const mx = (bk.x + fr.x) / 2, my = (bk.y + fr.y) / 2;
  let dx = px - mx, dy = py - my + 0.22;
  const dd = Math.hypot(dx, dy) || 1; dx /= dd; dy /= dd;
  const loaded = typeof drawAmmo === 'function';
  const pAng = Math.atan2(dy, dx), span = loaded ? 0.82 : 0.9, prad = loaded ? 0.33 : 0.18;
  const e1 = [px + Math.cos(pAng - span) * prad, py + Math.sin(pAng - span) * prad];
  const e2 = [px + Math.cos(pAng + span) * prad, py + Math.sin(pAng + span) * prad];
  const d1 = Math.hypot(e1[0] - bk.x, e1[1] - bk.y), d2 = Math.hypot(e2[0] - bk.x, e2[1] - bk.y);
  const eb = d1 < d2 ? e1 : e2, ef = d1 < d2 ? e2 : e1;
  const stretch = clamp(Math.max(aim, (Math.hypot(px - (x + f * SL_REST[0]), py - (y + SL_REST[1])) - 0.2) / 2.2), 0, 1);
  const bw = 0.085 * (1 - 0.45 * stretch);
  const bandCol = stretch > 0.02 ? mix(SLING.band, '#b04a30', stretch * 0.7) : SLING.band;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(bk.x, bk.y); ctx.lineTo(eb[0], eb[1]);
  ctx.strokeStyle = bandCol; ctx.lineWidth = bw; ctx.stroke();
  ctx.restore();
  if (typeof drawAmmo === 'function') {
    ctx.save();
    drawAmmo(ctx);
    ctx.restore();
  }
  ctx.save();
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(px, py, prad, pAng - span, pAng + span);
  ctx.strokeStyle = SLING.pouch; ctx.lineWidth = 0.14; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(fr.x, fr.y); ctx.lineTo(ef[0], ef[1]);
  ctx.strokeStyle = bandCol; ctx.lineWidth = bw; ctx.stroke();
  ctx.restore();

  // ---------- front layer: fork front arm
  ctx.save();
  ctx.translate(x, y); ctx.scale(f, 1);
  ctx.beginPath();
  forkPath(ctx, [FORK_CROTCH[0] - 0.01, FORK_CROTCH[1] + 0.03 + bounce], 1.06, -0.74 + bounce, [SL_FRONT[0], SL_FRONT[1] + bounce], null);
  strokeFork(ctx, lw);
  ctx.restore();
  ctx.restore();
}

// ---------------------------------------------------------------------
//  Blocks
// ---------------------------------------------------------------------
const MAT = {
  wood: { line: '#3a2210', crack: '#2e1606', crackHi: 'rgba(255,224,176,0.7)' },
  stone: { line: '#2e3b47', crack: '#26303a', crackHi: 'rgba(236,244,250,0.8)' },
  leaf: { line: '#1e4a10', crack: '#16380a', crackHi: 'rgba(230,255,200,0.65)' },
  crate: { line: '#3e220a', crack: '#2a1404', crackHi: 'rgba(255,225,170,0.7)' },
  log: { line: '#2e1808', crack: '#1e0e04', crackHi: 'rgba(255,220,170,0.65)' },
  hive: { line: '#5a3006', crack: '#4a2604', crackHi: 'rgba(255,236,160,0.7)' },
  mushroom: { line: '#4a0a08' },
};

const _detailCache = new Map();
function blockDetail(key, make) {
  let d = _detailCache.get(key);
  if (!d) {
    if (_detailCache.size > 800) _detailCache.clear();
    d = make();
    _detailCache.set(key, d);
  }
  return d;
}

// Crack polylines in local metres, clamped inside the shape (no clipping needed).
function genCracks(R, w, h, isCircle, level, margin) {
  const main = [], thin = [];
  const S = isCircle ? w * 1.3 : Math.min(w, h);
  const Lm = isCircle ? w * 1.3 : Math.max(w, h);
  const cl = (p) => {
    if (isCircle) {
      const d = Math.hypot(p[0], p[1]), m = w - margin;
      if (d > m) { p[0] *= m / d; p[1] *= m / d; }
    } else {
      p[0] = clamp(p[0], -w / 2 + margin, w / 2 - margin);
      p[1] = clamp(p[1], -h / 2 + margin, h / 2 - margin);
    }
    return p;
  };
  const edgePoint = () => {
    if (isCircle) { const a = R() * TAU; return [Math.cos(a) * w, Math.sin(a) * w, a + PI]; }
    const side = Math.floor(R() * 4), t = (R() - 0.5) * 0.8;
    if (side === 0) return [t * w, -h / 2, PI / 2];
    if (side === 1) return [w / 2, t * h, PI];
    if (side === 2) return [t * w, h / 2, -PI / 2];
    return [-w / 2, t * h, 0];
  };
  const crack = (lenMul, branches) => {
    const e = edgePoint();
    let x = e[0], y = e[1], a = e[2] + (R() - 0.5) * 0.9;
    const segs = 4 + Math.floor(R() * 3);
    const len = S * lenMul * (0.8 + R() * 0.5);
    const pts = [cl([x, y])];
    for (let i = 0; i < segs; i++) {
      a += (R() - 0.5) * 1.1;
      const sl = len / segs * (0.7 + R() * 0.6);
      x += Math.cos(a) * sl; y += Math.sin(a) * sl;
      pts.push(cl([x, y]));
    }
    main.push(pts);
    for (let b = 0; b < branches; b++) {
      const k = 1 + Math.floor(R() * (pts.length - 2));
      let bx = pts[k][0], by = pts[k][1], ba = a + (R() < 0.5 ? -1 : 1) * (0.6 + R() * 0.6);
      const bp = [[bx, by]];
      const n = 2 + Math.floor(R() * 2);
      for (let i = 0; i < n; i++) {
        ba += (R() - 0.5) * 0.9;
        const sl = len * 0.18 * (0.7 + R() * 0.6);
        bx += Math.cos(ba) * sl; by += Math.sin(ba) * sl;
        bp.push(cl([bx, by]));
      }
      thin.push(bp);
    }
  };
  const nLong = isCircle ? 1 : Math.max(1, Math.min(3, Math.round(Lm / (S * 2.2))));
  if (level >= 1) for (let i = 0; i < nLong; i++) crack(0.75, 1);
  if (level >= 2) {
    for (let i = 0; i < nLong + 1; i++) crack(1.0, 2);
    const cx = (R() - 0.5) * (isCircle ? w : w * 0.6), cy = (R() - 0.5) * (isCircle ? w : h * 0.5);
    for (let i = 0; i < 5; i++) {
      const a = i * TAU / 5 + R() * 0.6, l = S * (0.14 + R() * 0.14), m = l * 0.5;
      thin.push([cl([cx, cy]), cl([cx + Math.cos(a + 0.2) * m, cy + Math.sin(a + 0.2) * m]), cl([cx + Math.cos(a) * l, cy + Math.sin(a) * l])]);
    }
  }
  return { main, thin };
}

function polyPaths(ctx, list, ox, oy) {
  for (const pts of list) {
    ctx.moveTo(pts[0][0] + ox, pts[0][1] + oy);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] + ox, pts[i][1] + oy);
  }
}
function drawCracks(ctx, C, cw, M) {
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const o = cw * 0.55;
  ctx.strokeStyle = M.crackHi;
  ctx.beginPath(); polyPaths(ctx, C.main, o, o); ctx.lineWidth = cw * 0.7; ctx.stroke();
  ctx.beginPath(); polyPaths(ctx, C.thin, o, o); ctx.lineWidth = cw * 0.5; ctx.stroke();
  ctx.strokeStyle = M.crack;
  ctx.beginPath(); polyPaths(ctx, C.main, 0, 0); ctx.lineWidth = cw; ctx.stroke();
  ctx.beginPath(); polyPaths(ctx, C.thin, 0, 0); ctx.lineWidth = cw * 0.7; ctx.stroke();
}
function dotsPath(ctx, list) {
  for (const d of list) { ctx.moveTo(d[0] + d[2], d[1]); ctx.arc(d[0], d[1], d[2], 0, TAU); }
}
function bevelTL(ctx, w, h, i, r) {
  const x0 = -w / 2 + i, y0 = -h / 2 + i, x1 = w / 2 - i, y1 = h / 2 - i;
  ctx.moveTo(x0, y1 - r); ctx.lineTo(x0, y0 + r); ctx.arcTo(x0, y0, x0 + r, y0, r); ctx.lineTo(x1 - r, y0);
}
function bevelBR(ctx, w, h, i, r) {
  const x0 = -w / 2 + i, y0 = -h / 2 + i, x1 = w / 2 - i, y1 = h / 2 - i;
  ctx.moveTo(x1, y0 + r); ctx.lineTo(x1, y1 - r); ctx.arcTo(x1, y1, x1 - r, y1, r); ctx.lineTo(x0 + r, y1);
}

// --- wood: rough-barked twig/branch planks
function branchDetail(L, S, seed) {
  const R = rng(seed * 7 + 13);
  const grooves = [];
  const n = clamp(Math.round(S / 0.07), 3, 12);
  for (let i = 0; i < n; i++) {
    const yy = -S / 2 + S * (i + 0.3 + R() * 0.4) / n;
    const xs = -L / 2 + L * (0.02 + R() * 0.3), xe = xs + L * (0.25 + R() * 0.55);
    grooves.push([xs, yy, Math.min(xe, L / 2 - L * 0.03), S * (0.02 + R() * 0.03), R() * TAU]);
  }
  const knots = [];
  const nk = L > 1.6 ? 2 : (L > 0.5 ? (R() < 0.7 ? 1 : 0) : 0);
  const k0 = (R() - 0.5) * L * 0.5;
  for (let i = 0; i < nk; i++) knots.push([i ? -Math.sign(k0 || 1) * L * (0.2 + R() * 0.15) : k0, (R() - 0.5) * S * 0.35, Math.min(S * 0.13, 0.065)]);
  const sprout = (seed % 3 === 0) ? { x: (R() - 0.5) * L * 0.6, side: R() < 0.7 ? -1 : 1, a: (R() - 0.5) * 0.6 } : null;
  return { grooves, knots, sprout };
}

function drawBranchBox(ctx, w, h, b, lw) {
  const S = Math.min(w, h), L = Math.max(w, h);
  const cr = Math.min(S * 0.32, 0.12);
  const vert = h > w;
  ctx.beginPath(); roundRectPath(ctx, -w / 2, -h / 2, w, h, cr);
  ctx.fillStyle = cgrad(ctx, 'branch' + w + 'x' + h, () => {
    const g = vert ? ctx.createLinearGradient(-w / 2, 0, w / 2, 0) : ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, '#7a4e28'); g.addColorStop(0.22, '#c99a60'); g.addColorStop(0.5, '#a0703e'); g.addColorStop(0.85, '#76492a'); g.addColorStop(1, '#5a361c');
    return g;
  });
  ctx.fill();
  if (vert) ctx.rotate(PI / 2);
  const D = blockDetail('br' + L + 'x' + S + 's' + b.seed, () => branchDetail(L, S, b.seed | 0));
  // bark grooves along the long axis
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const g of D.grooves) {
    const xs = g[0], yy = g[1], xe = g[2], amp = g[3], ph = g[4];
    const n = Math.max(2, Math.round((xe - xs) / 0.22));
    ctx.moveTo(xs, yy);
    for (let i = 1; i <= n; i++) ctx.quadraticCurveTo(xs + (xe - xs) * (i - 0.5) / n, yy + Math.sin(ph + i * 2.1) * amp, xs + (xe - xs) * i / n, yy);
  }
  ctx.strokeStyle = 'rgba(52,28,10,0.55)'; ctx.lineWidth = clamp(S * 0.03, 0.01, 0.028); ctx.stroke();
  ctx.save(); ctx.translate(0, clamp(S * 0.02, 0.006, 0.018));
  ctx.strokeStyle = 'rgba(255,222,170,0.3)'; ctx.lineWidth = clamp(S * 0.015, 0.006, 0.014); ctx.stroke();
  ctx.restore();
  if (D.knots.length) {
    ctx.beginPath();
    for (const k of D.knots) { ctx.moveTo(k[0] + k[2] * 1.5, k[1]); ctx.ellipse(k[0], k[1], k[2] * 1.5, k[2], 0, 0, TAU); }
    ctx.fillStyle = '#80522a'; ctx.fill();
    ctx.lineWidth = clamp(S * 0.018, 0.007, 0.018); ctx.strokeStyle = 'rgba(40,20,6,0.55)'; ctx.stroke();
    ctx.beginPath();
    for (const k of D.knots) { ctx.moveTo(k[0] + k[2] * 0.55, k[1]); ctx.ellipse(k[0], k[1], k[2] * 0.55, k[2] * 0.35, 0, 0, TAU); }
    ctx.fillStyle = '#c99660'; ctx.fill();
  }
  if (vert) ctx.rotate(-PI / 2);
  const bv = Math.min(S * 0.08, 0.04), br = Math.max(cr - bv / 2, 0.001);
  ctx.lineWidth = bv; ctx.lineCap = 'butt';
  ctx.beginPath(); bevelTL(ctx, w, h, bv / 2, br); ctx.strokeStyle = 'rgba(255,230,190,0.28)'; ctx.stroke();
  return cr;
}
function drawBranchSprout(ctx, w, h, b, lw) {
  const S = Math.min(w, h), L = Math.max(w, h);
  const D = blockDetail('br' + L + 'x' + S + 's' + b.seed, () => branchDetail(L, S, b.seed | 0));
  if (!D.sprout) return;
  ctx.save();
  if (h > w) ctx.rotate(PI / 2);
  const sp = D.sprout, yEdge = sp.side * S / 2;
  const sz = clamp(S * 0.5, 0.1, 0.2);
  ctx.beginPath(); ctx.moveTo(sp.x, yEdge - sp.side * 0.01); ctx.quadraticCurveTo(sp.x + sz * 0.1, yEdge + sp.side * sz * 0.35, sp.x + sz * 0.25, yEdge + sp.side * sz * 0.5);
  ctx.strokeStyle = '#3a2210'; ctx.lineWidth = lw * 1.5; ctx.lineCap = 'round'; ctx.stroke();
  ctx.strokeStyle = '#8a5a2c'; ctx.lineWidth = lw * 0.8; ctx.stroke();
  const la = sp.side < 0 ? -PI / 2 + 0.7 + sp.a : PI / 2 - 0.7 + sp.a;
  drawLeaf(ctx, sp.x + sz * 0.22, yEdge + sp.side * sz * 0.48, la, sz, sz * 0.5, lw * 0.8, '#74c43e', '#2a5410');
  ctx.restore();
}

// --- stone: smooth river pebbles / stacked stones
function pebbleDetail(w, h, seed, isCircle) {
  const R = rng(seed * 11 + 5);
  const area = isCircle ? PI * w * w : w * h;
  const n = clamp(Math.round(area * 18), 3, 26);
  const light = [], dark = [];
  const sz = clamp(Math.sqrt(area) / 0.8, 0.6, 1.4);
  for (let i = 0; i < n; i++) {
    let x, y;
    if (isCircle) { const a = R() * TAU, r = Math.sqrt(R()) * w * 0.75; x = Math.cos(a) * r; y = Math.sin(a) * r; }
    else { x = (R() - 0.5) * w * 0.8; y = (R() - 0.5) * h * 0.8; }
    (R() < 0.5 ? dark : light).push([x, y, (0.008 + R() * 0.014) * sz]);
  }
  // stacked-stone seams for long slabs
  const seams = [];
  if (!isCircle) {
    const L = Math.max(w, h), S = Math.min(w, h);
    const k = Math.round(L / (S * 1.7));
    for (let i = 1; i < k; i++) seams.push(-L / 2 + L * i / k + (R() - 0.5) * S * 0.25);
  }
  // moss specks
  const moss = [];
  if (R() < 0.65) {
    let mx, my;
    if (isCircle) { const a = -PI / 2 + (R() - 0.5) * 1.6; mx = Math.cos(a) * w * 0.82; my = Math.sin(a) * w * 0.82; }
    else { mx = (R() - 0.5) * w * 0.7; my = -h / 2 + Math.min(h * 0.12, 0.06); }
    const S = isCircle ? w : Math.min(w, h), ms = clamp(S * 0.12, 0.025, 0.07);
    for (let i = 0; i < 6; i++) moss.push([mx + (R() - 0.5) * ms * 3, my + (R() - 0.3) * ms * 1.2, ms * (0.5 + R() * 0.6)]);
  }
  let lump = null;
  if (isCircle) { lump = []; for (let i = 0; i < 9; i++) lump.push(0.96 + R() * 0.04); }
  return { light, dark, seams, moss, lump };
}
function drawMoss(ctx, moss) {
  if (!moss.length) return;
  ctx.beginPath(); dotsPath(ctx, moss);
  ctx.fillStyle = '#5e9a2e'; ctx.fill();
  ctx.beginPath(); dotsPath(ctx, moss.map(m => [m[0] - m[2] * 0.25, m[1] - m[2] * 0.3, m[2] * 0.55]));
  ctx.fillStyle = '#9fd05a'; ctx.fill();
}
function drawPebbleBox(ctx, w, h, b, lw) {
  const S = Math.min(w, h), L = Math.max(w, h);
  const cr = Math.min(S * 0.34, 0.2);
  ctx.beginPath(); roundRectPath(ctx, -w / 2, -h / 2, w, h, cr);
  ctx.fillStyle = cgrad(ctx, 'pebble' + w + 'x' + h, () => {
    const g = ctx.createLinearGradient(-w / 2, -h / 2, w * 0.25, h / 2);
    g.addColorStop(0, '#cfdbe6'); g.addColorStop(0.35, '#98abbb'); g.addColorStop(1, '#6a7e90');
    return g;
  });
  ctx.fill();
  const D = blockDetail('pb' + w + 'x' + h + 's' + b.seed, () => pebbleDetail(w, h, b.seed | 0, false));
  ctx.beginPath(); dotsPath(ctx, D.dark); ctx.fillStyle = 'rgba(60,76,92,0.35)'; ctx.fill();
  ctx.beginPath(); dotsPath(ctx, D.light); ctx.fillStyle = 'rgba(240,246,252,0.5)'; ctx.fill();
  // stacked-stone seams
  if (D.seams.length) {
    const vert = h > w;
    ctx.save(); if (vert) ctx.rotate(PI / 2);
    const hs = S / 2 - lw * 0.5;
    ctx.beginPath();
    for (const sx of D.seams) { ctx.moveTo(sx - S * 0.05, -hs); ctx.bezierCurveTo(sx + S * 0.08, -hs * 0.4, sx - S * 0.08, hs * 0.4, sx + S * 0.04, hs); }
    ctx.strokeStyle = 'rgba(40,52,64,0.6)'; ctx.lineWidth = lw * 0.9; ctx.stroke();
    ctx.save(); ctx.translate(lw * 0.8, 0);
    ctx.strokeStyle = 'rgba(240,248,255,0.5)'; ctx.lineWidth = lw * 0.5; ctx.stroke();
    ctx.restore();
    ctx.restore();
  }
  // soft rounded bevel: sheen top-left, shade bottom-right
  const bv = Math.min(S * 0.14, 0.07), br = Math.max(cr - bv / 2, 0.001);
  ctx.lineWidth = bv; ctx.lineCap = 'round';
  ctx.beginPath(); bevelTL(ctx, w, h, bv / 2, br); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.stroke();
  ctx.beginPath(); bevelBR(ctx, w, h, bv / 2, br); ctx.strokeStyle = 'rgba(30,44,60,0.22)'; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(-w * 0.22, -h * 0.2, Math.min(w * 0.2, 0.3), Math.min(h * 0.08, 0.05), -0.1, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fill();
  drawMoss(ctx, D.moss);
  return cr;
}

// --- mini nuts (no faces) for crates, trees and piles; unit shapes scaled by s
function miniGrad(ctx, key, hi, base, lo) {
  return cgrad(ctx, 'mini' + key, () => {
    const g = ctx.createRadialGradient(-0.35, -0.4, 0.05, 0, 0, 1.3);
    g.addColorStop(0, hi); g.addColorStop(0.45, base); g.addColorStop(1, lo);
    return g;
  });
}
function drawMiniNut(ctx, type, x, y, s, rot, lw) {
  ctx.save();
  ctx.translate(x, y); if (rot) ctx.rotate(rot); ctx.scale(s, s);
  const l = lw / s;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (type === 'acorn') {
    const P = NP.acorn;
    ctx.beginPath(); ctx.moveTo(0.02, -0.8); ctx.quadraticCurveTo(0.04, -1.12, 0.22, -1.24);
    ctx.lineWidth = 0.16; ctx.strokeStyle = P.capLine; ctx.stroke();
    ctx.lineWidth = 0.1; ctx.strokeStyle = P.stem; ctx.stroke();
    ctx.beginPath(); acornBodyPath(ctx);
    ctx.fillStyle = miniGrad(ctx, 'acorn', P.hi, P.body, P.lo); ctx.fill();
    ctx.lineWidth = l; ctx.strokeStyle = P.line; ctx.stroke();
    ctx.beginPath(); acornCapPath(ctx);
    ctx.fillStyle = miniGrad(ctx, 'acap', P.capHi, P.cap, P.capLo); ctx.fill();
    ctx.lineWidth = l; ctx.strokeStyle = P.capLine; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-0.7, -0.5); ctx.lineTo(-0.25, -0.95); ctx.moveTo(-0.2, -0.28); ctx.lineTo(0.45, -0.95); ctx.moveTo(0.4, -0.3); ctx.lineTo(0.85, -0.7);
    ctx.moveTo(-0.75, -0.62); ctx.lineTo(-0.3, -0.24); ctx.moveTo(-0.25, -0.98); ctx.lineTo(0.45, -0.3); ctx.moveTo(0.35, -0.98); ctx.lineTo(0.9, -0.5);
    ctx.strokeStyle = rgba(P.capLine, 0.45); ctx.lineWidth = l * 0.6; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(-0.36, 0.1, 0.16, 0.26, 0.3, 0, TAU); ctx.fillStyle = 'rgba(255,240,215,0.5)'; ctx.fill();
  } else if (type === 'walnut') {
    const P = NP.walnut;
    ctx.beginPath(); walnutPath(ctx);
    ctx.fillStyle = miniGrad(ctx, 'walnut', P.hi, P.body, P.lo); ctx.fill();
    ctx.lineWidth = l; ctx.strokeStyle = P.line; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-0.05, -0.95); ctx.bezierCurveTo(-0.3, -0.4, -0.3, 0.4, -0.05, 0.95);
    ctx.moveTo(0.3, -0.5); ctx.quadraticCurveTo(0.5, -0.2, 0.3, 0.1); ctx.moveTo(-0.6, -0.3); ctx.quadraticCurveTo(-0.45, 0.1, -0.65, 0.4);
    ctx.moveTo(0.35, 0.35); ctx.quadraticCurveTo(0.6, 0.45, 0.5, 0.7);
    ctx.strokeStyle = rgba(P.line, 0.6); ctx.lineWidth = l * 0.8; ctx.stroke();
  } else if (type === 'pinenut') {
    const P = NP.pinenut;
    ctx.beginPath(); pinenutPath(ctx);
    ctx.fillStyle = miniGrad(ctx, 'pinenut', P.hi, P.body, P.lo); ctx.fill();
    ctx.lineWidth = l; ctx.strokeStyle = P.line; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(1.28, 0.02); ctx.bezierCurveTo(1.05, -0.24, 0.9, -0.36, 0.78, -0.4); ctx.lineTo(0.78, 0.42); ctx.bezierCurveTo(0.9, 0.36, 1.05, 0.26, 1.28, 0.02);
    ctx.fillStyle = rgba(P.tip, 0.8); ctx.fill();
  } else if (type === 'pinecone') {
    ctx.beginPath(); ctx.moveTo(0, -0.95); ctx.lineTo(0.05, -1.25);
    ctx.lineWidth = 0.14; ctx.strokeStyle = '#4a2a10'; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 0, 0.62, 1.0, 0, 0, TAU);
    ctx.fillStyle = miniGrad(ctx, 'pinecone', '#e0a468', '#9a5a2a', '#50280e'); ctx.fill();
    ctx.lineWidth = l; ctx.strokeStyle = '#2e1606'; ctx.stroke();
    ctx.beginPath();
    for (let row = 0; row < 5; row++) {
      const yy = -0.7 + row * 0.36, hw = 0.6 * Math.sqrt(Math.max(0.05, 1 - yy * yy)), n = row === 0 || row === 4 ? 2 : 3;
      for (let i = 0; i < n; i++) {
        const x0 = -hw + (2 * hw) * i / n, x1 = -hw + (2 * hw) * (i + 1) / n;
        ctx.moveTo(x0, yy); ctx.quadraticCurveTo((x0 + x1) / 2, yy + 0.3, x1, yy);
      }
    }
    ctx.strokeStyle = 'rgba(40,18,4,0.7)'; ctx.lineWidth = l * 0.8; ctx.stroke();
  } else if (type === 'burr') {
    const P = NP.burr;
    ctx.beginPath();
    for (let i = 0; i < 22; i++) { const a = i * TAU / 22 + (i & 1) * 0.1, len = (i & 1) ? 1.0 : 1.12; ctx.moveTo(Math.cos(a) * 0.5, Math.sin(a) * 0.5); ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len); }
    ctx.lineWidth = 0.12; ctx.strokeStyle = mix(P.lo, P.line, 0.4); ctx.stroke();
    ctx.lineWidth = 0.07; ctx.strokeStyle = P.spike; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 0.74, 0, TAU);
    ctx.fillStyle = miniGrad(ctx, 'burr', P.hi, P.body, P.lo); ctx.fill();
    ctx.lineWidth = l; ctx.strokeStyle = mix(P.lo, P.line, 0.5); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0.1, 0.22, 0.34, 0.26, 0, 0, TAU); ctx.fillStyle = NP.chestnut.body; ctx.fill();
    ctx.strokeStyle = NP.chestnut.line; ctx.lineWidth = l * 0.8; ctx.stroke();
  } else { // peanut
    const P = NP.peanut;
    ctx.beginPath(); peanutPath(ctx);
    ctx.fillStyle = miniGrad(ctx, 'peanut', P.hi, P.body, P.lo); ctx.fill();
    ctx.lineWidth = l; ctx.strokeStyle = P.line; ctx.stroke();
  }
  ctx.restore();
}

// --- leaf helpers
function leafShapeAt(ctx, cx, cy, hl, hw, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const X = (u, v) => cx + u * c - v * s, Y = (u, v) => cy + u * s + v * c;
  ctx.moveTo(X(-hl, 0), Y(-hl, 0));
  ctx.bezierCurveTo(X(-hl * 0.5, -hw * 1.3), Y(-hl * 0.5, -hw * 1.3), X(hl * 0.45, -hw * 1.3), Y(hl * 0.45, -hw * 1.3), X(hl, 0), Y(hl, 0));
  ctx.bezierCurveTo(X(hl * 0.45, hw * 1.3), Y(hl * 0.45, hw * 1.3), X(-hl * 0.5, hw * 1.3), Y(-hl * 0.5, hw * 1.3), X(-hl, 0), Y(-hl, 0));
  ctx.closePath();
}
function leafVeinsAt(ctx, cx, cy, hl, hw, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const X = (u, v) => cx + u * c - v * s, Y = (u, v) => cy + u * s + v * c;
  ctx.moveTo(X(-hl * 0.92, 0), Y(-hl * 0.92, 0)); ctx.lineTo(X(hl * 0.85, 0), Y(hl * 0.85, 0));
  for (const u of [-0.42, 0.08]) {
    ctx.moveTo(X(u * hl, 0), Y(u * hl, 0)); ctx.lineTo(X((u + 0.28) * hl, -hw * 0.62), Y((u + 0.28) * hl, -hw * 0.62));
    ctx.moveTo(X(u * hl, 0), Y(u * hl, 0)); ctx.lineTo(X((u + 0.28) * hl, hw * 0.62), Y((u + 0.28) * hl, hw * 0.62));
  }
}
const LEAF_PAL = {
  green: { back: '#3f8a26', a: ['#4f9e32', '#7cc446'], hi: '#b4e67a', line: '#1e4a10', vein: 'rgba(225,255,190,0.75)', base: '#2e6a1a' },
  autumn: { back: '#b8561c', a: ['#e07a26', '#f2a83a'], hi: '#ffd890', line: '#5a2408', vein: 'rgba(255,238,196,0.75)', base: '#8e3a12' },
};

// --- leaf bundle (fragile)
function leafDetail(L, S, seed, isCircle) {
  const R = rng(seed * 19 + 2);
  const autumn = ((seed % 3) + 3) % 3 === 1;
  const back = [], front = [];
  if (isCircle) {
    const r = L, n = 5, a0 = R() * TAU;
    for (let i = 0; i < n; i++) { const a = a0 + i * TAU / n; back.push([Math.cos(a) * r * 0.4, Math.sin(a) * r * 0.4, r * 0.56, r * 0.36, a + (R() - 0.5) * 0.2]); }
    for (let i = 0; i < 3; i++) { const a = a0 + (i + 0.5) * TAU / 3; front.push([Math.cos(a) * r * 0.24, Math.sin(a) * r * 0.24, r * 0.46, r * 0.28, a + (R() - 0.5) * 0.3]); }
    return { autumn, back, front, ties: [] };
  }
  if (L < S * 1.7) {
    // square-ish: pinwheel of leaves pointing at the corners + a crossed pair on top
    const hx = L / 2, hy = S / 2, d = Math.hypot(hx, hy);
    for (const [sx, sy] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
      const a = Math.atan2(sy * hy, sx * hx) + (R() - 0.5) * 0.12;
      back.push([sx * hx * 0.42, sy * hy * 0.42, d * 0.56, Math.min(hx, hy) * 0.5, a]);
    }
    front.push([0, 0, hx * 0.8, hy * 0.36, (R() - 0.5) * 0.3], [0, 0, hy * 0.8, hx * 0.3, PI / 2 + (R() - 0.5) * 0.3]);
    return { autumn, back, front, ties: [0] };
  }
  const n = Math.max(2, Math.round(L / (S * 1.3)));
  for (let i = 0; i < n; i++) {
    const cx = -L / 2 + L * (i + 0.5) / n;
    const hl = Math.min(L / (2 * n) * 1.3, L / 2 * 1.03 - Math.abs(cx));
    back.push([cx, (R() - 0.5) * S * 0.04, hl, S * 0.5, ((i & 1) ? PI : 0) + (R() - 0.5) * 0.08]);
  }
  const nf = n === 2 ? 1 : n - 1;
  for (let i = 0; i < nf; i++) {
    const cx = n === 2 ? 0 : -L / 2 + L * (i + 1) / n;
    const hl = Math.min(L / (2 * n) * 1.05, L / 2 * 0.95 - Math.abs(cx));
    front.push([cx, (R() - 0.5) * S * 0.06, hl, S * 0.38, ((i & 1) ? 0 : PI) + (R() - 0.5) * 0.18]);
  }
  const ties = L > S * 3.2 ? [-L * 0.26, L * 0.26] : [0];
  return { autumn, back, front, ties };
}
function leafGroup(ctx, list, grad, line, lw) {
  ctx.beginPath();
  for (const f of list) leafShapeAt(ctx, f[0], f[1], f[2], f[3], f[4]);
  ctx.fillStyle = grad; ctx.fill();
  ctx.lineWidth = lw * 0.8; ctx.strokeStyle = line; ctx.stroke();
}
function drawLeafBundle(ctx, w, h, b, lw, isCircle, hp, flash) {
  const S = isCircle ? w * 2 : Math.min(w, h), L = isCircle ? w * 2 : Math.max(w, h);
  const D = blockDetail('lf' + (isCircle ? 'c' + w : L + 'x' + S) + 's' + b.seed, () => leafDetail(isCircle ? w : L, S, b.seed | 0, isCircle));
  const LP = D.autumn ? LEAF_PAL.autumn : LEAF_PAL.green;
  const cr = isCircle ? 0 : Math.min(S * 0.45, 0.25);
  const outline = () => { ctx.beginPath(); if (isCircle) ctx.arc(0, 0, w * 0.95, 0, TAU); else roundRectPath(ctx, -w / 2, -h / 2, w, h, cr); };
  if (isCircle) {
    outline();
    ctx.fillStyle = LP.back; ctx.fill();
    ctx.lineWidth = lw; ctx.strokeStyle = LP.line; ctx.stroke();
  }
  ctx.save();
  if (!isCircle && h > w) ctx.rotate(PI / 2);
  const gk = 'lfg' + (D.autumn ? 'a' : 'g') + S;
  const gB = cgrad(ctx, gk + 'b', () => { const g = ctx.createLinearGradient(0, -S / 2, 0, S / 2); g.addColorStop(0, LP.a[0]); g.addColorStop(1, LP.back); return g; });
  const gF = cgrad(ctx, gk + 'f', () => { const g = ctx.createLinearGradient(0, -S / 2, 0, S / 2); g.addColorStop(0, LP.hi); g.addColorStop(0.45, LP.a[1]); g.addColorStop(1, LP.a[0]); return g; });
  leafGroup(ctx, D.back, gB, LP.line, lw);
  leafGroup(ctx, D.front, gF, LP.line, lw);
  ctx.beginPath();
  for (const f of D.back) leafVeinsAt(ctx, f[0], f[1], f[2], f[3], f[4]);
  for (const f of D.front) leafVeinsAt(ctx, f[0], f[1], f[2], f[3], f[4]);
  ctx.strokeStyle = LP.vein; ctx.lineWidth = clamp(S * 0.02, 0.008, 0.018); ctx.lineCap = 'round'; ctx.stroke();
  // grass-twine ties with a little knot
  const tw = clamp(S * (isCircle ? 0.05 : 0.07), 0.022, 0.045);
  ctx.beginPath();
  if (isCircle) {
    ctx.moveTo(-w * 0.2, -w * 0.9); ctx.quadraticCurveTo(w * 0.22, 0, -w * 0.2, w * 0.9);
  } else {
    for (const tx of D.ties) { ctx.moveTo(tx - S * 0.05, -S / 2 + 0.01); ctx.quadraticCurveTo(tx + S * 0.08, 0, tx - S * 0.03, S / 2 - 0.01); }
  }
  ctx.strokeStyle = '#4a5a14'; ctx.lineWidth = tw + lw * 1.4; ctx.stroke();
  ctx.strokeStyle = '#c6cf62'; ctx.lineWidth = tw; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,210,0.6)'; ctx.lineWidth = tw * 0.3; ctx.stroke();
  const kx = isCircle ? -w * 0.2 : D.ties[0] - S * 0.05, ky = isCircle ? -w * 0.86 : -S / 2 + 0.01;
  ctx.beginPath(); ctx.ellipse(kx - tw * 1.2, ky - tw * 0.6, tw * 1.3, tw * 0.8, -0.4, 0, TAU); ctx.ellipse(kx + tw * 1.2, ky - tw * 0.6, tw * 1.3, tw * 0.8, 0.4, 0, TAU);
  ctx.strokeStyle = '#4a5a14'; ctx.lineWidth = tw * 0.9 + lw; ctx.stroke();
  ctx.strokeStyle = '#c6cf62'; ctx.lineWidth = tw * 0.9; ctx.stroke();
  ctx.restore();
  if (hp < 0.7) {
    const lvl = hp < 0.35 ? 2 : 1, cw = clamp(S * 0.04, 0.014, 0.04);
    const C = blockDetail('lfc' + w + 'x' + h + 's' + b.seed + 'l' + lvl, () => genCracks(rng((b.seed | 0) * 31 + 7), isCircle ? w * 0.85 : w, isCircle ? w : h, isCircle, lvl, Math.max(cw * 1.3, cr * 0.4)));
    drawCracks(ctx, C, cw, MAT.leaf);
  }
  if (flash > 0) {
    ctx.save();
    if (!isCircle && h > w) ctx.rotate(PI / 2);
    ctx.beginPath();
    if (isCircle) ctx.arc(0, 0, w * 0.95, 0, TAU);
    for (const f of D.back) leafShapeAt(ctx, f[0], f[1], f[2], f[3], f[4]);
    ctx.fillStyle = 'rgba(255,255,255,' + (flash * 0.6).toFixed(3) + ')'; ctx.fill();
    ctx.restore();
  }
}

// --- nut crate (bonus pickup): woven twig basket brimming with nuts and a red bow
function drawNutCrate(ctx, w, h, b, lw, hp, flash) {
  const yr = -h / 2 + h * 0.36;                 // basket rim
  const tw = w, bw = w * 0.82, rim = Math.max(h * 0.09, 0.03);
  const basket = () => {
    ctx.moveTo(-tw / 2, yr);
    ctx.lineTo(tw / 2, yr);
    ctx.lineTo(bw / 2, h / 2 - h * 0.08);
    ctx.quadraticCurveTo(bw / 2, h / 2, bw / 2 - h * 0.08, h / 2);
    ctx.lineTo(-bw / 2 + h * 0.08, h / 2);
    ctx.quadraticCurveTo(-bw / 2, h / 2, -bw / 2, h / 2 - h * 0.08);
    ctx.closePath();
  };
  // sparkles behind (reward glow)
  ctx.fillStyle = cgrad(ctx, 'crateglow' + w + 'x' + h, () => {
    const g = ctx.createRadialGradient(0, yr - h * 0.1, 0, 0, yr - h * 0.1, Math.max(w, h) * 0.75);
    g.addColorStop(0, 'rgba(255,240,150,0.55)'); g.addColorStop(1, 'rgba(255,220,100,0)');
    return g;
  });
  ctx.beginPath(); ctx.arc(0, yr - h * 0.1, Math.max(w, h) * 0.75, 0, TAU); ctx.fill();
  // nut heap
  const s = Math.min(h * 0.24, w * 0.19);
  drawMiniNut(ctx, 'pinenut', w * 0.17, yr - h * 0.3, s * 0.62, -1.1, lw * 0.8);
  drawMiniNut(ctx, 'walnut', -w * 0.05, yr - h * 0.17, s * 1.0, 0.2, lw * 0.8);
  drawMiniNut(ctx, 'acorn', -w * 0.3, yr - h * 0.08, s * 0.85, -0.4, lw * 0.8);
  drawMiniNut(ctx, 'acorn', w * 0.29, yr - h * 0.08, s * 0.85, 0.45, lw * 0.8);
  drawMiniNut(ctx, 'peanut', w * 0.06, yr - h * 0.01, s * 0.66, -0.15, lw * 0.8);
  // basket body with weave
  ctx.beginPath(); basket();
  ctx.fillStyle = '#5a3616'; ctx.fill();
  ctx.save(); ctx.clip();
  const rows = Math.max(3, Math.round((h / 2 - yr) / Math.max(h * 0.12, 0.05)));
  const rh = (h / 2 - yr) / rows, cols = Math.max(4, Math.round(w / Math.max(rh * 1.6, 0.06)));
  const cw = w / cols;
  // woven bands (one path), then the brick-offset ribs and highlights (one stroke each)
  ctx.beginPath();
  for (let r = 0; r < rows; r++) ctx.rect(-w / 2, yr + r * rh + rh * 0.08, w, rh * 0.84);
  ctx.fillStyle = cgrad(ctx, 'wicker' + w + 'x' + h, () => {
    const g = ctx.createLinearGradient(-w / 2, yr, w * 0.3, h / 2);
    g.addColorStop(0, '#f2c888'); g.addColorStop(0.5, '#cf9552'); g.addColorStop(1, '#8e5a26');
    return g;
  });
  ctx.fill();
  ctx.beginPath();
  for (let r = 0; r < rows; r++) {
    const y0 = yr + r * rh + rh * 0.12, y1 = yr + (r + 1) * rh - rh * 0.12, off = (r & 1) ? cw / 2 : 0;
    for (let c = 0; c <= cols; c++) { const xx = -w / 2 + c * cw + off; ctx.moveTo(xx, y0); ctx.quadraticCurveTo(xx + cw * 0.1, (y0 + y1) / 2, xx, y1); }
  }
  ctx.lineWidth = Math.max(lw * 0.9, cw * 0.12); ctx.strokeStyle = 'rgba(80,42,12,0.75)'; ctx.stroke();
  ctx.beginPath();
  for (let r = 0; r < rows; r++) { const yy = yr + r * rh + rh * 0.3; ctx.moveTo(-w / 2, yy); ctx.lineTo(w / 2, yy); }
  ctx.lineWidth = rh * 0.14; ctx.strokeStyle = 'rgba(255,232,190,0.4)'; ctx.stroke();
  ctx.restore();
  ctx.beginPath(); basket();
  ctx.lineWidth = lw; ctx.strokeStyle = '#3e220a'; ctx.stroke();
  // twisted rim
  ctx.beginPath(); roundRectPath(ctx, -tw / 2 - rim * 0.3, yr - rim * 0.6, tw + rim * 0.6, rim * 1.2, rim * 0.6);
  ctx.fillStyle = '#b07838'; ctx.fill(); ctx.lineWidth = lw * 0.9; ctx.strokeStyle = '#3e220a'; ctx.stroke();
  ctx.beginPath();
  for (let xx = -tw / 2 + rim * 0.4; xx < tw / 2; xx += rim * 0.9) { ctx.moveTo(xx, yr + rim * 0.5); ctx.lineTo(xx + rim * 0.5, yr - rim * 0.5); }
  ctx.strokeStyle = 'rgba(255,225,170,0.6)'; ctx.lineWidth = lw * 0.6; ctx.stroke();
  // red ribbon + bow
  const rw = w * 0.13;
  ctx.beginPath(); ctx.rect(-rw / 2, yr, rw, h / 2 - yr - lw * 0.3);
  ctx.fillStyle = '#e02a36'; ctx.fill(); ctx.lineWidth = lw * 0.7; ctx.strokeStyle = '#5a0610'; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-rw * 0.2, yr + 0.01); ctx.lineTo(-rw * 0.2, h / 2 - 0.02);
  ctx.strokeStyle = 'rgba(255,160,160,0.7)'; ctx.lineWidth = rw * 0.18; ctx.stroke();
  const bs = Math.min(w, h) * 0.2;
  ctx.save(); ctx.translate(0, yr + rim * 0.1);
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.bezierCurveTo(-bs * 0.5, -bs * 0.9, -bs * 1.35, -bs * 0.5, -bs * 1.1, bs * 0.1); ctx.bezierCurveTo(-bs * 0.9, bs * 0.45, -bs * 0.35, bs * 0.25, 0, 0);
  ctx.moveTo(0, 0); ctx.bezierCurveTo(bs * 0.5, -bs * 0.9, bs * 1.35, -bs * 0.5, bs * 1.1, bs * 0.1); ctx.bezierCurveTo(bs * 0.9, bs * 0.45, bs * 0.35, bs * 0.25, 0, 0);
  ctx.moveTo(-bs * 0.1, bs * 0.1); ctx.lineTo(-bs * 0.55, bs * 0.95); ctx.lineTo(-bs * 0.3, bs * 0.8); ctx.lineTo(-bs * 0.2, bs * 1.0); ctx.lineTo(0, bs * 0.15);
  ctx.moveTo(bs * 0.1, bs * 0.1); ctx.lineTo(bs * 0.5, bs * 0.98); ctx.lineTo(bs * 0.28, bs * 0.82); ctx.lineTo(bs * 0.18, bs * 1.0); ctx.lineTo(0, bs * 0.15);
  ctx.fillStyle = '#ea3440'; ctx.fill(); ctx.lineWidth = lw * 0.8; ctx.strokeStyle = '#5a0610'; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0, bs * 0.02, bs * 0.24, bs * 0.2, 0, 0, TAU); ctx.fillStyle = '#c41a28'; ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-bs * 0.85, -bs * 0.25); ctx.quadraticCurveTo(-bs * 0.6, -bs * 0.55, -bs * 0.3, -bs * 0.4);
  ctx.moveTo(bs * 0.85, -bs * 0.25); ctx.quadraticCurveTo(bs * 0.6, -bs * 0.55, bs * 0.3, -bs * 0.4);
  ctx.strokeStyle = 'rgba(255,200,200,0.8)'; ctx.lineWidth = bs * 0.1; ctx.lineCap = 'round'; ctx.stroke();
  ctx.restore();
  // twinkles
  ctx.beginPath();
  starPath(ctx, -w * 0.4, yr - h * 0.28, h * 0.08, h * 0.02, 4, 0);
  starPath(ctx, w * 0.38, yr - h * 0.32, h * 0.06, h * 0.015, 4, 0.3);
  ctx.fillStyle = '#fffbd0'; ctx.fill();
  if (hp < 0.7) {
    const lvl = hp < 0.35 ? 2 : 1, cw = clamp(h * 0.035, 0.012, 0.035);
    const C = blockDetail('crc' + w + 'x' + h + 's' + b.seed + 'l' + lvl, () => genCracks(rng((b.seed | 0) * 31 + 7), bw, (h / 2 - yr), false, lvl, cw * 1.3));
    ctx.save(); ctx.translate(0, (yr + h / 2) / 2);
    drawCracks(ctx, C, cw, MAT.crate);
    ctx.restore();
  }
  if (flash > 0) {
    ctx.beginPath(); basket(); ctx.ellipse(0, yr - h * 0.06, w * 0.42, h * 0.22, 0, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,' + (flash * 0.6).toFixed(3) + ')'; ctx.fill();
  }
}

// --- heavy log
function logDetail(L, S, seed) {
  const R = rng(seed * 29 + 11);
  const grooves = [];
  const n = clamp(Math.round(S / 0.06), 5, 12);
  for (let i = 0; i < n; i++) {
    const yy = -S / 2 + S * (i + 0.3 + R() * 0.4) / n;
    const xs = -L / 2 + S * 0.25 + L * R() * 0.25, xe = L / 2 - S * 0.25 - L * R() * 0.2;
    grooves.push([xs, yy, xe, S * (0.02 + R() * 0.03), R() * TAU]);
  }
  const knot = [(R() - 0.5) * L * 0.5, (R() - 0.5) * S * 0.3, Math.min(S * 0.14, 0.08)];
  const deco = R() < 0.5 ? 'moss' : 'shroom';
  const dx = (R() - 0.5) * L * 0.5;
  const moss = [];
  for (let i = 0; i < 7; i++) moss.push([dx + (R() - 0.5) * S * 0.5, -S / 2 + R() * S * 0.08, S * (0.04 + R() * 0.04)]);
  return { grooves, knot, deco, dx, moss };
}
function logBodyPath(ctx, L, S, ex) {
  ctx.moveTo(-L / 2 + ex, -S / 2);
  ctx.lineTo(L / 2 - ex, -S / 2);
  ctx.ellipse(L / 2 - ex, 0, ex, S / 2, 0, -PI / 2, PI / 2);
  ctx.lineTo(-L / 2 + ex, S / 2);
  ctx.ellipse(-L / 2 + ex, 0, ex, S / 2, 0, PI / 2, PI * 1.5);
  ctx.closePath();
}
function endGrain(ctx, cx, cy, rx, ry, lw, key) {
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
  ctx.fillStyle = cgrad(ctx, key, () => {
    const g = ctx.createRadialGradient(cx - rx * 0.3, cy - ry * 0.3, 0, cx, cy, ry);
    g.addColorStop(0, '#fbdca4'); g.addColorStop(0.65, '#e8b272'); g.addColorStop(1, '#c48646');
    return g;
  });
  ctx.fill();
  ctx.lineWidth = lw * 0.8; ctx.strokeStyle = '#4a2a10'; ctx.stroke();
  ctx.beginPath();
  for (const k of [0.3, 0.55, 0.8]) { ctx.moveTo(cx + rx * k, cy); ctx.ellipse(cx, cy, rx * k, ry * k, 0, 0, TAU); }
  ctx.moveTo(cx, cy - ry * 0.1); ctx.lineTo(cx + rx * 0.2, cy - ry * 0.75);
  ctx.strokeStyle = 'rgba(150,86,36,0.6)'; ctx.lineWidth = lw * 0.5; ctx.stroke();
}
function drawHeavyLog(ctx, w, h, b, lw, hp, flash) {
  const S = Math.min(w, h), L = Math.max(w, h);
  const vert = h > w;
  if (vert) ctx.rotate(PI / 2);
  const ex = S * 0.2;
  const D = blockDetail('lg' + L + 'x' + S + 's' + b.seed, () => logDetail(L, S, b.seed | 0));
  ctx.beginPath(); logBodyPath(ctx, L, S, ex);
  ctx.fillStyle = cgrad(ctx, 'logbody' + S, () => {
    const g = ctx.createLinearGradient(0, -S / 2, 0, S / 2);
    g.addColorStop(0, '#6e4424'); g.addColorStop(0.2, '#b8834e'); g.addColorStop(0.5, '#8c5a30'); g.addColorStop(0.85, '#5e3a1c'); g.addColorStop(1, '#442812');
    return g;
  });
  ctx.fill();
  // bark grooves
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const g of D.grooves) {
    const xs = g[0], yy = g[1], xe = g[2], amp = g[3], ph = g[4];
    const n = Math.max(2, Math.round((xe - xs) / 0.25));
    ctx.moveTo(xs, yy);
    for (let i = 1; i <= n; i++) ctx.quadraticCurveTo(xs + (xe - xs) * (i - 0.5) / n, yy + Math.sin(ph + i * 2.3) * amp, xs + (xe - xs) * i / n, yy);
  }
  ctx.strokeStyle = 'rgba(40,20,6,0.6)'; ctx.lineWidth = clamp(S * 0.035, 0.012, 0.03); ctx.stroke();
  ctx.save(); ctx.translate(0, clamp(S * 0.025, 0.008, 0.02));
  ctx.strokeStyle = 'rgba(255,215,160,0.28)'; ctx.lineWidth = clamp(S * 0.018, 0.006, 0.016); ctx.stroke();
  ctx.restore();
  const k = D.knot;
  ctx.beginPath(); ctx.ellipse(k[0], k[1], k[2] * 1.6, k[2], 0, 0, TAU);
  ctx.fillStyle = '#6a4020'; ctx.fill(); ctx.lineWidth = lw * 0.7; ctx.strokeStyle = 'rgba(40,20,6,0.8)'; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(k[0], k[1], k[2] * 0.7, k[2] * 0.42, 0, 0, TAU); ctx.fillStyle = '#c99660'; ctx.fill();
  ctx.beginPath(); logBodyPath(ctx, L, S, ex);
  ctx.lineWidth = lw; ctx.strokeStyle = '#2e1808'; ctx.stroke();
  // end-grain faces at both ends
  endGrain(ctx, -L / 2 + ex, 0, ex * 0.95, S / 2 * 0.94, lw, 'lgend' + S + 'a');
  endGrain(ctx, L / 2 - ex, 0, ex * 0.95, S / 2 * 0.94, lw, 'lgend' + S + 'b');
  // moss or a tiny mushroom pair on top
  if (D.deco === 'moss') {
    ctx.beginPath(); dotsPath(ctx, D.moss); ctx.fillStyle = '#5e9a2e'; ctx.fill();
    ctx.beginPath(); dotsPath(ctx, D.moss.map(m => [m[0] - m[2] * 0.25, m[1] - m[2] * 0.3, m[2] * 0.5])); ctx.fillStyle = '#a4d45e'; ctx.fill();
  } else {
    const ms = clamp(S * 0.22, 0.06, 0.13);
    for (const [ox, sc] of [[0, 1], [ms * 1.1, 0.7]]) {
      const mx = D.dx + ox, my = -S / 2 + 0.01, m = ms * sc;
      ctx.beginPath(); ctx.rect(mx - m * 0.18, my - m * 0.75, m * 0.36, m * 0.75);
      ctx.fillStyle = '#f4e6cc'; ctx.fill(); ctx.lineWidth = lw * 0.6; ctx.strokeStyle = '#5a3e22'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mx - m * 0.6, my - m * 0.7); ctx.quadraticCurveTo(mx, my - m * 1.55, mx + m * 0.6, my - m * 0.7); ctx.closePath();
      ctx.fillStyle = '#e03a2e'; ctx.fill(); ctx.strokeStyle = '#4a0a08'; ctx.stroke();
      ctx.beginPath(); ctx.arc(mx - m * 0.18, my - m * 0.98, m * 0.1, 0, TAU); ctx.arc(mx + m * 0.2, my - m * 0.9, m * 0.07, 0, TAU);
      ctx.fillStyle = '#fff6ec'; ctx.fill();
    }
  }
  if (hp < 0.7) {
    const lvl = hp < 0.35 ? 2 : 1, cw = clamp(S * 0.045, 0.014, 0.045);
    const C = blockDetail('lgc' + L + 'x' + S + 's' + b.seed + 'l' + lvl, () => genCracks(rng((b.seed | 0) * 31 + 7), L - ex * 2.4, S, false, lvl, cw * 1.3));
    drawCracks(ctx, C, cw, MAT.log);
  }
  if (flash > 0) { ctx.beginPath(); logBodyPath(ctx, L, S, ex); ctx.fillStyle = 'rgba(255,255,255,' + (flash * 0.65).toFixed(3) + ')'; ctx.fill(); }
  if (vert) ctx.rotate(-PI / 2);
}
function drawLogSlice(ctx, r, b, lw, hp, flash) {
  const D = blockDetail('lsl' + r + 's' + b.seed, () => {
    const R = rng((b.seed | 0) * 5 + 17);
    const ticks = [];
    for (let i = 0; i < 26; i++) ticks.push(i * TAU / 26 + R() * 0.15);
    const fr = r * 0.8, rings = [];
    const nr = clamp(Math.round(r / 0.06), 4, 10), ox = (R() - 0.5) * fr * 0.18, oy = (R() - 0.5) * fr * 0.18;
    for (let i = 1; i <= nr; i++) {
      const rr = fr * i / (nr + 1), pts = [];
      for (let j = 0; j <= 16; j++) { const a = j * TAU / 16, wob = 1 + Math.sin(a * 3 + i * 1.7 + (b.seed | 0)) * 0.04; pts.push([ox * (1 - i / (nr + 1)) + Math.cos(a) * rr * wob, oy * (1 - i / (nr + 1)) + Math.sin(a) * rr * wob]); }
      rings.push(pts);
    }
    const checks = [R() * TAU, R() * TAU];
    const ma = -PI / 2 + (R() - 0.5) * 1.2, moss = [];
    for (let i = 0; i < 6; i++) moss.push([Math.cos(ma) * r * 0.92 + (R() - 0.5) * r * 0.2, Math.sin(ma) * r * 0.92 + (R() - 0.5) * r * 0.12, r * (0.05 + R() * 0.05)]);
    return { ticks, rings, ox, oy, checks, moss };
  });
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
  ctx.fillStyle = '#5e3a1e'; ctx.fill();
  ctx.beginPath();
  for (const a of D.ticks) { ctx.moveTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8); ctx.lineTo(Math.cos(a + 0.05) * r * 0.97, Math.sin(a + 0.05) * r * 0.97); }
  ctx.strokeStyle = 'rgba(30,14,4,0.65)'; ctx.lineWidth = r * 0.05; ctx.stroke();
  const fr = r * 0.8;
  ctx.beginPath(); ctx.arc(0, 0, fr, 0, TAU);
  ctx.fillStyle = cgrad(ctx, 'logslice' + r, () => {
    const g = ctx.createRadialGradient(-fr * 0.3, -fr * 0.3, fr * 0.05, 0, 0, fr);
    g.addColorStop(0, '#fde2ae'); g.addColorStop(0.6, '#ecb878'); g.addColorStop(1, '#c78848');
    return g;
  });
  ctx.fill();
  ctx.lineWidth = lw * 0.8; ctx.strokeStyle = 'rgba(80,40,12,0.9)'; ctx.stroke();
  ctx.beginPath(); polyPaths(ctx, D.rings, 0, 0);
  ctx.strokeStyle = 'rgba(150,86,36,0.55)'; ctx.lineWidth = clamp(r * 0.022, 0.007, 0.02); ctx.stroke();
  ctx.beginPath(); ctx.arc(D.ox, D.oy, fr * 0.05, 0, TAU); ctx.fillStyle = 'rgba(120,60,20,0.8)'; ctx.fill();
  ctx.beginPath();
  for (const a of D.checks) { ctx.moveTo(D.ox + Math.cos(a) * fr * 0.1, D.oy + Math.sin(a) * fr * 0.1); ctx.lineTo(Math.cos(a + 0.05) * fr * 0.55, Math.sin(a + 0.05) * fr * 0.55); ctx.lineTo(Math.cos(a) * fr * 0.96, Math.sin(a) * fr * 0.96); }
  ctx.strokeStyle = 'rgba(90,45,15,0.75)'; ctx.lineWidth = clamp(r * 0.03, 0.008, 0.025); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, fr * 0.9, PI * 1.05, PI * 1.45);
  ctx.strokeStyle = 'rgba(255,245,220,0.5)'; ctx.lineWidth = fr * 0.05; ctx.lineCap = 'round'; ctx.stroke();
  drawMoss(ctx, D.moss);
  if (hp < 0.7) {
    const lvl = hp < 0.35 ? 2 : 1, cw = clamp(r * 0.08, 0.014, 0.045);
    const C = blockDetail('lsc' + r + 's' + b.seed + 'l' + lvl, () => genCracks(rng((b.seed | 0) * 31 + 7), r, r, true, lvl, cw * 1.3));
    drawCracks(ctx, C, cw, MAT.log);
  }
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
  if (flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (flash * 0.65).toFixed(3) + ')'; ctx.fill(); }
  ctx.lineWidth = lw; ctx.strokeStyle = '#2a1406'; ctx.stroke();
}

// --- hive: honeycomb beehive block (explosive)
function hiveDetail(w, h, seed, isCircle) {
  const R = rng(seed * 17 + 9);
  const S = isCircle ? w * 2 : Math.min(w, h);
  const hr = clamp(S * 0.13, 0.045, 0.1);
  const honey = [];
  const hw = isCircle ? w : w / 2, hh = isCircle ? w : h / 2;
  const dx = hr * Math.sqrt(3), dy = hr * 1.5;
  const cells = [];
  for (let row = -Math.ceil(hh / dy) - 1; row <= Math.ceil(hh / dy) + 1; row++) {
    for (let col = -Math.ceil(hw / dx) - 1; col <= Math.ceil(hw / dx) + 1; col++) {
      const cx = col * dx + (row & 1 ? dx / 2 : 0), cy = row * dy;
      if (Math.abs(cx) > hw + hr * 0.9 || Math.abs(cy) > hh + hr * 0.9) continue;
      cells.push([cx, cy]);
      if (R() < 0.2 && Math.abs(cx) < hw - hr && Math.abs(cy) < hh - hr) honey.push([cx, cy]);
    }
  }
  const bees = [];
  const nb = S > 0.5 ? 2 : 1;
  for (let i = 0; i < nb; i++) bees.push([(R() - 0.5) * hw * 1.1, -hh * 0.35 + (R() - 0.5) * hh * 0.6, R() < 0.5 ? -1 : 1, (R() - 0.5) * 0.6]);
  // honeycomb walls as zigzag rows + vertical segments (each shared edge stroked once)
  const zig = [], vert = [];
  const r0 = Math.floor(-(hh + hr) / dy), r1 = Math.ceil((hh + hr) / dy) + 1;
  const c0 = Math.floor(-(hw + dx) / dx) - 1, c1 = Math.ceil((hw + dx) / dx) + 1;
  for (let row = r0; row <= r1; row++) {
    const cy = row * dy, off = (row & 1) ? dx / 2 : 0, line = [];
    for (let col = c0; col <= c1; col++) {
      const cx = col * dx + off;
      line.push(cx - dx / 2, cy - hr / 2, cx, cy - hr);
      if (row < r1 && Math.abs(cx - dx / 2) <= hw + dx && Math.abs(cy) <= hh + hr) vert.push(cx - dx / 2, cy - hr / 2, cy + hr / 2);
    }
    zig.push(line);
  }
  const drips = [];
  const nd = isCircle ? 1 : clamp(Math.round(w / 0.5), 1, 3);
  for (let i = 0; i < nd; i++) drips.push([(isCircle ? 0.2 * w : -w / 2 + w * (i + 0.3 + R() * 0.4) / nd), clamp(S * 0.22, 0.06, 0.16) * (0.7 + R() * 0.5), clamp(S * 0.07, 0.025, 0.05)]);
  return { hr, cells, honey, bees, drips, zig, vert };
}
function hexPath(ctx, cx, cy, r) {
  for (let i = 0; i < 6; i++) {
    const a = PI / 6 + i * PI / 3, px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
    if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
  }
  ctx.closePath();
}
function drawBee(ctx, x, y, s, dir, rot, lw) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s * dir, s);
  const l = lw / s;
  ctx.lineJoin = 'round';
  // wings
  ctx.beginPath(); ctx.ellipse(-0.15, -0.55, 0.28, 0.4, -0.5, 0, TAU); ctx.ellipse(0.2, -0.55, 0.26, 0.36, 0.4, 0, TAU);
  ctx.fillStyle = 'rgba(235,248,255,0.9)'; ctx.fill(); ctx.lineWidth = l * 0.7; ctx.strokeStyle = '#3a3a4a'; ctx.stroke();
  // body
  ctx.beginPath(); ctx.ellipse(0, 0, 0.62, 0.45, 0, 0, TAU);
  ctx.fillStyle = '#ffd23a'; ctx.fill();
  ctx.lineWidth = l; ctx.strokeStyle = '#2a2230'; ctx.stroke();
  ctx.beginPath();
  for (const x0 of [-0.28, 0.06]) {
    const x1 = x0 + 0.18, y0 = 0.45 * Math.sqrt(1 - (x0 / 0.62) * (x0 / 0.62)), y1 = 0.45 * Math.sqrt(1 - (x1 / 0.62) * (x1 / 0.62));
    ctx.moveTo(x0, -y0); ctx.lineTo(x1, -y1); ctx.lineTo(x1, y1); ctx.lineTo(x0, y0); ctx.closePath();
  }
  ctx.fillStyle = '#2a2230'; ctx.fill();
  // stinger + eye + angry brow
  ctx.beginPath(); ctx.moveTo(-0.6, -0.08); ctx.lineTo(-0.85, 0.02); ctx.lineTo(-0.6, 0.1); ctx.fillStyle = '#2a2230'; ctx.fill();
  ctx.beginPath(); ctx.arc(0.36, -0.06, 0.1, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(0.22, -0.26); ctx.lineTo(0.48, -0.16); ctx.lineWidth = l * 1.1; ctx.lineCap = 'round'; ctx.stroke();
  ctx.restore();
}
function drawHoneyDrips(ctx, drips, yEdge, lw) {
  ctx.beginPath();
  for (const d of drips) {
    const x = d[0], len = d[1], r = d[2];
    ctx.moveTo(x - r * 1.6, yEdge - lw);
    ctx.quadraticCurveTo(x - r * 0.8, yEdge + len * 0.2, x - r, yEdge + len - r);
    ctx.arc(x, yEdge + len - r, r, PI, 0, true);
    ctx.quadraticCurveTo(x + r * 0.8, yEdge + len * 0.2, x + r * 1.6, yEdge - lw);
    ctx.closePath();
  }
  ctx.fillStyle = '#f0a012'; ctx.fill();
  ctx.lineWidth = lw * 0.8; ctx.strokeStyle = '#7a4204'; ctx.stroke();
  ctx.beginPath();
  for (const d of drips) { ctx.moveTo(d[0] - d[2] * 0.3 + d[2] * 0.3, yEdge + d[1] - d[2] * 1.3); ctx.arc(d[0] - d[2] * 0.3, yEdge + d[1] - d[2] * 1.3, d[2] * 0.3, 0, TAU); }
  ctx.fillStyle = 'rgba(255,245,200,0.9)'; ctx.fill();
}
function drawHiveBox(ctx, w, h, b, lw) {
  const S = Math.min(w, h);
  const cr = Math.min(S * 0.14, 0.07);
  const D = blockDetail('hv' + w + 'x' + h + 's' + b.seed, () => hiveDetail(w, h, b.seed | 0, false));
  drawHoneyDrips(ctx, D.drips, h / 2, lw);
  ctx.beginPath(); roundRectPath(ctx, -w / 2, -h / 2, w, h, cr);
  ctx.fillStyle = cgrad(ctx, 'hive' + w + 'x' + h, () => {
    const g = ctx.createLinearGradient(-w / 2, -h / 2, w * 0.25, h / 2);
    g.addColorStop(0, '#ffe07a'); g.addColorStop(0.45, '#f4b62c'); g.addColorStop(1, '#c9800e');
    return g;
  });
  ctx.fill();
  ctx.save(); ctx.clip();
  // honey-filled cells
  const hr = D.hr;
  ctx.beginPath();
  for (const c of D.honey) hexPath(ctx, c[0], c[1], hr * 0.86);
  ctx.fillStyle = 'rgba(214,122,8,0.6)'; ctx.fill();
  // honeycomb walls
  ctx.beginPath();
  for (const L of D.zig) { ctx.moveTo(L[0], L[1]); for (let i = 2; i < L.length; i += 2) ctx.lineTo(L[i], L[i + 1]); }
  const V = D.vert;
  for (let i = 0; i < V.length; i += 3) { ctx.moveTo(V[i], V[i + 1]); ctx.lineTo(V[i], V[i + 2]); }
  ctx.strokeStyle = 'rgba(150,84,6,0.6)'; ctx.lineWidth = clamp(hr * 0.2, 0.008, 0.02); ctx.stroke();
  // danger stripes (bee-striped bands) top & bottom
  const bh = Math.min(h * 0.14, 0.12);
  const sw = bh * 1.1;
  ctx.beginPath();
  for (let xx = -w / 2 - bh * 2; xx < w / 2 + bh; xx += sw * 2) {
    for (const y0 of [-h / 2, h / 2 - bh]) { ctx.moveTo(xx, y0 + bh); ctx.lineTo(xx + bh, y0); ctx.lineTo(xx + bh + sw, y0); ctx.lineTo(xx + sw, y0 + bh); ctx.closePath(); }
  }
  ctx.fillStyle = '#2a2230'; ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(-w / 2, -h / 2 + bh, w, bh * 0.2); ctx.fillRect(-w / 2, h / 2 - bh - bh * 0.2, w, bh * 0.2);
  ctx.restore();
  // entrance hole
  const ex = 0, ey = h / 2 - bh - hr * 1.1;
  ctx.beginPath(); ctx.ellipse(ex, ey, hr * 1.1, hr * 0.7, 0, 0, TAU);
  ctx.fillStyle = '#3a1e04'; ctx.fill();
  ctx.lineWidth = lw * 0.8; ctx.strokeStyle = '#7a4204'; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(ex, ey + hr * 0.1, hr * 0.95, hr * 0.55, 0, PI * 1.1, PI * 1.9);
  ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = hr * 0.25; ctx.stroke();
  // bevel
  const bv = Math.min(S * 0.08, 0.04), br = Math.max(cr - bv / 2, 0.001);
  ctx.lineWidth = bv; ctx.lineCap = 'butt';
  ctx.beginPath(); bevelTL(ctx, w, h, bv / 2, br); ctx.strokeStyle = 'rgba(255,248,200,0.45)'; ctx.stroke();
  ctx.beginPath(); bevelBR(ctx, w, h, bv / 2, br); ctx.strokeStyle = 'rgba(120,60,0,0.3)'; ctx.stroke();
  // tiny bees
  const bs = clamp(S * 0.11, 0.035, 0.075);
  for (const bz of D.bees) drawBee(ctx, bz[0], bz[1], bs, bz[2], bz[3], lw * 0.6);
  return cr;
}

// --- mushroom (bouncy): red cap with white spots over a cream stem
function mushDetail(w, h, seed, isCircle) {
  const R = rng(seed * 23 + 3);
  const spots = [];
  const n = isCircle ? 5 : clamp(Math.round(w / 0.25) + 2, 4, 10);
  for (let i = 0; i < n; i++) {
    if (isCircle) { const a = R() * TAU, r = Math.sqrt(R()) * w * 0.72; spots.push([Math.cos(a) * r, Math.sin(a) * r * 0.9, w * (0.1 + R() * 0.1)]); }
    else spots.push([(i + 0.5) / n - 0.5 + (R() - 0.5) * 0.08, 0.15 + R() * 0.65, 0.06 + R() * 0.07]);
  }
  const dents = [];
  for (let i = 0; i < 6; i++) dents.push([(R() - 0.5) * 0.7, 0.2 + R() * 0.6, 0.6 + R() * 0.6, (R() - 0.5) * 0.8]);
  return { spots, dents };
}
function mushCapPath(ctx, w, h) {
  const top = -h / 2, cb = -h / 2 + h * 0.6;
  ctx.moveTo(-w / 2, cb);
  ctx.bezierCurveTo(-w / 2, top + h * 0.05, -w * 0.3, top, 0, top);
  ctx.bezierCurveTo(w * 0.3, top, w / 2, top + h * 0.05, w / 2, cb);
  ctx.quadraticCurveTo(w * 0.35, cb + h * 0.08, 0, cb + h * 0.08);
  ctx.quadraticCurveTo(-w * 0.35, cb + h * 0.08, -w / 2, cb);
  ctx.closePath();
}
function mushStemPath(ctx, w, h) {
  const cb = -h / 2 + h * 0.6, bot = h / 2;
  const sw = Math.min(w * 0.42, h * 0.7) / 2;
  ctx.moveTo(-sw, cb);
  ctx.bezierCurveTo(-sw * 0.9, cb + (bot - cb) * 0.5, -sw * 1.25, bot - (bot - cb) * 0.2, -sw * 1.2, bot);
  ctx.lineTo(sw * 1.2, bot);
  ctx.bezierCurveTo(sw * 1.25, bot - (bot - cb) * 0.2, sw * 0.9, cb + (bot - cb) * 0.5, sw, cb);
  ctx.closePath();
}
function drawMushroomBox(ctx, w, h, b, lw, hp, flash) {
  const D = blockDetail('mu' + w + 'x' + h + 's' + b.seed, () => mushDetail(w, h, b.seed | 0, false));
  if (flash > 0) { ctx.translate(0, h / 2); ctx.scale(1 + 0.12 * flash, 1 - 0.18 * flash); ctx.translate(0, -h / 2); }
  // stem
  ctx.beginPath(); mushStemPath(ctx, w, h);
  ctx.fillStyle = cgrad(ctx, 'mustem' + w + 'x' + h, () => {
    const g = ctx.createLinearGradient(-w * 0.25, 0, w * 0.25, 0);
    g.addColorStop(0, '#fff8ea'); g.addColorStop(0.6, '#f1e0c2'); g.addColorStop(1, '#cdb48e');
    return g;
  });
  ctx.fill();
  ctx.lineWidth = lw; ctx.strokeStyle = '#5a3e22'; ctx.stroke();
  // gills under the cap
  const cb = -h / 2 + h * 0.6;
  ctx.beginPath(); ctx.ellipse(0, cb + h * 0.025, w * 0.44, h * 0.07, 0, 0, TAU);
  ctx.fillStyle = '#f4cdb0'; ctx.fill();
  ctx.beginPath();
  for (let i = -5; i <= 5; i++) { ctx.moveTo(i * w * 0.075, cb + h * 0.07); ctx.lineTo(i * w * 0.02, cb - h * 0.01); }
  ctx.strokeStyle = 'rgba(160,90,60,0.45)'; ctx.lineWidth = lw * 0.5; ctx.stroke();
  // cap
  ctx.beginPath(); mushCapPath(ctx, w, h);
  ctx.fillStyle = cgrad(ctx, 'mucap' + w + 'x' + h, () => {
    const g = ctx.createRadialGradient(-w * 0.2, -h * 0.38, Math.min(w, h) * 0.02, 0, -h * 0.1, Math.max(w, h * 0.8) * 0.75);
    g.addColorStop(0, '#ff8a6a'); g.addColorStop(0.45, '#e2382c'); g.addColorStop(1, '#9e1a14');
    return g;
  });
  ctx.fill();
  ctx.save(); ctx.clip();
  const capH = h * 0.6, top = -h / 2;
  ctx.beginPath();
  for (const s of D.spots) {
    const sx = s[0] * w * 0.92, sy = top + s[1] * capH * 0.9, rr = s[2] * Math.min(w, capH * 1.6);
    const sq = 1 - Math.abs(s[0]) * 0.8;
    ctx.moveTo(sx + rr * sq, sy); ctx.ellipse(sx, sy, rr * sq, rr * 0.8, 0, 0, TAU);
  }
  ctx.fillStyle = '#fff6ec'; ctx.fill();
  ctx.lineWidth = lw * 0.5; ctx.strokeStyle = 'rgba(160,40,30,0.5)'; ctx.stroke();
  // dents
  if (hp < 0.7) {
    const nd = hp < 0.35 ? 5 : 2;
    ctx.beginPath();
    for (let i = 0; i < nd; i++) {
      const d = D.dents[i], dx = d[0] * w, dy = top + d[1] * capH * 0.85, dr = Math.min(w, capH) * 0.12 * d[2];
      ctx.moveTo(dx - dr, dy); ctx.quadraticCurveTo(dx, dy + dr * 0.8, dx + dr, dy);
    }
    ctx.strokeStyle = 'rgba(90,6,4,0.65)'; ctx.lineWidth = lw * 1.1; ctx.lineCap = 'round'; ctx.stroke();
    ctx.save(); ctx.translate(0, lw * 0.9);
    ctx.strokeStyle = 'rgba(255,160,140,0.55)'; ctx.lineWidth = lw * 0.6; ctx.stroke();
    ctx.restore();
  }
  ctx.beginPath(); ctx.ellipse(-w * 0.2, top + capH * 0.25, w * 0.16, capH * 0.08, -0.35, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fill();
  ctx.restore();
  ctx.beginPath(); mushCapPath(ctx, w, h);
  if (flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (flash * 0.5).toFixed(3) + ')'; ctx.fill(); }
  ctx.lineWidth = lw; ctx.strokeStyle = MAT.mushroom.line; ctx.stroke();
}
function drawPuffball(ctx, r, b, lw, hp, flash) {
  const D = blockDetail('mc' + r + 's' + b.seed, () => mushDetail(r, r, b.seed | 0, true));
  if (flash > 0) ctx.scale(1 + 0.12 * flash, 1 - 0.15 * flash);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
  ctx.fillStyle = cgrad(ctx, 'puff' + r, () => {
    const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.05, 0, 0, r * 1.05);
    g.addColorStop(0, '#ff8a6a'); g.addColorStop(0.5, '#e2382c'); g.addColorStop(1, '#9e1a14');
    return g;
  });
  ctx.fill();
  ctx.save(); ctx.clip();
  ctx.beginPath(); ctx.ellipse(0, r * 0.95, r * 0.7, r * 0.3, 0, 0, TAU); ctx.fillStyle = '#f4dcc0'; ctx.fill();
  ctx.beginPath();
  for (const s of D.spots) { ctx.moveTo(s[0] + s[2], s[1]); ctx.ellipse(s[0], s[1], s[2], s[2] * 0.85, 0, 0, TAU); }
  ctx.fillStyle = '#fff6ec'; ctx.fill();
  if (hp < 0.7) {
    const nd = hp < 0.35 ? 5 : 2;
    ctx.beginPath();
    for (let i = 0; i < nd; i++) {
      const d = D.dents[i], dx = d[0] * r * 1.2, dy = (d[1] - 0.6) * r * 1.4, dr = r * 0.22 * d[2];
      ctx.moveTo(dx - dr, dy); ctx.quadraticCurveTo(dx, dy + dr * 0.8, dx + dr, dy);
    }
    ctx.strokeStyle = 'rgba(90,6,4,0.65)'; ctx.lineWidth = lw * 1.1; ctx.lineCap = 'round'; ctx.stroke();
  }
  ctx.beginPath(); ctx.ellipse(-r * 0.35, -r * 0.45, r * 0.3, r * 0.14, -0.6, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fill();
  ctx.restore();
}

// --- circles for wood / stone / hive
function drawWoodLog(ctx, r, b, lw) {
  const D = blockDetail('log' + r + 's' + b.seed, () => {
    const R = rng((b.seed | 0) * 3 + 1);
    const ticks = [];
    for (let i = 0; i < 18; i++) ticks.push(i * TAU / 18 + R() * 0.2);
    const fr = r * 0.82;
    const ox = (R() - 0.5) * fr * 0.2, oy = (R() - 0.5) * fr * 0.2;
    const nr = clamp(Math.round(r / 0.07), 3, 8);
    const rings = [];
    for (let i = 1; i <= nr; i++) {
      const rr = fr * i / (nr + 1), pts = [];
      for (let j = 0; j <= 14; j++) {
        const a = j * TAU / 14, wob = 1 + Math.sin(a * 3 + i * 1.3 + (b.seed | 0)) * 0.035;
        pts.push([ox * (1 - i / (nr + 1)) + Math.cos(a) * rr * wob, oy * (1 - i / (nr + 1)) + Math.sin(a) * rr * wob]);
      }
      rings.push(pts);
    }
    return { ticks, ox, oy, rings, ca: R() * TAU, sprout: (b.seed | 0) % 3 === 0 };
  });
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
  ctx.fillStyle = '#6e4424'; ctx.fill();
  ctx.beginPath();
  for (const a of D.ticks) { ctx.moveTo(Math.cos(a) * r * 0.84, Math.sin(a) * r * 0.84); ctx.lineTo(Math.cos(a) * r * 0.97, Math.sin(a) * r * 0.97); }
  ctx.strokeStyle = 'rgba(40,20,6,0.6)'; ctx.lineWidth = r * 0.05; ctx.stroke();
  const fr = r * 0.82;
  ctx.beginPath(); ctx.arc(0, 0, fr, 0, TAU);
  ctx.fillStyle = cgrad(ctx, 'logface' + r, () => {
    const g = ctx.createRadialGradient(-fr * 0.3, -fr * 0.3, fr * 0.05, 0, 0, fr);
    g.addColorStop(0, '#fbdca4'); g.addColorStop(0.6, '#eab676'); g.addColorStop(1, '#c98b4c');
    return g;
  });
  ctx.fill();
  ctx.lineWidth = lw * 0.7; ctx.strokeStyle = 'rgba(90,45,15,0.8)'; ctx.stroke();
  ctx.beginPath(); polyPaths(ctx, D.rings, 0, 0);
  ctx.strokeStyle = 'rgba(150,86,36,0.55)'; ctx.lineWidth = clamp(r * 0.025, 0.008, 0.02); ctx.stroke();
  ctx.beginPath(); ctx.arc(D.ox, D.oy, fr * 0.06, 0, TAU); ctx.fillStyle = 'rgba(120,60,20,0.7)'; ctx.fill();
  const ca = D.ca;
  ctx.beginPath(); ctx.moveTo(D.ox + Math.cos(ca) * fr * 0.15, D.oy + Math.sin(ca) * fr * 0.15);
  ctx.lineTo(Math.cos(ca + 0.06) * fr * 0.6, Math.sin(ca + 0.06) * fr * 0.6);
  ctx.lineTo(Math.cos(ca) * fr * 0.95, Math.sin(ca) * fr * 0.95);
  ctx.strokeStyle = 'rgba(90,45,15,0.7)'; ctx.lineWidth = clamp(r * 0.03, 0.008, 0.025); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, fr * 0.9, PI * 1.05, PI * 1.45);
  ctx.strokeStyle = 'rgba(255,245,220,0.5)'; ctx.lineWidth = fr * 0.06; ctx.lineCap = 'round'; ctx.stroke();
}
function lumpPath(ctx, r, lump) {
  const k = lump.length, pts = [];
  for (let i = 0; i < k; i++) { const a = i * TAU / k; pts.push([Math.cos(a) * r * lump[i], Math.sin(a) * r * lump[i]]); }
  const m = (i) => { const a = pts[i % k], b = pts[(i + 1) % k]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
  const s = m(k - 1);
  ctx.moveTo(s[0], s[1]);
  for (let i = 0; i < k; i++) { const e = m(i); ctx.quadraticCurveTo(pts[i][0], pts[i][1], e[0], e[1]); }
  ctx.closePath();
}
function drawPebbleBall(ctx, r, b, lw) {
  const D = blockDetail('pball' + r + 's' + b.seed, () => pebbleDetail(r, r, b.seed | 0, true));
  ctx.beginPath(); lumpPath(ctx, r, D.lump);
  ctx.fillStyle = cgrad(ctx, 'pball' + r, () => {
    const g = ctx.createRadialGradient(-r * 0.38, -r * 0.42, r * 0.05, -r * 0.1, -r * 0.1, r * 1.2);
    g.addColorStop(0, '#e2ebf2'); g.addColorStop(0.35, '#a9bbca'); g.addColorStop(0.8, '#7890a3'); g.addColorStop(1, '#5e7386');
    return g;
  });
  ctx.fill();
  ctx.beginPath(); dotsPath(ctx, D.dark); ctx.fillStyle = 'rgba(60,76,92,0.35)'; ctx.fill();
  ctx.beginPath(); dotsPath(ctx, D.light); ctx.fillStyle = 'rgba(240,246,252,0.5)'; ctx.fill();
  ctx.beginPath(); ctx.arc(0, 0, r * 0.8, PI * 1.02, PI * 1.5);
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = r * 0.08; ctx.lineCap = 'round'; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, r * 0.82, PI * 0.1, PI * 0.55);
  ctx.strokeStyle = 'rgba(30,44,60,0.18)'; ctx.lineWidth = r * 0.1; ctx.stroke();
  drawMoss(ctx, D.moss);
  return D.lump;
}
function drawHiveBall(ctx, r, b, lw) {
  const D = blockDetail('hvb' + r + 's' + b.seed, () => hiveDetail(r, r, b.seed | 0, true));
  drawHoneyDrips(ctx, D.drips.map(d => [d[0], d[1], d[2]]), r * 0.9, lw);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
  ctx.fillStyle = cgrad(ctx, 'hiveball' + r, () => {
    const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.05, 0, 0, r * 1.05);
    g.addColorStop(0, '#ffe68a'); g.addColorStop(0.5, '#f2b02a'); g.addColorStop(1, '#b8720a');
    return g;
  });
  ctx.fill();
  // skep coils
  ctx.beginPath();
  for (let i = -3; i <= 3; i++) {
    const yy = i * r * 0.27, hw = Math.sqrt(Math.max(0, r * r - yy * yy)) * 0.98;
    ctx.moveTo(-hw, yy); ctx.quadraticCurveTo(0, yy + r * 0.12, hw, yy);
  }
  ctx.strokeStyle = 'rgba(130,70,4,0.6)'; ctx.lineWidth = clamp(r * 0.04, 0.01, 0.03); ctx.stroke();
  ctx.save(); ctx.translate(0, -clamp(r * 0.03, 0.008, 0.02));
  ctx.strokeStyle = 'rgba(255,240,170,0.5)'; ctx.lineWidth = clamp(r * 0.02, 0.006, 0.015); ctx.stroke();
  ctx.restore();
  ctx.beginPath(); ctx.ellipse(r * 0.12, r * 0.5, r * 0.24, r * 0.15, 0, 0, TAU);
  ctx.fillStyle = '#3a1e04'; ctx.fill(); ctx.lineWidth = lw * 0.8; ctx.strokeStyle = '#7a4204'; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, r * 0.84, PI * 1.08, PI * 1.45);
  ctx.strokeStyle = 'rgba(255,250,210,0.55)'; ctx.lineWidth = r * 0.07; ctx.lineCap = 'round'; ctx.stroke();
  const bs = clamp(r * 0.2, 0.035, 0.075);
  drawBee(ctx, -r * 0.35, -r * 0.2, bs, 1, 0.2, lw * 0.6);
}

export function drawBlock(ctx, b) {
  if (!b) return;
  const req = b.material === 'ice' ? 'leaf' : b.material;   // ice was retired: stale callers get leaf
  const mat = MAT[req] ? req : 'wood';
  const circle = b.shape === 'circle';
  const hp = b.hp01 == null ? 1 : clamp(+b.hp01, 0, 1);
  const flash = clamp(+b.flash || 0, 0, 1);
  const lw = 0.03;
  const M = MAT[mat];
  const seed = b.seed | 0;
  ctx.save();
  ctx.translate(+b.x || 0, +b.y || 0);
  if (b.angle) ctx.rotate(b.angle);
  ctx.lineJoin = 'round';
  if (mat === 'leaf' || mat === 'crate' || mat === 'log') {
    if (circle) {
      const r = Math.max(0.02, +b.r || 0.3);
      if (mat === 'leaf') drawLeafBundle(ctx, r, r, b, lw, true, hp, flash);
      else if (mat === 'log') drawLogSlice(ctx, r, b, lw, hp, flash);
      else drawNutCrate(ctx, r * 1.9, r * 1.6, b, lw, hp, flash);
    } else {
      const w = Math.max(0.02, +b.w || 1), h = Math.max(0.02, +b.h || 1);
      if (mat === 'leaf') drawLeafBundle(ctx, w, h, b, lw, false, hp, flash);
      else if (mat === 'log') drawHeavyLog(ctx, w, h, b, lw, hp, flash);
      else drawNutCrate(ctx, w, h, b, lw, hp, flash);
    }
    ctx.restore();
    return;
  }
  if (mat === 'mushroom') {
    if (circle) {
      const r = Math.max(0.02, +b.r || 0.3);
      drawPuffball(ctx, r, b, lw, hp, flash);
      ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
      if (flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (flash * 0.5).toFixed(3) + ')'; ctx.fill(); }
      ctx.lineWidth = lw; ctx.strokeStyle = M.line; ctx.stroke();
    } else {
      drawMushroomBox(ctx, Math.max(0.02, +b.w || 1), Math.max(0.02, +b.h || 1), b, lw, hp, flash);
    }
    ctx.restore();
    return;
  }
  if (circle) {
    const r = Math.max(0.02, +b.r || 0.3);
    let lump = null;
    if (mat === 'wood') drawWoodLog(ctx, r, b, lw);
    else if (mat === 'stone') lump = drawPebbleBall(ctx, r, b, lw);
    else drawHiveBall(ctx, r, b, lw);
    if (hp < 0.7) {
      const lvl = hp < 0.35 ? 2 : 1;
      const cw = clamp(r * 0.08, 0.014, 0.045);
      const C = blockDetail('cc' + r + 's' + seed + 'l' + lvl, () => genCracks(rng(seed * 31 + 7), r * (lump ? 0.95 : 1), r, true, lvl, cw * 1.3));
      drawCracks(ctx, C, cw, M);
    }
    ctx.beginPath(); if (lump) lumpPath(ctx, r, lump); else ctx.arc(0, 0, r, 0, TAU);
    if (flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (flash * 0.7).toFixed(3) + ')'; ctx.fill(); }
    ctx.lineWidth = lw; ctx.strokeStyle = mat === 'wood' ? '#3a1d08' : M.line; ctx.stroke();
  } else {
    const w = Math.max(0.02, +b.w || 1), h = Math.max(0.02, +b.h || 1);
    let cr;
    if (mat === 'wood') cr = drawBranchBox(ctx, w, h, b, lw);
    else if (mat === 'stone') cr = drawPebbleBox(ctx, w, h, b, lw);
    else cr = drawHiveBox(ctx, w, h, b, lw);
    if (hp < 0.7) {
      const lvl = hp < 0.35 ? 2 : 1;
      const S = Math.min(w, h);
      const cw = clamp(S * 0.04, 0.014, 0.045);
      const C = blockDetail('cb' + w + 'x' + h + 's' + seed + 'l' + lvl, () => genCracks(rng(seed * 31 + 7), w, h, false, lvl, Math.max(cw * 1.2, cr * 0.4)));
      drawCracks(ctx, C, cw, M);
    }
    ctx.beginPath(); roundRectPath(ctx, -w / 2, -h / 2, w, h, cr);
    if (flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (flash * 0.7).toFixed(3) + ')'; ctx.fill(); }
    ctx.lineWidth = lw; ctx.strokeStyle = M.line; ctx.stroke();
    if (mat === 'wood') drawBranchSprout(ctx, w, h, b, lw);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------
//  Forest obstacles: trees, fallen trees, stumps, spider webs, dandelions, home trees
//  (render space, metres, y down; origin of each object as documented on the export)
// ---------------------------------------------------------------------
const TREE_P = {
  oak:      { bark: '#7e5634', barkHi: '#b4865a', barkLo: '#4a2e18', line: '#2a180a', leaf: ['#2e6e22', '#4a9632', '#8ccc58'], leafLine: '#1a4210', nut: 'acorn', leafCol: '#5aa83a' },
  maple:    { bark: '#7a685a', barkHi: '#aa988a', barkLo: '#4a3c32', line: '#261c16', leaf: ['#a8301a', '#de5a2a', '#ffad54'], leafLine: '#5a1608', nut: 'acorn', leafCol: '#e8622a' },
  pine:     { bark: '#80482a', barkHi: '#b4744a', barkLo: '#4a2412', line: '#2a1408', leaf: ['#1c5030', '#2e7444', '#62aa66'], leafLine: '#0c3018', nut: 'pinecone', leafCol: '#3a8a4a' },
  chestnut: { bark: '#6e4a30', barkHi: '#9e7656', barkLo: '#40281a', line: '#26160a', leaf: ['#5a8a1c', '#8ab83a', '#d2e67a'], leafLine: '#2e4a0c', nut: 'burr', leafCol: '#8ab83a' },
};

function treeGeom(t) {
  const kind = TREE_P[t.kind] ? t.kind : 'oak';
  const h = clamp(+t.h || 4, 2, 8), R = clamp(+t.canopyR || 2.2, 1, 4);
  const seed = t.seed | 0, dir = (seed & 1) ? -1 : 1;
  const cy = -h;
  const bottom = cy + R * (kind === 'pine' ? 0.9 : 0.72);
  const lean = (hash(seed, 1.7) - 0.5) * 0.35;
  const tx = (yy) => lean * clamp(-yy / h, 0, 1);
  const by = Math.min(bottom + 0.25, -0.9);
  const tip = [tx(by) + dir * (R * 0.92 + 0.25), by - 0.3];
  const webY = Math.min(bottom + 1.2, -1.15);
  return { kind, h, R, dir, cy, bottom, lean, tx, by, tip, web: [tx(webY) + dir * 1.3, webY] };
}

export function treeAnchors(t) {
  t = t || EMPTY;
  const G = treeGeom(t), x = +t.x || 0, y = +t.y || 0;
  return { branch: { x: x + G.tip[0], y: y + G.tip[1] }, web: { x: x + G.web[0], y: y + G.web[1] } };
}

function trunkPath(ctx, G) {
  const top = G.cy + G.R * 0.3, tt = G.tx(top), mid = top * 0.5, tm = G.tx(mid);
  ctx.moveTo(tt - 0.26, top);
  ctx.quadraticCurveTo(tm - 0.37, mid, -0.42, -0.34);
  ctx.bezierCurveTo(-0.48, -0.12, -0.7, 0.04, -0.95, 0.3);
  ctx.quadraticCurveTo(-0.62, 0.16, -0.36, 0.17);
  ctx.quadraticCurveTo(-0.14, 0.2, 0.04, 0.42);
  ctx.quadraticCurveTo(0.2, 0.16, 0.42, 0.16);
  ctx.quadraticCurveTo(0.68, 0.16, 0.95, 0.3);
  ctx.bezierCurveTo(0.72, 0.06, 0.5, -0.12, 0.44, -0.34);
  ctx.quadraticCurveTo(tm + 0.37, mid, tt + 0.26, top);
  ctx.closePath();
}

function drawTrunk(ctx, G, P, lw, seed, hp, time) {
  ctx.beginPath(); trunkPath(ctx, G);
  ctx.fillStyle = cgrad(ctx, 'trunk' + G.kind, () => {
    const g = ctx.createLinearGradient(-0.5, 0, 0.5, 0);
    g.addColorStop(0, P.bark); g.addColorStop(0.28, P.barkHi); g.addColorStop(0.6, P.bark); g.addColorStop(1, P.barkLo);
    return g;
  });
  ctx.fill();
  const top = G.cy + G.R * 0.3;
  // bark texture
  ctx.beginPath();
  if (G.kind === 'pine') {
    const R = rng(seed * 3 + 1);
    for (let i = 0; i < 16; i++) {
      const yy = -0.3 + (top + 0.3) * R(), xx = G.tx(yy) + (R() - 0.5) * 0.5, ww = 0.1 + R() * 0.08;
      ctx.moveTo(xx - ww, yy); ctx.quadraticCurveTo(xx, yy + 0.07, xx + ww, yy);
    }
  } else {
    for (const k of [-0.24, -0.11, 0.02, 0.15, 0.27]) {
      const n = 6;
      ctx.moveTo(k * 1.25, 0.12);
      for (let i = 1; i <= n; i++) {
        const yy = 0.12 + (top - 0.12) * i / n, ww = 1.25 - 0.45 * i / n;
        ctx.quadraticCurveTo(G.tx(yy) + k * ww + Math.sin(i * 2.3 + k * 9) * 0.04, yy - (top - 0.12) / n * 0.5, G.tx(yy) + k * ww, yy);
      }
    }
  }
  ctx.strokeStyle = rgba(P.barkLo, 0.65); ctx.lineWidth = lw * 0.9; ctx.stroke();
  ctx.save(); ctx.translate(-0.03, 0);
  ctx.strokeStyle = rgba(P.barkHi, 0.35); ctx.lineWidth = lw * 0.5; ctx.stroke();
  ctx.restore();
  // knot hole with (sometimes) a peeking critter
  const ky = -G.h * 0.38, kx = G.tx(ky) + 0.05;
  ctx.beginPath(); ctx.ellipse(kx, ky, 0.15, 0.2, 0, 0, TAU);
  ctx.fillStyle = P.barkHi; ctx.fill(); ctx.lineWidth = lw * 0.8; ctx.strokeStyle = P.line; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(kx, ky + 0.02, 0.1, 0.14, 0, 0, TAU);
  ctx.fillStyle = '#1c0e06'; ctx.fill();
  if (seed % 2 === 0 && frac(time * 0.23 + seed * 0.1) > 0.08) {
    ctx.beginPath(); ctx.arc(kx - 0.035, ky + 0.02, 0.028, 0, TAU); ctx.arc(kx + 0.035, ky + 0.02, 0.028, 0, TAU);
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.beginPath(); ctx.arc(kx - 0.03, ky + 0.025, 0.014, 0, TAU); ctx.arc(kx + 0.04, ky + 0.025, 0.014, 0, TAU);
    ctx.fillStyle = '#1a1010'; ctx.fill();
  }
  // damage cracks
  if (hp < 0.5) {
    const R = rng(seed * 41 + 3), n = hp < 0.25 ? 4 : 2, main = [], thin = [];
    for (let c = 0; c < n; c++) {
      let yy = -0.15 - R() * 0.5, xx = G.tx(yy) + (R() - 0.5) * 0.4;
      const pts = [[xx, yy]], segs = 5 + Math.floor(R() * 3);
      for (let i = 0; i < segs; i++) {
        yy -= 0.25 + R() * 0.3; xx = clamp(xx + (R() - 0.5) * 0.18, G.tx(yy) - 0.26, G.tx(yy) + 0.26);
        pts.push([xx, yy]);
        if (R() < 0.3) thin.push([[xx, yy], [xx + (R() - 0.5) * 0.25, yy - 0.12 - R() * 0.1]]);
      }
      main.push(pts);
    }
    drawCracks(ctx, { main, thin }, 0.045, { crack: '#1e1006', crackHi: rgba(P.barkHi, 0.8) });
  }
  ctx.beginPath(); trunkPath(ctx, G);
  ctx.lineWidth = lw; ctx.strokeStyle = P.line; ctx.stroke();
}

function drawTreeBranch(ctx, G, P, lw, time) {
  const bx = G.tx(G.by), by = G.by, t = G.tip;
  const cx = bx + (t[0] - bx) * 0.5, cyy = by + 0.05;
  ctx.beginPath(); taperPath(ctx, bx, by + 0.02, cx, cyy, t[0], t[1], 0.26, 0.08, 8, false, true);
  ctx.fillStyle = P.bark; ctx.fill();
  ctx.lineWidth = lw; ctx.strokeStyle = P.line; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bx, by - 0.05); ctx.quadraticCurveTo(cx, cyy - 0.08, t[0] - G.dir * 0.05, t[1] - 0.03);
  ctx.strokeStyle = rgba(P.barkHi, 0.6); ctx.lineWidth = 0.035; ctx.stroke();
  // small twig with leaves near the tip
  const mx = bx + (t[0] - bx) * 0.66, my = by + (t[1] - by) * 0.66 - 0.02;
  ctx.beginPath(); ctx.moveTo(mx, my); ctx.quadraticCurveTo(mx + G.dir * 0.1, my - 0.2, mx + G.dir * 0.28, my - 0.34);
  ctx.strokeStyle = P.line; ctx.lineWidth = 0.05 + lw; ctx.stroke();
  ctx.strokeStyle = P.bark; ctx.lineWidth = 0.05; ctx.stroke();
  const sw = Math.sin(time * 2 + mx) * 0.08;
  ctx.beginPath();
  leafShapeAt(ctx, mx + G.dir * 0.36, my - 0.42, 0.14, 0.07, -PI / 2 + G.dir * 0.6 + sw);
  leafShapeAt(ctx, mx + G.dir * 0.18, my - 0.36, 0.12, 0.06, -PI / 2 - G.dir * 0.4 + sw);
  leafShapeAt(ctx, t[0] + G.dir * 0.12, t[1] - 0.08, 0.13, 0.065, -G.dir * 0.3 + (G.dir < 0 ? PI : 0) + sw);
  ctx.fillStyle = P.leafCol; ctx.fill();
  ctx.lineWidth = lw * 0.7; ctx.strokeStyle = P.leafLine; ctx.stroke();
}

function canopyBalls(R, seed) {
  return blockDetail('cb' + R + 's' + seed, () => {
    const Rn = rng(seed * 13 + 5), B = [[0, -0.05 * R, 0.6 * R]];
    const n = 8, a0 = Rn() * TAU;
    for (let i = 0; i < n; i++) {
      const a = a0 + i * TAU / n + (Rn() - 0.5) * 0.3, d = R * (0.5 + 0.08 * Rn());
      B.push([Math.cos(a) * d, Math.sin(a) * d * 0.78 - 0.04 * R, R * (0.36 + 0.1 * Rn())]);
    }
    B.push([-0.3 * R, -0.58 * R, 0.36 * R], [0.28 * R, -0.55 * R, 0.34 * R]);
    const tex = [];
    for (let i = 0; i < 30; i++) {
      const a = Rn() * TAU, d = Math.sqrt(Rn()) * R * 0.8;
      const x = Math.cos(a) * d, y = Math.sin(a) * d * 0.8;
      const light = (x + y) < R * 0.1 ? Rn() < 0.8 : Rn() < 0.2;
      tex.push([x, y, R * (0.08 + 0.04 * Rn()), light, Rn() * TAU, R * 0.35]);
    }
    const edge = [];
    for (let i = 0; i < 11; i++) {
      const a = -PI * 0.1 + i * PI * 1.2 / 10 + (Rn() - 0.5) * 0.15;
      edge.push([Math.cos(a) * R * 0.86, Math.sin(a) * R * 0.66 - 0.04 * R, a]);
    }
    for (let i = 0; i < 5; i++) {
      const a = PI * 1.2 + i * PI * 0.6 / 4 + (Rn() - 0.5) * 0.15;
      edge.push([Math.cos(a) * R * 0.86, Math.sin(a) * R * 0.66 - 0.04 * R, a]);
    }
    return { B, tex, edge };
  });
}
function circlesPath(ctx, B, ox, oy, k, wob) {
  for (let i = 0; i < B.length; i++) {
    const b = B[i], w = wob ? wob[i] : 0;
    const x = b[0] + ox * b[2] + w, y = b[1] + oy * b[2] - w * 0.5, r = b[2] * k;
    ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, TAU);
  }
}
function drawRoundCanopy(ctx, G, P, lw, seed, shake, time) {
  const C = canopyBalls(G.R, seed);
  ctx.save();
  ctx.translate(G.tx(G.cy), G.cy);
  const wob = shake > 0.01 ? C.B.map((b, i) => Math.sin(time * 21 + i * 1.7) * 0.06 * G.R * shake) : null;
  if (G.kind === 'maple' || G.kind === 'chestnut') {
    const fl = shake * Math.sin(time * 23) * 0.3;
    ctx.beginPath();
    for (let i = 0; i < C.edge.length; i++) {
      const e = C.edge[i], a = e[2] + fl * ((i & 1) ? 1 : -1);
      if (G.kind === 'maple') starPath(ctx, e[0] + Math.cos(a) * G.R * 0.2, e[1] + Math.sin(a) * G.R * 0.2, G.R * 0.15, G.R * 0.09, 5, a + PI / 2);
      else leafShapeAt(ctx, e[0] + Math.cos(a) * G.R * 0.2, e[1] + Math.sin(a) * G.R * 0.2, G.R * 0.17, G.R * 0.05, a);
    }
    ctx.fillStyle = P.leaf[1]; ctx.fill();
    ctx.lineWidth = lw * 0.9; ctx.strokeStyle = P.leafLine; ctx.stroke();
  }
  ctx.beginPath(); circlesPath(ctx, C.B, 0, 0, 1, wob);
  ctx.lineWidth = lw * 2; ctx.strokeStyle = P.leafLine; ctx.stroke();
  ctx.fillStyle = P.leaf[0]; ctx.fill();
  ctx.beginPath(); circlesPath(ctx, C.B, -0.1, -0.13, 0.8, wob);
  ctx.fillStyle = P.leaf[1]; ctx.fill();
  ctx.beginPath(); circlesPath(ctx, C.B, -0.27, -0.33, 0.42, wob);
  ctx.fillStyle = rgba(P.leaf[2], 0.9); ctx.fill();
  // little leaf clusters for foliage texture (dark in the shade, light in the sun)
  ctx.beginPath();
  for (const t of C.tex) if (!t[3]) leafShapeAt(ctx, t[0], t[1], t[2] * 0.95, t[2] * 0.42, t[4]);
  ctx.fillStyle = rgba(P.leaf[0], 0.7); ctx.fill();
  ctx.beginPath();
  for (const t of C.tex) if (t[3] && t[1] < t[5]) leafShapeAt(ctx, t[0], t[1], t[2] * 0.85, t[2] * 0.38, t[4]);
  ctx.fillStyle = rgba(P.leaf[2], 0.75); ctx.fill();
  ctx.restore();
}
function pineTierPath(ctx, cx, apexY, baseY, hw, bumps) {
  ctx.moveTo(cx, apexY);
  ctx.quadraticCurveTo(cx - hw * 0.45, apexY + (baseY - apexY) * 0.55, cx - hw, baseY);
  const step = (2 * hw) / bumps;
  for (let i = 0; i < bumps; i++) {
    const x0 = cx - hw + step * i;
    ctx.quadraticCurveTo(x0 + step * 0.5, baseY + step * 0.45, x0 + step, baseY);
  }
  ctx.quadraticCurveTo(cx + hw * 0.45, apexY + (baseY - apexY) * 0.55, cx, apexY);
  ctx.closePath();
}
function drawPineCanopy(ctx, G, P, lw, seed, shake, time) {
  const R = G.R, cx0 = G.tx(G.cy);
  const n = 4, sp = R * 0.45;
  for (let i = 0; i < n; i++) {
    const baseY = G.bottom - i * sp, hw = R * (1.0 - i * 0.2), apex = baseY - R * 0.85;
    const cx = cx0 + (shake > 0.01 ? Math.sin(time * 19 + i * 1.3) * 0.05 * R * shake * (i + 1) / n : 0);
    ctx.beginPath(); pineTierPath(ctx, cx, apex, baseY, hw, 5 - Math.min(i, 2));
    ctx.fillStyle = P.leaf[0]; ctx.fill();
    ctx.lineWidth = lw; ctx.strokeStyle = P.leafLine; ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - hw * 0.08, apex + (baseY - apex) * 0.12);
    ctx.quadraticCurveTo(cx - hw * 0.42, apex + (baseY - apex) * 0.55, cx - hw * 0.86, baseY - 0.02);
    ctx.quadraticCurveTo(cx - hw * 0.4, baseY + R * 0.04, cx - hw * 0.05, baseY - (baseY - apex) * 0.1);
    ctx.closePath();
    ctx.fillStyle = P.leaf[1]; ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx - 0.05, apex + 0.1); ctx.quadraticCurveTo(cx - hw * 0.4, apex + (baseY - apex) * 0.5, cx - hw * 0.8, baseY - 0.1);
    ctx.strokeStyle = rgba(P.leaf[2], 0.8); ctx.lineWidth = lw * 1.2; ctx.lineCap = 'round'; ctx.stroke();
  }
}
function treeNutSlots(G, seed) {
  return blockDetail('tn' + G.kind + G.R + 's' + seed, () => {
    const Rn = rng(seed * 7 + 29), out = [];
    for (let i = 0; i < 6; i++) {
      if (G.kind === 'pine') {
        const tier = i % 3, baseY = G.bottom - tier * G.R * 0.45, hw = G.R * (1.0 - tier * 0.2);
        const side = (i & 1) ? 1 : -1, f = 0.35 + 0.45 * Rn();
        out.push([side * hw * f, baseY - G.cy + 0.12]);
      } else {
        const a = PI * 0.12 + (i * 0.37 % 1) * PI * 0.76, d = G.R * (0.55 + 0.18 * Rn());
        out.push([Math.cos(a) * d * ((i & 1) ? 1 : -1), Math.sin(a) * d * 0.6 + G.R * 0.05]);
      }
    }
    return out;
  });
}
function drawTreeNuts(ctx, G, P, nuts, seed, lw, shake, time) {
  if (!nuts) return;
  const slots = treeNutSlots(G, seed), cx = G.tx(G.cy);
  const type = P.nut, s = type === 'burr' ? 0.25 : type === 'pinecone' ? 0.21 : 0.19;
  for (let i = 0; i < nuts; i++) {
    const p = slots[i], nx = cx + p[0], ny = G.cy + p[1];
    const sw = Math.sin(time * 2 + i) * 0.05 + shake * Math.sin(time * 13 + i * 2) * 0.45;
    ctx.save();
    ctx.translate(nx, ny - s * 1.3); ctx.rotate(sw);
    ctx.beginPath(); ctx.moveTo(0, -0.14); ctx.lineTo(0, s * 0.4);
    ctx.strokeStyle = '#3a2410'; ctx.lineWidth = 0.035; ctx.stroke();
    if (type !== 'pinecone') {
      ctx.beginPath(); leafShapeAt(ctx, 0.1, -0.1, 0.1, 0.05, -0.5); ctx.fillStyle = P.leafCol; ctx.fill();
      ctx.lineWidth = lw * 0.6; ctx.strokeStyle = P.leafLine; ctx.stroke();
    }
    drawMiniNut(ctx, type, 0, s * 1.3, s, 0, lw * 0.9);
    ctx.restore();
  }
}
function drawFallingLeaves(ctx, G, P, shake, time, seed) {
  ctx.save();
  const cx = G.tx(G.cy);
  for (let i = 0; i < 6; i++) {
    const ph = frac(time * 0.5 + i / 6);
    const x = cx + (hash(i, seed) - 0.5) * G.R * 1.6 + Math.sin(ph * 7 + i) * 0.35;
    const y = G.bottom - G.R * 0.2 + ph * 3.0;
    ctx.globalAlpha = clamp(shake * 1.6, 0, 1) * (1 - ph);
    ctx.beginPath(); leafShapeAt(ctx, x, y, 0.12, 0.06, ph * 9 + i);
    ctx.fillStyle = G.kind === 'pine' ? P.leaf[1] : P.leafCol; ctx.fill();
    ctx.lineWidth = 0.02; ctx.strokeStyle = P.leafLine; ctx.stroke();
  }
  ctx.restore();
}

export function drawTree(ctx, t) {
  if (!t) return;
  const G = treeGeom(t), P = TREE_P[G.kind];
  const time = +t.time || 0, shake = clamp(+t.shake || 0, 0, 1);
  const hp = t.hp01 == null ? 1 : clamp(+t.hp01, 0, 1);
  const seed = t.seed | 0, nuts = clamp(Math.round(+t.nuts || 0), 0, 6);
  const lw = 0.04;
  ctx.save();
  ctx.translate(+t.x || 0, +t.y || 0);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  drawTreeBranch(ctx, G, P, lw, time);
  drawTrunk(ctx, G, P, lw, seed, hp, time);
  const sway = Math.sin(time * 1.1 + seed) * 0.012 + shake * Math.sin(time * 17) * 0.075;
  const px = G.tx(G.bottom), py = G.bottom;
  ctx.save();
  ctx.translate(px, py); ctx.rotate(sway); ctx.translate(-px, -py);
  if (G.kind === 'pine') drawPineCanopy(ctx, G, P, lw, seed, shake, time);
  else drawRoundCanopy(ctx, G, P, lw, seed, shake, time);
  drawTreeNuts(ctx, G, P, nuts, seed, lw, shake, time);
  ctx.restore();
  if (shake > 0.03) drawFallingLeaves(ctx, G, P, shake, time, seed);
  ctx.restore();
}

// --- fallen tree (physics box len × 0.7)
export function drawFallenTree(ctx, f) {
  if (!f) return;
  const kind = TREE_P[f.kind] ? f.kind : 'oak', P = TREE_P[kind];
  const len = Math.max(1, +f.len || 4), seed = f.seed | 0, lw = 0.04;
  const r0 = 0.35, r1 = 0.24, L2 = len / 2;
  ctx.save();
  ctx.translate(+f.x || 0, +f.y || 0);
  if (f.angle) ctx.rotate(f.angle);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // leafy twigs still attached (behind the log)
  const tw = [[L2 - 0.2, -0.05, -0.55, 0.85], [L2 - 0.1, 0.0, -0.08, 0.65], [L2 - 0.4, -0.12, -1.05, 0.7], [len * 0.12, -0.3, -1.25, 0.55], [len * 0.32, -0.28, -0.8, 0.5]];
  ctx.beginPath();
  const tips = [];
  for (const t of tw) {
    const ex = t[0] + Math.cos(t[2]) * t[3], ey = t[1] + Math.sin(t[2]) * t[3];
    ctx.moveTo(t[0], t[1]); ctx.quadraticCurveTo(t[0] + Math.cos(t[2] - 0.3) * t[3] * 0.5, t[1] + Math.sin(t[2] - 0.3) * t[3] * 0.5, ex, ey);
    tips.push([ex, ey, t[2]]);
  }
  ctx.strokeStyle = P.line; ctx.lineWidth = 0.07 + lw; ctx.stroke();
  ctx.strokeStyle = P.bark; ctx.lineWidth = 0.07; ctx.stroke();
  ctx.beginPath();
  for (const p of tips) {
    if (kind === 'pine') {
      for (let k = -3; k <= 3; k++) { const a = p[2] + k * 0.3; ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] + Math.cos(a) * 0.22, p[1] + Math.sin(a) * 0.22); }
    } else {
      leafShapeAt(ctx, p[0] + Math.cos(p[2]) * 0.12, p[1] + Math.sin(p[2]) * 0.12, 0.16, 0.08, p[2]);
      leafShapeAt(ctx, p[0] + Math.cos(p[2] + 1.0) * 0.12, p[1] + Math.sin(p[2] + 1.0) * 0.12, 0.13, 0.065, p[2] + 1.0);
      leafShapeAt(ctx, p[0] + Math.cos(p[2] - 1.0) * 0.12, p[1] + Math.sin(p[2] - 1.0) * 0.12, 0.13, 0.065, p[2] - 1.0);
    }
  }
  if (kind === 'pine') { ctx.strokeStyle = P.leafLine; ctx.lineWidth = 0.06; ctx.stroke(); ctx.strokeStyle = P.leaf[1]; ctx.lineWidth = 0.035; ctx.stroke(); }
  else { ctx.fillStyle = P.leafCol; ctx.fill(); ctx.lineWidth = lw * 0.7; ctx.strokeStyle = P.leafLine; ctx.stroke(); }
  // log body with a splintered broken end on the left
  const J = [[-L2 - 0.08, r0 * 0.7], [-L2 + 0.1, r0 * 0.35], [-L2 - 0.13, 0.02], [-L2 + 0.06, -r0 * 0.35], [-L2 - 0.06, -r0 * 0.72]];
  const body = () => {
    ctx.moveTo(-L2 + 0.08, -r0);
    ctx.lineTo(L2 - 0.15, -r1);
    ctx.quadraticCurveTo(L2 + 0.06, -r1, L2 + 0.06, 0);
    ctx.quadraticCurveTo(L2 + 0.06, r1, L2 - 0.15, r1);
    ctx.lineTo(-L2 + 0.08, r0);
    for (const p of J) ctx.lineTo(p[0], p[1]);
    ctx.closePath();
  };
  ctx.beginPath(); body();
  ctx.fillStyle = cgrad(ctx, 'fallen' + kind, () => {
    const g = ctx.createLinearGradient(0, -r0, 0, r0);
    g.addColorStop(0, P.bark); g.addColorStop(0.25, P.barkHi); g.addColorStop(0.6, P.bark); g.addColorStop(1, P.barkLo);
    return g;
  });
  ctx.fill();
  const Rg = rng(seed * 11 + 3);
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const yy = -0.24 + i * 0.1 + (Rg() - 0.5) * 0.04, xs = -L2 + 0.35 + Rg() * len * 0.2, xe = L2 - 0.3 - Rg() * len * 0.2;
    const n = Math.max(2, Math.round((xe - xs) / 0.4));
    ctx.moveTo(xs, yy * (1 - 0.3 * 0));
    for (let k = 1; k <= n; k++) ctx.quadraticCurveTo(xs + (xe - xs) * (k - 0.5) / n, yy + Math.sin(k * 2.1 + i) * 0.02, xs + (xe - xs) * k / n, yy * (1 - 0.3 * k / n));
  }
  ctx.strokeStyle = rgba(P.barkLo, 0.65); ctx.lineWidth = lw * 0.8; ctx.stroke();
  const kx = -L2 + len * (0.4 + 0.3 * Rg());
  ctx.beginPath(); ctx.ellipse(kx, 0.05, 0.1, 0.07, 0, 0, TAU); ctx.fillStyle = P.barkLo; ctx.fill();
  ctx.beginPath(); ctx.ellipse(kx, 0.05, 0.045, 0.03, 0, 0, TAU); ctx.fillStyle = P.barkHi; ctx.fill();
  // splinter zone
  ctx.beginPath();
  ctx.moveTo(-L2 + 0.08, -r0 + 0.01);
  ctx.lineTo(-L2 + 0.26, -r0 + 0.03); ctx.lineTo(-L2 + 0.2, -0.1); ctx.lineTo(-L2 + 0.3, 0.08); ctx.lineTo(-L2 + 0.22, r0 - 0.03); ctx.lineTo(-L2 + 0.08, r0 - 0.01);
  for (const p of J) ctx.lineTo(p[0], p[1]);
  ctx.closePath();
  ctx.fillStyle = '#e8c48a'; ctx.fill();
  ctx.beginPath();
  for (const p of J) { ctx.moveTo(p[0] + 0.02, p[1]); ctx.lineTo(p[0] + 0.2, p[1] * 0.9); }
  ctx.strokeStyle = 'rgba(120,70,30,0.7)'; ctx.lineWidth = lw * 0.6; ctx.stroke();
  ctx.beginPath(); body();
  ctx.lineWidth = lw; ctx.strokeStyle = P.line; ctx.stroke();
  ctx.restore();
}

// --- stump left behind (s.y = ground)
export function drawStump(ctx, s) {
  if (!s) return;
  const kind = TREE_P[s.kind] ? s.kind : 'oak', P = TREE_P[kind];
  const w = Math.max(0.3, +s.w || 0.9), h = Math.max(0.2, +s.h || 0.6), seed = s.seed | 0, lw = 0.04;
  const D = blockDetail('stump' + w + 'x' + h + 's' + seed, () => {
    const R = rng(seed * 17 + 5), top = [];
    const n = 7;
    for (let i = 0; i <= n; i++) top.push([-w * 0.46 + w * 0.92 * i / n, -h * (0.78 + ((i & 1) ? 0.22 : 0.02) * (0.6 + 0.8 * R()))]);
    return { top };
  });
  ctx.save();
  ctx.translate(+s.x || 0, +s.y || 0);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const body = () => {
    ctx.moveTo(D.top[0][0], D.top[0][1]);
    for (let i = 1; i < D.top.length; i++) ctx.lineTo(D.top[i][0], D.top[i][1]);
    ctx.bezierCurveTo(w * 0.48, -h * 0.4, w * 0.5, -0.05, w * 0.5 + 0.22, 0.14);
    ctx.quadraticCurveTo(w * 0.3, 0.1, w * 0.12, 0.2);
    ctx.quadraticCurveTo(-w * 0.1, 0.08, -w * 0.3, 0.12);
    ctx.quadraticCurveTo(-w * 0.45, 0.1, -w * 0.5 - 0.2, 0.15);
    ctx.bezierCurveTo(-w * 0.5, -0.05, -w * 0.48, -h * 0.4, D.top[0][0], D.top[0][1]);
    ctx.closePath();
  };
  ctx.beginPath(); body();
  const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  g.addColorStop(0, P.bark); g.addColorStop(0.3, P.barkHi); g.addColorStop(0.62, P.bark); g.addColorStop(1, P.barkLo);
  ctx.fillStyle = g; ctx.fill();
  ctx.beginPath();
  for (const k of [-0.3, -0.12, 0.06, 0.24]) { ctx.moveTo(k * w, 0.08); ctx.quadraticCurveTo(k * w + 0.03, -h * 0.35, k * w * 0.96, -h * 0.7); }
  ctx.strokeStyle = rgba(P.barkLo, 0.65); ctx.lineWidth = lw * 0.9; ctx.stroke();
  // broken pale top with splinters
  ctx.beginPath();
  ctx.moveTo(D.top[0][0], D.top[0][1]);
  for (let i = 1; i < D.top.length; i++) ctx.lineTo(D.top[i][0], D.top[i][1]);
  ctx.quadraticCurveTo(0, -h * 0.58, D.top[0][0], D.top[0][1]);
  ctx.closePath();
  ctx.fillStyle = '#e8c48a'; ctx.fill();
  ctx.beginPath();
  for (let i = 1; i < D.top.length - 1; i += 2) { ctx.moveTo(D.top[i][0], D.top[i][1] + 0.02); ctx.lineTo(D.top[i][0] * 0.9, -h * 0.66); }
  ctx.moveTo(-w * 0.3, -h * 0.68); ctx.quadraticCurveTo(0, -h * 0.62, w * 0.3, -h * 0.7);
  ctx.strokeStyle = 'rgba(130,76,32,0.7)'; ctx.lineWidth = lw * 0.6; ctx.stroke();
  ctx.beginPath(); body();
  ctx.lineWidth = lw; ctx.strokeStyle = P.line; ctx.stroke();
  ctx.restore();
}

// --- spider web
export function drawWeb(ctx, w) {
  if (!w) return;
  const x = +w.x || 0, y = +w.y || 0, r = Math.max(0.2, +w.r || 1), seed = w.seed | 0;
  const broken = clamp(+w.broken || 0, 0, 1), wob = clamp(+w.wobble || 0, 0, 1), time = +w.time || 0;
  const anchors = Array.isArray(w.anchors) ? w.anchors : [];
  const D = blockDetail('web' + r + 's' + seed, () => {
    const R = rng(seed * 23 + 1), N = 11, sp = [];
    for (let i = 0; i < N; i++) sp.push([i * TAU / N + (R() - 0.5) * 0.25, r * (0.88 + R() * 0.12)]);
    const keep = [];
    for (let i = 0; i < 200; i++) keep.push(R());
    const dew = [];
    for (let i = 0; i < 8; i++) dew.push([Math.floor(R() * N), 2 + Math.floor(R() * 5), R()]);
    return { N, sp, keep, dew };
  });
  const K = 7;
  const P = (i, f) => {
    const s = D.sp[i % D.N], a = s[0], d = s[1] * f;
    let px = Math.cos(a) * d, py = Math.sin(a) * d;
    if (wob > 0) { px += Math.sin(time * 11 + a * 2) * wob * 0.06 * r * f; py += Math.cos(time * 9 + a * 3) * wob * 0.06 * r * f; }
    return [x + px, y + py];
  };
  const alive = (k) => D.keep[k % D.keep.length] >= broken;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  // anchor threads from the nearest rim spoke
  for (let j = 0; j < anchors.length; j++) {
    const an = anchors[j];
    if (!an || !alive(150 + j)) continue;
    let best = 0, bd = 1e9;
    for (let i = 0; i < D.N; i++) { const p = P(i, 1); const d = Math.hypot(p[0] - an.x, p[1] - an.y); if (d < bd) { bd = d; best = i; } }
    const p = P(best, 1);
    ctx.moveTo(p[0], p[1]); ctx.lineTo(+an.x, +an.y);
  }
  // spokes
  for (let i = 0; i < D.N; i++) {
    if (!alive(i)) continue;
    const c = P(i, 0.06), e = P(i, 1);
    ctx.moveTo(c[0], c[1]); ctx.lineTo(e[0], e[1]);
  }
  // spiral rings with a little sag
  for (let k = 1; k <= K; k++) {
    const f = 0.16 + 0.8 * k / K;
    for (let i = 0; i < D.N; i++) {
      if (!alive(20 + k * D.N + i)) continue;
      const a = P(i, f), b = P(i + 1, f);
      ctx.moveTo(a[0], a[1]); ctx.quadraticCurveTo((a[0] + b[0]) / 2 * 0.93 + x * 0.07, (a[1] + b[1]) / 2 * 0.93 + y * 0.07 + 0.02 * r, b[0], b[1]);
    }
  }
  // dangling torn strands
  if (broken > 0) {
    for (let j = 0; j < 4; j++) {
      const base = j < anchors.length && anchors[j] ? [+anchors[j].x, +anchors[j].y] : P(j * 3, 0.9);
      const len = r * (0.35 + 0.5 * broken) * (0.6 + 0.4 * D.keep[190 + j]);
      const sw = Math.sin(time * 2.5 + j) * 0.12 * r;
      ctx.moveTo(base[0], base[1]); ctx.quadraticCurveTo(base[0] + sw * 0.5, base[1] + len * 0.5, base[0] + sw, base[1] + len);
    }
  }
  ctx.strokeStyle = 'rgba(52,62,90,0.42)'; ctx.lineWidth = 0.04; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 0.02; ctx.stroke();
  // dew drops
  ctx.beginPath();
  const glints = [];
  for (const dw of D.dew) {
    if (!alive(20 + dw[1] * D.N + dw[0])) continue;
    const f = 0.16 + 0.8 * dw[1] / K, p0 = P(dw[0], f), p1 = P(dw[0] + 1, f), t = 0.15 + dw[2] * 0.7;
    const p = [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t + 0.015];
    ctx.moveTo(p[0] + 0.03, p[1]); ctx.arc(p[0], p[1], 0.03, 0, TAU);
    glints.push(p);
  }
  ctx.fillStyle = 'rgba(200,236,255,0.9)'; ctx.fill();
  ctx.lineWidth = 0.008; ctx.strokeStyle = 'rgba(60,110,150,0.6)'; ctx.stroke();
  ctx.beginPath();
  for (let i = 0; i < glints.length; i++) {
    const p = glints[i];
    ctx.moveTo(p[0] - 0.005, p[1] - 0.01); ctx.arc(p[0] - 0.01, p[1] - 0.01, 0.01, 0, TAU);
    if (Math.sin(time * 3 + i * 2.1) > 0.75) starPath(ctx, p[0] - 0.01, p[1] - 0.01, 0.06, 0.012, 4, 0);
  }
  ctx.fillStyle = '#ffffff'; ctx.fill();
  // cute angry spider at the hub
  if (broken < 0.9) drawSpider(ctx, x, y + Math.sin(time * 2.2) * 0.02 * r, clamp(r, 0.6, 1.4) * 0.13, time, wob);
  ctx.restore();
}
function drawSpider(ctx, x, y, s, time, wob) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(s, s);
  const l = 0.03 / s;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // legs
  ctx.beginPath();
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const a = (-0.7 + i * 0.45) , wig = Math.sin(time * 8 + i + side) * 0.08 * (1 + wob * 2);
      const kx = side * (1.05 + 0.1 * Math.cos(a)), ky = Math.sin(a) * 0.9 - 0.45 + wig;
      ctx.moveTo(side * 0.5, Math.sin(a) * 0.4);
      ctx.quadraticCurveTo(side * 0.8, ky - 0.2, kx, ky);
      ctx.lineTo(side * (1.35 + 0.1 * i * 0.2), ky + 0.55 + i * 0.12);
    }
  }
  ctx.strokeStyle = '#1e1428'; ctx.lineWidth = 0.16; ctx.stroke();
  // body
  ctx.beginPath(); ctx.arc(0, 0, 0.72, 0, TAU);
  ctx.fillStyle = cgrad(ctx, 'spider', () => {
    const g = ctx.createRadialGradient(-0.25, -0.3, 0.05, 0, 0, 0.8);
    g.addColorStop(0, '#6e5a8a'); g.addColorStop(0.55, '#3a2c50'); g.addColorStop(1, '#1e1428');
    return g;
  });
  ctx.fill();
  ctx.lineWidth = l * 1.2; ctx.strokeStyle = '#120a18'; ctx.stroke();
  // eyes, brows, blush
  ctx.beginPath(); ctx.arc(-0.26, -0.08, 0.22, 0, TAU); ctx.arc(0.26, -0.08, 0.22, 0, TAU);
  ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.lineWidth = l * 0.8; ctx.stroke();
  ctx.beginPath(); ctx.arc(-0.22, -0.04, 0.12, 0, TAU); ctx.arc(0.22, -0.04, 0.12, 0, TAU);
  ctx.fillStyle = '#120a18'; ctx.fill();
  ctx.beginPath(); ctx.arc(-0.25, -0.08, 0.045, 0, TAU); ctx.arc(0.19, -0.08, 0.045, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(-0.5, -0.42); ctx.lineTo(-0.1, -0.3); ctx.moveTo(0.5, -0.42); ctx.lineTo(0.1, -0.3);
  ctx.strokeStyle = '#0a0610'; ctx.lineWidth = 0.13; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(-0.42, 0.25, 0.14, 0.08, 0, 0, TAU); ctx.ellipse(0.42, 0.25, 0.14, 0.08, 0, 0, TAU);
  ctx.fillStyle = 'rgba(255,120,160,0.55)'; ctx.fill();
  ctx.beginPath(); ctx.moveTo(-0.12, 0.34); ctx.quadraticCurveTo(0, 0.24, 0.12, 0.34);
  ctx.strokeStyle = '#0a0610'; ctx.lineWidth = l * 0.9; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(-0.3, -0.5, 0.18, 0.08, -0.5, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill();
  ctx.restore();
}

// --- dandelion
export function drawDandelion(ctx, d) {
  if (!d) return;
  const x = +d.x || 0, y = +d.y || 0, h = Math.max(0.3, +d.h || 1.1), hr = Math.max(0.1, +d.headR || 0.45);
  const blown = clamp(+d.blown || 0, 0, 1), time = +d.time || 0, seed = d.seed | 0, lw = 0.03;
  const D = blockDetail('dnd' + hr + 's' + seed, () => {
    const R = rng(seed * 31 + 9), seeds = [];
    for (let i = 0; i < 40; i++) { const a = i * 2.39996 + R() * 0.3; seeds.push([Math.cos(a), Math.sin(a), 0.78 + R() * 0.22, R()]); }
    seeds.sort((a, b) => a[3] - b[3]);
    return { seeds, curve: (R() - 0.5) * 0.3 };
  });
  const sway = Math.sin(time * 1.6 + seed) * 0.05;
  const hx = x + Math.sin(sway) * h + D.curve * h * 0.3, hy = y - Math.cos(sway) * h;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // jagged base leaves
  ctx.beginPath();
  for (const side of [-1, 1, -0.55, 0.6]) {
    const L = h * (Math.abs(side) > 0.9 ? 0.5 : 0.36), dir = Math.sign(side), up = Math.abs(side) > 0.9 ? 0.12 : 0.32;
    ctx.moveTo(x, y);
    for (let k = 1; k <= 4; k++) {
      const u = k / 4;
      ctx.lineTo(x + dir * L * (u - 0.08), y - L * up * u - L * 0.14 * (1 - u) * 0.5 - L * 0.1);
      ctx.lineTo(x + dir * L * u, y - L * up * u - 0.01);
    }
    ctx.quadraticCurveTo(x + dir * L * 0.5, y + 0.02, x, y);
  }
  ctx.fillStyle = '#5ea83a'; ctx.fill();
  ctx.lineWidth = lw; ctx.strokeStyle = '#1e4a10'; ctx.stroke();
  // stem
  ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + D.curve * h * 0.6 + sway * h * 0.3, y - h * 0.55, hx, hy);
  ctx.strokeStyle = '#1e4a10'; ctx.lineWidth = 0.05 + lw; ctx.stroke();
  ctx.strokeStyle = '#72b442'; ctx.lineWidth = 0.05; ctx.stroke();
  ctx.strokeStyle = 'rgba(210,250,170,0.6)'; ctx.lineWidth = 0.015; ctx.stroke();
  // seed puff
  const shown = Math.round(D.seeds.length * (1 - blown));
  if (shown > 0) {
    ctx.fillStyle = cgrad(ctx, 'dandhalo' + hr, () => {
      const g = ctx.createRadialGradient(-hr * 0.25, -hr * 0.25, hr * 0.05, 0, 0, hr * 1.05);
      g.addColorStop(0, 'rgba(255,255,255,0.75)'); g.addColorStop(0.7, 'rgba(250,252,255,0.45)'); g.addColorStop(1, 'rgba(240,245,255,0.1)');
      return g;
    });
    ctx.save(); ctx.translate(hx, hy);
    ctx.globalAlpha = 0.35 + 0.65 * (1 - blown);
    ctx.beginPath(); ctx.arc(0, 0, hr * 1.02, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    for (let i = 0; i < shown; i++) {
      const s = D.seeds[i], ex = s[0] * hr * s[2], ey = s[1] * hr * s[2], t = hr * 0.13;
      ctx.moveTo(s[0] * hr * 0.12, s[1] * hr * 0.12); ctx.lineTo(ex, ey);
      for (let k = -2; k <= 2; k++) { const a = Math.atan2(s[1], s[0]) + k * 0.45; ctx.moveTo(ex, ey); ctx.lineTo(ex + Math.cos(a) * t, ey + Math.sin(a) * t); }
    }
    ctx.strokeStyle = 'rgba(120,130,150,0.45)'; ctx.lineWidth = 0.02; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 0.01; ctx.stroke();
    ctx.restore();
  }
  // drifting seeds while being blown
  if (blown > 0 && blown < 1) {
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const ph = frac(time * 0.35 + i / 4), sx = hx + ph * 2.2 + Math.sin(ph * 6 + i) * 0.1, sy = hy - ph * 1.0 + Math.cos(ph * 5 + i) * 0.08;
      ctx.moveTo(sx, sy); ctx.lineTo(sx - 0.04, sy + 0.12);
      for (let k = -2; k <= 2; k++) { const a = -PI / 2 + k * 0.5; ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(a) * 0.06, sy + Math.sin(a) * 0.06); }
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 0.012; ctx.stroke();
  }
  // green nub / receptacle
  const nr = hr * (0.12 + 0.08 * blown);
  ctx.beginPath(); ctx.arc(hx, hy, nr, 0, TAU);
  ctx.fillStyle = blown > 0.8 ? '#7ab84a' : '#a89a5a'; ctx.fill();
  ctx.lineWidth = lw * 0.8; ctx.strokeStyle = '#2a4a14'; ctx.stroke();
  if (blown > 0.6) {
    ctx.beginPath();
    for (const a of [0.5, 1.2, 1.9, 2.6]) { ctx.moveTo(hx + Math.cos(a) * nr, hy + Math.sin(a) * nr); ctx.quadraticCurveTo(hx + Math.cos(a) * nr * 1.8, hy + Math.sin(a) * nr * 1.6, hx + Math.cos(a) * nr * 1.6, hy + nr * 2.2); }
    ctx.strokeStyle = '#5a9a34'; ctx.lineWidth = 0.025; ctx.stroke();
  }
  ctx.restore();
}

// --- home trees (scenery behind each captain; drawn before the terrain)
const HOME_P = [
  { bark: '#8e7058', barkHi: '#b8a08a', barkLo: '#5e4a3a', line: '#4a3a2e', leaf: ['#4e7c44', '#6a9a58', '#a6c88c'], team: '#f0572f', teamDark: '#7a2a14' },
  { bark: '#8e6450', barkHi: '#b8927c', barkLo: '#5e3e30', line: '#4a3226', leaf: ['#3a5e48', '#4f7a5c', '#8aae90'], team: '#2f9be8', teamDark: '#16507a' },
];
function homeTrunkPath(ctx, top, wTop, wBase) {
  ctx.moveTo(-wBase / 2 - 0.1, 2.0);
  ctx.lineTo(-wBase / 2 - 0.2, 0.25);
  ctx.quadraticCurveTo(-wBase / 2 - 0.5, 0.06, -wBase / 2 - 0.7, 0.1);
  ctx.quadraticCurveTo(-wBase / 2 - 0.15, -0.2, -wBase / 2, -1.0);
  ctx.bezierCurveTo(-wBase / 2 + 0.15, -3.0, -wTop / 2 - 0.05, top * 0.7, -wTop / 2, top);
  ctx.lineTo(wTop / 2, top);
  ctx.bezierCurveTo(wTop / 2 + 0.05, top * 0.7, wBase / 2 - 0.15, -3.0, wBase / 2, -1.0);
  ctx.quadraticCurveTo(wBase / 2 + 0.15, -0.2, wBase / 2 + 0.7, 0.1);
  ctx.quadraticCurveTo(wBase / 2 + 0.5, 0.06, wBase / 2 + 0.2, 0.25);
  ctx.lineTo(wBase / 2 + 0.1, 2.0);
  ctx.closePath();
}
export function drawHomeTree(ctx, h) {
  if (!h) return;
  const team = h.team ? 1 : 0, f = h.facing < 0 ? -1 : 1, time = +h.time || 0, seed = h.seed | 0;
  const P = HOME_P[team], lw = 0.045, pine = team === 1;
  const top = pine ? -9.0 : -6.4, wTop = pine ? 1.1 : 1.7, wBase = pine ? 2.1 : 2.4;
  ctx.save();
  ctx.translate(+h.x || 0, +h.y || 0);
  ctx.scale(f, 1);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const lx = -0.6 * f;                          // light offset (upper-left in render space)
  // big limbs reaching into the canopy (oak)
  if (!pine) {
    ctx.beginPath();
    taperPath(ctx, -0.3, -5.2, -1.4, -6.0, -2.3, -7.2, 0.7, 0.25, 8, false, true);
    taperPath(ctx, 0.3, -5.6, 1.3, -6.3, 2.1, -7.6, 0.6, 0.22, 8, false, true);
    ctx.fillStyle = P.bark; ctx.fill();
    ctx.lineWidth = lw; ctx.strokeStyle = P.line; ctx.stroke();
  }
  // trunk
  ctx.beginPath(); homeTrunkPath(ctx, top, wTop, wBase);
  const tg = ctx.createLinearGradient(-wBase / 2, 0, wBase / 2, 0);
  const lit = f > 0 ? [P.barkHi, P.bark, P.barkLo] : [P.barkLo, P.bark, P.barkHi];
  tg.addColorStop(0, mix(lit[0], P.bark, 0.3)); tg.addColorStop(0.5, lit[1]); tg.addColorStop(1, mix(lit[2], P.bark, 0.3));
  ctx.fillStyle = tg; ctx.fill();
  ctx.beginPath();
  for (const k of [-0.36, -0.2, -0.05, 0.1, 0.26, 0.4]) {
    ctx.moveTo(k * wBase, 1.8);
    const n = 8;
    for (let i = 1; i <= n; i++) {
      const yy = 1.8 + (top - 1.8) * i / n, ww = wBase + (wTop - wBase) * i / n;
      ctx.quadraticCurveTo(k * ww + Math.sin(i * 1.9 + k * 13) * 0.08, yy - (top - 1.8) / n * 0.5, k * ww, yy);
    }
  }
  ctx.strokeStyle = rgba(P.barkLo, 0.5); ctx.lineWidth = lw * 1.1; ctx.stroke();
  ctx.lineWidth = lw; ctx.strokeStyle = P.line;
  ctx.beginPath(); homeTrunkPath(ctx, top, wTop, wBase); ctx.stroke();
  // round wooden door
  const dx = 0.35, dw = 1.1, dh = 1.6;
  ctx.beginPath(); ctx.moveTo(dx - dw / 2 - 0.12, -0.02); ctx.lineTo(dx - dw / 2 - 0.12, -dh + dw / 2); ctx.arc(dx, -dh + dw / 2, dw / 2 + 0.12, PI, 0); ctx.lineTo(dx + dw / 2 + 0.12, -0.02); ctx.closePath();
  ctx.fillStyle = P.barkLo; ctx.fill();
  const door = () => { ctx.moveTo(dx - dw / 2, -0.02); ctx.lineTo(dx - dw / 2, -dh + dw / 2); ctx.arc(dx, -dh + dw / 2, dw / 2, PI, 0); ctx.lineTo(dx + dw / 2, -0.02); ctx.closePath(); };
  ctx.beginPath(); door();
  const dg = ctx.createLinearGradient(dx - dw / 2, 0, dx + dw / 2, 0);
  dg.addColorStop(0, '#c49064'); dg.addColorStop(1, '#8e6040');
  ctx.fillStyle = dg; ctx.fill();
  ctx.beginPath();
  for (const k of [-0.25, 0, 0.25]) { ctx.moveTo(dx + k * dw, -0.04); ctx.lineTo(dx + k * dw, -dh + dw / 2 - Math.sqrt(Math.max(0, 0.25 - k * k)) * dw + 0.04); }
  ctx.strokeStyle = 'rgba(80,50,30,0.55)'; ctx.lineWidth = lw * 0.8; ctx.stroke();
  ctx.beginPath(); ctx.rect(dx - dw / 2, -dh * 0.72, dw * 0.55, 0.08); ctx.rect(dx - dw / 2, -dh * 0.3, dw * 0.55, 0.08);
  ctx.fillStyle = '#5e4a3a'; ctx.fill();
  ctx.beginPath(); ctx.arc(dx + dw * 0.3, -dh * 0.45, 0.07, 0, TAU); ctx.fillStyle = '#e0b85a'; ctx.fill();
  ctx.lineWidth = lw * 0.6; ctx.strokeStyle = '#6a4a1a'; ctx.stroke();
  ctx.beginPath(); door(); ctx.lineWidth = lw; ctx.strokeStyle = P.line; ctx.stroke();
  // carved emblem above the door
  ctx.save(); ctx.translate(dx, -dh - 0.55); ctx.scale(0.3, 0.3);
  ctx.beginPath();
  if (pine) { ctx.ellipse(0, 0.1, 0.62, 0.95, 0, 0, TAU); }
  else { acornBodyPath(ctx); acornCapPath(ctx); }
  ctx.fillStyle = mix(P.barkHi, P.bark, 0.35); ctx.fill();
  ctx.lineWidth = 0.14; ctx.strokeStyle = rgba(P.barkLo, 0.9); ctx.stroke();
  if (pine) {
    ctx.beginPath();
    for (const yy of [-0.45, -0.1, 0.25, 0.6]) { ctx.moveTo(-0.5, yy); ctx.quadraticCurveTo(-0.25, yy + 0.25, 0, yy); ctx.quadraticCurveTo(0.25, yy + 0.25, 0.5, yy); }
    ctx.strokeStyle = rgba(P.barkLo, 0.8); ctx.lineWidth = 0.1; ctx.stroke();
  }
  ctx.restore();
  // round window with warm light
  const wx = -0.62, wy = -3.6, wr = 0.38;
  ctx.fillStyle = cgrad(ctx, 'homeglow', () => {
    const g = ctx.createRadialGradient(0, 0, 0.2, 0, 0, 1.2);
    g.addColorStop(0, 'rgba(255,214,120,0.45)'); g.addColorStop(1, 'rgba(255,190,90,0)');
    return g;
  });
  ctx.save(); ctx.translate(wx, wy);
  ctx.globalAlpha = 0.85 + 0.15 * Math.sin(time * 2.3 + seed);
  ctx.beginPath(); ctx.arc(0, 0, 1.2, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
  ctx.beginPath(); ctx.arc(0, 0, wr + 0.1, 0, TAU); ctx.fillStyle = '#7a5a40'; ctx.fill();
  ctx.lineWidth = lw; ctx.strokeStyle = P.line; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, wr, 0, TAU);
  ctx.fillStyle = cgrad(ctx, 'homewin', () => {
    const g = ctx.createRadialGradient(-0.08, -0.08, 0.02, 0, 0, 0.4);
    g.addColorStop(0, '#fff6c4'); g.addColorStop(0.6, '#ffc860'); g.addColorStop(1, '#e88a2a');
    return g;
  });
  ctx.fill();
  ctx.beginPath(); ctx.moveTo(-wr, 0); ctx.lineTo(wr, 0); ctx.moveTo(0, -wr); ctx.lineTo(0, wr);
  ctx.strokeStyle = '#7a5a40'; ctx.lineWidth = 0.06; ctx.stroke();
  ctx.restore();
  // window ledge + rope ladder
  ctx.beginPath(); roundRectPath(ctx, wx - 0.55, wy + wr + 0.08, 1.1, 0.1, 0.04);
  ctx.fillStyle = '#9a7454'; ctx.fill(); ctx.lineWidth = lw * 0.8; ctx.strokeStyle = P.line; ctx.stroke();
  const lt = wy + wr + 0.16, lxl = wx - 0.26, lxr = wx + 0.26, swing = Math.sin(time * 1.3 + seed) * 0.04;
  ctx.beginPath();
  ctx.moveTo(lxl, lt); ctx.quadraticCurveTo(lxl - 0.05 + swing, lt * 0.5, lxl - 0.02 + swing * 2, -0.02);
  ctx.moveTo(lxr, lt); ctx.quadraticCurveTo(lxr - 0.05 + swing, lt * 0.5, lxr - 0.02 + swing * 2, -0.02);
  ctx.strokeStyle = '#6a5034'; ctx.lineWidth = 0.07; ctx.stroke();
  ctx.strokeStyle = '#c8a878'; ctx.lineWidth = 0.035; ctx.stroke();
  ctx.beginPath();
  const rungs = Math.floor((-lt) / 0.38);
  for (let i = 1; i <= rungs; i++) {
    const t = i / (rungs + 0.6), yy = lt + (-0.02 - lt) * t, sx = swing * 2 * t;
    ctx.moveTo(lxl - 0.03 + sx, yy); ctx.lineTo(lxr - 0.03 + sx, yy);
  }
  ctx.strokeStyle = '#5e4630'; ctx.lineWidth = 0.08; ctx.stroke();
  ctx.strokeStyle = '#a88a64'; ctx.lineWidth = 0.045; ctx.stroke();
  // nut pile by the door
  const pileX = dx + dw / 2 + 0.55, pn = pine ? 'pinecone' : 'acorn', ps = pine ? 0.15 : 0.13;
  const pile = [[-0.3, -0.13], [0, -0.13], [0.3, -0.13], [-0.15, -0.38], [0.15, -0.38], [0, -0.62]];
  for (let i = 0; i < pile.length; i++) drawMiniNut(ctx, pn, pileX + pile[i][0], pile[i][1] - (pine ? 0.02 : 0), ps, (i - 2.5) * 0.15, lw * 0.8);
  // canopy (soft, no outline)
  const shade = (k) => mix(P.leaf[k], '#b8c8c0', 0.08);
  if (pine) {
    const tiers = 5, base = -4.7, sp = 1.45, R = 3.7;
    for (let i = 0; i < tiers; i++) {
      const baseY = base - i * sp, hw = R * (1 - i * 0.17), apex = baseY - 2.4;
      ctx.beginPath(); pineTierPath(ctx, 0, apex, baseY, hw, 6 - Math.min(i, 3));
      ctx.fillStyle = shade(0); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-0.1 * f, apex + 0.3);
      ctx.quadraticCurveTo(lx * hw * 0.7, apex + (baseY - apex) * 0.55, lx * hw * 1.4, baseY - 0.05);
      ctx.quadraticCurveTo(lx * hw * 0.6, baseY + 0.12, 0, baseY - 0.25);
      ctx.closePath();
      ctx.fillStyle = shade(1); ctx.fill();
      ctx.beginPath(); ctx.moveTo(lx * 0.1, apex + 0.3); ctx.quadraticCurveTo(lx * hw * 0.66, apex + (baseY - apex) * 0.5, lx * hw * 1.3, baseY - 0.2);
      ctx.strokeStyle = rgba(P.leaf[2], 0.6); ctx.lineWidth = 0.08; ctx.stroke();
    }
  } else {
    const C = canopyBalls(3.5, seed + 77);
    ctx.save(); ctx.translate(0, -8.0);
    const sway = Math.sin(time * 0.9 + seed) * 0.03;
    ctx.rotate(sway * 0.1);
    const B = C.B.map(b => [b[0] * 1.15, b[1], b[2] * 1.05]);
    ctx.beginPath(); circlesPath(ctx, B, 0, 0, 1, null); ctx.fillStyle = shade(0); ctx.fill();
    ctx.beginPath(); circlesPath(ctx, B, lx * 0.18, -0.14, 0.8, null); ctx.fillStyle = shade(1); ctx.fill();
    ctx.beginPath(); circlesPath(ctx, B, lx * 0.45, -0.34, 0.42, null); ctx.fillStyle = rgba(P.leaf[2], 0.75); ctx.fill();
    ctx.beginPath();
    for (const t of C.tex) if (!t[3]) leafShapeAt(ctx, t[0] * 1.15, t[1], t[2] * 0.95, t[2] * 0.42, t[4]);
    ctx.fillStyle = rgba(P.leaf[0], 0.45); ctx.fill();
    ctx.beginPath();
    for (const t of C.tex) if (t[3]) leafShapeAt(ctx, t[0] * 1.15, t[1], t[2] * 0.85, t[2] * 0.38, t[4]);
    ctx.fillStyle = rgba(P.leaf[2], 0.5); ctx.fill();
    ctx.restore();
  }
  // team pennant on a pole sticking out of the trunk
  const px0 = wBase / 2 - 0.15, py0 = pine ? -4.2 : -4.4, px1 = px0 + 1.0, py1 = py0 - 1.3;
  ctx.beginPath(); ctx.moveTo(px0 - 0.2, py0 + 0.1); ctx.lineTo(px1, py1);
  ctx.strokeStyle = P.line; ctx.lineWidth = 0.09 + lw; ctx.stroke();
  ctx.strokeStyle = '#a07a54'; ctx.lineWidth = 0.09; ctx.stroke();
  ctx.beginPath(); ctx.arc(px1, py1, 0.08, 0, TAU); ctx.fillStyle = '#e8c860'; ctx.fill();
  const w1 = Math.sin(time * 4.2 + seed) * 0.1, w2 = Math.sin(time * 4.2 - 1.2 + seed) * 0.14;
  const fx = px1 - 0.02, fy0 = py1 + 0.08, fy1 = py1 + 0.62;
  ctx.beginPath();
  ctx.moveTo(fx, fy0);
  ctx.bezierCurveTo(fx + 0.45, fy0 + w1, fx + 0.9, fy0 + 0.12 - w1, fx + 1.35, (fy0 + fy1) / 2 + w2);
  ctx.bezierCurveTo(fx + 0.9, fy1 - 0.12 - w1, fx + 0.45, fy1 + w1, fx, fy1);
  ctx.closePath();
  ctx.fillStyle = mix(P.team, '#d8d0c8', 0.12); ctx.fill();
  ctx.lineWidth = lw * 0.8; ctx.strokeStyle = P.teamDark; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(fx + 0.05, (fy0 + fy1) / 2); ctx.bezierCurveTo(fx + 0.45, (fy0 + fy1) / 2 + w1 * 0.6, fx + 0.9, (fy0 + fy1) / 2 - w1 * 0.4, fx + 1.2, (fy0 + fy1) / 2 + w2 * 0.9);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.06; ctx.stroke();
  ctx.restore();
}

// ---------------------------------------------------------------------
//  Gameplay events: charging boar, supply drop, HUD event icons
//  (same flat chibi style as the captains: flat fills, one shade tone, one chunky outline)
// ---------------------------------------------------------------------
const EV_INK = '#2b1a12';
const EV_LW = 0.055;

// --- wild boar (local metres: feet on y = 0, facing +x)
const BOAR = {
  body: '#8e5a34', shade: '#6c4024', mane: '#3e2416', leg: '#5e3a22', legFar: '#472a18',
  snout: '#f0b7a0', nostril: '#8a4a3a', tusk: '#fffbea', earIn: '#e89a88',
};
function boarBodyPath(p) {
  p.moveTo(-0.98, -0.62);
  p.bezierCurveTo(-1.0, -1.0, -0.56, -1.16, -0.02, -1.18);
  p.bezierCurveTo(0.42, -1.2, 0.66, -1.08, 0.72, -0.88);
  p.bezierCurveTo(0.78, -0.62, 0.66, -0.36, 0.44, -0.32);
  p.quadraticCurveTo(-0.2, -0.25, -0.66, -0.3);
  p.bezierCurveTo(-0.9, -0.34, -0.98, -0.46, -0.98, -0.62);
  p.closePath();
}
function boarManePath(p) {
  const pts = [[0.62, -1.06], [0.5, -1.38], [0.32, -1.14], [0.18, -1.37], [0.02, -1.14], [-0.14, -1.34], [-0.3, -1.12], [-0.46, -1.28], [-0.58, -1.06], [-0.76, -1.12], [-0.8, -0.94]];
  p.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]);
  p.lineTo(-0.2, -0.9);
  p.closePath();
}
function boarHeadPath(p) { p.moveTo(1.2, -0.76); p.ellipse(0.84, -0.76, 0.36, 0.33, -0.12, 0, TAU); p.closePath(); }
function boarEarsPath(p) {
  p.moveTo(0.54, -0.96); p.lineTo(0.5, -1.24); p.lineTo(0.74, -1.04); p.closePath();
  p.moveTo(0.8, -1.04); p.lineTo(0.9, -1.28); p.lineTo(0.98, -1.02); p.closePath();
}
function boarEarsInPath(p) { p.moveTo(0.57, -1.0); p.lineTo(0.55, -1.16); p.lineTo(0.68, -1.05); p.closePath(); }
function boarSnoutPath(p) { p.moveTo(1.29, -0.63); p.ellipse(1.15, -0.63, 0.14, 0.13, 0, 0, TAU); p.closePath(); }
function boarTusksPath(p) {
  p.moveTo(0.99, -0.44); p.quadraticCurveTo(1.1, -0.47, 1.08, -0.7); p.quadraticCurveTo(1.03, -0.57, 0.94, -0.51); p.closePath();
  p.moveTo(1.24, -0.46); p.quadraticCurveTo(1.35, -0.5, 1.34, -0.7); p.quadraticCurveTo(1.28, -0.58, 1.2, -0.52); p.closePath();
}
function boarTailPath(p) { p.moveTo(-0.96, -0.74); p.quadraticCurveTo(-1.14, -0.76, -1.14, -0.9); p.quadraticCurveTo(-1.13, -1.0, -1.04, -0.96); }

// head (ears, head, snout, tusks, face) — shared by drawBoar and the HUD icon
const BOAR_HEAD_K = 1.2, BOAR_HC = [0.84, -0.8];
function drawBoarHead(ctx, P, lr, hit, lw) {
  ctx.save();
  ctx.translate(BOAR_HC[0], BOAR_HC[1]); ctx.scale(BOAR_HEAD_K, BOAR_HEAD_K); ctx.translate(-BOAR_HC[0], -BOAR_HC[1]);
  lw /= BOAR_HEAD_K;
  const ears = P2('boar:ears', boarEarsPath);
  ctx.fillStyle = P.shade; ctx.fill(ears);
  ctx.fillStyle = BOAR.earIn; ctx.fill(P2('boar:earsIn', boarEarsInPath));
  ctx.strokeStyle = EV_INK; ctx.lineWidth = lw; ctx.stroke(ears);
  const head = P2('boar:head', boarHeadPath);
  ctx.fillStyle = P.body; ctx.fill(head);
  const hs = shadeCrescent('boar:headShade' + lr, head, lr === 'r' ? LIGHT_X : -LIGHT_X, LIGHT_Y, 0.84, -0.76, 0.1, 0.88);
  if (hs) { ctx.fillStyle = P.shade; ctx.fill(hs, 'evenodd'); }
  ctx.stroke(head);
  const snout = P2('boar:snout', boarSnoutPath);
  ctx.fillStyle = P.snout; ctx.fill(snout); ctx.stroke(snout);
  const tusks = P2('boar:tusks', boarTusksPath);
  ctx.fillStyle = BOAR.tusk; ctx.fill(tusks); ctx.lineWidth = lw * 0.8; ctx.stroke(tusks);
  // nostrils + eyes (one ink fill)
  ctx.beginPath();
  ctx.moveTo(1.13, -0.63); ctx.ellipse(1.1, -0.63, 0.03, 0.045, 0, 0, TAU);
  ctx.moveTo(1.23, -0.63); ctx.ellipse(1.2, -0.63, 0.03, 0.045, 0, 0, TAU);
  const shut = hit > 0.35;
  if (!shut) {
    ctx.moveTo(0.83, -0.82); ctx.ellipse(0.76, -0.82, 0.07, 0.095, 0, 0, TAU);
    ctx.moveTo(1.01, -0.85); ctx.ellipse(0.96, -0.85, 0.055, 0.085, 0, 0, TAU);
  }
  ctx.fillStyle = EV_INK; ctx.fill();
  if (!shut) {
    ctx.beginPath();
    ctx.moveTo(0.77, -0.85); ctx.arc(0.745, -0.85, 0.028, 0, TAU);
    ctx.moveTo(0.97, -0.88); ctx.arc(0.95, -0.88, 0.022, 0, TAU);
    ctx.fillStyle = '#ffffff'; ctx.fill();
  }
  // brows in a fierce V (+ squeezed >< eyes when hit)
  ctx.beginPath();
  ctx.moveTo(0.62, -1.0); ctx.lineTo(0.86, -0.92);
  ctx.moveTo(0.9, -0.94); ctx.lineTo(1.06, -1.02);
  if (shut) {
    ctx.moveTo(0.68, -0.89); ctx.lineTo(0.8, -0.82); ctx.lineTo(0.68, -0.75);
    ctx.moveTo(1.02, -0.91); ctx.lineTo(0.92, -0.84); ctx.lineTo(1.02, -0.77);
  }
  ctx.strokeStyle = EV_INK; ctx.lineWidth = 0.06; ctx.lineCap = 'round'; ctx.stroke();
  ctx.restore();
}

function boarPal(hit) {
  if (hit <= 0.02) return BOAR;
  const t = hit * 0.4;
  return { body: mix(BOAR.body, '#ffffff', t), shade: mix(BOAR.shade, '#ffffff', t), mane: mix(BOAR.mane, '#ffffff', t * 0.6), leg: mix(BOAR.leg, '#ffffff', t), legFar: mix(BOAR.legFar, '#ffffff', t), snout: mix(BOAR.snout, '#ffffff', t) };
}

export function drawBoar(ctx, b) {
  if (!b) return;
  const f = b.facing < 0 ? -1 : 1, time = +b.time || 0;
  const run = clamp(+b.run || 0, 0, 1), hit = clamp(+b.hit || 0, 0, 1);
  const P = boarPal(hit), lw = EV_LW, lr = f > 0 ? 'r' : 'l';
  const ph = time * 15;
  const bob = -Math.abs(Math.sin(ph)) * 0.07 * run;
  const x = +b.x || 0, y = +b.y || 0;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(f, 1);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // dust kicked up behind the feet
  if (run > 0.3) {
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const q = frac(time * 2.6 + i / 3), r = 0.1 + q * 0.14;
      const dx = -0.78 - q * 0.7 - i * 0.12, dy = -0.1 - q * 0.22;
      ctx.moveTo(dx + r, dy); ctx.arc(dx, dy, r, 0, TAU);
    }
    ctx.globalAlpha = 0.6 * run;
    ctx.fillStyle = '#e2d2b0'; ctx.fill();
    ctx.globalAlpha = 1;
  }
  // squash on impact (anchored at the feet)
  if (hit > 0.02) ctx.scale(1 + 0.16 * hit, 1 - 0.16 * hit);
  // legs: [hipX, phase, far?]
  const LEGS = [[0.3, PI, 1], [-0.7, 0, 1], [0.48, 0, 0], [-0.52, PI, 0]];
  for (let pass = 1; pass >= 0; pass--) {
    ctx.beginPath();
    for (const L of LEGS) {
      if (L[2] !== pass) continue;
      const a = Math.sin(ph + L[1]) * 0.6 * run, hy = -0.4 + bob;
      ctx.moveTo(L[0], hy); ctx.lineTo(L[0] + Math.sin(a) * 0.34, hy + Math.cos(a) * 0.34);
    }
    ctx.strokeStyle = EV_INK; ctx.lineWidth = 0.2 + lw * 2; ctx.stroke();
    ctx.strokeStyle = pass ? P.legFar : P.leg; ctx.lineWidth = 0.2; ctx.stroke();
    if (pass === 1) {
      // body (drawn between far and near legs), mane first so the body covers its base
      ctx.save(); ctx.translate(0, bob);
      const tail = P2('boar:tail', boarTailPath);
      ctx.strokeStyle = EV_INK; ctx.lineWidth = 0.05; ctx.stroke(tail);
      const mane = P2('boar:mane', boarManePath);
      ctx.fillStyle = P.mane; ctx.fill(mane); ctx.lineWidth = lw; ctx.stroke(mane);
      const body = P2('boar:body', boarBodyPath);
      ctx.fillStyle = P.body; ctx.fill(body);
      const bs = shadeCrescent('boar:bodyShade' + lr, body, LIGHT_X * f, LIGHT_Y, -0.12, -0.74, 0.12, 0.9);
      if (bs) { ctx.fillStyle = P.shade; ctx.fill(bs, 'evenodd'); }
      ctx.stroke(body);
      ctx.restore();
    }
  }
  ctx.save(); ctx.translate(0, bob);
  drawBoarHead(ctx, P, lr, hit, lw);
  ctx.restore();
  if (hit > 0.2) {
    ctx.beginPath();
    starPath(ctx, 1.62, -1.02, 0.17 * hit, 0.065 * hit, 4, 0);
    starPath(ctx, 1.55, -0.34, 0.13 * hit, 0.05 * hit, 4, 0.4);
    ctx.fillStyle = '#ffe34a'; ctx.fill();
    ctx.lineWidth = 0.03; ctx.strokeStyle = EV_INK; ctx.stroke();
  }
  ctx.restore();
}

// --- supply drop (local metres: origin = basket centre)
const DROP = { leaf: '#f5892c', leafD: '#d2621a', vein: '#ffd9a4', stem: '#8a5a2a', basket: '#d9a05c', basketD: '#b67a3c', rim: '#a86e38', badge: '#fff6e4', string: '#6a5040' };
const CANOPY_Y = -2.3, CANOPY_W = 1.4;
const CANOPY_BASE = CANOPY_Y + 0.24;
function canopyTip(i) { const t = PI - i * PI / 4; return [Math.cos(t) * (CANOPY_W + 0.06), CANOPY_BASE - Math.sin(t) * 1.0]; }
function canopySinus(i) { const t = PI - (i + 0.5) * PI / 4; return [Math.cos(t) * 1.06, CANOPY_BASE - Math.sin(t) * 0.62]; }
function canopyPath(p) {
  // maple-like: 5 pointed lobe tips on an arch, rounded sinuses between, concave underside
  let q = canopyTip(0);
  p.moveTo(q[0], q[1]);
  for (let i = 0; i < 4; i++) {
    const a = canopyTip(i), sn = canopySinus(i), b = canopyTip(i + 1);
    const ma = [(a[0] + sn[0]) / 2, (a[1] + sn[1]) / 2], mb = [(sn[0] + b[0]) / 2, (sn[1] + b[1]) / 2];
    const la = Math.hypot(ma[0], ma[1] - CANOPY_BASE) || 1, lb = Math.hypot(mb[0], mb[1] - CANOPY_BASE) || 1;
    p.quadraticCurveTo(ma[0] + ma[0] / la * 0.1, ma[1] + (ma[1] - CANOPY_BASE) / la * 0.1, sn[0], sn[1]);
    p.quadraticCurveTo(mb[0] + mb[0] / lb * 0.1, mb[1] + (mb[1] - CANOPY_BASE) / lb * 0.1, b[0], b[1]);
  }
  q = canopyTip(0);
  p.quadraticCurveTo(0, CANOPY_Y - 0.1, q[0], q[1]);
  p.closePath();
}
// right half (shade side, light comes from the upper left): centre vein -> tips 2..4 -> half of the underside
function canopyHalfPath(p) {
  const t2 = canopyTip(2);
  p.moveTo(0, CANOPY_Y + 0.02); p.lineTo(t2[0], t2[1]);
  for (let i = 2; i < 4; i++) {
    const a = canopyTip(i), sn = canopySinus(i), b = canopyTip(i + 1);
    const ma = [(a[0] + sn[0]) / 2, (a[1] + sn[1]) / 2], mb = [(sn[0] + b[0]) / 2, (sn[1] + b[1]) / 2];
    const la = Math.hypot(ma[0], ma[1] - CANOPY_BASE) || 1, lb = Math.hypot(mb[0], mb[1] - CANOPY_BASE) || 1;
    p.quadraticCurveTo(ma[0] + ma[0] / la * 0.1, ma[1] + (ma[1] - CANOPY_BASE) / la * 0.1, sn[0], sn[1]);
    p.quadraticCurveTo(mb[0] + mb[0] / lb * 0.1, mb[1] + (mb[1] - CANOPY_BASE) / lb * 0.1, b[0], b[1]);
  }
  const t4 = canopyTip(4), cx = 0, cyy = CANOPY_Y - 0.1;
  p.quadraticCurveTo((t4[0] + cx) / 2, (t4[1] + cyy) / 2, 0, 0.5 * CANOPY_BASE + 0.5 * cyy);
  p.closePath();
}
function canopyVeinsPath(p) {
  const sx = 0, sy = CANOPY_Y + 0.02;
  for (let i = 0; i < 5; i++) {
    const t = canopyTip(i), k = i === 0 || i === 4 ? 0.9 : 0.86;
    p.moveTo(sx, sy); p.lineTo(sx + (t[0] - sx) * k, sy + (t[1] - sy) * k);
  }
}
const STRING_TOP = [[-1.18, -2.13], [-0.46, -2.3], [0.46, -2.3], [1.18, -2.13]];
const STRING_BOT = [[-0.42, -0.36], [-0.14, -0.38], [0.14, -0.38], [0.42, -0.36]];
function stringsPath(p) { for (let i = 0; i < 4; i++) { p.moveTo(STRING_TOP[i][0], STRING_TOP[i][1]); p.lineTo(STRING_BOT[i][0], STRING_BOT[i][1]); } }
function basketPath(p) {
  p.moveTo(-0.45, -0.34); p.lineTo(0.45, -0.34); p.lineTo(0.38, 0.28);
  p.quadraticCurveTo(0.37, 0.36, 0.28, 0.36); p.lineTo(-0.28, 0.36);
  p.quadraticCurveTo(-0.37, 0.36, -0.38, 0.28); p.closePath();
}
function basketShadePath(p) {
  p.moveTo(-0.4, 0.12); p.lineTo(0.4, 0.12); p.lineTo(0.38, 0.28);
  p.quadraticCurveTo(0.37, 0.36, 0.28, 0.36); p.lineTo(-0.28, 0.36);
  p.quadraticCurveTo(-0.37, 0.36, -0.38, 0.28); p.closePath();
}
function basketRimPath(p) { roundRectPath(p, -0.5, -0.44, 1.0, 0.14, 0.07); }
function basketLinesPath(p) {
  p.moveTo(0.45, -0.3); p.lineTo(0.38, 0.28); p.quadraticCurveTo(0.37, 0.36, 0.28, 0.36); p.lineTo(-0.28, 0.36);
  p.quadraticCurveTo(-0.37, 0.36, -0.38, 0.28); p.lineTo(-0.45, -0.3);
  p.moveTo(-0.42, -0.06); p.lineTo(-0.26, -0.06); p.moveTo(0.26, -0.06); p.lineTo(0.42, -0.06);
  p.moveTo(-0.4, 0.14); p.lineTo(-0.26, 0.14); p.moveTo(0.26, 0.14); p.lineTo(0.4, 0.14);
  basketRimPath(p);
}
function heartPath(p, cx, cy, s) {
  p.moveTo(cx, cy + s * 0.9);
  p.bezierCurveTo(cx - s * 1.2, cy + 0.05 * s, cx - s * 1.0, cy - s * 0.95, cx, cy - s * 0.35);
  p.bezierCurveTo(cx + s * 1.0, cy - s * 0.95, cx + s * 1.2, cy + 0.05 * s, cx, cy + s * 0.9);
  p.closePath();
}
function burrBadgePath(p) {
  const cx = -0.07, cy = 0.02, r = 0.085;
  for (let i = 0; i < 10; i++) {
    const a = i * TAU / 10;
    p.moveTo(cx + Math.cos(a) * r * 0.9, cy + Math.sin(a) * r * 0.9); p.lineTo(cx + Math.cos(a) * r * 1.55, cy + Math.sin(a) * r * 1.55);
  }
}
function drawBadge(ctx, kind, lw) {
  ctx.beginPath(); ctx.arc(0, 0.02, 0.23, 0, TAU);
  ctx.fillStyle = DROP.badge; ctx.fill();
  ctx.strokeStyle = EV_INK; ctx.lineWidth = lw * 0.8; ctx.stroke();
  if (kind === 'heal') {
    const h = P2('drop:heart', (p) => heartPath(p, 0, 0.03, 0.16));
    ctx.fillStyle = '#ef3b4e'; ctx.fill(h); ctx.stroke(h);
    ctx.beginPath(); ctx.ellipse(-0.07, -0.02, 0.035, 0.025, -0.6, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill();
  } else {
    // spiky burr + walnut
    const sp = P2('drop:burrSpikes', burrBadgePath);
    ctx.strokeStyle = '#3e6e18'; ctx.lineWidth = 0.035; ctx.stroke(sp);
    ctx.beginPath(); ctx.arc(-0.07, 0.02, 0.085, 0, TAU);
    ctx.fillStyle = '#86c04a'; ctx.fill(); ctx.strokeStyle = EV_INK; ctx.lineWidth = lw * 0.6; ctx.stroke();
    ctx.beginPath(); ctx.arc(0.08, 0.07, 0.08, 0, TAU);
    ctx.fillStyle = '#a8784a'; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0.07, -0.005); ctx.quadraticCurveTo(0.045, 0.07, 0.07, 0.145); ctx.stroke();
  }
}
function drawBasket(ctx, kind, lw, time) {
  // soft reward glow
  ctx.fillStyle = cgrad(ctx, 'dropglow', () => {
    const g = ctx.createRadialGradient(0, 0, 0.1, 0, 0, 0.95);
    g.addColorStop(0, 'rgba(255,240,150,0.55)'); g.addColorStop(1, 'rgba(255,230,120,0)');
    return g;
  });
  ctx.beginPath(); ctx.arc(0, 0, 0.95, 0, TAU); ctx.fill();
  ctx.fillStyle = DROP.basket; ctx.fill(P2('drop:basket', basketPath));
  ctx.fillStyle = DROP.basketD; ctx.fill(P2('drop:basketShade', basketShadePath));
  ctx.fillStyle = DROP.rim; ctx.fill(P2('drop:rim', basketRimPath));
  ctx.strokeStyle = EV_INK; ctx.lineWidth = lw; ctx.stroke(P2('drop:basketLines', basketLinesPath));
  drawBadge(ctx, kind, lw);
  // twinkles
  const tw = 0.5 + 0.5 * Math.sin(time * 5);
  ctx.beginPath();
  starPath(ctx, -0.6, -0.5, 0.1 + 0.07 * tw, 0.03, 4, 0);
  starPath(ctx, 0.62, -0.2, 0.08 + 0.06 * (1 - tw), 0.025, 4, 0.3);
  ctx.fillStyle = '#fffbd2'; ctx.fill();
}
function drawCanopy(ctx, lw, lr) {
  const c = P2('drop:canopy', canopyPath);
  ctx.fillStyle = DROP.leaf; ctx.fill(c);
  ctx.fillStyle = DROP.leafD; ctx.fill(P2('drop:canopyHalf', canopyHalfPath));
  ctx.strokeStyle = DROP.vein; ctx.lineWidth = 0.055; ctx.stroke(P2('drop:veins', canopyVeinsPath));
  ctx.strokeStyle = EV_INK; ctx.lineWidth = lw; ctx.stroke(c);
  // stem hanging from the centre of the leaf
  ctx.beginPath(); ctx.moveTo(0, CANOPY_Y + 0.02); ctx.quadraticCurveTo(0.04, CANOPY_Y + 0.22, -0.02, CANOPY_Y + 0.4);
  ctx.strokeStyle = EV_INK; ctx.lineWidth = 0.1 + lw; ctx.stroke();
  ctx.strokeStyle = DROP.stem; ctx.lineWidth = 0.1; ctx.stroke();
}

export function drawSupplyDrop(ctx, d) {
  if (!d) return;
  const time = +d.time || 0, kind = d.kind === 'heal' ? 'heal' : 'nuts', lw = EV_LW;
  ctx.save();
  ctx.translate(+d.x || 0, +d.y || 0);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (d.landed) {
    // leaf lying folded behind the basket (basket bottom = ground)
    ctx.save();
    ctx.translate(-0.25, 0.34); ctx.rotate(-0.1); ctx.scale(0.62, 0.5); ctx.translate(0, -(CANOPY_Y + 0.24));
    drawCanopy(ctx, lw / 0.56, 'r');
    ctx.restore();
    drawBasket(ctx, kind, lw, time);
  } else {
    const rot = clamp(+d.sway || 0, -1, 1) * 0.22 + Math.sin(time * 1.7) * 0.05;
    ctx.rotate(rot);
    ctx.strokeStyle = DROP.string; ctx.lineWidth = 0.035; ctx.stroke(P2('drop:strings', stringsPath));
    ctx.save();
    const fl = 1 + Math.sin(time * 3.1) * 0.03;
    ctx.translate(0, CANOPY_Y); ctx.scale(1, fl); ctx.translate(0, -CANOPY_Y);
    drawCanopy(ctx, lw, 'r');
    ctx.restore();
    drawBasket(ctx, kind, lw, time);
  }
  ctx.restore();
}

// --- HUD event icons (unit space, centre of the canvas, radius ~1.15)
function cloudPath(p) {
  p.moveTo(-0.44 + 0.36, -0.2); p.arc(-0.44, -0.2, 0.36, 0, TAU);
  p.moveTo(0.06 + 0.46, -0.38); p.arc(0.06, -0.38, 0.46, 0, TAU);
  p.moveTo(0.52 + 0.34, -0.16); p.arc(0.52, -0.16, 0.34, 0, TAU);
  roundRectPath(p, -0.8, -0.3, 1.66, 0.42, 0.2);
}
function drawIconCloud(ctx, lw) {
  const c = P2('icon:cloud', cloudPath);
  ctx.strokeStyle = EV_INK; ctx.lineWidth = lw * 2; ctx.stroke(c);
  ctx.fillStyle = '#f4f8fc'; ctx.fill(c);
  ctx.beginPath(); ctx.ellipse(0.02, 0.02, 0.72, 0.09, 0, 0, TAU);
  ctx.fillStyle = '#d4dfeb'; ctx.fill();
}
function drawIconAcorn(ctx, x, y, s, rot, lw) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
  const l = lw / s;
  ctx.beginPath(); ctx.moveTo(0.02, -0.82); ctx.quadraticCurveTo(0.04, -1.12, 0.24, -1.24);
  ctx.strokeStyle = EV_INK; ctx.lineWidth = 0.2; ctx.stroke();
  const body = P2('nut:acorn', acornBodyPath), cap = P2('nut:acorncap', acornCapPath);
  ctx.fillStyle = '#cf8644'; ctx.fill(body); ctx.strokeStyle = EV_INK; ctx.lineWidth = l; ctx.stroke(body);
  ctx.fillStyle = '#8e6036'; ctx.fill(cap); ctx.stroke(cap);
  ctx.restore();
}
export function drawEventIcon(canvas, kind) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height, m = Math.min(w, h);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  let k = m / 2.5, cx = w / 2, cy = h / 2;
  const lw = 0.09;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (kind === 'boar') {
    // scaled head spans about x 0.41..1.45, y -1.38..-0.42 in boar space
    k = m / 1.22;
    ctx.setTransform(k, 0, 0, k, cx - 0.93 * k, cy + 0.9 * k);
    drawBoarHead(ctx, BOAR, 'r', 0, 0.045);
  } else if (kind === 'supply') {
    k = m / 3.6;
    ctx.setTransform(k, 0, 0, k, cx - 0.08 * k, cy + 1.25 * k);
    ctx.strokeStyle = DROP.string; ctx.lineWidth = 0.06; ctx.stroke(P2('drop:strings', stringsPath));
    drawCanopy(ctx, 0.08, 'r');
    drawBasket(ctx, 'nuts', 0.08, 0.3);
  } else {
    ctx.setTransform(k, 0, 0, k, cx, cy);
    if (kind === 'rain' || kind === 'acornrain') {
      ctx.translate(0, -0.22);
      if (kind === 'rain') {
        ctx.beginPath();
        for (const d of [[-0.46, 0.46], [0.06, 0.66], [0.52, 0.44]]) {
          ctx.moveTo(d[0], d[1] - 0.2); ctx.quadraticCurveTo(d[0] + 0.12, d[1] - 0.02, d[0] + 0.12, d[1] + 0.04);
          ctx.arc(d[0], d[1] + 0.04, 0.12, 0, PI); ctx.quadraticCurveTo(d[0] - 0.12, d[1] - 0.02, d[0], d[1] - 0.2); ctx.closePath();
        }
        ctx.fillStyle = '#3fa2f2'; ctx.fill();
        ctx.strokeStyle = EV_INK; ctx.lineWidth = lw * 0.8; ctx.stroke();
      } else {
        drawIconAcorn(ctx, -0.46, 0.62, 0.22, -0.3, lw * 0.8);
        drawIconAcorn(ctx, 0.08, 0.86, 0.24, 0.2, lw * 0.8);
        drawIconAcorn(ctx, 0.56, 0.58, 0.2, 0.4, lw * 0.8);
      }
      drawIconCloud(ctx, lw);
    } else { // gust
      ctx.beginPath();
      ctx.moveTo(-1.0, -0.36); ctx.lineTo(0.3, -0.36); ctx.bezierCurveTo(0.72, -0.36, 0.74, -0.86, 0.42, -0.86); ctx.quadraticCurveTo(0.22, -0.84, 0.26, -0.64);
      ctx.moveTo(-0.86, 0.08); ctx.lineTo(0.6, 0.08); ctx.bezierCurveTo(1.02, 0.08, 1.02, 0.56, 0.72, 0.56); ctx.quadraticCurveTo(0.54, 0.55, 0.56, 0.38);
      ctx.moveTo(-1.0, 0.5); ctx.lineTo(-0.02, 0.5); ctx.bezierCurveTo(0.26, 0.5, 0.3, 0.84, 0.06, 0.86);
      ctx.strokeStyle = EV_INK; ctx.lineWidth = 0.26; ctx.stroke();
      ctx.strokeStyle = '#e4f4ff'; ctx.lineWidth = 0.14; ctx.stroke();
      ctx.beginPath(); leafShapeAt(ctx, -0.46, -0.72, 0.26, 0.13, -0.5);
      ctx.fillStyle = '#6cbc3c'; ctx.fill(); ctx.strokeStyle = EV_INK; ctx.lineWidth = lw * 0.8; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-0.66, -0.6); ctx.lineTo(-0.26, -0.84);
      ctx.strokeStyle = '#c8f09a'; ctx.lineWidth = 0.035; ctx.stroke();
    }
  }
  ctx.restore();
}

// ---------------------------------------------------------------------
//  UI icons
// ---------------------------------------------------------------------
export function drawAmmoIcon(canvas, type) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const m = Math.min(w, h);
  const r = 0.4;
  let span = 2.7, ox = 0, oy = 0;
  if (type === 'acorn') { span = 2.75; oy = 0.03; }
  else if (type === 'pinenut') { span = 2.75; ox = -0.03; }
  else if (type === 'peanut') { span = 2.5; ox = 0.02; }
  else if (type === 'burr') { span = 2.6; }
  else if (type === 'walnut') { span = 2.3; }
  else if (type === 'kernel') { span = 2.35; }
  const k = m / (span * r);
  ctx.setTransform(k, 0, 0, k, w / 2 + ox * m, h / 2 + oy * m);
  drawNut(ctx, type, 0, 0, r, 0, { time: 0.4, state: 'idle', lookX: 0.4, lookY: 0.1, fuse: 0 });
  ctx.restore();
}

export function drawCaptainIcon(canvas, team) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const m = Math.min(w, h);
  const tm = team ? 1 : 0;
  // head unit -> px; fits ears (and the long tufts), hat and cheeks
  const k = m / (tm ? 3.2 : 2.95);
  ctx.setTransform(k, 0, 0, k, w / 2 - 0.05 * m, h / 2 + (tm ? 0.5 : 0.36) * k);
  const o = { eye: 'open', blink: 0, tilt: 1, browUp: 0, mouth: 'w', puff: 0, llx: 0.5, lly: 0.1 };
  drawCaptainHead(ctx, tm, CAPT[tm], o, LIGHT_X, LIGHT_Y, 0.5, CAP_LW / HEAD_K * 1.1);
  ctx.restore();
}
