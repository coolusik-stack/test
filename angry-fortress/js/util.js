// Small math + helpers shared across modules.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const easeOutBack = (t) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);

// Frame-rate independent exponential approach.
export const damp = (a, b, rate, dt) => lerp(a, b, 1 - Math.exp(-rate * dt));

// Seeded PRNG (mulberry32).
export function rng(seed) {
  let s = seed >>> 0;
  const f = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (a, b) => a + (b - a) * f();
  f.int = (a, b) => Math.floor(a + (b - a + 1) * f());
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.sign = () => (f() < 0.5 ? -1 : 1);
  return f;
}

// 1D value noise, smooth, deterministic per seed.
export function noise1D(seed) {
  const r = rng(seed);
  const N = 256;
  const table = new Float32Array(N);
  for (let i = 0; i < N; i++) table[i] = r() * 2 - 1;
  return (x) => {
    const i = Math.floor(x);
    const f = x - i;
    const a = table[((i % N) + N) % N];
    const b = table[(((i + 1) % N) + N) % N];
    return lerp(a, b, smooth(f));
  };
}

export const storage = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch (e) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* storage unavailable — fine */
    }
  },
};

export const prefs = { vibe: true };

export function vibrate(pattern) {
  if (!prefs.vibe) return;
  try {
    if (navigator.vibrate) navigator.vibrate(pattern);
  } catch (e) {
    /* not supported */
  }
}
