// =====================================================================
//  엥그리 포트리스 (Angry Fortress) — procedural vector art module
//  ES module, no dependencies. Render space: 1 unit = 1 m, x right, y down.
//  Every public draw function saves/restores the context state.
// =====================================================================

export const BIRD_TYPES = ['red', 'yellow', 'blue', 'black', 'white'];
export const BIRD_INFO = {
  red:    { name: '빵빵',  desc: '묵직한 기본탄',        color: '#e5392f' },
  yellow: { name: '쌩쌩',  desc: '터치: 초고속 돌진',    color: '#ffd21f' },
  blue:   { name: '삼둥이', desc: '터치: 세 마리로 분열', color: '#39a7f0' },
  black:  { name: '쾅쾅',  desc: '터치: 대폭발',        color: '#2b2d3a' },
  white:  { name: '알폭이', desc: '터치: 알 폭탄 투하',  color: '#f5f1ea' },
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

// Tapered quadratic "limb" path (horns, fork arms, rope ends)
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
function qpt(x0, y0, cx, cy, x1, y1, t) {
  const u = 1 - t;
  return [u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1];
}

function outlineW(r) { return 0.035 * Math.sqrt(clamp(r, 0.08, 3) / 0.4); }

// ---------------------------------------------------------------------
//  Bird palettes & layouts (unit space: body radius = 1, facing +x)
// ---------------------------------------------------------------------
const BEAK_STD = { beak: '#ffd24a', beakLo: '#f08a12', beakLine: '#6b2a05' };
const BP = {
  red: {
    body: '#e5392f', hi: '#ff9270', lo: '#b01f1c', rim: '#7d0f12', line: '#4a0b0c',
    belly: '#fff0dc', bellyLo: '#efc4a0', tuft: '#d42c25', tail: '#3a2c30', tailLine: '#16100f',
    brow: '#2d1210', lid: '#cf2d26', blush: '#ff9ab4', blushA: 1.35, bounce: '#ffb08a', ...BEAK_STD,
  },
  yellow: {
    body: '#ffd21f', hi: '#fff6a6', lo: '#e89d0c', rim: '#b86a04', line: '#5e3300',
    belly: '#fffbe6', bellyLo: '#ffe48c', tuft: '#ff8a1e', tail: '#3b2a1b', tailLine: '#150d06',
    brow: '#3d2206', lid: '#f2b40f', blush: '#ff8f7d', bounce: '#fff3b0',
    beak: '#ffb43a', beakLo: '#e5590a', beakLine: '#6b2505',
  },
  blue: {
    body: '#39a7f0', hi: '#b0e6ff', lo: '#1c6fc0', rim: '#0f4a8a', line: '#0b2c4d',
    belly: '#effaff', bellyLo: '#b8def5', tuft: '#2a8be0', tail: '#1d5c9c', tailLine: '#0b2c4d',
    brow: '#0f2238', lid: '#2f95dd', blush: '#ff86aa', bounce: '#b7ecff', ...BEAK_STD,
  },
  black: {
    body: '#2b2d3a', hi: '#6a7394', lo: '#191a24', rim: '#0b0b10', line: '#050508',
    belly: '#9a9eae', bellyLo: '#5f6372', tuft: '#1c1d27', tail: '#1c1d27', tailLine: '#050508',
    brow: '#08080c', browEdge: 'rgba(150,162,205,0.6)', eyeGlow: 'rgba(235,240,255,0.9)', blushA: 1.3, lid: '#262834', blush: '#ff6f8e', bounce: '#7fa8ff', sheen: '#9cc2ff',
    beak: '#ffb13a', beakLo: '#e5620c', beakLine: '#5a2204',
  },
  white: {
    body: '#f5f1ea', hi: '#ffffff', lo: '#c2b6d6', rim: '#8e80a8', line: '#4b4063',
    belly: '#fffdf6', bellyLo: '#f0e4d0', tuft: '#ff8fb3', tail: '#d9cfe6', tailLine: '#4b4063',
    brow: '#4b3f5e', lid: '#e6deee', blush: '#ff94b2', bounce: '#ffffff', ...BEAK_STD,
  },
};

// feathers: [x, y, len, width, angle, curl]
const BL = {
  red: {
    shape: 'round',
    eyes: [[0.03, -0.14, 0.3, 1], [0.58, -0.16, 0.265, 0.84]],
    brow: { th: 0.2, len: [0.5, 0.38], gap: 0.06, tilt: 0.4 },
    beak: [0.45, 0.28, 0.86, 1.0],
    belly: [0.12, 0.6, 0.72, 0.5, -0.18],
    blush: [[-0.22, 0.2, 0.15, 0.085], [0.85, 0.12, 0.075, 0.06]],
    tufts: [[-0.12, -0.86, 0.5, 0.2, -2.05, -0.35], [0.1, -0.9, 0.4, 0.17, -1.6, -0.28]],
    tail: [[-0.86, 0.1, 0.5, 0.22, PI - 0.05, 0.25], [-0.84, 0.26, 0.46, 0.2, PI + 0.35, 0.25], [-0.8, 0.4, 0.36, 0.17, PI + 0.72, 0.2]],
    hc: [0, 0], hl: 0.52, lid: 0, lidSlant: 0.1,
  },
  yellow: {
    shape: 'tri',
    eyes: [[0.02, -0.06, 0.265, 1], [0.47, -0.08, 0.23, 0.84]],
    brow: { th: 0.16, len: [0.4, 0.31], gap: 0.07, tilt: 0.28 },
    beak: [0.42, 0.24, 0.84, 1.6],
    belly: [0.05, 0.66, 0.9, 0.42, 0],
    blush: [[-0.26, 0.24, 0.14, 0.08], [0.72, 0.18, 0.07, 0.055]],
    tufts: [[0.22, -0.98, 0.42, 0.17, -2.35, -0.3], [0.3, -1.0, 0.5, 0.19, -1.95, -0.25], [0.38, -0.98, 0.36, 0.15, -1.55, -0.2]],
    tail: [[-0.9, 0.5, 0.44, 0.19, PI + 0.25, 0.2], [-0.84, 0.62, 0.36, 0.16, PI + 0.65, 0.2]],
    hc: [0.08, 0.12], hl: 0.42, lid: 0.3, lidSlant: 0.14,
  },
  blue: {
    shape: 'round',
    eyes: [[0.03, -0.13, 0.32, 1], [0.59, -0.15, 0.28, 0.84]],
    brow: { th: 0.16, len: [0.44, 0.34], gap: 0.07, tilt: 0.3 },
    beak: [0.45, 0.27, 0.8, 1.0],
    belly: [0.12, 0.6, 0.72, 0.5, -0.18],
    blush: [[-0.24, 0.22, 0.16, 0.09], [0.86, 0.14, 0.075, 0.06]],
    curl: true,
    tail: [[-0.86, 0.12, 0.42, 0.2, PI + 0.05, 0.25], [-0.84, 0.28, 0.38, 0.18, PI + 0.45, 0.25]],
    hc: [0, 0], hl: 0.52, lid: 0, lidSlant: 0.06, grin: 0.22, browAsym: 0.07, browLift1: 0.07,
  },
  mini: {
    shape: 'round',
    eyes: [[0.03, -0.13, 0.33, 1], [0.6, -0.15, 0.29, 0.84]],
    brow: { th: 0.16, len: [0.42, 0.32], gap: 0.07, tilt: 0.3 },
    beak: [0.46, 0.28, 0.8, 1.0],
    belly: [0.12, 0.6, 0.72, 0.5, -0.18],
    blush: [[-0.24, 0.22, 0.16, 0.09]],
    curl: 'mini',
    tail: null,
    hc: [0, 0], hl: 0.52, lid: 0, lidSlant: 0.06, grin: 0.22, mini: true,
  },
  black: {
    shape: 'round',
    eyes: [[0.03, -0.14, 0.3, 1], [0.58, -0.16, 0.265, 0.84]],
    brow: { th: 0.21, len: [0.5, 0.38], gap: 0.06, tilt: 0.42 },
    beak: [0.45, 0.28, 0.86, 1.0],
    belly: [0.12, 0.62, 0.7, 0.48, -0.18],
    blush: [[-0.22, 0.2, 0.15, 0.085], [0.85, 0.12, 0.075, 0.06]],
    tail: [[-0.86, 0.12, 0.44, 0.2, PI + 0.05, 0.25], [-0.84, 0.28, 0.4, 0.18, PI + 0.42, 0.25]],
    hc: [0, 0], hl: 0.52, lid: 0.06, lidSlant: 0.2, fuse: true,
  },
  white: {
    shape: 'egg',
    eyes: [[-0.01, -0.2, 0.265, 1], [0.46, -0.22, 0.23, 0.84]],
    brow: { th: 0.13, len: [0.36, 0.28], gap: 0.1, tilt: 0.06 },
    beak: [0.4, 0.17, 0.78, 1.0],
    belly: [0.08, 0.56, 0.66, 0.44, -0.12],
    blush: [[-0.26, 0.12, 0.15, 0.085], [0.72, 0.06, 0.07, 0.055]],
    tufts: [[-0.02, -1.04, 0.28, 0.13, -1.95, -0.3], [0.08, -1.06, 0.22, 0.11, -1.45, -0.25]],
    tail: [[-0.8, 0.36, 0.34, 0.17, PI + 0.2, 0.2], [-0.76, 0.5, 0.3, 0.15, PI + 0.6, 0.2]],
    hc: [0, -0.05], hl: 0.5, lid: 0.44, lidSlant: -0.16, sleepy: true,
  },
};

// ---------------------------------------------------------------------
//  Body shapes
// ---------------------------------------------------------------------
const TRI = [[0.36, -1.18], [1.06, 0.7], [-1.06, 0.72]];
const TRI_T = 0.32, TRI_BULGE = 0.13;
const _triPts = (function () {
  const n = 3, out = [];
  for (let i = 0; i < n; i++) {
    const V = TRI[i], Pv = TRI[(i + n - 1) % n], Nx = TRI[(i + 1) % n];
    out.push({
      v: V,
      pin: [V[0] + (Pv[0] - V[0]) * TRI_T, V[1] + (Pv[1] - V[1]) * TRI_T],
      pout: [V[0] + (Nx[0] - V[0]) * TRI_T, V[1] + (Nx[1] - V[1]) * TRI_T],
    });
  }
  const ctrl = [];
  for (let i = 0; i < n; i++) {
    const A = TRI[i], B = TRI[(i + 1) % n];
    const dx = B[0] - A[0], dy = B[1] - A[1], len = Math.hypot(dx, dy);
    const nx = dy / len, ny = -dx / len;
    ctrl.push([(A[0] + B[0]) / 2 + nx * TRI_BULGE * len * 0.5, (A[1] + B[1]) / 2 + ny * TRI_BULGE * len * 0.5]);
  }
  return { pts: out, ctrl };
})();

function triPath(ctx) {
  const P = _triPts.pts, C = _triPts.ctrl;
  ctx.moveTo(P[0].pout[0], P[0].pout[1]);
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3;
    ctx.quadraticCurveTo(C[i][0], C[i][1], P[j].pin[0], P[j].pin[1]);
    ctx.quadraticCurveTo(P[j].v[0], P[j].v[1], P[j].pout[0], P[j].pout[1]);
  }
  ctx.closePath();
}
function eggPath(ctx, top, bot, wid, wy) {
  top = top || -1.14; bot = bot || 0.98; wid = wid || 0.92; wy = wy == null ? 0.14 : wy;
  ctx.moveTo(0, top);
  ctx.bezierCurveTo(wid * 0.6, top, wid, (top + wy) * 0.55, wid, wy);
  ctx.bezierCurveTo(wid, wy + (bot - wy) * 0.6, wid * 0.56, bot, 0, bot);
  ctx.bezierCurveTo(-wid * 0.56, bot, -wid, wy + (bot - wy) * 0.6, -wid, wy);
  ctx.bezierCurveTo(-wid, (top + wy) * 0.55, -wid * 0.6, top, 0, top);
  ctx.closePath();
}
function bodyPath(ctx, shape) {
  if (shape === 'tri') triPath(ctx);
  else if (shape === 'egg') eggPath(ctx);
  else { ctx.moveTo(1, 0); ctx.arc(0, 0, 1, 0, TAU); ctx.closePath(); }
}

// ---------------------------------------------------------------------
//  Bird parts
// ---------------------------------------------------------------------
function feather(ctx, f, col, line, lw, hiCol) {
  const x = f[0], y = f[1], len = f[2], wid = f[3], ang = f[4], c = (f[5] || 0) * len;
  ctx.save();
  ctx.translate(x, y); ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(0, -wid * 0.42);
  ctx.bezierCurveTo(len * 0.35, -wid * 0.78 + c * 0.25, len * 0.82, -wid * 0.32 + c * 0.8, len, c);
  ctx.bezierCurveTo(len * 0.72, wid * 0.32 + c * 0.7, len * 0.32, wid * 0.72 + c * 0.25, 0, wid * 0.42);
  ctx.closePath();
  ctx.fillStyle = col; ctx.fill();
  ctx.lineWidth = lw; ctx.strokeStyle = line; ctx.lineJoin = 'round'; ctx.stroke();
  if (hiCol !== false) {
    ctx.beginPath();
    ctx.moveTo(len * 0.18, -wid * 0.12 + c * 0.05);
    ctx.quadraticCurveTo(len * 0.5, -wid * 0.18 + c * 0.35, len * 0.8, c * 0.72);
    ctx.strokeStyle = hiCol || 'rgba(255,255,255,0.32)'; ctx.lineWidth = lw * 0.7; ctx.lineCap = 'round'; ctx.stroke();
  }
  ctx.restore();
}

function curlTuft(ctx, P, lw, mini) {
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const w = mini ? 0.2 : 0.17;
  ctx.beginPath();
  if (mini) {
    ctx.moveTo(0.04, -0.82);
    ctx.bezierCurveTo(0.0, -1.12, 0.2, -1.32, 0.38, -1.2);
    ctx.quadraticCurveTo(0.46, -1.1, 0.36, -1.04);
  } else {
    ctx.moveTo(0.02, -0.8);
    ctx.bezierCurveTo(-0.04, -1.16, 0.14, -1.46, 0.4, -1.38);
    ctx.bezierCurveTo(0.6, -1.3, 0.54, -1.08, 0.38, -1.1);
  }
  ctx.strokeStyle = P.line; ctx.lineWidth = w + lw * 2; ctx.stroke();
  ctx.strokeStyle = P.tuft; ctx.lineWidth = w; ctx.stroke();
  // glossy ridge
  ctx.beginPath();
  if (mini) { ctx.moveTo(0.02, -0.95); ctx.bezierCurveTo(0.02, -1.14, 0.16, -1.26, 0.3, -1.24); }
  else { ctx.moveTo(0.0, -0.98); ctx.bezierCurveTo(0.0, -1.2, 0.14, -1.38, 0.34, -1.36); }
  ctx.strokeStyle = rgba(P.hi, 0.75); ctx.lineWidth = w * 0.28; ctx.stroke();
  ctx.restore();
}

function softBlush(ctx, b, col, alpha) {
  ctx.save();
  ctx.translate(b[0], b[1]); ctx.scale(b[2], b[3]);
  ctx.fillStyle = cgrad(ctx, 'blush' + col + alpha, () => {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, rgba(col, 0.75 * alpha));
    g.addColorStop(0.55, rgba(col, 0.5 * alpha));
    g.addColorStop(1, rgba(col, 0));
    return g;
  });
  ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); ctx.fill();
  ctx.restore();
}

// eye in local unit space. inner: +1 when the inner (beak-side) of the eye is +x
function drawEye(ctx, ex, ey, er, esx, inner, o, P) {
  ctx.save();
  ctx.translate(ex, ey);
  ctx.scale(er * esx, er);
  const lw = o.lw / er;
  const mode = o.eyeMode;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (mode === 'x' || mode === 'dead' || mode === 'happy') {
    ctx.strokeStyle = P.eyeLine || '#1a1320';
    ctx.lineWidth = Math.max(lw * 1.7, 0.2);
    ctx.beginPath();
    if (mode === 'x') {
      ctx.moveTo(-0.72 * inner, -0.62); ctx.quadraticCurveTo(0.1 * inner, -0.2, 0.55 * inner, 0.02);
      ctx.quadraticCurveTo(0.1 * inner, 0.22, -0.72 * inner, 0.62);
    } else if (mode === 'dead') {
      ctx.moveTo(-0.62, -0.62); ctx.lineTo(0.62, 0.62); ctx.moveTo(0.62, -0.62); ctx.lineTo(-0.62, 0.62);
    } else {
      ctx.arc(0, 0.5, 0.78, PI * 1.16, PI * 1.84);
    }
    if (P.eyeGlow) { ctx.save(); ctx.strokeStyle = P.eyeGlow; ctx.lineWidth += lw * 1.2; ctx.stroke(); ctx.restore(); }
    ctx.stroke();
    ctx.restore();
    return;
  }
  // sclera
  ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU);
  ctx.fillStyle = cgrad(ctx, 'sclera', () => {
    const g = ctx.createRadialGradient(-0.3, -0.42, 0.05, 0, 0, 1.05);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#f7f8fd'); g.addColorStop(0.85, '#e2e6f2'); g.addColorStop(1, '#c4cbe0');
    return g;
  });
  ctx.fill();
  const lid = o.lid + (1 - o.lid) * clamp(o.blink, 0, 1);
  if (mode === 'spiral') {
    ctx.save(); ctx.clip();
    const N = 26, rot = o.time * 7 * inner;
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const t = i / N, a = rot + t * TAU * 1.75, rr = 0.05 + t * 0.74;
      const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.strokeStyle = '#3b2b52'; ctx.lineWidth = Math.max(lw * 1.25, 0.16); ctx.stroke();
    ctx.restore();
  } else if (lid < 0.97) {
    ctx.save(); ctx.clip();
    const pr = 0.56 * (o.pupil || 1);
    const px = o.llx * 0.38, py = o.lly * 0.38 + (lid > 0.3 ? (lid - 0.3) * 0.35 : 0);
    ctx.save();
    ctx.translate(px, py); ctx.scale(pr, pr);
    ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU);
    ctx.fillStyle = cgrad(ctx, 'iris', () => {
      const g = ctx.createRadialGradient(0.05, 0.5, 0.05, 0, 0.1, 1.05);
      g.addColorStop(0, '#6a5a8c'); g.addColorStop(0.45, '#2a2238'); g.addColorStop(1, '#0c0a11');
      return g;
    });
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(-0.3, -0.34, 0.38, 0, TAU); ctx.fill();
    if (!o.simple) { ctx.beginPath(); ctx.arc(0.38, 0.36, 0.16, 0, TAU); ctx.fill(); }
    ctx.restore();
    if (lid > 0.02) {
      const yl = -1 + 2 * lid, sl = o.lidSlant || 0;
      const yIn = yl + sl, yOut = yl - sl;
      const yR = inner > 0 ? yIn : yOut, yL = inner > 0 ? yOut : yIn;
      const cy = (yL + yR) / 2 + 0.2;
      ctx.beginPath();
      ctx.moveTo(-1.3, -1.3); ctx.lineTo(1.3, -1.3); ctx.lineTo(1.3, yR);
      ctx.quadraticCurveTo(0, cy, -1.3, yL); ctx.closePath();
      ctx.fillStyle = P.lid; ctx.fill();
      // soft lid shadow on the eyeball
      ctx.beginPath(); ctx.moveTo(1.3, yR); ctx.quadraticCurveTo(0, cy + 0.02, -1.3, yL);
      ctx.strokeStyle = 'rgba(40,30,70,0.18)'; ctx.lineWidth = lw * 2.4; ctx.stroke();
      ctx.strokeStyle = P.eyeLine || P.line; ctx.lineWidth = lw * 1.25; ctx.stroke();
    }
    ctx.restore();
  } else {
    // fully closed: lid over the eye with a curved lash line
    ctx.fillStyle = P.lid; ctx.fill();
    ctx.beginPath();
    ctx.arc(0, -0.55, 1.05, PI * 0.26, PI * 0.74);
    ctx.strokeStyle = P.eyeLine || P.line; ctx.lineWidth = lw * 1.4; ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU);
  ctx.strokeStyle = P.eyeLine || P.line; ctx.lineWidth = lw * 0.85; ctx.stroke();
  ctx.restore();
}

function drawBrow(ctx, cx, cy, len, th, tilt, inner, P, lw) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(inner, 1);
  ctx.rotate(tilt);
  const a = len / 2;
  ctx.beginPath();
  ctx.moveTo(-a, -th * 0.2);
  ctx.quadraticCurveTo(-a * 0.1, -th * 0.72, a, -th * 0.55);
  ctx.quadraticCurveTo(a + th * 0.42, -th * 0.05, a, th * 0.5);
  ctx.quadraticCurveTo(-a * 0.05, th * 0.3, -a, th * 0.26);
  ctx.quadraticCurveTo(-a - th * 0.3, th * 0.03, -a, -th * 0.2);
  ctx.closePath();
  ctx.fillStyle = P.brow; ctx.fill();
  if (P.browEdge) { ctx.lineWidth = lw * 0.55; ctx.strokeStyle = P.browEdge; ctx.stroke(); }
  // subtle top sheen
  ctx.beginPath();
  ctx.moveTo(-a * 0.6, -th * 0.18); ctx.quadraticCurveTo(0, -th * 0.45, a * 0.7, -th * 0.34);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = th * 0.18; ctx.lineCap = 'round'; ctx.stroke();
  ctx.restore();
}

// Beak: anchor (bx,by), scale s, length multiplier len, open 0..1
function drawBeak(ctx, bx, by, s, len, open, P, lw, opt) {
  ctx.save();
  ctx.translate(bx, by);
  ctx.scale(s, s);
  lw /= s;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const hx = -0.22, hy = 0.06;
  const up = -open * 0.3, lo = open * 0.62 + (opt && opt.grin ? opt.grin * 0.35 : 0);
  const cu = Math.cos(up), su = Math.sin(up), cl = Math.cos(lo), sl = Math.sin(lo);
  const utx = 0.48 * len, uty = 0.05, ltx = 0.34 * len, lty = 0.1;
  const Ut = [hx + (utx - hx) * cu - (uty - hy) * su, hy + (utx - hx) * su + (uty - hy) * cu];
  const Lt = [hx + (ltx - hx) * cl - (lty - hy) * sl, hy + (ltx - hx) * sl + (lty - hy) * cl];
  const openAmt = open + (opt && opt.grin ? opt.grin * 0.5 : 0);
  if (openAmt > 0.04) {
    // mouth cavity
    ctx.beginPath();
    ctx.moveTo(hx, hy - 0.03);
    ctx.lineTo(Ut[0] * 0.92, Ut[1] + 0.02);
    ctx.quadraticCurveTo((Ut[0] + Lt[0]) * 0.55, (Ut[1] + Lt[1]) * 0.5, Lt[0] * 0.9, Lt[1] - 0.02);
    ctx.closePath();
    ctx.fillStyle = '#6a1020'; ctx.fill();
    ctx.lineWidth = lw * 0.8; ctx.strokeStyle = P.beakLine; ctx.stroke();
    // tongue
    ctx.save();
    ctx.translate(hx, hy); ctx.rotate(lo * 0.8);
    ctx.beginPath(); ctx.ellipse(0.24 * len * 0.8 + 0.02, 0.02, 0.15 * Math.min(len, 1.3), 0.06 + open * 0.03, 0, 0, TAU);
    ctx.fillStyle = '#ff6d8a'; ctx.fill();
    ctx.restore();
  }
  // lower beak
  ctx.save();
  ctx.translate(hx, hy); ctx.rotate(lo); ctx.translate(-hx, -hy);
  ctx.beginPath();
  ctx.moveTo(-0.24, 0.07);
  ctx.quadraticCurveTo(0.12 * len, 0.11, ltx, lty);
  ctx.quadraticCurveTo(0.2 * len, 0.29, -0.14, 0.27);
  ctx.quadraticCurveTo(-0.31, 0.2, -0.24, 0.07);
  ctx.closePath();
  ctx.fillStyle = cgrad(ctx, 'blo' + P.beak + len, () => {
    const g = ctx.createLinearGradient(0, 0.06, 0, 0.27);
    g.addColorStop(0, mix(P.beak, P.beakLo, 0.45)); g.addColorStop(1, P.beakLo);
    return g;
  });
  ctx.fill();
  ctx.lineWidth = lw; ctx.strokeStyle = P.beakLine; ctx.stroke();
  ctx.restore();
  // upper beak
  ctx.save();
  ctx.translate(hx, hy); ctx.rotate(up); ctx.translate(-hx, -hy);
  ctx.beginPath();
  ctx.moveTo(-0.26, -0.16);
  ctx.bezierCurveTo(0.0, -0.27, 0.32 * len, -0.15, utx, uty);
  ctx.quadraticCurveTo(0.18 * len, 0.11, -0.26, 0.1);
  ctx.quadraticCurveTo(-0.37, -0.03, -0.26, -0.16);
  ctx.closePath();
  ctx.fillStyle = cgrad(ctx, 'bup' + P.beak + len, () => {
    const g = ctx.createLinearGradient(0, -0.22, 0, 0.1);
    g.addColorStop(0, mix(P.beak, '#ffffff', 0.4)); g.addColorStop(0.4, P.beak); g.addColorStop(0.75, mix(P.beak, P.beakLo, 0.6)); g.addColorStop(1, P.beakLo);
    return g;
  });
  ctx.fill();
  ctx.lineWidth = lw; ctx.strokeStyle = P.beakLine; ctx.stroke();
  // ridge highlight + nostril
  ctx.beginPath();
  ctx.moveTo(-0.16, -0.15); ctx.quadraticCurveTo(0.1 * len, -0.19, 0.28 * len, -0.08);
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = lw * 1.0; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(0.05 * len + 0.02, -0.07, 0.038, 0.024, 0.3, 0, TAU);
  ctx.fillStyle = rgba(P.beakLine, 0.7); ctx.fill();
  ctx.restore();
  if (opt && opt.tongueOut) {
    ctx.save();
    ctx.translate(hx, hy); ctx.rotate(lo * 0.7);
    ctx.beginPath();
    ctx.moveTo(0.02, 0.02);
    ctx.bezierCurveTo(0.15, 0.04, 0.3, 0.06, 0.34, 0.2);
    ctx.bezierCurveTo(0.38, 0.36, 0.2, 0.4, 0.16, 0.26);
    ctx.quadraticCurveTo(0.12, 0.12, 0.0, 0.1);
    ctx.closePath();
    ctx.fillStyle = '#ff6d8a'; ctx.fill();
    ctx.lineWidth = lw; ctx.strokeStyle = '#7a1428'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0.2, 0.1); ctx.quadraticCurveTo(0.26, 0.18, 0.25, 0.28);
    ctx.lineWidth = lw * 0.7; ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

function drawSpark(ctx, x, y, size, time, lw, intensity) {
  intensity = intensity == null ? 1 : intensity;
  const fl = 0.8 + 0.2 * Math.sin(time * 41) * Math.sin(time * 23 + 1.3);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(size, size);
  // glow
  ctx.fillStyle = cgrad(ctx, 'sparkglow', () => {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, 'rgba(255,245,190,0.95)'); g.addColorStop(0.3, 'rgba(255,196,70,0.55)'); g.addColorStop(1, 'rgba(255,120,20,0)');
    return g;
  });
  ctx.globalAlpha = clamp(0.55 + 0.45 * intensity, 0, 1);
  ctx.beginPath(); ctx.arc(0, 0, 1.3 * fl, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
  // rays
  const k = Math.floor(time * 24);
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = i * TAU / 8 + time * 2.5 + (i & 1) * 0.2;
    const l = 0.45 + 0.6 * hash(i, k);
    ctx.moveTo(Math.cos(a) * 0.18, Math.sin(a) * 0.18);
    ctx.lineTo(Math.cos(a) * l, Math.sin(a) * l);
  }
  ctx.strokeStyle = '#ffb21e'; ctx.lineWidth = 0.2; ctx.stroke();
  ctx.strokeStyle = '#fff6b0'; ctx.lineWidth = 0.09; ctx.stroke();
  // embers
  for (let i = 0; i < 4; i++) {
    const ph = frac(time * 1.9 + i * 0.27);
    const a = hash(i, Math.floor(time * 1.9 + i * 0.27)) * TAU;
    const d = 0.35 + ph * 1.1;
    ctx.globalAlpha = 1 - ph;
    ctx.fillStyle = i & 1 ? '#ffe36a' : '#ff9a2a';
    ctx.beginPath(); ctx.arc(Math.cos(a) * d, Math.sin(a) * d - ph * 0.3, 0.09 * (1 - ph * 0.5), 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // core star
  ctx.beginPath(); starPath(ctx, 0, 0, 0.42 * fl, 0.17, 4, time * 3);
  ctx.fillStyle = '#fff3a0'; ctx.fill();
  ctx.beginPath(); ctx.arc(0, 0, 0.16, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.restore();
}

function drawRope(ctx, x0, y0, cx, cy, x1, y1, w, lw, burnt) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, cy, x1, y1);
  ctx.strokeStyle = '#5a4424'; ctx.lineWidth = w + lw * 1.6; ctx.stroke();
  ctx.strokeStyle = '#e9d39c'; ctx.lineWidth = w; ctx.stroke();
  // twist marks
  const n = 5;
  ctx.strokeStyle = '#b39258'; ctx.lineWidth = w * 0.28;
  ctx.beginPath();
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const p = qpt(x0, y0, cx, cy, x1, y1, t), q = qpt(x0, y0, cx, cy, x1, y1, Math.min(1, t + 0.02));
    let dx = q[0] - p[0], dy = q[1] - p[1]; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    ctx.moveTo(p[0] - dy * w * 0.38 - dx * w * 0.2, p[1] + dx * w * 0.38 - dy * w * 0.2);
    ctx.lineTo(p[0] + dy * w * 0.38 + dx * w * 0.2, p[1] - dx * w * 0.38 + dy * w * 0.2);
  }
  ctx.stroke();
  if (burnt) {
    ctx.beginPath(); ctx.arc(x1, y1, w * 0.62, 0, TAU);
    ctx.fillStyle = '#3a2a22'; ctx.fill();
  }
  ctx.restore();
}

function drawDizzyStars(ctx, cx, cy, rx, ry, size, time, lw) {
  for (let i = 0; i < 3; i++) {
    const a = time * 4 + i * TAU / 3;
    const px = cx + Math.cos(a) * rx, py = cy + Math.sin(a) * ry;
    const sc = 0.75 + 0.25 * Math.sin(a);
    ctx.beginPath(); starPath(ctx, px, py, size * sc, size * sc * 0.45, 5, a * 0.5);
    ctx.fillStyle = '#ffe14a'; ctx.fill();
    ctx.lineWidth = lw * 0.7; ctx.strokeStyle = '#9a6200'; ctx.lineJoin = 'round'; ctx.stroke();
  }
}

function drawSweat(ctx, x, y, s, time, lw) {
  const ph = frac(time * 0.8);
  ctx.save();
  ctx.translate(x, y + ph * 0.18 * s);
  ctx.scale(s, s);
  ctx.globalAlpha = ph < 0.8 ? 1 : (1 - ph) * 5;
  ctx.beginPath();
  ctx.moveTo(0, -0.18);
  ctx.bezierCurveTo(0.06, -0.06, 0.1, 0.0, 0.1, 0.05);
  ctx.arc(0, 0.05, 0.1, 0, PI);
  ctx.bezierCurveTo(-0.1, 0.0, -0.06, -0.06, 0, -0.18);
  ctx.closePath();
  ctx.fillStyle = '#bfeaff'; ctx.fill();
  ctx.lineWidth = lw / s * 0.7; ctx.strokeStyle = '#2f79ad'; ctx.stroke();
  ctx.beginPath(); ctx.ellipse(-0.03, 0.05, 0.025, 0.045, 0.3, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------
//  Bird figure (unit space).  o = options computed from the state.
// ---------------------------------------------------------------------
function birdFigure(ctx, P, L, o) {
  const lw = o.lw, gx = o.gx, gy = o.gy;
  ctx.lineJoin = 'round';
  // --- behind body: tail, tufts
  if (L.tail) for (let i = 0; i < L.tail.length; i++) feather(ctx, L.tail[i], P.tail, P.tailLine || P.line, lw, L.mini ? false : undefined);
  if (L.tufts) for (let i = 0; i < L.tufts.length; i++) feather(ctx, L.tufts[i], P.tuft, P.line, lw);
  if (L.curl) curlTuft(ctx, P, lw, L.curl === 'mini');
  if (o.behind) o.behind(ctx);

  // --- body
  const hc = L.hc || [0, 0];
  ctx.beginPath(); bodyPath(ctx, L.shape);
  const g = ctx.createRadialGradient(hc[0] + gx * 0.42, hc[1] + gy * 0.42, 0, hc[0] + gx * 0.42, hc[1] + gy * 0.42, 1.52);
  g.addColorStop(0, P.hi); g.addColorStop(0.3, P.body); g.addColorStop(0.64, P.body); g.addColorStop(1, P.lo);
  ctx.fillStyle = g; ctx.fill();
  ctx.save();
  ctx.clip();
  // belly
  if (L.belly) {
    const b = L.belly;
    ctx.save();
    ctx.translate(b[0], b[1]); ctx.rotate(b[4]); ctx.scale(b[2], b[3]);
    ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU);
    const bg = ctx.createRadialGradient(gx * 0.35, gy * 0.5 - 0.1, 0.05, 0, 0, 1.05);
    bg.addColorStop(0, P.belly); bg.addColorStop(0.6, mix(P.belly, P.bellyLo, 0.35)); bg.addColorStop(1, P.bellyLo);
    ctx.fillStyle = bg; ctx.fill();
    ctx.restore();
  }
  if (o.onBody) o.onBody(ctx);
  // darker rim
  ctx.fillStyle = cgrad(ctx, 'rim' + P.rim + L.shape, () => {
    const r = ctx.createRadialGradient(hc[0], hc[1], 0.6, hc[0], hc[1], L.shape === 'round' ? 1.02 : 1.2);
    r.addColorStop(0, rgba(P.rim, 0)); r.addColorStop(0.7, rgba(P.rim, 0.1)); r.addColorStop(1, rgba(P.rim, 0.42));
    return r;
  });
  ctx.fillRect(-1.6, -1.6, 3.2, 3.2);
  // bounce light crescent (opposite the key light)
  if (!L.mini) {
    ctx.beginPath(); bodyPath(ctx, L.shape);
    ctx.save(); ctx.translate(gx * 0.11, gy * 0.11); bodyPath(ctx, L.shape); ctx.restore();
    ctx.fillStyle = rgba(P.bounce || P.hi, P.sheen ? 0.34 : 0.24);
    ctx.fill('evenodd');
  }
  // specular
  const hl = L.hl || 0.5, ang = Math.atan2(gy, gx);
  const sx = hc[0] + gx * hl, sy = hc[1] + gy * hl;
  ctx.beginPath(); ctx.ellipse(sx, sy, 0.3, 0.155, ang + PI / 2, 0, TAU);
  ctx.fillStyle = P.sheen ? rgba(P.sheen, 0.45) : 'rgba(255,255,255,0.5)';
  ctx.fill();
  ctx.beginPath(); ctx.arc(sx - gy * 0.3 + gx * 0.06, sy + gx * 0.3 + gy * 0.06, 0.06, 0, TAU);
  ctx.fillStyle = P.sheen ? rgba(P.sheen, 0.7) : 'rgba(255,255,255,0.8)';
  ctx.fill();
  ctx.restore();
  ctx.beginPath(); bodyPath(ctx, L.shape);
  ctx.lineWidth = lw; ctx.strokeStyle = P.line; ctx.stroke();

  if (o.afterBody) o.afterBody(ctx);

  // --- face
  if (L.blush) for (let i = 0; i < L.blush.length; i++) softBlush(ctx, L.blush[i], P.blush, (o.blushA || 1) * (P.blushA || 1));
  const E = L.eyes;
  drawEye(ctx, E[0][0], E[0][1], E[0][2], E[0][3], 1, o, P);
  drawEye(ctx, E[1][0], E[1][1], E[1][2], E[1][3], -1, o, P);
  const bk = L.beak;
  if (!L.mini) {
    ctx.beginPath(); ctx.ellipse(bk[0] + 0.02, bk[1] + 0.2 * bk[2] + o.open * 0.1, 0.3 * bk[2] * Math.min(bk[3], 1.25), 0.1 * bk[2], -0.1, 0, TAU);
    ctx.fillStyle = rgba(P.line, 0.14); ctx.fill();
  }
  drawBeak(ctx, bk[0], bk[1], bk[2], bk[3], o.open, P, lw, o.beakOpt);
  if (o.hook) o.hook(ctx);
  // brows
  const B = L.brow;
  if (B && !o.noBrows) {
    const t0 = o.browTilt + (o.browAsym || 0), t1 = o.browTilt - (o.browAsym || 0);
    const d0 = E[0][2] + B.gap + B.th * 0.3 - o.browDy + (o.browLift0 || 0);
    const d1 = E[1][2] + B.gap + B.th * 0.3 - o.browDy + (o.browLift1 || 0);
    drawBrow(ctx, E[0][0] + 0.02, E[0][1] - d0, B.len[0], B.th, t0, 1, P, lw);
    drawBrow(ctx, E[1][0] - 0.01, E[1][1] - d1, B.len[1], B.th * 0.92, t1, -1, P, lw);
  }
  if (o.front) o.front(ctx);
}

// state → face options for ammo birds
function birdFace(L, s, state) {
  const o = {
    eyeMode: 'open', lid: L.lid || 0, lidSlant: L.lidSlant || 0, blink: +s.blink || 0,
    browTilt: L.brow.tilt, browDy: 0, browAsym: 0, open: 0, pupil: 1, beakOpt: null,
  };
  if (L.grin) o.beakOpt = { grin: L.grin };
  o.browAsym = L.browAsym || (L.shape === 'tri' ? -0.08 : 0);
  if (L.browLift1) o.browLift1 = L.browLift1;
  if (state === 'fly') {
    o.lid = L.sleepy ? 0.26 : Math.max(0.12, (L.lid || 0) * 0.6);
    o.lidSlant = 0.36;
    o.browTilt = L.brow.tilt + (L.sleepy ? 0.62 : 0.22);
    o.browDy = 0.08; o.browAsym = 0;
    o.open = 0.95; o.pupil = 0.82; o.beakOpt = null; o.browLift1 = 0;
  } else if (state === 'hurt') {
    o.eyeMode = 'x'; o.browTilt = -0.34; o.browDy = -0.05; o.open = 0.32; o.beakOpt = null; o.browAsym = 0; o.browLift1 = 0;
  } else if (state === 'dizzy') {
    o.eyeMode = 'spiral'; o.browTilt = -0.1; o.browAsym = 0.28; o.open = 0.28; o.beakOpt = null;
  }
  return o;
}

// ---------------------------------------------------------------------
//  Public: drawBird
// ---------------------------------------------------------------------
export function drawBird(ctx, type, x, y, r, angle, s) {
  s = s || EMPTY;
  if (!(r > 0)) return;
  angle = angle || 0;
  if (type === 'egg') { drawEggBomb(ctx, x, y, r, angle, s); return; }
  const key = type === 'mini' ? 'mini' : (BL[type] ? type : 'red');
  const P = BP[key === 'mini' ? 'blue' : key], L = BL[key];
  const time = +s.time || 0, flip = !!s.flip;
  const state = s.state || 'idle';
  const sq = clamp(+s.squash || 0, -0.6, 0.6);
  const breath = state === 'idle' ? Math.sin(time * 3.1 + x * 1.7) * 0.022 : 0;
  const sx = (1 + sq) * (1 - breath * 0.5), sy = (1 - sq) * (1 + breath);
  const ca = Math.cos(angle), sa = Math.sin(angle);
  let lx = +s.lookX || 0, ly = +s.lookY || 0;
  let llx = lx * ca + ly * sa, lly = -lx * sa + ly * ca;
  if (flip) llx = -llx;
  const lm = Math.hypot(llx, lly);
  if (lm > 1) { llx /= lm; lly /= lm; }
  let gx = LIGHT_X * ca + LIGHT_Y * sa, gy = -LIGHT_X * sa + LIGHT_Y * ca;
  if (flip) gx = -gx;

  const o = birdFace(L, s, state);
  o.lw = outlineW(r) / r; o.gx = gx; o.gy = gy; o.llx = llx; o.lly = lly; o.time = time;
  o.simple = !!L.mini;
  if (L.fuse) {
    const fz = clamp(+s.fuse || 0, 0, 1);
    o.afterBody = (c) => drawBombFuse(c, fz, time, o.lw);
  }
  if (state === 'dizzy') o.front = (c) => drawDizzyStars(c, 0.05, -1.25, 0.62, 0.16, 0.16, time, o.lw);

  ctx.save();
  ctx.translate(x, y);
  if (angle) ctx.rotate(angle);
  ctx.scale(sx * r * (flip ? -1 : 1), sy * r);
  birdFigure(ctx, P, L, o);
  ctx.restore();
}

function drawBombFuse(ctx, fz, time, lw) {
  // metal cap
  ctx.save();
  ctx.lineJoin = 'round';
  const len = 1 - fz * 0.55;
  const x0 = 0.1, y0 = -0.94, cx = 0.02, cy = -1.28, x1 = 0.34, y1 = -1.42;
  const tp = qpt(x0, y0, cx, cy, x1, y1, len);
  // partial curve control point for de Casteljau split
  const c2 = [x0 + (cx - x0) * len, y0 + (cy - y0) * len];
  drawRope(ctx, x0, y0, c2[0], c2[1], tp[0], tp[1], 0.12, lw, fz > 0);
  ctx.beginPath();
  roundRectPath(ctx, -0.07, -1.06, 0.3, 0.16, 0.05);
  ctx.fillStyle = cgrad(ctx, 'fusecap', () => {
    const g = ctx.createLinearGradient(-0.07, 0, 0.23, 0);
    g.addColorStop(0, '#8e95a6'); g.addColorStop(0.35, '#e4e8f0'); g.addColorStop(1, '#5a6070');
    return g;
  });
  ctx.fill();
  ctx.lineWidth = lw * 0.9; ctx.strokeStyle = '#1a1c24'; ctx.stroke();
  if (fz > 0) drawSpark(ctx, tp[0], tp[1], 0.2 + 0.3 * fz, time, lw, fz);
  ctx.restore();
}

// White bird's egg bomb
function drawEggBomb(ctx, x, y, r, angle, s) {
  const time = +s.time || 0;
  const sq = clamp(+s.squash || 0, -0.6, 0.6);
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const gx = LIGHT_X * ca + LIGHT_Y * sa, gy = -LIGHT_X * sa + LIGHT_Y * ca;
  const lw = outlineW(r) / r * 0.8;
  ctx.save();
  ctx.translate(x, y);
  if (angle) ctx.rotate(angle);
  ctx.scale(r * (1 + sq), r * (1 - sq));
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // fuse
  const fx0 = 0.02, fy0 = -1.02, fcx = -0.14, fcy = -1.34, fx1 = 0.2, fy1 = -1.5;
  drawRope(ctx, fx0, fy0, fcx, fcy, fx1, fy1, 0.13, lw, true);
  // body
  ctx.beginPath(); eggPath(ctx, -1.12, 1.0, 0.86, 0.2);
  const g = ctx.createRadialGradient(gx * 0.4, gy * 0.4, 0, gx * 0.4, gy * 0.4, 1.5);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, '#fbf4e2'); g.addColorStop(0.7, '#eadcc0'); g.addColorStop(1, '#bba888');
  ctx.fillStyle = g; ctx.fill();
  ctx.save(); ctx.clip();
  // speckles
  const sp = [[-0.4, -0.5, 0.07], [0.3, -0.62, 0.05], [0.5, 0.45, 0.08], [-0.55, 0.5, 0.06], [0.1, 0.7, 0.05], [-0.2, -0.85, 0.045], [0.62, -0.1, 0.05]];
  ctx.fillStyle = 'rgba(160,130,190,0.45)';
  for (const p of sp) { ctx.beginPath(); ctx.ellipse(p[0], p[1], p[2], p[2] * 0.75, 0.5, 0, TAU); ctx.fill(); }
  // jagged crack with molten glow leaking out
  const pulse = 0.5 + 0.5 * Math.sin(time * 9);
  const cr = [[-0.95, -0.05], [-0.62, 0.06], [-0.44, -0.12], [-0.18, 0.04], [0.02, -0.1], [0.2, 0.08], [0.36, -0.02]];
  const br = [[-0.18, 0.04], [-0.1, 0.26], [0.04, 0.34]];
  const crackPath = () => {
    ctx.beginPath();
    ctx.moveTo(cr[0][0], cr[0][1]);
    for (let i = 1; i < cr.length; i++) ctx.lineTo(cr[i][0], cr[i][1]);
    ctx.moveTo(br[0][0], br[0][1]);
    for (let i = 1; i < br.length; i++) ctx.lineTo(br[i][0], br[i][1]);
  };
  ctx.fillStyle = cgrad(ctx, 'eggglow', () => {
    const q = ctx.createRadialGradient(-0.3, 0.0, 0.05, -0.3, 0.0, 0.8);
    q.addColorStop(0, 'rgba(255,170,60,0.55)'); q.addColorStop(1, 'rgba(255,120,40,0)');
    return q;
  });
  ctx.globalAlpha = 0.45 + 0.55 * pulse;
  ctx.fillRect(-1.2, -0.9, 2.4, 1.8);
  ctx.globalAlpha = 1;
  crackPath();
  ctx.strokeStyle = '#5a3a1e'; ctx.lineWidth = lw * 1.8; ctx.stroke();
  crackPath();
  ctx.strokeStyle = mix('#ff7a1a', '#fff09a', pulse); ctx.lineWidth = lw * 0.8; ctx.stroke();
  // rim & specular
  ctx.fillStyle = cgrad(ctx, 'eggrim', () => {
    const q = ctx.createRadialGradient(0, 0, 0.6, 0, 0, 1.15);
    q.addColorStop(0, 'rgba(120,100,70,0)'); q.addColorStop(1, 'rgba(120,100,70,0.35)');
    return q;
  });
  ctx.fillRect(-1.5, -1.5, 3, 3);
  ctx.beginPath(); ctx.ellipse(gx * 0.5, gy * 0.5, 0.28, 0.15, Math.atan2(gy, gx) + PI / 2, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fill();
  ctx.restore();
  ctx.beginPath(); eggPath(ctx, -1.12, 1.0, 0.86, 0.2);
  ctx.lineWidth = lw; ctx.strokeStyle = '#5a4a33'; ctx.stroke();
  // fuse collar
  ctx.beginPath(); ctx.ellipse(0.02, -1.06, 0.14, 0.07, 0, 0, TAU);
  ctx.fillStyle = '#9aa0ae'; ctx.fill(); ctx.lineWidth = lw * 0.8; ctx.strokeStyle = '#2a2c34'; ctx.stroke();
  drawSpark(ctx, fx1, fy1, 0.34, time, lw, 1);
  ctx.restore();
}

// ---------------------------------------------------------------------
//  Commander (captain + slingshot cart)
// ---------------------------------------------------------------------
const CAP_R = 0.62;
const CAP_X = -0.25, CAP_Y = -0.68;
const SL_BACK = [0.52, -1.14], SL_FRONT = [1.04, -1.12], SL_REST = [0.78, -1.02];
const FORK_CROTCH = [0.79, -0.54], FORK_BASE = [0.72, 0.22];

export function slingAnchors(x, y, facing) {
  const f = facing < 0 ? -1 : 1;
  return {
    back: { x: x + f * SL_BACK[0], y: y + SL_BACK[1] },
    front: { x: x + f * SL_FRONT[0], y: y + SL_FRONT[1] },
    rest: { x: x + f * SL_REST[0], y: y + SL_REST[1] },
  };
}

const CAP_P = [
  {
    body: '#f0572f', hi: '#ffab80', lo: '#c23a1b', rim: '#8a200c', line: '#4d1407',
    belly: '#fff2df', bellyLo: '#f5cfa8', tail: '#8c2a12', tailLine: '#3a0f05', tuft: '#d8431f',
    brow: '#2d130c', lid: '#dc4a22', blush: '#ff6f8e', bounce: '#ffbd94', wing: '#d9471f', ...BEAK_STD,
  },
  {
    body: '#2f9be8', hi: '#a4dcff', lo: '#1b69b4', rim: '#0d4380', line: '#0a2848',
    belly: '#eef9ff', bellyLo: '#bcdcf2', tail: '#1a4f88', tailLine: '#081c33', tuft: '#2a86d6',
    brow: '#0e2036', lid: '#2a88d0', blush: '#ff7fa6', bounce: '#b3e6ff', wing: '#2585d4', ...BEAK_STD,
  },
];
const CAP_L = {
  shape: 'round',
  eyes: [[0.08, -0.06, 0.29, 1], [0.61, -0.08, 0.255, 0.84]],
  brow: { th: 0.19, len: [0.48, 0.37], gap: 0.05, tilt: 0.36 },
  beak: [0.5, 0.32, 0.9, 1.0],
  belly: [0.16, 0.56, 0.72, 0.5, -0.15],
  blush: [[-0.22, 0.26, 0.16, 0.09], [0.88, 0.18, 0.075, 0.06]],
  tail: [[-0.84, 0.5, 0.5, 0.24, PI + 0.35, 0.25], [-0.8, 0.64, 0.44, 0.22, PI + 0.7, 0.25]],
  hc: [0, 0], hl: 0.55,
};

const _capPalCache = new Map();
function tintedPal(P, tint, amt) {
  if (amt <= 0.01) return P;
  const q = Math.round(amt * 24) / 24;
  const k = P.body + tint + q;
  let T = _capPalCache.get(k);
  if (T) return T;
  T = Object.assign({}, P);
  for (const f of ['body', 'hi', 'lo', 'rim', 'belly', 'bellyLo', 'tail', 'lid', 'wing', 'bounce']) T[f] = mix(P[f], tint, q);
  if (_capPalCache.size > 400) _capPalCache.clear();
  _capPalCache.set(k, T);
  return T;
}

function captainFaceOpts(s, time) {
  const mood = s.mood || 'normal';
  const hp = s.hp == null ? 1 : s.hp;
  const hurt = clamp(+s.hurt || 0, 0, 1);
  const o = {
    eyeMode: 'open', lid: 0.04, lidSlant: 0.14, blink: +s.blink || 0,
    browTilt: CAP_L.brow.tilt, browDy: 0, browAsym: 0, open: 0, pupil: 1, beakOpt: null,
    llx: 0.75, lly: 0.05, sweat: false, bandage: false, stars: false, tremble: 0, blushA: 1, wingUp: 0,
  };
  if (mood === 'aim') {
    o.lid = 0.22; o.lidSlant = 0.34; o.browTilt = 0.52; o.browDy = 0.06; o.llx = 0.9; o.lly = -0.35; o.pupil = 0.85;
    o.beakOpt = { grin: 0.08 }; o.wingUp = 1;
  } else if (mood === 'happy') {
    o.eyeMode = 'happy'; o.browTilt = -0.12; o.browDy = -0.07; o.open = 0.8; o.blushA = 1.5; o.wingUp = 0.7;
  } else if (mood === 'scared') {
    o.browTilt = -0.42; o.browDy = -0.1; o.pupil = 0.55; o.open = 0.38; o.tremble = 1; o.sweat = true; o.lid = 0;
    o.llx = 0.2; o.lly = -0.1;
  }
  if (hp < 0.35) {
    o.bandage = true; o.sweat = true;
    if (mood !== 'happy') { o.browTilt = Math.min(o.browTilt, 0.12) - 0.1; o.browAsym = 0.12; }
  }
  if (hp < 0.15) { o.eyeMode = 'spiral'; o.stars = true; o.open = 0.3; o.browTilt = -0.2; }
  if (hurt > 0.15) { o.eyeMode = 'x'; o.browTilt = -0.36; o.browDy = -0.05; o.open = 0.45; o.beakOpt = null; }
  if (s.dead) {
    o.eyeMode = 'dead'; o.open = 0.55; o.beakOpt = { tongueOut: true }; o.browTilt = -0.25; o.browDy = -0.02;
    o.sweat = false; o.stars = false; o.tremble = 0;
  }
  return o;
}

// helmets are drawn in captain unit space (body radius 1)
function drawArmyHelmet(ctx, lw, gx, gy) {
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // dome
  ctx.beginPath();
  ctx.moveTo(-1.0, -0.36);
  ctx.bezierCurveTo(-1.04, -1.28, 0.98, -1.34, 1.02, -0.46);
  ctx.quadraticCurveTo(0.0, -0.66, -1.0, -0.36);
  ctx.closePath();
  const g = ctx.createRadialGradient(gx * 0.45, -0.6 + gy * 0.5, 0.02, gx * 0.2, -0.7 + gy * 0.2, 1.35);
  g.addColorStop(0, '#c5d27a'); g.addColorStop(0.3, '#8a9a3f'); g.addColorStop(0.75, '#5e6b27'); g.addColorStop(1, '#3a4416');
  ctx.fillStyle = g; ctx.fill();
  ctx.save(); ctx.clip();
  // canvas cover seam
  ctx.beginPath(); ctx.moveTo(-0.95, -0.72); ctx.quadraticCurveTo(0.0, -1.0, 0.98, -0.82);
  ctx.strokeStyle = 'rgba(40,50,12,0.35)'; ctx.lineWidth = lw * 0.9; ctx.stroke();
  ctx.setLineDash([0.05, 0.06]);
  ctx.beginPath(); ctx.moveTo(-0.92, -0.78); ctx.quadraticCurveTo(0.0, -1.06, 0.96, -0.88);
  ctx.strokeStyle = 'rgba(230,240,190,0.35)'; ctx.lineWidth = lw * 0.55; ctx.stroke();
  ctx.setLineDash([]);
  // gloss
  const ang = Math.atan2(gy, gx);
  ctx.beginPath(); ctx.ellipse(gx * 0.5 - 0.05, -0.72 + gy * 0.38, 0.34, 0.12, ang + PI / 2 + 0.25, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,230,0.42)'; ctx.fill();
  ctx.beginPath(); ctx.arc(gx * 0.58 + 0.12, -0.72 + gy * 0.5 + 0.02, 0.045, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,240,0.8)'; ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.moveTo(-1.0, -0.36);
  ctx.bezierCurveTo(-1.04, -1.28, 0.98, -1.34, 1.02, -0.46);
  ctx.strokeStyle = '#1e2508'; ctx.lineWidth = lw; ctx.stroke();
  // gold star
  ctx.save();
  ctx.translate(0.24, -0.82); ctx.scale(0.86, 1); ctx.rotate(0.08);
  ctx.beginPath(); starPath(ctx, 0, 0, 0.25, 0.11, 5, 0);
  const sg = ctx.createLinearGradient(-0.2, -0.25, 0.2, 0.25);
  sg.addColorStop(0, '#fff6b0'); sg.addColorStop(0.45, '#ffd02a'); sg.addColorStop(1, '#e08a00');
  ctx.fillStyle = sg; ctx.fill();
  ctx.lineWidth = lw * 0.85; ctx.strokeStyle = '#6b3d00'; ctx.stroke();
  ctx.beginPath(); starPath(ctx, -0.03, -0.03, 0.1, 0.045, 5, 0);
  ctx.fillStyle = 'rgba(255,255,220,0.8)'; ctx.fill();
  ctx.restore();
  // brim
  ctx.beginPath();
  ctx.moveTo(-1.08, -0.3);
  ctx.quadraticCurveTo(-0.02, -0.62, 1.1, -0.44);
  ctx.quadraticCurveTo(1.22, -0.4, 1.2, -0.32);
  ctx.quadraticCurveTo(0.02, -0.46, -1.06, -0.18);
  ctx.quadraticCurveTo(-1.14, -0.24, -1.08, -0.3);
  ctx.closePath();
  const bg = ctx.createLinearGradient(0, -0.62, 0, -0.2);
  bg.addColorStop(0, '#8c9b44'); bg.addColorStop(1, '#4a5620');
  ctx.fillStyle = bg; ctx.fill();
  ctx.lineWidth = lw; ctx.strokeStyle = '#1e2508'; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-0.98, -0.3); ctx.quadraticCurveTo(-0.02, -0.57, 1.08, -0.41);
  ctx.strokeStyle = 'rgba(230,240,180,0.45)'; ctx.lineWidth = lw * 0.6; ctx.stroke();
  // rivets
  const rv = [[-0.78, -0.33], [-0.34, -0.44], [0.2, -0.47], [0.7, -0.42]];
  for (const p of rv) {
    ctx.beginPath(); ctx.arc(p[0], p[1], 0.04, 0, TAU);
    ctx.fillStyle = '#c9c18a'; ctx.fill(); ctx.lineWidth = lw * 0.5; ctx.strokeStyle = '#2a300c'; ctx.stroke();
  }
  ctx.restore();
}

function hornPath(ctx, bx, by, cx, cy, tx, ty, w) {
  taperPath(ctx, bx, by, cx, cy, tx, ty, w, 0.02, 10, false, true);
}
function drawHorn(ctx, bx, by, cx, cy, tx, ty, w, lw) {
  ctx.beginPath(); hornPath(ctx, bx, by, cx, cy, tx, ty, w);
  const g = ctx.createLinearGradient(bx, by, tx, ty);
  g.addColorStop(0, '#e6d2a2'); g.addColorStop(0.55, '#fff4d8'); g.addColorStop(1, '#f7e6bd');
  ctx.fillStyle = g; ctx.fill();
  ctx.save(); ctx.clip();
  // ridges
  ctx.lineWidth = lw * 0.7; ctx.strokeStyle = 'rgba(160,120,60,0.55)';
  for (let i = 1; i <= 3; i++) {
    const t = i * 0.17;
    const p = qpt(bx, by, cx, cy, tx, ty, t), q = qpt(bx, by, cx, cy, tx, ty, t + 0.02);
    let dx = q[0] - p[0], dy = q[1] - p[1]; const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const ww = w * (1 - t) * 0.7;
    ctx.beginPath();
    ctx.moveTo(p[0] - dy * ww, p[1] + dx * ww);
    ctx.quadraticCurveTo(p[0] + dx * ww * 0.3, p[1] + dy * ww * 0.3, p[0] + dy * ww, p[1] - dx * ww);
    ctx.stroke();
  }
  // shade side
  ctx.beginPath(); hornPath(ctx, bx + 0.06, by + 0.05, cx + 0.07, cy + 0.06, tx + 0.04, ty + 0.05, w);
  ctx.fillStyle = 'rgba(150,110,50,0.25)'; ctx.fill();
  ctx.restore();
  ctx.beginPath(); hornPath(ctx, bx, by, cx, cy, tx, ty, w);
  ctx.lineWidth = lw; ctx.strokeStyle = '#5a4222'; ctx.stroke();
}

function drawVikingHelmet(ctx, lw, gx, gy) {
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  // back horn (far side)
  drawHorn(ctx, -0.72, -0.74, -1.24, -0.92, -1.2, -1.44, 0.34, lw);
  // dome
  ctx.beginPath();
  ctx.moveTo(-0.96, -0.4);
  ctx.bezierCurveTo(-1.0, -1.26, 0.94, -1.32, 0.98, -0.48);
  ctx.quadraticCurveTo(0.0, -0.66, -0.96, -0.4);
  ctx.closePath();
  const g = ctx.createRadialGradient(gx * 0.45, -0.66 + gy * 0.45, 0.02, gx * 0.15, -0.72 + gy * 0.15, 1.3);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.28, '#dfe6ee'); g.addColorStop(0.7, '#a2adbb'); g.addColorStop(1, '#6d7888');
  ctx.fillStyle = g; ctx.fill();
  ctx.save(); ctx.clip();
  // center ridge band
  ctx.beginPath();
  ctx.moveTo(0.02, -0.6); ctx.bezierCurveTo(0.0, -0.9, 0.0, -1.1, -0.06, -1.2);
  ctx.lineTo(0.14, -1.2); ctx.bezierCurveTo(0.2, -1.1, 0.2, -0.9, 0.2, -0.62); ctx.closePath();
  const rg = ctx.createLinearGradient(0, 0, 0.22, 0);
  rg.addColorStop(0, '#c98a2c'); rg.addColorStop(0.45, '#ffd46e'); rg.addColorStop(1, '#a8661a');
  ctx.fillStyle = rg; ctx.fill();
  ctx.lineWidth = lw * 0.7; ctx.strokeStyle = '#5a3208'; ctx.stroke();
  for (const yy of [-0.76, -0.9, -1.04]) {
    ctx.beginPath(); ctx.arc(0.1, yy, 0.035, 0, TAU); ctx.fillStyle = '#fff0b8'; ctx.fill();
    ctx.lineWidth = lw * 0.4; ctx.strokeStyle = '#5a3208'; ctx.stroke();
  }
  // gloss
  const ang = Math.atan2(gy, gx);
  ctx.beginPath(); ctx.ellipse(gx * 0.52 - 0.12, -0.76 + gy * 0.4, 0.3, 0.11, ang + PI / 2 + 0.3, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.moveTo(-0.96, -0.4);
  ctx.bezierCurveTo(-1.0, -1.26, 0.94, -1.32, 0.98, -0.48);
  ctx.lineWidth = lw; ctx.strokeStyle = '#2a3340'; ctx.stroke();
  // rim band (bronze)
  ctx.beginPath();
  ctx.moveTo(-1.02, -0.34);
  ctx.quadraticCurveTo(0.0, -0.66, 1.04, -0.46);
  ctx.quadraticCurveTo(1.1, -0.38, 1.04, -0.32);
  ctx.quadraticCurveTo(0.0, -0.5, -1.0, -0.2);
  ctx.quadraticCurveTo(-1.08, -0.27, -1.02, -0.34);
  ctx.closePath();
  const bg = ctx.createLinearGradient(0, -0.6, 0, -0.24);
  bg.addColorStop(0, '#ffd978'); bg.addColorStop(0.5, '#d9962e'); bg.addColorStop(1, '#9a5a14');
  ctx.fillStyle = bg; ctx.fill();
  ctx.lineWidth = lw; ctx.strokeStyle = '#4a2a06'; ctx.stroke();
  const rv = [[-0.76, -0.33], [-0.3, -0.44], [0.2, -0.47], [0.68, -0.42]];
  for (const p of rv) {
    ctx.beginPath(); ctx.arc(p[0], p[1], 0.038, 0, TAU);
    ctx.fillStyle = '#fff2c0'; ctx.fill(); ctx.lineWidth = lw * 0.45; ctx.strokeStyle = '#4a2a06'; ctx.stroke();
  }
  // front horn (near side)
  drawHorn(ctx, 0.68, -0.8, 1.2, -0.92, 1.14, -1.44, 0.34, lw);
  ctx.restore();
}

function drawBandage(ctx, x, y, lw) {
  ctx.save();
  ctx.translate(x, y);
  for (const a of [-0.55, 0.55]) {
    ctx.save(); ctx.rotate(a);
    ctx.beginPath(); roundRectPath(ctx, -0.23, -0.075, 0.46, 0.15, 0.06);
    ctx.fillStyle = '#f6dcb4'; ctx.fill();
    ctx.lineWidth = lw * 0.75; ctx.strokeStyle = '#8a6440'; ctx.stroke();
    ctx.fillStyle = 'rgba(160,110,70,0.55)';
    for (const dx of [-0.15, 0.15]) for (const dy of [-0.025, 0.025]) { ctx.beginPath(); ctx.arc(dx, dy, 0.012, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  ctx.beginPath(); roundRectPath(ctx, -0.07, -0.07, 0.14, 0.14, 0.03);
  ctx.fillStyle = '#ffeed8'; ctx.fill();
  ctx.lineWidth = lw * 0.5; ctx.strokeStyle = '#b08a60'; ctx.stroke();
  ctx.restore();
}

const CAP_L_ICON = Object.assign({}, CAP_L, { tail: null });
function drawCaptainFigure(ctx, team, s, fo, lw, gx, gy, time, layout) {
  let P = CAP_P[team ? 1 : 0];
  const hurt = clamp(+s.hurt || 0, 0, 1);
  if (hurt > 0.01) {
    const tint = Math.sin(time * 38) > 0 ? '#ffffff' : '#ff2a2a';
    P = tintedPal(P, tint, hurt * 0.6);
  }
  const o = Object.assign({}, fo);
  o.lw = lw; o.gx = gx; o.gy = gy; o.time = time;
  const dead = !!s.dead;
  o.hook = (c) => {
    c.save();
    if (dead) { c.translate(-0.22, -0.12); c.rotate(-0.32); }
    if (team) drawVikingHelmet(c, lw, gx, gy); else drawArmyHelmet(c, lw, gx, gy);
    c.restore();
  };
  o.front = (c) => {
    if (fo.bandage) drawBandage(c, -0.5, 0.02, lw);
    if (fo.sweat) drawSweat(c, 0.98, -0.34, 1.1, time, lw);
    if (fo.stars) drawDizzyStars(c, 0.0, -1.35, 0.8, 0.2, 0.16, time, lw);
  };
  birdFigure(ctx, P, layout || CAP_L, o);
  return P;
}

// captain's flipper-wing gripping the cart rail (drawn after the cart panel)
function drawRailWing(ctx, P, x, y, pose, time, lw) {
  ctx.save();
  ctx.translate(x, y);
  let rot = 0;
  if (pose === 'happy') rot = -0.45 + Math.sin(time * 11) * 0.35;
  else if (pose === 'dead') { rot = 0.55; ctx.translate(0.02, 0.03); }
  else if (pose === 'aim') rot = -0.15;
  ctx.rotate(rot);
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-0.15, -0.07);
  ctx.bezierCurveTo(-0.04, -0.17, 0.17, -0.12, 0.19, 0.02);
  ctx.bezierCurveTo(0.2, 0.13, 0.12, 0.22, 0.05, 0.22);
  ctx.bezierCurveTo(0.0, 0.15, -0.07, 0.1, -0.12, 0.05);
  ctx.closePath();
  const g = ctx.createLinearGradient(-0.1, -0.15, 0.12, 0.22);
  g.addColorStop(0, P.hi); g.addColorStop(0.45, P.body); g.addColorStop(1, P.lo);
  ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = lw; ctx.strokeStyle = P.line; ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0.06, 0.03); ctx.quadraticCurveTo(0.1, 0.1, 0.08, 0.17);
  ctx.moveTo(0.13, 0.0); ctx.quadraticCurveTo(0.16, 0.07, 0.15, 0.13);
  ctx.strokeStyle = rgba(P.line, 0.45); ctx.lineWidth = lw * 0.6; ctx.stroke();
  ctx.restore();
}

// --- cart parts (local space: +x = front/facing, origin = physics center)
const WOOD = { hi: '#f4c689', base: '#d4944f', lo: '#9c5f2b', line: '#3c220c', grain: 'rgba(120,64,24,0.45)' };
const FORK = { hi: '#dca06a', base: '#a86b36', lo: '#6a3e18', line: '#2c1808' };
const IRON = { hi: '#b9c0cc', base: '#5d6470', lo: '#343944', line: '#15181e' };

function drawWheel(ctx, cx, cy, R, ang, lw) {
  ctx.save();
  ctx.translate(cx, cy);
  // tire
  ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU);
  ctx.fillStyle = cgrad(ctx, 'tire' + R, () => {
    const g = ctx.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.2, 0, 0, R);
    g.addColorStop(0, '#8a919e'); g.addColorStop(0.7, '#555c68'); g.addColorStop(1, '#2d323b');
    return g;
  });
  ctx.fill();
  ctx.lineWidth = lw; ctx.strokeStyle = IRON.line; ctx.stroke();
  ctx.rotate(ang);
  // studs on iron tire
  ctx.fillStyle = '#c3c9d3';
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = i * TAU / 8, sx = Math.cos(a) * R * 0.93, sy = Math.sin(a) * R * 0.93;
    ctx.moveTo(sx + R * 0.045, sy); ctx.arc(sx, sy, R * 0.045, 0, TAU);
  }
  ctx.fill();
  // wooden felloe
  const rw = R * 0.8;
  ctx.beginPath(); ctx.arc(0, 0, rw, 0, TAU); ctx.arc(0, 0, rw * 0.72, 0, TAU, true);
  ctx.fillStyle = WOOD.base; ctx.fill();
  ctx.lineWidth = lw * 0.7; ctx.strokeStyle = WOOD.line; ctx.stroke();
  // spokes
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = i * TAU / 6;
    ctx.moveTo(Math.cos(a) * R * 0.12, Math.sin(a) * R * 0.12);
    ctx.lineTo(Math.cos(a) * rw * 0.76, Math.sin(a) * rw * 0.76);
  }
  ctx.strokeStyle = WOOD.line; ctx.lineWidth = R * 0.17 + lw * 1.2; ctx.stroke();
  ctx.strokeStyle = WOOD.base; ctx.lineWidth = R * 0.17; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,230,180,0.45)'; ctx.lineWidth = R * 0.05; ctx.stroke();
  // hub
  ctx.beginPath(); ctx.arc(0, 0, R * 0.27, 0, TAU);
  ctx.fillStyle = IRON.base; ctx.fill(); ctx.lineWidth = lw * 0.8; ctx.strokeStyle = IRON.line; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, R * 0.12, 0, TAU);
  ctx.fillStyle = IRON.hi; ctx.fill(); ctx.stroke();
  ctx.restore();
  // fixed rim shading (not rotating) — light from upper-left
  ctx.save(); ctx.translate(cx, cy);
  ctx.beginPath(); ctx.arc(0, 0, R * 0.9, PI * 1.05, PI * 1.55);
  ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = R * 0.06; ctx.lineCap = 'round'; ctx.stroke();
  ctx.restore();
}

function woodBoardPath(ctx) {
  // trapezoid cart side panel with rounded corners
  const pts = [[-0.86, -0.07], [0.82, -0.07], [0.72, 0.4], [-0.76, 0.4]];
  const r = 0.07;
  const n = pts.length;
  const m0 = [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2];
  ctx.moveTo(m0[0], m0[1]);
  for (let i = 1; i <= n; i++) {
    const a = pts[i % n], b = pts[(i + 1) % n];
    ctx.arcTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, r);
  }
  ctx.closePath();
}

function drawCartPanel(ctx, lw, team) {
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath(); woodBoardPath(ctx);
  ctx.fillStyle = cgrad(ctx, 'cartpanel', () => {
    const g = ctx.createLinearGradient(0, -0.07, 0, 0.4);
    g.addColorStop(0, WOOD.hi); g.addColorStop(0.35, WOOD.base); g.addColorStop(1, WOOD.lo);
    return g;
  });
  ctx.fill();
  ctx.save(); ctx.clip();
  // plank seams
  for (const yy of [0.09, 0.25]) {
    ctx.beginPath(); ctx.moveTo(-0.9, yy); ctx.lineTo(0.9, yy);
    ctx.strokeStyle = 'rgba(70,35,10,0.75)'; ctx.lineWidth = lw * 0.8; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-0.9, yy + lw * 0.8); ctx.lineTo(0.9, yy + lw * 0.8);
    ctx.strokeStyle = 'rgba(255,225,170,0.45)'; ctx.lineWidth = lw * 0.5; ctx.stroke();
  }
  // grain
  ctx.strokeStyle = WOOD.grain; ctx.lineWidth = lw * 0.4;
  const grains = [[0.0, -0.8, 0.3, 0.02], [0.04, -0.1, 0.6, -0.015], [0.15, -0.7, 0.1, 0.02], [0.19, 0.2, 0.7, -0.02], [0.31, -0.6, 0.2, 0.015], [0.35, 0.3, 0.65, 0.02]];
  for (const q of grains) {
    ctx.beginPath(); ctx.moveTo(q[1], q[0]);
    ctx.bezierCurveTo(q[1] + (q[2] - q[1]) * 0.33, q[0] + q[3], q[1] + (q[2] - q[1]) * 0.66, q[0] - q[3], q[2], q[0]);
    ctx.stroke();
  }
  // knot
  ctx.beginPath(); ctx.ellipse(-0.42, 0.32, 0.06, 0.03, 0, 0, TAU); ctx.strokeStyle = 'rgba(110,60,20,0.6)'; ctx.stroke();
  ctx.restore();
  ctx.beginPath(); woodBoardPath(ctx);
  ctx.lineWidth = lw; ctx.strokeStyle = WOOD.line; ctx.stroke();
  // top rail
  ctx.beginPath(); roundRectPath(ctx, -0.92, -0.13, 1.8, 0.12, 0.05);
  ctx.fillStyle = cgrad(ctx, 'cartrail', () => {
    const g = ctx.createLinearGradient(0, -0.13, 0, -0.01);
    g.addColorStop(0, '#e3a868'); g.addColorStop(1, '#8e5424');
    return g;
  });
  ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = WOOD.line; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-0.86, -0.105); ctx.lineTo(0.82, -0.105);
  ctx.strokeStyle = 'rgba(255,235,190,0.6)'; ctx.lineWidth = lw * 0.5; ctx.stroke();
  // iron corner brackets
  const brk = (x, flip) => {
    ctx.save(); ctx.translate(x, -0.07); ctx.scale(flip, 1);
    ctx.beginPath();
    ctx.moveTo(-0.02, -0.07); ctx.lineTo(0.2, -0.07); ctx.lineTo(0.2, 0.05); ctx.lineTo(0.1, 0.05);
    ctx.lineTo(0.08, 0.3); ctx.lineTo(-0.04, 0.3); ctx.closePath();
    ctx.fillStyle = IRON.base; ctx.fill(); ctx.lineWidth = lw * 0.8; ctx.strokeStyle = IRON.line; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0.0, -0.05); ctx.lineTo(0.18, -0.05);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = lw * 0.5; ctx.stroke();
    ctx.fillStyle = IRON.hi;
    for (const p of [[0.03, -0.01], [0.15, -0.01], [0.02, 0.2]]) { ctx.beginPath(); ctx.arc(p[0], p[1], 0.022, 0, TAU); ctx.fill(); }
    ctx.restore();
  };
  brk(-0.84, 1); brk(0.8, -1);
  // painted team emblem
  ctx.save();
  ctx.translate(0.0, 0.17);
  ctx.beginPath(); ctx.arc(0, 0, 0.14, 0, TAU);
  ctx.fillStyle = team ? '#2f8fe0' : '#e84a2a'; ctx.fill();
  ctx.lineWidth = lw * 0.8; ctx.strokeStyle = team ? '#0c2d52' : '#5a1408'; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, 0.105, 0, TAU); ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = lw * 0.45; ctx.stroke();
  if (team) {
    // tiny horned helmet glyph
    ctx.beginPath(); ctx.arc(0, 0.03, 0.055, PI, 0); ctx.closePath();
    ctx.fillStyle = '#ffffff'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(-0.05, 0.0); ctx.quadraticCurveTo(-0.1, -0.02, -0.09, -0.08);
    ctx.moveTo(0.05, 0.0); ctx.quadraticCurveTo(0.1, -0.02, 0.09, -0.08);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.025; ctx.stroke();
  } else {
    ctx.beginPath(); starPath(ctx, 0, 0.005, 0.085, 0.036, 5, 0); ctx.fillStyle = '#ffe07a'; ctx.fill();
  }
  ctx.restore();
  ctx.restore();
}

function drawPennant(ctx, team, time, lw) {
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // pole
  ctx.beginPath(); ctx.moveTo(-0.8, 0.0); ctx.lineTo(-0.98, -1.36);
  ctx.strokeStyle = WOOD.line; ctx.lineWidth = 0.055 + lw * 1.4; ctx.stroke();
  ctx.strokeStyle = '#b0773e'; ctx.lineWidth = 0.055; ctx.stroke();
  ctx.beginPath(); ctx.arc(-0.985, -1.38, 0.045, 0, TAU); ctx.fillStyle = '#ffd24a'; ctx.fill();
  ctx.lineWidth = lw * 0.7; ctx.strokeStyle = '#6b4000'; ctx.stroke();
  // waving flag
  const w1 = Math.sin(time * 5.2) * 0.05, w2 = Math.sin(time * 5.2 - 1.3) * 0.07;
  const ax = -0.975, ay0 = -1.32, ay1 = -1.07;
  const tx = -1.34, ty = -1.2 + w2;
  ctx.beginPath();
  ctx.moveTo(ax, ay0);
  ctx.bezierCurveTo(ax - 0.14, ay0 + w1, ax - 0.3, ay0 + 0.06 - w1, tx, ty);
  ctx.bezierCurveTo(ax - 0.3, ay1 - 0.06 - w1, ax - 0.14, ay1 + w1, ax, ay1);
  ctx.closePath();
  const col = team ? '#2f8fe0' : '#e84a2a';
  const fg = ctx.createLinearGradient(ax, 0, tx, 0);
  fg.addColorStop(0, mix(col, '#ffffff', 0.15)); fg.addColorStop(0.5, col); fg.addColorStop(1, mix(col, '#000000', 0.2));
  ctx.fillStyle = fg; ctx.fill();
  ctx.lineWidth = lw * 0.8; ctx.strokeStyle = team ? '#0c2d52' : '#5a1408'; ctx.stroke();
  // stripe
  ctx.beginPath();
  ctx.moveTo(ax - 0.02, ay0 + 0.1); ctx.bezierCurveTo(ax - 0.14, ay0 + 0.1 + w1 * 0.8, ax - 0.26, ay0 + 0.12 - w1, tx + 0.12, ty - 0.005);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 0.035; ctx.stroke();
  ctx.restore();
}

function drawForkArm(ctx, x0, y0, cx, cy, x1, y1, w0, w1, lw, lightSide) {
  ctx.beginPath(); taperPath(ctx, x0, y0, cx, cy, x1, y1, w0, w1, 8, true, true);
  ctx.fillStyle = FORK.base; ctx.fill();
  ctx.save(); ctx.clip();
  // shade & highlight bands along the limb
  ctx.beginPath(); taperPath(ctx, x0 - lightSide * w0 * 0.3, y0, cx - lightSide * w0 * 0.3, cy, x1 - lightSide * w1 * 0.3, y1, w0 * 0.55, w1 * 0.55, 8, true, true);
  ctx.fillStyle = FORK.lo; ctx.fill();
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x0 + lightSide * w0 * 0.2, y0); ctx.quadraticCurveTo(cx + lightSide * w0 * 0.2, cy, x1 + lightSide * w1 * 0.2, y1);
  ctx.strokeStyle = FORK.hi; ctx.lineWidth = w1 * 0.3; ctx.stroke();
  ctx.restore();
  ctx.beginPath(); taperPath(ctx, x0, y0, cx, cy, x1, y1, w0, w1, 8, true, true);
  ctx.lineWidth = lw; ctx.strokeStyle = FORK.line; ctx.lineJoin = 'round'; ctx.stroke();
}

function drawForkWrap(ctx, x, y, w, lw) {
  // leather wrap where the band is tied, just under the tip
  ctx.save();
  ctx.translate(x, y + 0.1);
  ctx.beginPath(); roundRectPath(ctx, -w * 0.62, -0.07, w * 1.24, 0.14, 0.03);
  ctx.fillStyle = '#4a2416'; ctx.fill(); ctx.lineWidth = lw * 0.7; ctx.strokeStyle = '#1a0a04'; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-w * 0.55, -0.02); ctx.lineTo(w * 0.55, -0.035); ctx.moveTo(-w * 0.55, 0.035); ctx.lineTo(w * 0.55, 0.02);
  ctx.strokeStyle = 'rgba(255,190,150,0.35)'; ctx.lineWidth = lw * 0.45; ctx.stroke();
  ctx.restore();
}

function drawBand(ctx, x0, y0, x1, y1, w, tension) {
  const col = mix('#6e2219', '#a8493a', tension * 0.8);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
  ctx.strokeStyle = '#26090a'; ctx.lineWidth = w + 0.028; ctx.stroke();
  ctx.strokeStyle = col; ctx.lineWidth = w; ctx.stroke();
  // highlight
  const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy) || 1;
  const ox = (dy / d) * w * 0.22, oy = (-dx / d) * w * 0.22;
  ctx.beginPath(); ctx.moveTo(x0 + ox, y0 + oy - w * 0.1); ctx.lineTo(x1 + ox, y1 + oy - w * 0.1);
  ctx.strokeStyle = rgba('#ff9a80', 0.35 + tension * 0.2); ctx.lineWidth = w * 0.25; ctx.stroke();
  ctx.restore();
}

function drawPouch(ctx, px, py, ang, span, rad, lw) {
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const a0 = ang - span, a1 = ang + span, ro = rad + 0.075, ri = rad - 0.045;
  // leather cup (crescent)
  ctx.beginPath();
  ctx.arc(px, py, ro, a0, a1);
  ctx.arc(px + Math.cos(a1) * rad, py + Math.sin(a1) * rad, 0.06, a1, a1 + PI);
  ctx.arc(px, py, ri, a1, a0, true);
  ctx.arc(px + Math.cos(a0) * rad, py + Math.sin(a0) * rad, 0.06, a0 + PI, a0);
  ctx.closePath();
  const g = ctx.createRadialGradient(px, py, ri, px, py, ro);
  g.addColorStop(0, '#9a5a2c'); g.addColorStop(0.5, '#6e3a1a'); g.addColorStop(1, '#4a230c');
  ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = lw * 0.9; ctx.strokeStyle = '#1e0d05'; ctx.stroke();
  // stitching
  ctx.setLineDash([0.03, 0.03]);
  ctx.beginPath(); ctx.arc(px, py, rad + 0.015, a0 + 0.12, a1 - 0.12);
  ctx.strokeStyle = 'rgba(255,214,160,0.75)'; ctx.lineWidth = 0.013; ctx.stroke();
  ctx.setLineDash([]);
  // grommets where the bands attach
  ctx.fillStyle = '#c9ced8';
  for (const a of [a0, a1]) {
    ctx.beginPath(); ctx.arc(px + Math.cos(a) * rad, py + Math.sin(a) * rad, 0.028, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

export function drawCommander(ctx, x, y, s, drawAmmo) {
  s = s || EMPTY;
  const f = s.facing < 0 ? -1 : 1;
  const team = s.team ? 1 : 0;
  const time = +s.time || 0;
  const lw = 0.035;
  const moving = !!s.moving, dead = !!s.dead;
  const aim = clamp(+s.aimPower || 0, 0, 1);
  const fo = captainFaceOpts(s, time);
  const hurt = clamp(+s.hurt || 0, 0, 1);
  const bounce = moving ? -Math.abs(Math.sin(time * 13)) * 0.035 : 0;
  const capBounce = moving ? -Math.abs(Math.sin(time * 13 - 0.7)) * 0.07 : 0;
  const breath = dead ? 0 : Math.sin(time * 2.4) * 0.018;
  let shake = 0;
  if (hurt > 0.01) shake += Math.sin(time * 61) * 0.04 * hurt;
  if (fo.tremble) shake += Math.sin(time * 47) * 0.012;
  const wheelAng = s.wheelAngle != null ? (+s.wheelAngle || 0) : (moving ? time * 7 : 0);
  // light in commander-local space (mirrored when facing left)
  const gxLocal = LIGHT_X * f;

  ctx.save();
  // ---------- back layer: pennant, cart back, captain, panel, wheels, fork back arm
  ctx.save();
  ctx.translate(x, y); ctx.scale(f, 1);
  ctx.lineJoin = 'round';
  ctx.save(); ctx.translate(0, bounce);
  drawPennant(ctx, team, time, lw);
  // cart far wall (seen above the panel)
  ctx.beginPath(); roundRectPath(ctx, -0.8, -0.21, 1.52, 0.2, 0.05);
  ctx.fillStyle = '#8a5428'; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = WOOD.line; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-0.76, -0.18); ctx.lineTo(0.68, -0.18);
  ctx.strokeStyle = 'rgba(255,220,170,0.35)'; ctx.lineWidth = lw * 0.5; ctx.stroke();
  ctx.restore();
  // captain
  ctx.save();
  ctx.translate(CAP_X + shake, CAP_Y + bounce + capBounce);
  if (dead) { ctx.translate(0, 0.45); ctx.rotate(-0.32); ctx.translate(0, -0.45); }
  ctx.scale(CAP_R * (1 - breath * 0.5), CAP_R * (1 + breath));
  const capPal = drawCaptainFigure(ctx, team, s, fo, outlineW(CAP_R) / CAP_R, gxLocal, LIGHT_Y, time);
  ctx.restore();
  // panel
  ctx.save(); ctx.translate(0, bounce);
  drawCartPanel(ctx, lw, team);
  ctx.restore();
  // captain's flipper on the rail
  const pose = dead ? 'dead' : (s.mood === 'happy' ? 'happy' : (s.mood === 'aim' ? 'aim' : 'rest'));
  drawRailWing(ctx, capPal, CAP_X + 0.4 + shake, -0.09 + bounce + capBounce * 0.4, pose, time, lw);
  // wheels
  drawWheel(ctx, -0.47, 0.46, 0.29, wheelAng * f, lw);
  drawWheel(ctx, 0.46, 0.46, 0.29, wheelAng * f, lw);
  // fork stem + back arm
  ctx.save(); ctx.translate(0, bounce);
  drawForkArm(ctx, FORK_CROTCH[0], FORK_CROTCH[1] + 0.04, 0.55, -0.74, SL_BACK[0], SL_BACK[1], 0.15, 0.115, lw, -f);
  drawForkWrap(ctx, SL_BACK[0], SL_BACK[1], 0.115, lw);
  drawForkArm(ctx, FORK_BASE[0], FORK_BASE[1], 0.77, -0.2, FORK_CROTCH[0], FORK_CROTCH[1], 0.17, 0.16, lw, -f);
  ctx.restore();
  ctx.restore();

  // ---------- sling (render space)
  const bk = { x: x + f * SL_BACK[0], y: y + SL_BACK[1] + bounce };
  const fr = { x: x + f * SL_FRONT[0], y: y + SL_FRONT[1] + bounce };
  let px, py;
  if (s.pouch && isFinite(s.pouch.x) && isFinite(s.pouch.y)) { px = s.pouch.x; py = s.pouch.y; }
  else { px = x + f * SL_REST[0]; py = y + SL_REST[1] + bounce; }
  const mx = (bk.x + fr.x) / 2, my = (bk.y + fr.y) / 2;
  let dx = px - mx, dy = py - my + 0.22;
  const dd = Math.hypot(dx, dy) || 1; dx /= dd; dy /= dd;
  const pAng = Math.atan2(dy, dx), span = 0.8, prad = 0.33;
  const e1 = [px + Math.cos(pAng - span) * prad, py + Math.sin(pAng - span) * prad];
  const e2 = [px + Math.cos(pAng + span) * prad, py + Math.sin(pAng + span) * prad];
  const d1 = Math.hypot(e1[0] - bk.x, e1[1] - bk.y), d2 = Math.hypot(e2[0] - bk.x, e2[1] - bk.y);
  const eb = d1 < d2 ? e1 : e2, ef = d1 < d2 ? e2 : e1;
  const stretch = clamp(Math.max(aim, (Math.hypot(px - (x + f * SL_REST[0]), py - (y + SL_REST[1])) - 0.2) / 2.2), 0, 1);
  const bw = 0.09 * (1 - 0.5 * stretch);
  ctx.save();
  drawBand(ctx, bk.x, bk.y, eb[0], eb[1], bw, stretch);
  ctx.restore();
  if (typeof drawAmmo === 'function') {
    ctx.save();
    drawAmmo(ctx);
    ctx.restore();
  }
  ctx.save();
  drawPouch(ctx, px, py, pAng, span, prad, lw);
  drawBand(ctx, fr.x, fr.y, ef[0], ef[1], bw, stretch);
  ctx.restore();

  // ---------- front layer: fork front arm + front details
  ctx.save();
  ctx.translate(x, y); ctx.scale(f, 1);
  ctx.lineJoin = 'round';
  ctx.save(); ctx.translate(0, bounce);
  drawForkArm(ctx, FORK_CROTCH[0] - 0.01, FORK_CROTCH[1] + 0.05, 1.07, -0.74, SL_FRONT[0], SL_FRONT[1], 0.155, 0.12, lw, -f);
  drawForkWrap(ctx, SL_FRONT[0], SL_FRONT[1], 0.12, lw);
  // crotch knot to hide the seam
  ctx.beginPath(); ctx.ellipse(FORK_CROTCH[0] + 0.005, FORK_CROTCH[1] + 0.03, 0.085, 0.07, 0, 0, TAU);
  ctx.fillStyle = FORK.base; ctx.fill();
  ctx.beginPath(); ctx.arc(FORK_CROTCH[0] + 0.01, FORK_CROTCH[1] + 0.05, 0.045, PI * 0.1, PI * 0.9);
  ctx.strokeStyle = rgba(FORK.line, 0.6); ctx.lineWidth = lw * 0.6; ctx.stroke();
  // clamp bracket on cart front
  ctx.beginPath(); roundRectPath(ctx, 0.6, -0.03, 0.25, 0.12, 0.03);
  ctx.fillStyle = IRON.base; ctx.fill(); ctx.lineWidth = lw * 0.8; ctx.strokeStyle = IRON.line; ctx.stroke();
  ctx.beginPath(); roundRectPath(ctx, 0.62, 0.17, 0.22, 0.1, 0.03);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = IRON.hi;
  for (const p of [[0.65, 0.03], [0.8, 0.03], [0.66, 0.22], [0.8, 0.22]]) { ctx.beginPath(); ctx.arc(p[0], p[1], 0.02, 0, TAU); ctx.fill(); }
  ctx.restore();
  ctx.restore();
  ctx.restore();
}

// ---------------------------------------------------------------------
//  Blocks
// ---------------------------------------------------------------------
const MAT = {
  wood: { hi: '#f6c888', base: '#dea05a', lo: '#b3702f', line: '#4a2710', crack: '#3a1d08', crackHi: 'rgba(255,228,176,0.75)' },
  stone: { hi: '#d5dbe2', base: '#a3abb5', lo: '#7d8590', line: '#353b44', crack: '#262a31', crackHi: 'rgba(238,242,248,0.8)' },
  ice: { line: 'rgba(58,140,196,0.95)', crack: 'rgba(255,255,255,0.95)', crackHi: 'rgba(40,120,180,0.5)' },
  tnt: { hi: '#ff6a4f', base: '#d9352b', lo: '#9e1b16', line: '#3d0907', crack: '#2a0503', crackHi: 'rgba(255,170,140,0.6)' },
};

// Per-block geometry is generated once from (material, size, seed) and cached,
// so drawing never calls Math.random() and nothing flickers.
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

// L-shaped bevel strokes following a rounded rect, inset by i (top-left light, bottom-right dark)
function bevelTL(ctx, w, h, i, r) {
  const x0 = -w / 2 + i, y0 = -h / 2 + i, x1 = w / 2 - i, y1 = h / 2 - i;
  ctx.moveTo(x0, y1 - r); ctx.lineTo(x0, y0 + r); ctx.arcTo(x0, y0, x0 + r, y0, r); ctx.lineTo(x1 - r, y0);
}
function bevelBR(ctx, w, h, i, r) {
  const x0 = -w / 2 + i, y0 = -h / 2 + i, x1 = w / 2 - i, y1 = h / 2 - i;
  ctx.moveTo(x1, y0 + r); ctx.lineTo(x1, y1 - r); ctx.arcTo(x1, y1, x1 - r, y1, r); ctx.lineTo(x0 + r, y1);
}

function woodDetail(L, S, seed) {
  const R = rng(seed * 7 + 13);
  const planks = clamp(Math.round(S / 0.26), 1, 6);
  const ph = S / planks;
  const grain = [], knots = [], nails = [];
  const inset = Math.min(0.1, L * 0.12);
  for (let p = 0; p < planks; p++) {
    const y0 = -S / 2 + p * ph;
    const ng = ph > 0.18 ? 3 : 2;
    for (let g = 0; g < ng; g++) {
      const yy = y0 + ph * (0.22 + 0.56 * (g + R() * 0.6) / ng);
      const xs = -L / 2 + L * (0.04 + R() * 0.22), xe = L / 2 - L * (0.04 + R() * 0.22);
      grain.push([xs, yy, xe, ph * (0.04 + R() * 0.08), R() * TAU]);
    }
    if (L > 0.7 && R() < 0.55) knots.push([(R() - 0.5) * L * 0.6, y0 + ph * (0.4 + R() * 0.2), Math.min(ph * 0.2, 0.065)]);
    nails.push([-L / 2 + inset, y0 + ph / 2, clamp(ph * 0.1, 0.014, 0.03)], [L / 2 - inset, y0 + ph / 2, clamp(ph * 0.1, 0.014, 0.03)]);
  }
  return { planks, ph, grain, knots, nails };
}

function drawWoodBox(ctx, w, h, b, lw) {
  const M = MAT.wood;
  const S = Math.min(w, h), L = Math.max(w, h);
  const cr = Math.min(S * 0.14, 0.06);
  ctx.beginPath(); roundRectPath(ctx, -w / 2, -h / 2, w, h, cr);
  ctx.fillStyle = cgrad(ctx, 'wbox' + w + 'x' + h, () => {
    const g = ctx.createLinearGradient(-w / 2, -h / 2, w / 2 * 0.3, h / 2);
    g.addColorStop(0, M.hi); g.addColorStop(0.45, M.base); g.addColorStop(1, M.lo);
    return g;
  });
  ctx.fill();
  const vert = h > w;
  if (vert) ctx.rotate(PI / 2);
  const D = blockDetail('w' + L + 'x' + S + 's' + b.seed, () => woodDetail(L, S, b.seed | 0));
  // grain (one path)
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const g of D.grain) {
    const xs = g[0], yy = g[1], xe = g[2], amp = g[3], ph = g[4];
    const n = Math.max(2, Math.round((xe - xs) / 0.35));
    ctx.moveTo(xs, yy);
    for (let i = 1; i <= n; i++) {
      ctx.quadraticCurveTo(xs + (xe - xs) * (i - 0.5) / n, yy + Math.sin(ph + i * 1.7) * amp, xs + (xe - xs) * i / n, yy);
    }
  }
  ctx.strokeStyle = 'rgba(128,68,24,0.42)'; ctx.lineWidth = clamp(S * 0.018, 0.008, 0.02); ctx.stroke();
  if (D.knots.length) {
    ctx.beginPath();
    for (const k of D.knots) { ctx.moveTo(k[0] + k[2] * 1.8, k[1]); ctx.ellipse(k[0], k[1], k[2] * 1.8, k[2], 0, 0, TAU); }
    ctx.fillStyle = 'rgba(140,76,26,0.45)'; ctx.fill();
    ctx.beginPath();
    for (const k of D.knots) { ctx.moveTo(k[0] + k[2] * 2.7, k[1]); ctx.ellipse(k[0], k[1], k[2] * 2.7, k[2] * 1.5, 0, 0, TAU); }
    ctx.strokeStyle = 'rgba(128,68,24,0.35)'; ctx.lineWidth = clamp(S * 0.014, 0.006, 0.016); ctx.stroke();
  }
  // plank seams with bevel
  if (D.planks > 1) {
    const x0 = -L / 2 + lw * 0.5, x1 = L / 2 - lw * 0.5;
    ctx.beginPath();
    for (let p = 1; p < D.planks; p++) { const yy = -S / 2 + p * D.ph; ctx.moveTo(x0, yy); ctx.lineTo(x1, yy); }
    ctx.strokeStyle = 'rgba(92,46,14,0.8)'; ctx.lineWidth = lw * 0.8; ctx.stroke();
    ctx.beginPath();
    for (let p = 1; p < D.planks; p++) { const yy = -S / 2 + p * D.ph + lw * 0.75; ctx.moveTo(x0, yy); ctx.lineTo(x1, yy); }
    ctx.strokeStyle = 'rgba(255,230,180,0.5)'; ctx.lineWidth = lw * 0.45; ctx.stroke();
  }
  // nails
  ctx.beginPath();
  for (const n of D.nails) { ctx.moveTo(n[0] + n[2], n[1]); ctx.arc(n[0], n[1], n[2], 0, TAU); }
  ctx.fillStyle = '#6d6a6a'; ctx.fill();
  ctx.beginPath();
  for (const n of D.nails) { ctx.moveTo(n[0] - n[2] * 0.3 + n[2] * 0.45, n[1] - n[2] * 0.3); ctx.arc(n[0] - n[2] * 0.3, n[1] - n[2] * 0.3, n[2] * 0.45, 0, TAU); }
  ctx.fillStyle = '#dcd8d2'; ctx.fill();
  if (vert) ctx.rotate(-PI / 2);
  // bevel
  const bv = Math.min(S * 0.09, 0.045), br = Math.max(cr - bv / 2, 0.001);
  ctx.lineWidth = bv; ctx.lineCap = 'butt';
  ctx.beginPath(); bevelTL(ctx, w, h, bv / 2, br); ctx.strokeStyle = 'rgba(255,236,196,0.55)'; ctx.stroke();
  ctx.beginPath(); bevelBR(ctx, w, h, bv / 2, br); ctx.strokeStyle = 'rgba(110,50,10,0.38)'; ctx.stroke();
  return cr;
}

function stoneDetail(w, h, seed, isCircle) {
  const R = rng(seed * 11 + 5);
  const area = isCircle ? PI * w * w : w * h;
  const n = clamp(Math.round(area * 40), 5, 60);
  const light = [], dark = [];
  const sz = clamp(Math.sqrt(area) / 0.8, 0.6, 1.4);
  for (let i = 0; i < n; i++) {
    let x, y;
    if (isCircle) { const a = R() * TAU, r = Math.sqrt(R()) * w * 0.8; x = Math.cos(a) * r; y = Math.sin(a) * r; }
    else { x = (R() - 0.5) * w * 0.8; y = (R() - 0.5) * h * 0.8; }
    (R() < 0.55 ? dark : light).push([x, y, (0.01 + R() * 0.02) * sz]);
  }
  let lump = null, facets = null;
  if (isCircle) {
    lump = [];
    for (let i = 0; i < 9; i++) lump.push(0.93 + R() * 0.07);
    const c = [-0.12 + (R() - 0.5) * 0.2, -0.1 + (R() - 0.5) * 0.2];
    const pts = [], a0 = R() * TAU;
    for (let i = 0; i < 5; i++) { const a = a0 + i * TAU / 5 + (R() - 0.5) * 0.5; pts.push([Math.cos(a), Math.sin(a)]); }
    facets = { c, pts };
  }
  const strata = [];
  if (!isCircle) {
    const c = Math.min(3, Math.round((w + h) / 0.8));
    for (let i = 0; i < c; i++) strata.push([R(), R(), 0.5 + R() * 0.5]);
  }
  return { light, dark, lump, facets, strata };
}
function dotsPath(ctx, list) {
  for (const d of list) { ctx.moveTo(d[0] + d[2], d[1]); ctx.arc(d[0], d[1], d[2], 0, TAU); }
}

function drawStoneBox(ctx, w, h, b, lw) {
  const M = MAT.stone;
  const S = Math.min(w, h);
  const cr = Math.min(S * 0.1, 0.045);
  const bv = Math.min(S * 0.16, 0.1);
  const x0 = -w / 2, y0 = -h / 2, x1 = w / 2, y1 = h / 2, c = cr * 0.35;
  // light top/left bevel & dark bottom/right bevel (corners chamfered to sit inside the rounding)
  ctx.beginPath();
  ctx.moveTo(x0, y1 - c); ctx.lineTo(x0, y0 + c); ctx.lineTo(x0 + c, y0); ctx.lineTo(x1 - c, y0);
  ctx.lineTo(x1 - bv, y0 + bv); ctx.lineTo(x0 + bv, y0 + bv); ctx.lineTo(x0 + bv, y1 - bv); ctx.closePath();
  ctx.fillStyle = M.hi; ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x1, y0 + c); ctx.lineTo(x1, y1 - c); ctx.lineTo(x1 - c, y1); ctx.lineTo(x0 + c, y1);
  ctx.lineTo(x0 + bv, y1 - bv); ctx.lineTo(x1 - bv, y1 - bv); ctx.lineTo(x1 - bv, y0 + bv); ctx.closePath();
  ctx.fillStyle = '#69717c'; ctx.fill();
  // face
  ctx.beginPath(); roundRectPath(ctx, x0 + bv, y0 + bv, w - bv * 2, h - bv * 2, cr * 0.5);
  ctx.fillStyle = cgrad(ctx, 'sface' + w + 'x' + h, () => {
    const g = ctx.createLinearGradient(x0, y0, x1 * 0.4, y1);
    g.addColorStop(0, '#c2c9d1'); g.addColorStop(0.5, M.base); g.addColorStop(1, '#8c949e');
    return g;
  });
  ctx.fill();
  const D = blockDetail('s' + w + 'x' + h + 's' + b.seed, () => stoneDetail(w - bv, h - bv, b.seed | 0, false));
  ctx.beginPath(); dotsPath(ctx, D.dark); ctx.fillStyle = 'rgba(70,76,86,0.45)'; ctx.fill();
  ctx.beginPath(); dotsPath(ctx, D.light); ctx.fillStyle = 'rgba(238,242,248,0.55)'; ctx.fill();
  if (D.strata.length) {
    ctx.beginPath();
    for (const s of D.strata) {
      const yy = (s[1] - 0.5) * (h - bv * 3), xs = (s[0] - 0.5) * w * 0.4;
      ctx.moveTo(xs - w * 0.2 * s[2], yy); ctx.quadraticCurveTo(xs, yy - S * 0.04, xs + w * 0.22 * s[2], yy + S * 0.02);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = Math.min(S * 0.03, 0.02); ctx.lineCap = 'round'; ctx.stroke();
  }
  // crisp ridge between bevel and face
  ctx.beginPath(); ctx.moveTo(x0 + bv, y1 - bv); ctx.lineTo(x0 + bv, y0 + bv); ctx.lineTo(x1 - bv, y0 + bv);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = lw * 0.45; ctx.lineJoin = 'round'; ctx.stroke();
  return cr;
}

// Diagonal glint stripes baked into a linear gradient (no clipping)
function glintGradient(ctx, key, hw, hh, S, seed, long) {
  return cgrad(ctx, key, () => {
    const ax = 0.68, ay = 0.73;                    // gradient axis (stripes run along "/")
    const P = hw * ax + hh * ay;                   // half projection of the box on the axis
    const g = ctx.createLinearGradient(-ax * P, -ay * P, ax * P, ay * P);
    const R = rng(seed * 13 + 1);
    const stripes = [];
    const groups = long ? [-0.45, 0.35] : [-0.3];
    for (const gc of groups) {
      const c = gc * P + (R() - 0.5) * S * 0.25;
      stripes.push([c, S * 0.22, 0.5], [c + S * 0.24, S * 0.07, 0.4]);
    }
    const eps = 0.0005;
    const t = (v) => clamp((v + P) / (2 * P), 0, 1);
    let last = 0;
    g.addColorStop(0, 'rgba(255,255,255,0)');
    for (const s of stripes) {
      const a = t(s[0] - s[1] / 2), bb = t(s[0] + s[1] / 2);
      if (a <= last) continue;
      g.addColorStop(a, 'rgba(255,255,255,0)');
      g.addColorStop(Math.min(1, a + eps), 'rgba(255,255,255,' + s[2] + ')');
      g.addColorStop(Math.max(a + eps, bb - eps), 'rgba(255,255,255,' + s[2] + ')');
      g.addColorStop(bb, 'rgba(255,255,255,0)');
      last = bb;
    }
    g.addColorStop(1, 'rgba(255,255,255,0)');
    return g;
  });
}

function iceDetail(w, h, seed) {
  const R = rng(seed * 5 + 3);
  const S = Math.min(w, h), L = Math.max(w, h);
  const fr = [], bub = [];
  const nf = 2 + Math.floor(L / 0.8);
  const cl = (x, y) => [clamp(x, -w / 2 + S * 0.15, w / 2 - S * 0.15), clamp(y, -h / 2 + S * 0.15, h / 2 - S * 0.15)];
  for (let i = 0; i < nf; i++) {
    const x = (R() - 0.5) * w * 0.8, y = (R() - 0.5) * h * 0.8, a = R() * PI, l = S * (0.2 + R() * 0.3);
    fr.push([cl(x, y), cl(x + Math.cos(a) * l, y + Math.sin(a) * l), cl(x + Math.cos(a + 0.9) * l * 0.6, y + Math.sin(a + 0.9) * l * 0.6)]);
  }
  const nb = 2 + Math.floor(L / 0.6);
  for (let i = 0; i < nb; i++) bub.push([(R() - 0.5) * w * 0.75, (R() - 0.5) * h * 0.75, S * (0.015 + R() * 0.02)]);
  return { fr, bub };
}

function drawIceBox(ctx, w, h, b, lw) {
  const S = Math.min(w, h), L = Math.max(w, h);
  const cr = Math.min(S * 0.12, 0.05);
  ctx.beginPath(); roundRectPath(ctx, -w / 2, -h / 2, w, h, cr);
  ctx.fillStyle = cgrad(ctx, 'ice' + w + 'x' + h, () => {
    const g = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    g.addColorStop(0, 'rgba(226,250,255,0.82)'); g.addColorStop(0.5, 'rgba(176,229,250,0.74)'); g.addColorStop(1, 'rgba(128,200,236,0.8)');
    return g;
  });
  ctx.fill();
  ctx.fillStyle = glintGradient(ctx, 'iceg' + w + 'x' + h + 's' + b.seed, w / 2, h / 2, S, b.seed | 0, L > S * 2.2);
  ctx.fill();
  const D = blockDetail('i' + w + 'x' + h + 's' + b.seed, () => iceDetail(w, h, b.seed | 0));
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); polyPaths(ctx, D.fr, 0, 0);
  ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = clamp(S * 0.015, 0.006, 0.016); ctx.stroke();
  ctx.beginPath(); dotsPath(ctx, D.bub); ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fill();
  // frosty inner rim + cool shadow edge
  const fe = Math.min(S * 0.12, 0.05);
  ctx.beginPath(); roundRectPath(ctx, -w / 2 + fe * 0.6, -h / 2 + fe * 0.6, w - fe * 1.2, h - fe * 1.2, Math.max(cr - fe * 0.6, 0.001));
  ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = fe * 1.2; ctx.stroke();
  ctx.beginPath(); bevelBR(ctx, w, h, fe * 0.35, Math.max(cr - fe * 0.35, 0.001));
  ctx.strokeStyle = 'rgba(60,150,210,0.35)'; ctx.lineWidth = fe * 0.7; ctx.lineCap = 'butt'; ctx.stroke();
  return cr;
}

// Vector block letters "TNT" (font independent). Cap height 1, width 2.42.
// Each glyph is a single non-overlapping polygon so the outline stroke stays cheap.
const _TNT_T = [[0, 0], [0.72, 0], [0.72, 0.25], [0.485, 0.25], [0.485, 1], [0.235, 1], [0.235, 0.25], [0, 0.25]];
const _TNT_N = [[0, 0], [0.2625, 0], [0.53, 0.517], [0.53, 0], [0.78, 0], [0.78, 1], [0.5175, 1], [0.25, 0.483], [0.25, 1], [0, 1]];
function tntLettersPath(ctx) {
  const glyph = (pts, ox) => {
    ctx.moveTo(pts[0][0] + ox, pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0] + ox, pts[i][1]);
    ctx.closePath();
  };
  glyph(_TNT_T, 0); glyph(_TNT_N, 0.82); glyph(_TNT_T, 1.7);
}
function drawTNTText(ctx, cx, cy, maxW, maxH) {
  const fs = Math.min(maxH, maxW / 2.42);
  if (fs <= 0.01) return;
  ctx.save();
  ctx.translate(cx - 1.21 * fs, cy - 0.5 * fs);
  ctx.scale(fs, fs);
  ctx.lineJoin = 'bevel';
  ctx.translate(0, 0.07);
  ctx.beginPath(); tntLettersPath(ctx);
  ctx.lineWidth = 0.3; ctx.strokeStyle = '#3d0907'; ctx.stroke();
  ctx.translate(0, -0.07);
  ctx.beginPath(); tntLettersPath(ctx);
  ctx.lineWidth = 0.2; ctx.stroke();
  ctx.fillStyle = '#ffe07a'; ctx.fill();
  // glossy top edge on each glyph
  ctx.beginPath();
  ctx.moveTo(0.06, 0.07); ctx.lineTo(0.66, 0.07);
  ctx.moveTo(1.76, 0.07); ctx.lineTo(2.36, 0.07);
  ctx.moveTo(0.88, 0.07); ctx.lineTo(0.88, 0.9);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.06; ctx.lineCap = 'round'; ctx.stroke();
  ctx.restore();
}

function drawTntBox(ctx, w, h, b, lw) {
  const M = MAT.tnt;
  const S = Math.min(w, h);
  const cr = Math.min(S * 0.1, 0.05);
  ctx.beginPath(); roundRectPath(ctx, -w / 2, -h / 2, w, h, cr);
  ctx.fillStyle = cgrad(ctx, 'tnt' + w + 'x' + h, () => {
    const g = ctx.createLinearGradient(-w / 2, -h / 2, w * 0.2, h / 2);
    g.addColorStop(0, M.hi); g.addColorStop(0.45, M.base); g.addColorStop(1, M.lo);
    return g;
  });
  ctx.fill();
  // vertical board seams
  const nb = Math.max(2, Math.round(w / 0.28));
  const sy0 = -h / 2 + lw * 0.5, sy1 = h / 2 - lw * 0.5;
  ctx.lineWidth = lw * 0.6;
  ctx.beginPath();
  for (let i = 1; i < nb; i++) { const xx = -w / 2 + w * i / nb; ctx.moveTo(xx, sy0); ctx.lineTo(xx, sy1); }
  ctx.strokeStyle = 'rgba(90,10,8,0.45)'; ctx.stroke();
  ctx.beginPath();
  for (let i = 1; i < nb; i++) { const xx = -w / 2 + w * i / nb + lw * 0.6; ctx.moveTo(xx, sy0); ctx.lineTo(xx, sy1); }
  ctx.strokeStyle = 'rgba(255,150,120,0.25)'; ctx.stroke();
  // dark bands
  const bh = h * 0.15, bx0 = -w / 2 + lw * 0.3, bw = w - lw * 0.6;
  const off = Math.max(h * 0.07, cr);
  const by0 = -h / 2 + off, by1 = h / 2 - off - bh;
  ctx.beginPath(); ctx.rect(bx0, by0, bw, bh); ctx.rect(bx0, by1, bw, bh);
  ctx.fillStyle = '#6e1410'; ctx.fill();
  ctx.beginPath(); ctx.rect(bx0, by0, bw, bh * 0.18); ctx.rect(bx0, by1, bw, bh * 0.18);
  ctx.fillStyle = 'rgba(255,140,110,0.35)'; ctx.fill();
  ctx.beginPath(); ctx.rect(bx0, by0 + bh * 0.82, bw, bh * 0.18); ctx.rect(bx0, by1 + bh * 0.82, bw, bh * 0.18);
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fill();
  // label
  const lwid = w * 0.82, lh = h * 0.42;
  ctx.beginPath(); roundRectPath(ctx, -lwid / 2, -lh / 2, lwid, lh, Math.min(lh, lwid) * 0.15);
  ctx.fillStyle = 'rgba(60,6,4,0.28)'; ctx.fill();
  drawTNTText(ctx, 0, 0, lwid * 0.86, lh * 0.72);
  // bevel
  const bv = Math.min(S * 0.08, 0.04), br = Math.max(cr - bv / 2, 0.001);
  ctx.lineWidth = bv; ctx.lineCap = 'butt';
  ctx.beginPath(); bevelTL(ctx, w, h, bv / 2, br); ctx.strokeStyle = 'rgba(255,190,160,0.45)'; ctx.stroke();
  ctx.beginPath(); bevelBR(ctx, w, h, bv / 2, br); ctx.strokeStyle = 'rgba(60,0,0,0.35)'; ctx.stroke();
  // metal corner brackets (follow the rounded corners)
  const cs = Math.min(S * 0.22, 0.13);
  ctx.beginPath();
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const px = sx * w / 2, py = sy * h / 2;
    ctx.moveTo(px - sx * cs, py);
    ctx.arcTo(px, py, px, py - sy * cs, cr);
    ctx.lineTo(px, py - sy * cs);
    ctx.closePath();
  }
  ctx.fillStyle = '#3b3f48'; ctx.fill();
  return cr;
}

function drawWoodLog(ctx, r, b, lw) {
  const D = blockDetail('log' + r + 's' + b.seed, () => {
    const R = rng((b.seed | 0) * 3 + 1);
    const ticks = [];
    for (let i = 0; i < 18; i++) ticks.push(i * TAU / 18 + R() * 0.2);
    const fr = r * 0.84;
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
    return { ticks, ox, oy, rings, ca: R() * TAU };
  });
  // bark
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
  ctx.fillStyle = '#7c4a24'; ctx.fill();
  ctx.beginPath();
  for (const a of D.ticks) { ctx.moveTo(Math.cos(a) * r * 0.86, Math.sin(a) * r * 0.86); ctx.lineTo(Math.cos(a) * r * 0.97, Math.sin(a) * r * 0.97); }
  ctx.strokeStyle = 'rgba(50,25,8,0.55)'; ctx.lineWidth = r * 0.04; ctx.stroke();
  // end grain face
  const fr = r * 0.84;
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
  // drying check
  const ca = D.ca;
  ctx.beginPath(); ctx.moveTo(D.ox + Math.cos(ca) * fr * 0.15, D.oy + Math.sin(ca) * fr * 0.15);
  ctx.lineTo(Math.cos(ca + 0.06) * fr * 0.6, Math.sin(ca + 0.06) * fr * 0.6);
  ctx.lineTo(Math.cos(ca) * fr * 0.95, Math.sin(ca) * fr * 0.95);
  ctx.strokeStyle = 'rgba(90,45,15,0.7)'; ctx.lineWidth = clamp(r * 0.03, 0.008, 0.025); ctx.stroke();
  // gloss
  ctx.beginPath(); ctx.arc(0, 0, fr * 0.9, PI * 1.05, PI * 1.45);
  ctx.strokeStyle = 'rgba(255,245,220,0.5)'; ctx.lineWidth = fr * 0.06; ctx.lineCap = 'round'; ctx.stroke();
}

function boulderPath(ctx, r, lump) {
  const k = lump.length;
  const pts = [];
  for (let i = 0; i < k; i++) { const a = i * TAU / k; pts.push([Math.cos(a) * r * lump[i], Math.sin(a) * r * lump[i]]); }
  const m = (i) => { const a = pts[i % k], b = pts[(i + 1) % k]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
  const s = m(k - 1);
  ctx.moveTo(s[0], s[1]);
  for (let i = 0; i < k; i++) { const e = m(i); ctx.quadraticCurveTo(pts[i][0], pts[i][1], e[0], e[1]); }
  ctx.closePath();
}

function drawBoulder(ctx, r, b, lw) {
  const D = blockDetail('bo' + r + 's' + b.seed, () => stoneDetail(r, r, b.seed | 0, true));
  ctx.beginPath(); boulderPath(ctx, r, D.lump);
  ctx.fillStyle = cgrad(ctx, 'boulder' + r, () => {
    const g = ctx.createRadialGradient(-r * 0.38, -r * 0.42, r * 0.05, -r * 0.1, -r * 0.1, r * 1.25);
    g.addColorStop(0, '#e2e7ed'); g.addColorStop(0.35, '#b1b9c2'); g.addColorStop(0.8, '#838b96'); g.addColorStop(1, '#646b76');
    return g;
  });
  ctx.fill();
  // chunky facets: planes fanning from an off-centre apex, toned by the light (clip to the lumpy outline)
  ctx.save(); ctx.clip();
  const F = D.facets, la = Math.atan2(-0.83, -0.56);
  for (let i = 0; i < F.pts.length; i++) {
    const p0 = F.pts[i], p1 = F.pts[(i + 1) % F.pts.length];
    const mid = Math.atan2((p0[1] + p1[1]) / 2 - F.c[1], (p0[0] + p1[0]) / 2 - F.c[0]);
    const lit = Math.cos(mid - la);
    ctx.beginPath(); ctx.moveTo(F.c[0] * r, F.c[1] * r); ctx.lineTo(p0[0] * r * 1.3, p0[1] * r * 1.3); ctx.lineTo(p1[0] * r * 1.3, p1[1] * r * 1.3); ctx.closePath();
    ctx.fillStyle = lit > 0 ? 'rgba(255,255,255,' + (lit * 0.16).toFixed(3) + ')' : 'rgba(40,46,56,' + (-lit * 0.18).toFixed(3) + ')';
    ctx.fill();
  }
  ctx.restore();
  ctx.beginPath();
  for (const p of F.pts) { ctx.moveTo(F.c[0] * r, F.c[1] * r); ctx.lineTo(p[0] * r * 0.9, p[1] * r * 0.9); }
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = Math.max(r * 0.035, 0.01); ctx.lineCap = 'round'; ctx.stroke();
  ctx.beginPath(); dotsPath(ctx, D.dark); ctx.fillStyle = 'rgba(70,76,86,0.4)'; ctx.fill();
  ctx.beginPath(); dotsPath(ctx, D.light); ctx.fillStyle = 'rgba(240,244,248,0.5)'; ctx.fill();
  return D.lump;
}

function drawIceBall(ctx, r, b, lw) {
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
  ctx.fillStyle = cgrad(ctx, 'iceball' + r, () => {
    const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.05, 0, 0, r);
    g.addColorStop(0, 'rgba(240,253,255,0.9)'); g.addColorStop(0.6, 'rgba(176,229,250,0.75)'); g.addColorStop(1, 'rgba(110,190,232,0.82)');
    return g;
  });
  ctx.fill();
  ctx.fillStyle = glintGradient(ctx, 'iceballg' + r + 's' + b.seed, r * 0.72, r * 0.72, r * 1.4, b.seed | 0, false);
  ctx.fill();
  ctx.beginPath(); ctx.arc(0, 0, r - Math.min(r * 0.07, 0.03), 0, TAU);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = Math.min(r * 0.14, 0.06); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, r * 0.72, PI * 1.05, PI * 1.5);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = r * 0.07; ctx.lineCap = 'round'; ctx.stroke();
}

function drawTntBall(ctx, r, b, lw) {
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
  ctx.fillStyle = cgrad(ctx, 'tntball' + r, () => {
    const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.05, 0, 0, r * 1.05);
    g.addColorStop(0, '#ff7a5c'); g.addColorStop(0.5, '#d9352b'); g.addColorStop(1, '#8e1712');
    return g;
  });
  ctx.fill();
  ctx.beginPath(); ctx.arc(0, 0, r * 0.8, 0, TAU);
  ctx.lineWidth = r * 0.12; ctx.strokeStyle = '#6e1410'; ctx.stroke();
  drawTNTText(ctx, 0, 0, r * 1.15, r * 0.5);
  ctx.beginPath(); ctx.arc(0, 0, r * 0.9, PI * 1.08, PI * 1.42);
  ctx.strokeStyle = 'rgba(255,220,200,0.5)'; ctx.lineWidth = r * 0.07; ctx.lineCap = 'round'; ctx.stroke();
}

export function drawBlock(ctx, b) {
  if (!b) return;
  const mat = MAT[b.material] ? b.material : 'wood';
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
  if (circle) {
    const r = Math.max(0.02, +b.r || 0.3);
    let lump = null;
    if (mat === 'wood') drawWoodLog(ctx, r, b, lw);
    else if (mat === 'stone') lump = drawBoulder(ctx, r, b, lw);
    else if (mat === 'ice') drawIceBall(ctx, r, b, lw);
    else drawTntBall(ctx, r, b, lw);
    if (hp < 0.7) {
      const lvl = hp < 0.35 ? 2 : 1;
      const cw = clamp(r * 0.08, 0.014, 0.045);
      const C = blockDetail('cc' + r + 's' + seed + 'l' + lvl, () => genCracks(rng(seed * 31 + 7), r * (lump ? 0.93 : 1), r, true, lvl, cw * 1.3));
      drawCracks(ctx, C, cw, M);
    }
    ctx.beginPath(); if (lump) boulderPath(ctx, r, lump); else ctx.arc(0, 0, r, 0, TAU);
    if (flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (flash * 0.7).toFixed(3) + ')'; ctx.fill(); }
    ctx.lineWidth = lw; ctx.strokeStyle = mat === 'wood' ? '#3a1d08' : M.line; ctx.stroke();
  } else {
    const w = Math.max(0.02, +b.w || 1), h = Math.max(0.02, +b.h || 1);
    let cr;
    if (mat === 'wood') cr = drawWoodBox(ctx, w, h, b, lw);
    else if (mat === 'stone') cr = drawStoneBox(ctx, w, h, b, lw);
    else if (mat === 'ice') cr = drawIceBox(ctx, w, h, b, lw);
    else cr = drawTntBox(ctx, w, h, b, lw);
    if (hp < 0.7) {
      const lvl = hp < 0.35 ? 2 : 1;
      const S = Math.min(w, h);
      const cw = clamp(S * 0.04, 0.014, 0.045);
      const C = blockDetail('cb' + w + 'x' + h + 's' + seed + 'l' + lvl, () => genCracks(rng(seed * 31 + 7), w, h, false, lvl, cw * 1.2));
      drawCracks(ctx, C, cw, M);
    }
    ctx.beginPath(); roundRectPath(ctx, -w / 2, -h / 2, w, h, cr);
    if (flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (flash * 0.7).toFixed(3) + ')'; ctx.fill(); }
    ctx.lineWidth = lw; ctx.strokeStyle = M.line; ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------------
//  UI icons
// ---------------------------------------------------------------------
export function drawBirdIcon(canvas, type) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const m = Math.min(w, h);
  const r = 0.4;
  const k = m / (2.95 * r);
  let oy = 0.1, ox = -0.02;
  if (type === 'egg') { oy = 0.14; ox = -0.04; }
  if (type === 'yellow') { oy = 0.06; }
  ctx.setTransform(k, 0, 0, k, w / 2 + ox * m, h / 2 + oy * m);
  drawBird(ctx, type, 0, 0, r, 0, { time: 0.4, state: 'idle', lookX: 0.4, lookY: 0.1, fuse: 0 });
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
  const k = m / 2.75;           // unit (captain radius) → px; fits helmet+horns and the round body
  ctx.setTransform(k, 0, 0, k, w / 2 - 0.02 * m, h / 2 + 0.22 * k);
  const fo = captainFaceOpts({ mood: 'normal', hp: 1 }, 0);
  fo.llx = 0.55; fo.lly = 0.1;
  drawCaptainFigure(ctx, team ? 1 : 0, { team }, fo, outlineW(0.62) / 0.62 * 1.15, LIGHT_X, LIGHT_Y, 0.5, CAP_L_ICON);
  ctx.restore();
}
