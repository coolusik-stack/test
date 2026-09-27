/*
 * 엥그리 포트리스 (Angry Fortress) — procedural audio engine.
 *
 * Zero external assets: every sound effect and music track is synthesized at
 * runtime with the Web Audio API (oscillators, pre-generated noise buffers,
 * biquad filters, envelopes, wave-shapers and a convolver whose impulse
 * response is generated from noise).
 *
 * API (see bottom of file):
 *   Sound.init() / Sound.unlock()      lazily create + resume the AudioContext (call from a user gesture)
 *   Sound.setSfx(on) / Sound.setMusic(on), Sound.sfxOn / Sound.musicOn
 *   Sound.play(name, { vol, pitch, pan })
 *   Sound.stretch(t | null)           slingshot rubber-band creak while aiming
 *   Sound.music('menu'|'battle'|'victory'|null)
 *   Sound.duck(amount = 0.4, seconds = 0.6)   lower music by `amount` (0..1) for `seconds`
 *   Sound.pause() / Sound.resume()
 *
 * Signal flow:
 *   sfx voices ─┬─────────────────────────► sfxBus ─┐
 *               └► reverb send ► convolver ─► sfxBus │
 *   music notes ► trackBus (per track, crossfaded) ► musicBus ► duck ─┤
 *   stretch creak ─────────────────────────► sfxBus ─┤
 *                                                     └► compressor ► master ► destination
 */

const MAX_VOICES = 24; // polyphony cap for one-shot sfx
const RATE_LIMIT_MS = 35; // identical sound names closer than this are skipped
const MUSIC_LEVEL = 0.35; // music bus gain relative to sfx
const XFADE = 0.8; // music crossfade seconds
const LOOKAHEAD = 0.12; // music scheduler lookahead (s)
const TICK_MS = 25; // music scheduler timer period

const HAS_WIN = typeof window !== 'undefined';
const ACtor = HAS_WIN ? window.AudioContext || window.webkitAudioContext : null;

let ctx = null;
let chain = null;
let failed = false;
let sfxEnabled = true;
let musicEnabled = true;
let paused = false;
let resumeReqAt = -1e9;
let wantTrack = null;
let timer = 0;
let silentKicked = false;
let gesturesHooked = false;
let duckUntil = 0;
let duckLevel = 1;
let stretchState = null;

const voices = []; // active sfx voices, oldest first
const players = []; // active music track players
const lastPlay = Object.create(null);

const nowMs = () => (HAS_WIN && window.performance ? window.performance.now() : Date.now());
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const rnd = (a, b) => a + Math.random() * (b - a);
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const fin = (x, d) => (typeof x === 'number' && isFinite(x) ? x : d);
const quiet = (fn) => {
  try {
    const r = fn();
    if (r && typeof r.catch === 'function') r.catch(() => {});
    return r;
  } catch (e) {
    return undefined;
  }
};

/* ------------------------------------------------------------------------ */
/* Shared generated resources (per context, generated once)                  */
/* ------------------------------------------------------------------------ */

const BUFS = new WeakMap();
/** White / pink / brown noise and a sparse "crackle" buffer, 2 s each, mono. */
function buffers(c) {
  let b = BUFS.get(c);
  if (b) return b;
  const sr = c.sampleRate;
  const n = Math.floor(sr * 2);
  const w = c.createBuffer(1, n, sr);
  const p = c.createBuffer(1, n, sr);
  const br = c.createBuffer(1, n, sr);
  const k = c.createBuffer(1, n, sr);
  const wd = w.getChannelData(0);
  const pd = p.getChannelData(0);
  const bd = br.getChannelData(0);
  const kd = k.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < n; i++) {
    const x = Math.random() * 2 - 1;
    wd[i] = x;
    // Paul Kellet's pink filter
    b0 = 0.99886 * b0 + x * 0.0555179;
    b1 = 0.99332 * b1 + x * 0.0750759;
    b2 = 0.969 * b2 + x * 0.153852;
    b3 = 0.8665 * b3 + x * 0.3104856;
    b4 = 0.55 * b4 + x * 0.5329522;
    b5 = -0.7616 * b5 - x * 0.016898;
    pd[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11;
    b6 = x * 0.115926;
    last = (last + 0.02 * x) / 1.02;
    bd[i] = last * 3.5;
  }
  // crackle: random short noisy grains, ~75 per second
  let i = 0;
  for (;;) {
    i += 1 + Math.floor((-Math.log(1 - Math.random()) * sr) / 75);
    if (i >= n) break;
    const amp = 0.25 + 0.75 * Math.random() * Math.random();
    const len = 10 + Math.floor(Math.random() * 60);
    const tau = len / 3.5;
    for (let j = 0; j < len && i + j < n; j++) {
      kd[i + j] = clamp(kd[i + j] + amp * Math.exp(-j / tau) * (Math.random() * 2 - 1), -1, 1);
    }
  }
  b = { w, p, b: br, c: k, dur: 2 };
  BUFS.set(c, b);
  return b;
}

/** Stereo reverb impulse response: decaying noise that darkens over time. */
function makeIR(c, sec) {
  const sr = c.sampleRate;
  const n = Math.floor(sr * sec);
  const ir = c.createBuffer(2, n, sr);
  const pre = Math.floor(sr * 0.012);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / n;
      const x = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.2);
      lp += (0.6 - 0.5 * t) * (x - lp);
      d[i] = i < pre ? 0 : lp;
    }
  }
  return ir;
}

const CURVES = {};
/** tanh soft-clip curve (shared Float32Array, context independent). */
function curve(k) {
  const key = k.toFixed(2);
  if (CURVES[key]) return CURVES[key];
  const n = 1024;
  const a = new Float32Array(n);
  const norm = Math.tanh(k);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    a[i] = Math.tanh(k * x) / norm;
  }
  return (CURVES[key] = a);
}

const WAVES = new WeakMap();
/** 25% pulse wave (toy/chiptune lead). */
function pulseWave(c) {
  let w = WAVES.get(c);
  if (w) return w;
  const N = 40;
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  const d = 0.25;
  for (let n = 1; n < N; n++) {
    re[n] = Math.sin(2 * Math.PI * n * d) / (Math.PI * n);
    im[n] = (1 - Math.cos(2 * Math.PI * n * d)) / (Math.PI * n);
  }
  w = c.createPeriodicWave(re, im);
  WAVES.set(c, w);
  return w;
}

/* ------------------------------------------------------------------------ */
/* Master chain                                                              */
/* ------------------------------------------------------------------------ */

function buildChain(c) {
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.knee.value = 12;
  comp.ratio.value = 4;
  comp.attack.value = 0.003;
  comp.release.value = 0.2;
  // master gain feeds a transparent safety clipper: linear up to 0.8, soft knee to a 0.98 ceiling.
  // The shaper input is pre-scaled by 0.5 so the curve covers ±2.0 of real signal.
  const master = c.createGain();
  master.gain.value = 0.72 * 0.5;
  const clip = c.createWaveShaper();
  clip.curve = ceilingCurve();
  clip.oversample = 'none';
  comp.connect(master);
  master.connect(clip);
  clip.connect(c.destination);

  const sfx = c.createGain();
  sfx.gain.value = sfxEnabled ? 1 : 0;
  sfx.connect(comp);

  const music = c.createGain();
  music.gain.value = musicEnabled ? MUSIC_LEVEL : 0;
  const duckG = c.createGain();
  music.connect(duckG);
  duckG.connect(comp);

  const revIn = c.createGain();
  try {
    const conv = c.createConvolver();
    conv.buffer = makeIR(c, 1.6);
    const rOut = c.createGain();
    rOut.gain.value = 0.55;
    revIn.connect(conv);
    conv.connect(rOut);
    rOut.connect(sfx);
  } catch (e) {
    /* no reverb: sends go nowhere */
  }
  return { c, comp, master, out: clip, sfx, music, duckG, revIn };
}

let CEILING = null;
function ceilingCurve() {
  if (CEILING) return CEILING;
  const n = 4096;
  CEILING = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = 2 * ((i * 2) / (n - 1) - 1);
    const ax = Math.abs(x);
    const y = ax < 0.8 ? ax : 0.8 + 0.18 * Math.tanh((ax - 0.8) / 0.18);
    CEILING[i] = x < 0 ? -y : y;
  }
  return CEILING;
}

/* ------------------------------------------------------------------------ */
/* Voice: a tiny graph builder. Times are relative to the voice start and    */
/* scaled by 1/pitch; frequencies are scaled by pitch (playback-rate style). */
/* All nodes are disconnected once every source in the voice has ended.      */
/* ------------------------------------------------------------------------ */

class Voice {
  constructor(ch, dest, t0, p, onDone) {
    this.ch = ch;
    this.c = ch.c;
    this.t0 = t0;
    this.p = p;
    this.s = 1 / p;
    this.nyq = this.c.sampleRate * 0.45;
    this.nodes = [];
    this.n = 0;
    this.ended = 0;
    this.onDone = onDone;
    this.killed = false;
    this.cleaned = false;
    this.out = this.c.createGain();
    this.nodes.push(this.out);
    this.out.connect(dest);
    this._onEnded = () => {
      if (++this.ended >= this.n) this.cleanup();
    };
  }
  at(t) {
    return this.t0 + t * this.s;
  }
  hz(f) {
    return clamp(f * this.p, 1, this.nyq);
  }
  gain(v = 1) {
    const g = this.c.createGain();
    g.gain.value = v;
    this.nodes.push(g);
    return g;
  }
  filter(type, f, Q = 0.7) {
    const b = this.c.createBiquadFilter();
    b.type = type;
    b.frequency.value = this.hz(f);
    b.Q.value = Q;
    this.nodes.push(b);
    return b;
  }
  shaper(k) {
    const w = this.c.createWaveShaper();
    w.curve = curve(k);
    this.nodes.push(w);
    return w;
  }
  /** Stereo panner inside a voice (falls back to a plain gain where StereoPanner is missing). */
  panner(pan) {
    if (!this.c.createStereoPanner) return this.gain(1);
    const p = this.c.createStereoPanner();
    p.pan.value = clamp(pan, -1, 1);
    this.nodes.push(p);
    return p;
  }
  /** Sine LFO added to any AudioParam from rel time t for dur (rate scales with pitch). */
  lfo(param, rate, depth, t, dur, type = 'sine') {
    const l = this.c.createOscillator();
    l.type = type;
    l.frequency.value = rate * this.p;
    const lg = this.gain(depth);
    l.connect(lg);
    lg.connect(param);
    this.src(l, t, t + dur + 0.01);
  }
  /** Reverb send from this voice's output. */
  send(amount) {
    if (!this.ch.revIn || amount <= 0) return;
    const g = this.gain(amount);
    this.out.connect(g);
    g.connect(this.ch.revIn);
  }
  /** Frequency automation: start f at rel time t, then f1 over glide, or a list of [dt, f] points. */
  sweep(param, t, f, f1, glide, pts) {
    param.setValueAtTime(this.hz(f), this.at(t));
    if (pts) {
      for (let i = 0; i < pts.length; i++) param.exponentialRampToValueAtTime(this.hz(pts[i][1]), this.at(t + pts[i][0]));
    } else if (f1) {
      param.exponentialRampToValueAtTime(this.hz(f1), this.at(t + glide));
    }
  }
  /** Attack (linear) / hold / decay (exponential) gain envelope. */
  env(param, t, a, h, d, g) {
    const T = this.at(t);
    const s = this.s;
    param.setValueAtTime(0, T);
    param.linearRampToValueAtTime(g, T + a * s);
    if (h > 0) param.setValueAtTime(g, T + (a + h) * s);
    param.exponentialRampToValueAtTime(0.0001, T + (a + h + d) * s);
  }
  src(node, t0, t1, offset) {
    this.nodes.push(node);
    this.n++;
    node.onended = this._onEnded;
    if (offset != null) node.start(this.at(t0), offset);
    else node.start(this.at(t0));
    node.stop(this.at(t1));
  }
  /**
   * Oscillator with envelope.
   * o: { type|wave, f, f1, glide, pts, t, a, h, d, g, out, det, vib:{r,d,d1,t1,delay} }
   */
  tone(o) {
    const t = o.t || 0;
    const a = o.a != null ? o.a : 0.003;
    const h = o.h || 0;
    const d = o.d != null ? o.d : 0.2;
    const dur = a + h + d;
    const osc = this.c.createOscillator();
    if (o.wave) osc.setPeriodicWave(o.wave);
    else osc.type = o.type || 'sine';
    this.sweep(osc.frequency, t, o.f, o.f1, o.glide != null ? o.glide : dur, o.pts);
    if (o.det) osc.detune.value = o.det;
    const g = this.gain(0);
    this.env(g.gain, t, a, h, d, Math.max(0.0002, o.g != null ? o.g : 0.5));
    osc.connect(g);
    g.connect(o.out || this.out);
    if (o.vib) this.vib(osc.frequency, t, dur, o.vib);
    this.src(osc, t, t + dur + 0.01);
    return osc;
  }
  /** Sine LFO (Hz depth) into a frequency param. */
  vib(param, t, dur, vb) {
    const l = this.c.createOscillator();
    l.frequency.value = vb.r * this.p;
    const lg = this.gain(0);
    const T = this.at(t);
    const d0 = (vb.d || 0) * this.p;
    if (vb.delay) {
      lg.gain.setValueAtTime(0, T);
      lg.gain.linearRampToValueAtTime(d0, this.at(t + vb.delay));
    } else {
      lg.gain.setValueAtTime(d0, T);
    }
    if (vb.d1 != null) lg.gain.linearRampToValueAtTime(vb.d1 * this.p, this.at(t + (vb.t1 != null ? vb.t1 : dur)));
    l.connect(lg);
    lg.connect(param);
    this.src(l, t, t + dur + 0.01);
  }
  /**
   * Noise burst through an optional filter.
   * o: { k:'w'|'p'|'b'|'c', t, a, h, d, g, ft, f, f1, glide, pts, Q, rate, out }
   */
  noise(o) {
    const t = o.t || 0;
    const a = o.a != null ? o.a : 0.002;
    const h = o.h || 0;
    const d = o.d != null ? o.d : 0.1;
    const dur = a + h + d;
    const B = buffers(this.c);
    const s = this.c.createBufferSource();
    s.buffer = B[o.k || 'w'];
    s.loop = true;
    s.playbackRate.value = (o.rate || 1) * this.p;
    let node = s;
    if (o.ft) {
      const f = this.c.createBiquadFilter();
      f.type = o.ft;
      f.Q.value = o.Q != null ? o.Q : 0.7;
      this.sweep(f.frequency, t, o.f, o.f1, o.glide != null ? o.glide : dur, o.pts);
      this.nodes.push(f);
      node.connect(f);
      node = f;
    }
    const g = this.gain(0);
    this.env(g.gain, t, a, h, d, Math.max(0.0002, o.g != null ? o.g : 0.5));
    node.connect(g);
    g.connect(o.out || this.out);
    this.src(s, t, t + dur + 0.01, Math.random() * (B.dur - 0.05));
    return g;
  }
  /** Fast fade + stop (voice stealing). */
  kill() {
    if (this.killed) return;
    this.killed = true;
    const t = this.c.currentTime;
    quiet(() => {
      const g = this.out.gain;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0, t + 0.025);
    });
    for (let i = 0; i < this.nodes.length; i++) {
      const nd = this.nodes[i];
      if (nd.stop) quiet(() => nd.stop(t + 0.04));
    }
  }
  cleanup() {
    if (this.cleaned) return;
    this.cleaned = true;
    for (let i = 0; i < this.nodes.length; i++) {
      const nd = this.nodes[i];
      quiet(() => nd.disconnect());
      nd.onended = null;
    }
    this.nodes.length = 0;
    if (this.onDone) this.onDone(this);
  }
}

/* ------------------------------------------------------------------------ */
/* Reusable synth fragments                                                  */
/* ------------------------------------------------------------------------ */

/** Bubbly pop: sine sweeping upward. */
function pop(v, t, f, g, up = 2.1) {
  v.tone({ t, f, f1: f * up, glide: 0.045, a: 0.002, d: 0.09, g });
  v.tone({ t, type: 'triangle', f: f * 2, f1: f * up * 2, glide: 0.04, a: 0.001, d: 0.04, g: g * 0.18 });
}

/** Inharmonic bell. */
function bell(v, t, f, g, dec = 1) {
  const P = [
    [1, 1, 1],
    [2, 0.45, 0.6],
    [2.76, 0.3, 0.42],
    [5.4, 0.14, 0.2],
    [8.93, 0.05, 0.1],
  ];
  for (let i = 0; i < P.length; i++) {
    const [r, a, d] = P[i];
    if (f * r * v.p > 12500) continue;
    v.tone({ t, f: f * r, a: 0.0015, d: d * dec, g: g * a });
  }
}

/** Marimba-ish mallet note. */
function mallet(v, t, f, g, d = 0.4) {
  v.tone({ t, f, a: 0.002, d, g });
  v.tone({ t, f: f * 4, a: 0.001, d: 0.06, g: g * 0.2 });
  v.tone({ t, type: 'triangle', f: f * 2, a: 0.002, d: d * 0.3, g: g * 0.12 });
}

/** Hollow wooden knock. */
function knock(v, t, f, g, d = 0.1) {
  v.tone({ t, f: f * 1.08, f1: f, glide: 0.02, a: 0.0008, d, g });
  v.tone({ t, f: f * 2.62, a: 0.0006, d: d * 0.45, g: g * 0.35 });
  v.noise({ t, k: 'w', a: 0.0005, d: 0.018, g: g * 0.6, ft: 'bandpass', f: f * 3, Q: 1.8 });
}

/** Tiny bird tweet. */
function tweet(v, t, f, g, d = 0.07) {
  v.tone({ t, f, pts: [[d * 0.4, f * 1.3], [d, f * 1.1]], a: 0.004, h: d * 0.45, d: d * 0.6, g });
}

/**
 * Bird / cartoon voice: a buzzy source through formant band-passes.
 * o: { t, type, pts:[[t,f]...], a, h, d, g, vib, drive, am:{r,depth}, form:[{f,pts,Q,g}], body:[lpHz, gain] }
 */
function bird(v, o) {
  const t = o.t || 0;
  const mix = v.gain(1);
  mix.connect(v.out);
  const pre = v.gain(1);
  for (let i = 0; i < o.form.length; i++) {
    const F = o.form[i];
    const bp = v.filter('bandpass', F.f, F.Q);
    if (F.pts) v.sweep(bp.frequency, t, F.f, null, 0, F.pts);
    const fg = v.gain(F.g);
    pre.connect(bp);
    bp.connect(fg);
    fg.connect(mix);
  }
  if (o.body) {
    const lp = v.filter('lowpass', o.body[0], 1);
    const lg = v.gain(o.body[1]);
    pre.connect(lp);
    lp.connect(lg);
    lg.connect(mix);
  }
  let into = pre;
  if (o.drive) {
    const sh = v.shaper(o.drive);
    sh.connect(into);
    into = sh;
  }
  const dur = o.a + (o.h || 0) + o.d;
  if (o.am) {
    const amg = v.gain(1 - o.am.depth);
    const l = v.c.createOscillator();
    l.frequency.value = o.am.r * v.p;
    const lg = v.gain(o.am.depth);
    l.connect(lg);
    lg.connect(amg.gain);
    amg.connect(into);
    into = amg;
    v.src(l, t, t + dur + 0.01);
  }
  const P = o.pts;
  v.tone({
    t,
    type: o.type || 'sawtooth',
    f: P[0][1],
    pts: P.slice(1),
    a: o.a,
    h: o.h,
    d: o.d,
    g: o.g,
    vib: o.vib,
    out: into,
  });
}

/** Cartoon explosion. S = size 0..1, g = level. */
function boom(v, t, S, g = 1) {
  // transient click (reads on any speaker)
  v.noise({ t, k: 'w', a: 0.0008, d: 0.025, g: 0.5 * g, ft: 'highpass', f: 1200 });
  // sub thump (felt on headphones)
  v.tone({ t, f: 110 - 25 * S, f1: 34, glide: 0.25 + 0.4 * S, a: 0.003, h: 0.03 * S, d: 0.3 + 0.7 * S, g: 0.8 * g });
  // driven mid punch: harmonics of the thump so phone speakers hear the "boom"
  const sh = v.shaper(3.5);
  const lp = v.filter('lowpass', 2400, 0.5);
  const sg = v.gain(0.45 * g);
  sh.connect(lp);
  lp.connect(sg);
  sg.connect(v.out);
  v.tone({ t, type: 'triangle', f: 270 - 50 * S, f1: 68, glide: 0.18 + 0.25 * S, a: 0.002, h: 0.02, d: 0.2 + 0.35 * S, g: 1, out: sh });
  // noise blast sweeping down
  v.noise({ t, k: 'w', a: 0.002, h: 0.02 * S, d: 0.3 + 0.9 * S, g: 0.55 * g, ft: 'lowpass', f: 6500, f1: 170, glide: 0.25 + 0.8 * S, Q: 0.5 });
  // rumble
  v.noise({ t, k: 'b', a: 0.004, h: 0.08 * S, d: 0.35 + 1.0 * S, g: 0.65 * g, ft: 'lowpass', f: 650 + 350 * S });
  // crackle tail
  v.noise({ t: t + 0.04, k: 'c', a: 0.03, h: 0.1 * S, d: 0.3 + 0.9 * S, g: 0.55 * g, ft: 'bandpass', f: 1700, Q: 0.6, rate: 0.9 });
  if (S > 0.6) v.noise({ t: t + 0.1, k: 'c', a: 0.05, h: 0.15, d: 0.9 * S, g: 0.4 * g, ft: 'lowpass', f: 900, rate: 0.5 });
}

/* ------------------------------------------------------------------------ */
/* Sound effect library                                                      */
/*   g: base gain, pr: priority (higher survives voice stealing),            */
/*   j: random pitch jitter (±), max: simultaneous voices of this name,      */
/*   duck: [amount, seconds] music duck                                       */
/* ------------------------------------------------------------------------ */

const SFX = Object.create(null);
function def(name, g, pr, j, max, fn, extra) {
  SFX[name] = Object.assign({ g, pr, j, max, fn }, extra || {});
}

/* ---- UI ---- */
def('tap', 1.3, 3, 0.015, 4, (v) => {
  v.tone({ f: 480, f1: 1180, glide: 0.05, a: 0.002, d: 0.085, g: 0.5 });
  v.tone({ type: 'triangle', f: 960, f1: 2200, glide: 0.04, a: 0.001, d: 0.04, g: 0.1 });
  v.noise({ k: 'w', a: 0.0005, d: 0.01, g: 0.08, ft: 'highpass', f: 3500 });
});
def('back', 1.2, 3, 0.015, 4, (v) => {
  v.tone({ f: 560, f1: 240, glide: 0.08, a: 0.002, d: 0.11, g: 0.5 });
  v.tone({ type: 'triangle', f: 280, f1: 170, glide: 0.07, a: 0.002, d: 0.08, g: 0.2 });
  v.noise({ k: 'w', a: 0.0005, d: 0.012, g: 0.07, ft: 'bandpass', f: 1800, Q: 1 });
});
def('select', 0.6, 3, 0.02, 4, (v) => {
  v.noise({ k: 'w', a: 0.0005, d: 0.016, g: 0.3, ft: 'bandpass', f: 3600, Q: 3 });
  v.tone({ type: 'triangle', f: 1900, a: 0.0008, d: 0.025, g: 0.12 });
  v.tone({ t: 0.03, f: 1900, pts: [[0.035, 3300], [0.075, 2500], [0.11, 2900]], a: 0.006, h: 0.05, d: 0.06, g: 0.28, vib: { r: 38, d: 90 } });
  v.tone({ t: 0.15, f: 2500, pts: [[0.03, 3700], [0.07, 3100]], a: 0.004, h: 0.02, d: 0.05, g: 0.2 });
});
def('start', 0.9, 3, 0, 2, (v) => {
  v.noise({ k: 'p', a: 0.28, d: 0.1, g: 0.4, ft: 'bandpass', f: 350, f1: 3600, glide: 0.36, Q: 1.3 });
  v.tone({ type: 'triangle', f: 220, f1: 880, glide: 0.34, a: 0.25, d: 0.08, g: 0.08 });
  bell(v, 0.34, 1046.5, 0.3, 1.3);
  bell(v, 0.34, 1568, 0.12, 0.9);
  v.noise({ t: 0.34, k: 'w', a: 0.002, d: 0.3, g: 0.05, ft: 'highpass', f: 7000 });
  v.send(0.35);
});
def('turn', 0.75, 3, 0, 2, (v) => {
  mallet(v, 0, 784, 0.34, 0.4);
  mallet(v, 0.13, 1046.5, 0.34, 0.55);
  v.send(0.18);
});
def('tick', 1.4, 3, 0, 2, (v) => {
  v.tone({ f: 1250, f1: 1150, glide: 0.02, a: 0.0006, d: 0.045, g: 0.4 });
  v.tone({ f: 3150, a: 0.0005, d: 0.018, g: 0.1 });
  v.tone({ type: 'triangle', f: 620, a: 0.0006, d: 0.03, g: 0.12 });
  v.noise({ k: 'w', a: 0.0004, d: 0.01, g: 0.22, ft: 'bandpass', f: 2600, Q: 3 });
});
def('deny', 0.8, 3, 0, 2, (v) => {
  const lp = v.filter('lowpass', 1500, 1);
  lp.connect(v.out);
  [[0, 208], [0.1, 156]].forEach(([t, f]) => {
    v.tone({ t, type: 'square', f, f1: f * 0.95, a: 0.004, h: 0.035, d: 0.06, g: 0.16, out: lp });
    v.tone({ t, type: 'sawtooth', f: f * 1.013, f1: f * 0.96, a: 0.004, h: 0.035, d: 0.06, g: 0.1, out: lp });
  });
  v.tone({ t: 0.1, f: 330, f1: 160, glide: 0.08, a: 0.002, d: 0.12, g: 0.3 });
});

/* ---- Birds ---- */
def('launch', 2.2, 2, 0.02, 3, (v) => {
  v.noise({ k: 'w', a: 0.0004, d: 0.02, g: 0.45, ft: 'highpass', f: 1800 });
  const lp = v.filter('lowpass', 2600, 3);
  v.sweep(lp.frequency, 0, 2600, 500, 0.3);
  lp.connect(v.out);
  v.tone({ type: 'sawtooth', f: 270, f1: 105, glide: 0.28, a: 0.002, d: 0.3, g: 0.32, out: lp, vib: { r: 23, d: 45, d1: 3, t1: 0.3 } });
  v.tone({ type: 'triangle', f: 135, f1: 70, glide: 0.25, a: 0.002, d: 0.22, g: 0.25 });
  v.noise({ t: 0.015, k: 'p', a: 0.07, d: 0.32, g: 0.6, ft: 'bandpass', f: 600, pts: [[0.1, 2700], [0.35, 900]], Q: 1.2 });
});
def('squawk_red', 0.7, 2, 0.03, 3, (v) =>
  bird(v, {
    type: 'sawtooth',
    pts: [[0, 430], [0.05, 690], [0.16, 610], [0.34, 400]],
    a: 0.015, h: 0.2, d: 0.14, g: 0.6,
    vib: { r: 31, d: 28 },
    drive: 2.2,
    form: [
      { f: 850, pts: [[0.08, 1250], [0.3, 800]], Q: 5, g: 2.2 },
      { f: 1900, pts: [[0.08, 2500], [0.3, 1800]], Q: 7, g: 1.6 },
      { f: 3200, Q: 6, g: 0.6 },
    ],
    body: [700, 0.4],
  })
);
def('squawk_yellow', 0.62, 2, 0.03, 3, (v) => {
  bird(v, {
    type: 'square',
    pts: [[0, 760], [0.05, 1500], [0.11, 1850], [0.2, 1300]],
    a: 0.008, h: 0.09, d: 0.1, g: 0.45,
    vib: { r: 42, d: 45 },
    drive: 1.5,
    form: [
      { f: 1500, pts: [[0.1, 2300]], Q: 5, g: 2 },
      { f: 3000, pts: [[0.1, 3800]], Q: 6, g: 1.2 },
    ],
  });
  v.noise({ k: 'w', a: 0.01, d: 0.1, g: 0.08, ft: 'bandpass', f: 2500, f1: 7000, glide: 0.1, Q: 2 });
});
def('squawk_blue', 0.8, 2, 0.03, 3, (v) => {
  tweet(v, 0, 3000, 0.3);
  tweet(v, 0.085, 3500, 0.26);
  tweet(v, 0.17, 3200, 0.3, 0.09);
});
def('squawk_black', 0.85, 2, 0.03, 3, (v) =>
  bird(v, {
    type: 'sawtooth',
    pts: [[0, 125], [0.08, 175], [0.3, 150], [0.5, 105]],
    a: 0.03, h: 0.3, d: 0.18, g: 0.7,
    vib: { r: 7, d: 6 },
    drive: 3,
    am: { r: 29, depth: 0.55 },
    form: [
      { f: 520, pts: [[0.15, 700], [0.5, 480]], Q: 4, g: 2.2 },
      { f: 1100, pts: [[0.15, 1350], [0.5, 1000]], Q: 6, g: 1.5 },
      { f: 2400, Q: 5, g: 0.5 },
    ],
    body: [400, 0.8],
  })
);
def('squawk_white', 0.36, 2, 0.03, 3, (v) => {
  v.tone({ type: 'triangle', f: 620, f1: 330, glide: 0.03, a: 0.001, d: 0.04, g: 0.35 });
  v.noise({ k: 'w', a: 0.0005, d: 0.012, g: 0.15, ft: 'bandpass', f: 1500, Q: 2 });
  bird(v, {
    t: 0.055,
    type: 'square',
    pts: [[0, 950], [0.04, 1550], [0.13, 1350], [0.22, 880]],
    a: 0.008, h: 0.12, d: 0.1, g: 0.42,
    vib: { r: 21, d: 55 },
    drive: 1.3,
    form: [
      { f: 1300, pts: [[0.1, 1700]], Q: 6, g: 2 },
      { f: 2700, pts: [[0.1, 3200]], Q: 9, g: 1.4 },
    ],
  });
});
def('ability', 0.85, 2, 0, 3, (v) => {
  const lp = v.filter('lowpass', 4000, 1);
  lp.connect(v.out);
  v.tone({ type: 'square', f: 330, f1: 1980, glide: 0.2, a: 0.01, h: 0.1, d: 0.1, g: 0.1, out: lp });
  v.tone({ type: 'triangle', f: 660, f1: 3960, glide: 0.2, a: 0.01, h: 0.08, d: 0.1, g: 0.1 });
  v.tone({ t: 0.19, f: 2637, a: 0.003, d: 0.5, g: 0.2, vib: { r: 13, d: 35 } });
  v.tone({ t: 0.19, f: 3951, a: 0.003, d: 0.35, g: 0.09, vib: { r: 16, d: 50 } });
  v.noise({ t: 0.17, k: 'w', a: 0.02, d: 0.35, g: 0.06, ft: 'highpass', f: 7000 });
  v.send(0.25);
});
def('dash', 1.35, 2, 0.02, 3, (v) => {
  v.noise({ k: 'p', a: 0.05, h: 0.1, d: 0.3, g: 0.6, ft: 'bandpass', f: 450, f1: 3800, glide: 0.35, Q: 1.5 });
  const lp = v.filter('lowpass', 1600, 2);
  lp.connect(v.out);
  v.tone({ type: 'sawtooth', f: 170, f1: 880, glide: 0.32, a: 0.03, h: 0.1, d: 0.25, g: 0.14, out: lp });
  v.noise({ k: 'w', a: 0.01, d: 0.12, g: 0.12, ft: 'highpass', f: 4500 });
});
def('split', 1.0, 2, 0.02, 3, (v) => {
  [[0, 620], [0.065, 780], [0.13, 940]].forEach(([t, f]) => {
    pop(v, t, f, 0.38);
    v.noise({ t, k: 'w', a: 0.0005, d: 0.01, g: 0.08, ft: 'highpass', f: 3000 });
  });
  [[0.05, 3520], [0.1, 4186], [0.16, 5274], [0.21, 4699]].forEach(([t, f]) => v.tone({ t, f, a: 0.001, d: 0.12, g: 0.06 }));
  v.send(0.2);
});
def('egg_drop', 0.6, 2, 0, 2, (v) => {
  v.tone({ f: 2100, f1: 620, glide: 0.58, a: 0.02, h: 0.46, d: 0.12, g: 0.26, vib: { r: 7, d: 38 } });
  v.tone({ type: 'triangle', f: 4200, f1: 1240, glide: 0.58, a: 0.02, h: 0.4, d: 0.12, g: 0.025 });
});
def('fuse', 1.0, 2, 0, 2, (v) => {
  v.noise({ k: 'w', a: 0.015, h: 0.45, d: 0.14, g: 0.16, ft: 'bandpass', f: 5200, Q: 0.9 });
  v.noise({ k: 'c', a: 0.01, h: 0.45, d: 0.14, g: 0.6, ft: 'highpass', f: 2200, rate: 1.4 });
  v.noise({ k: 'w', a: 0.01, h: 0.4, d: 0.2, g: 0.05, ft: 'bandpass', f: 2000, Q: 2.5 });
});

/* ---- Impacts ---- */
def('hit_wood', 1.45, 1, 0.04, 5, (v) => {
  knock(v, 0, 420, 0.55, 0.11);
  v.tone({ type: 'triangle', f: 210, f1: 170, glide: 0.06, a: 0.001, d: 0.08, g: 0.2 });
});
def('hit_stone', 2.2, 1, 0.04, 5, (v) => {
  v.noise({ k: 'w', a: 0.0004, d: 0.03, g: 0.5, ft: 'bandpass', f: 2600, Q: 1.2 });
  v.tone({ f: 1780, a: 0.0004, d: 0.035, g: 0.16 });
  v.tone({ f: 2950, a: 0.0004, d: 0.022, g: 0.1 });
  v.tone({ f: 200, f1: 120, glide: 0.05, a: 0.001, d: 0.06, g: 0.32 });
  v.tone({ type: 'triangle', f: 400, f1: 260, glide: 0.04, a: 0.001, d: 0.04, g: 0.14 });
});
def('hit_ice', 1.5, 1, 0.04, 5, (v) => {
  v.noise({ k: 'w', a: 0.0004, d: 0.008, g: 0.18, ft: 'highpass', f: 4500 });
  const b = rnd(0.97, 1.03);
  [[2637, 0.24, 0.25], [3960, 0.13, 0.18], [5580, 0.09, 0.12], [7040, 0.05, 0.08]].forEach(([f, g, d]) =>
    v.tone({ f: f * b, a: 0.0006, d, g })
  );
  v.send(0.1);
});
def('break_wood', 1.7, 1, 0.04, 4, (v) => {
  v.noise({ k: 'w', a: 0.0005, d: 0.035, g: 0.5, ft: 'bandpass', f: 1900, Q: 0.8 });
  [[0, 330, 0.45], [0.035, 470, 0.32], [0.08, 262, 0.28], [0.13, 560, 0.18]].forEach(([t, f, g]) =>
    knock(v, t, f * rnd(0.95, 1.05), g, 0.09)
  );
  v.noise({ t: 0.01, k: 'c', a: 0.004, h: 0.07, d: 0.3, g: 0.9, ft: 'bandpass', f: 2300, Q: 1.1, rate: 1.1 });
  v.tone({ f: 140, f1: 70, glide: 0.1, a: 0.002, d: 0.12, g: 0.3 });
});
def('break_stone', 1.6, 1, 0.04, 4, (v) => {
  v.noise({ k: 'w', a: 0.0005, d: 0.05, g: 0.45, ft: 'bandpass', f: 1600, Q: 0.9 });
  v.tone({ f: 170, f1: 70, glide: 0.12, a: 0.002, d: 0.18, g: 0.45 });
  v.tone({ type: 'triangle', f: 340, f1: 150, glide: 0.1, a: 0.002, d: 0.1, g: 0.18 });
  v.noise({ t: 0.015, k: 'c', a: 0.01, h: 0.14, d: 0.45, g: 1.1, ft: 'bandpass', f: 950, f1: 520, glide: 0.6, Q: 3, rate: 0.75 });
  v.noise({ t: 0.03, k: 'c', a: 0.01, h: 0.1, d: 0.35, g: 0.6, ft: 'bandpass', f: 2300, Q: 2, rate: 0.6 });
  v.noise({ k: 'b', a: 0.01, h: 0.1, d: 0.4, g: 0.35, ft: 'lowpass', f: 700 });
});
def('break_ice', 2.5, 1, 0.04, 4, (v) => {
  v.noise({ k: 'w', a: 0.0008, d: 0.12, g: 0.4, ft: 'highpass', f: 2600 });
  v.noise({ k: 'w', a: 0.0008, d: 0.05, g: 0.25, ft: 'bandpass', f: 1300, Q: 1 });
  const bank = v.gain(1);
  [3300, 4500, 6100, 7700].forEach((f) => {
    const bp = v.filter('bandpass', f, 22);
    bank.connect(bp);
    bp.connect(v.out);
  });
  v.noise({ t: 0.008, k: 'c', a: 0.004, h: 0.08, d: 0.65, g: 3.5, out: bank, rate: 0.9 });
  for (let i = 0; i < 6; i++) {
    v.tone({ t: 0.03 + i * 0.07 + rnd(0, 0.04), f: rnd(2800, 6800), a: 0.0008, d: rnd(0.08, 0.16), g: 0.07 * (1 - i * 0.1) });
  }
  v.send(0.2);
});
def('thud', 1.2, 1, 0.04, 5, (v) => {
  v.tone({ f: 125, f1: 55, glide: 0.1, a: 0.003, d: 0.15, g: 0.5 });
  v.tone({ type: 'triangle', f: 260, f1: 120, glide: 0.06, a: 0.002, d: 0.08, g: 0.24 });
  v.noise({ k: 'b', a: 0.003, d: 0.14, g: 0.45, ft: 'lowpass', f: 550 });
  v.noise({ k: 'p', a: 0.002, d: 0.07, g: 0.32, ft: 'bandpass', f: 800, Q: 1 });
  v.tone({ f: 340, f1: 190, glide: 0.04, a: 0.001, d: 0.05, g: 0.14 });
});
def('bounce', 1.05, 1, 0.04, 4, (v) => {
  v.tone({ type: 'triangle', f: 250, pts: [[0.03, 560], [0.26, 430]], a: 0.003, h: 0.03, d: 0.23, g: 0.34, vib: { r: 13, d: 55, d1: 4, t1: 0.26 } });
  v.tone({ f: 500, pts: [[0.03, 1120], [0.2, 860]], a: 0.003, d: 0.12, g: 0.07 });
});

/* ---- Explosions ---- */
def('explode_small', 1.2, 3, 0.04, 4, (v) => {
  boom(v, 0, 0.35, 0.85);
  v.send(0.15);
});
def(
  'explode_big',
  1.3, 3, 0.04, 3,
  (v) => {
    boom(v, 0, 1, 1);
    v.send(0.45);
  },
  { duck: [0.5, 1.0] }
);
def(
  'tnt',
  1.15, 3, 0.04, 3,
  (v) => {
    v.noise({ k: 'w', a: 0.0004, d: 0.05, g: 0.6, ft: 'bandpass', f: 2100, Q: 0.9 });
    knock(v, 0, 520, 0.45, 0.08);
    knock(v, 0.03, 380, 0.3, 0.1);
    v.noise({ t: 0.01, k: 'c', a: 0.004, h: 0.1, d: 0.5, g: 0.8, ft: 'bandpass', f: 2600, Q: 1, rate: 1.2 });
    boom(v, 0.012, 0.85, 0.95);
    v.send(0.4);
  },
  { duck: [0.5, 0.9] }
);

/* ---- Captain ---- */
def('hurt', 0.45, 2, 0.03, 3, (v) => {
  bird(v, {
    type: 'sawtooth',
    pts: [[0, 520], [0.035, 610], [0.2, 400]],
    a: 0.012, h: 0.1, d: 0.1, g: 0.6,
    vib: { r: 11, d: 14 },
    drive: 1.2,
    form: [
      { f: 600, pts: [[0.2, 450]], Q: 4, g: 2.2 },
      { f: 1100, pts: [[0.2, 850]], Q: 5, g: 1.3 },
      { f: 2600, Q: 5, g: 0.35 },
    ],
    body: [800, 0.5],
  });
  v.noise({ t: 0.16, k: 'w', a: 0.015, d: 0.07, g: 0.05, ft: 'bandpass', f: 2800, Q: 1.2 });
});
def('ko', 0.85, 3, 0, 2, (v) => {
  v.tone({ f: 1500, pts: [[0.08, 1700], [0.72, 320]], a: 0.02, h: 0.62, d: 0.1, g: 0.25, vib: { r: 6.5, d: 40 } });
  v.tone({ type: 'triangle', f: 3000, pts: [[0.08, 3400], [0.72, 640]], a: 0.02, h: 0.62, d: 0.1, g: 0.02 });
  knock(v, 0.78, 300, 0.55, 0.15);
  v.tone({ t: 0.78, f: 330, f1: 165, glide: 0.1, a: 0.001, d: 0.16, g: 0.35 });
  tweet(v, 0.98, 3200, 0.08);
  tweet(v, 1.1, 3700, 0.07);
  tweet(v, 1.22, 3400, 0.08);
});
def('splash', 1.6, 2, 0.03, 3, (v) => {
  v.tone({ f: 440, f1: 150, glide: 0.07, a: 0.002, d: 0.09, g: 0.32 });
  v.noise({ k: 'w', a: 0.004, h: 0.04, d: 0.45, g: 0.5, ft: 'bandpass', f: 2400, f1: 850, glide: 0.45, Q: 0.8 });
  v.noise({ t: 0.015, k: 'w', a: 0.02, d: 0.35, g: 0.14, ft: 'highpass', f: 5000 });
  v.noise({ k: 'b', a: 0.005, d: 0.25, g: 0.25, ft: 'lowpass', f: 600 });
  for (let i = 0; i < 6; i++) {
    const t = 0.12 + i * 0.075 + rnd(0, 0.04);
    const f = rnd(450, 950);
    v.tone({ t, f, f1: f * 2.3, glide: 0.035, a: 0.002, d: 0.05, g: 0.11 * (1 - i * 0.1) });
  }
});
def('move', 0.6, 0, 0.06, 2, (v) => {
  v.noise({ k: 'b', a: 0.02, h: 0.1, d: 0.1, g: 0.4, ft: 'lowpass', f: 420 });
  v.noise({ k: 'p', a: 0.02, h: 0.06, d: 0.1, g: 0.12, ft: 'bandpass', f: 600, Q: 1.5 });
  const bp = v.filter('bandpass', rnd(1000, 1500), 7);
  bp.connect(v.out);
  v.tone({ type: 'sawtooth', f: rnd(28, 40), f1: rnd(30, 44), a: 0.03, h: 0.06, d: 0.07, g: 0.5, out: bp });
  v.noise({ k: 'w', a: 0.0005, d: 0.01, g: 0.06, ft: 'bandpass', f: 2500, Q: 2 });
  v.noise({ t: 0.12, k: 'w', a: 0.0005, d: 0.01, g: 0.05, ft: 'bandpass', f: 2300, Q: 2 });
});
def('land', 1.35, 2, 0.04, 3, (v) => {
  v.tone({ f: 150, f1: 58, glide: 0.1, a: 0.002, d: 0.2, g: 0.55 });
  v.tone({ type: 'triangle', f: 300, f1: 130, glide: 0.07, a: 0.002, d: 0.1, g: 0.22 });
  knock(v, 0.004, 360, 0.35, 0.09);
  v.noise({ k: 'b', a: 0.003, d: 0.12, g: 0.35, ft: 'lowpass', f: 700 });
  v.noise({ t: 0.02, k: 'c', a: 0.003, d: 0.14, g: 0.5, ft: 'bandpass', f: 2600, Q: 1.5 });
});

/* ---- Results ---- */
def('win', 1.15, 3, 0, 1, (v) => {
  const lp = v.filter('lowpass', 3000, 1);
  lp.connect(v.out);
  [[0, 523.25], [0.085, 659.25], [0.17, 783.99], [0.255, 1046.5]].forEach(([t, f]) => {
    v.tone({ t, type: 'square', f, a: 0.003, d: 0.14, g: 0.1, out: lp });
    mallet(v, t, f, 0.18, 0.25);
  });
  const lp2 = v.filter('lowpass', 600, 1);
  v.sweep(lp2.frequency, 0.36, 600, null, 0, [[0.06, 3000], [0.9, 1400]]);
  lp2.connect(v.out);
  [523.25, 659.25, 783.99, 1046.5].forEach((f) =>
    v.tone({ t: 0.36, type: 'sawtooth', f, a: 0.03, h: 0.55, d: 0.5, g: 0.07, out: lp2, vib: { r: 5.5, d: f * 0.008, delay: 0.25 } })
  );
  [[0.36, 2093], [0.43, 2637], [0.5, 3136], [0.57, 4186]].forEach(([t, f]) => v.tone({ t, f, a: 0.001, d: 0.35, g: 0.07 }));
  v.noise({ t: 0.36, k: 'w', a: 0.005, d: 0.8, g: 0.05, ft: 'highpass', f: 6000 });
  v.send(0.25);
});
def('lose', 0.9, 3, 0, 1, (v) => {
  const notes = [[0, 293.66, 0.26], [0.3, 277.18, 0.26], [0.6, 261.63, 0.26], [0.9, 246.94, 0.75]];
  notes.forEach(([t, f, len], i) => {
    const last = i === 3;
    const lp = v.filter('lowpass', 350, 6);
    v.sweep(lp.frequency, t, 350, null, 0, last ? [[0.07, 1500], [0.3, 700], [0.45, 1300], [0.8, 380]] : [[0.07, 1500], [len, 450]]);
    lp.connect(v.out);
    v.tone({
      t, type: 'sawtooth', f,
      pts: last ? [[0.12, f], [len, f * 0.93]] : null,
      a: 0.03, h: len - 0.1, d: 0.12, g: 0.24, out: lp,
      vib: last ? { r: 6, d: 0, d1: f * 0.035, t1: len } : null,
    });
    v.tone({ t, type: 'triangle', f: f * 2, a: 0.03, h: len - 0.12, d: 0.1, g: 0.03 });
  });
});
def('star', 1.1, 3, 0, 4, (v) => {
  bell(v, 0, 1318.5, 0.28, 0.9);
  [[0.03, 3951], [0.06, 5274], [0.1, 4699], [0.14, 6272]].forEach(([t, f]) => v.tone({ t, f, a: 0.001, d: 0.12, g: 0.06 }));
  v.noise({ k: 'w', a: 0.004, d: 0.3, g: 0.05, ft: 'highpass', f: 8000 });
  v.send(0.3);
});
def('wind', 1.3, 2, 0.03, 2, (v) => {
  v.noise({ k: 'p', a: 0.35, h: 0.2, d: 0.55, g: 0.45, ft: 'bandpass', f: 420, pts: [[0.4, 1100], [1.1, 560]], Q: 1.1 });
  v.noise({ k: 'w', a: 0.4, h: 0.1, d: 0.5, g: 0.05, ft: 'bandpass', f: 1700, pts: [[0.5, 2500], [1.1, 1400]], Q: 10 });
  v.noise({ k: 'b', a: 0.3, h: 0.2, d: 0.5, g: 0.12, ft: 'lowpass', f: 500 });
});

/* ---- Squirrels & nuts theme ---- */
def('chitter', 1.3, 2, 0.03, 3, (v) => {
  // 4-6 rapid squeaky chirps with tongue clicks and a little rasp; last one flicks up
  const n = 4 + Math.floor(Math.random() * 3);
  let t = 0;
  for (let i = 0; i < n; i++) {
    const f = rnd(2300, 2800) * (i === n - 1 ? 1.12 : 1);
    const acc = i === 0 ? 1 : rnd(0.6, 0.9);
    v.tone({ t, type: 'triangle', f: f * 0.8, pts: [[0.012, f * 1.25], [0.04, f * 0.9]], a: 0.003, h: 0.012, d: 0.03, g: 0.3 * acc });
    v.tone({ t, f: f * 1.6, pts: [[0.012, f * 2], [0.04, f * 1.5]], a: 0.002, d: 0.025, g: 0.06 * acc });
    v.noise({ t, k: 'w', a: 0.0005, d: 0.008, g: 0.22 * acc, ft: 'bandpass', f: 4200, Q: 2.5 });
    v.noise({ t, k: 'w', a: 0.002, d: 0.02, g: 0.08 * acc, ft: 'bandpass', f: 1500, Q: 3 });
    t += rnd(0.048, 0.068);
  }
});
def('squeak_hurt', 0.3, 2, 0.03, 3, (v) => {
  // "eek!": soft triangle squeal, energy kept around 1.3 kHz so it's cute rather than shrill
  v.noise({ k: 'w', a: 0.004, d: 0.03, g: 0.08, ft: 'bandpass', f: 3000, Q: 1.5 });
  bird(v, {
    type: 'triangle',
    pts: [[0, 900], [0.035, 1380], [0.16, 1300], [0.29, 980]],
    a: 0.012, h: 0.14, d: 0.13, g: 0.7,
    vib: { r: 13, d: 30 },
    drive: 1.6,
    form: [
      { f: 1300, pts: [[0.16, 1250], [0.29, 1000]], Q: 3, g: 1.6 },
      { f: 2700, pts: [[0.16, 2600], [0.29, 2100]], Q: 6, g: 0.7 },
    ],
    body: [1100, 0.4],
  });
});
def('squeak_ko', 0.25, 3, 0, 2, (v) => {
  // long falling "eeeek..." with a growing dizzy wobble, then a soft bonk
  bird(v, {
    type: 'triangle',
    pts: [[0, 1150], [0.07, 1500], [0.25, 1250], [0.68, 520]],
    a: 0.015, h: 0.5, d: 0.18, g: 0.7,
    vib: { r: 9, d: 20, d1: 70, t1: 0.68 },
    drive: 1.6,
    form: [
      { f: 1400, pts: [[0.25, 1300], [0.68, 700]], Q: 2.5, g: 1.6 },
      { f: 2800, pts: [[0.68, 1600]], Q: 5, g: 0.6 },
    ],
    body: [1000, 0.45],
  });
  knock(v, 0.72, 280, 0.35, 0.14);
  v.tone({ t: 0.72, f: 300, f1: 160, glide: 0.1, a: 0.002, d: 0.16, g: 0.3 });
});
def('nut_hit', 2.0, 1, 0.04, 5, (v) => {
  // small hollow "tock" (higher and drier than hit_wood); size via opts.pitch
  v.tone({ f: 900, f1: 780, glide: 0.015, a: 0.0006, d: 0.07, g: 0.45 });
  v.tone({ f: 2150, a: 0.0005, d: 0.022, g: 0.14 });
  v.tone({ type: 'triangle', f: 430, f1: 380, glide: 0.03, a: 0.0008, d: 0.05, g: 0.16 });
  v.noise({ k: 'w', a: 0.0004, d: 0.012, g: 0.3, ft: 'bandpass', f: 2600, Q: 2 });
  v.noise({ k: 'p', a: 0.0005, d: 0.05, g: 0.12, ft: 'bandpass', f: 1000, Q: 8 });
});
def('crack', 2.2, 2, 0.04, 3, (v) => {
  // crisp double snap + shell ping, then a fine crumbly tail
  v.noise({ k: 'w', a: 0.0003, d: 0.008, g: 0.6, ft: 'highpass', f: 1500 });
  v.noise({ t: 0.018, k: 'w', a: 0.0003, d: 0.006, g: 0.3, ft: 'highpass', f: 2000 });
  v.noise({ k: 'w', a: 0.0004, d: 0.025, g: 0.35, ft: 'bandpass', f: 3200, Q: 1.4 });
  v.tone({ f: 1850, f1: 1500, glide: 0.02, a: 0.0004, d: 0.025, g: 0.14 });
  v.tone({ type: 'triangle', f: 620, f1: 400, glide: 0.03, a: 0.0005, d: 0.035, g: 0.14 });
  v.noise({ t: 0.012, k: 'c', a: 0.003, h: 0.03, d: 0.16, g: 1.4, ft: 'bandpass', f: 2800, Q: 1.2, rate: 1.4 });
  v.noise({ t: 0.03, k: 'c', a: 0.005, d: 0.12, g: 0.8, ft: 'bandpass', f: 1400, Q: 1.5, rate: 0.9 });
});
def(
  'pound',
  1.0, 3, 0.02, 2,
  (v) => {
    // rising "shwip"...
    v.noise({ k: 'p', a: 0.08, d: 0.05, g: 0.4, ft: 'bandpass', f: 700, f1: 4200, glide: 0.12, Q: 1.8 });
    v.tone({ f: 380, f1: 1500, glide: 0.12, a: 0.06, d: 0.05, g: 0.06 });
    // ...then a heavy woody slam with low punch
    const T = 0.13;
    v.noise({ t: T, k: 'w', a: 0.0006, d: 0.03, g: 0.45, ft: 'bandpass', f: 1600, Q: 0.8 });
    knock(v, T, 250, 0.55, 0.16);
    v.tone({ t: T, f: 150, f1: 42, glide: 0.22, a: 0.002, h: 0.02, d: 0.38, g: 0.8 });
    const sh = v.shaper(3);
    const lp = v.filter('lowpass', 1800, 0.5);
    const sg = v.gain(0.35);
    sh.connect(lp);
    lp.connect(sg);
    sg.connect(v.out);
    v.tone({ t: T, type: 'triangle', f: 300, f1: 80, glide: 0.18, a: 0.002, d: 0.26, g: 1, out: sh });
    v.noise({ t: T, k: 'b', a: 0.003, h: 0.04, d: 0.35, g: 0.55, ft: 'lowpass', f: 650 });
    v.noise({ t: T + 0.02, k: 'c', a: 0.01, d: 0.25, g: 0.35, ft: 'bandpass', f: 1800, Q: 0.8, rate: 0.8 });
    v.send(0.15);
  },
  { duck: [0.3, 0.35] }
);
def('spikes', 2.4, 3, 0.02, 2, (v) => {
  // dense needle ticks
  v.noise({ k: 'c', a: 0.004, h: 0.08, d: 0.3, g: 1.2, ft: 'highpass', f: 3500, rate: 2.2 });
  v.noise({ t: 0.02, k: 'c', a: 0.01, h: 0.06, d: 0.28, g: 0.8, ft: 'bandpass', f: 6500, Q: 1.5, rate: 1.7 });
  // little whooshes flying out in different directions
  [[0, -0.7, 2600], [0.03, 0.6, 3400], [0.07, -0.2, 3000], [0.11, 0.85, 3900], [0.15, -0.9, 2800]].forEach(([t, pan, f]) => {
    const pn = v.panner(pan);
    pn.connect(v.out);
    v.noise({ t, k: 'w', a: 0.015, d: 0.12, g: 0.3, ft: 'bandpass', f, f1: f * 2.2, glide: 0.12, Q: 2.5, out: pn });
  });
  // tiny metallic glints
  for (let i = 0; i < 7; i++) v.tone({ t: rnd(0, 0.3), f: rnd(5500, 8500), a: 0.0005, d: rnd(0.015, 0.03), g: 0.08 });
});
def('buzz', 0.9, 2, 0.03, 2, (v) => {
  // detuned saw "bees", each drifting in pitch and across the stereo field; swells then fades (~1.6 s)
  const dur = 1.6;
  const mix = v.gain(1);
  const lp = v.filter('lowpass', 3200, 0.7);
  const pk = v.filter('peaking', 950, 1.2);
  pk.gain.value = 6;
  mix.connect(lp);
  lp.connect(pk);
  pk.connect(v.out);
  [[205, -0.6, 0.9], [219, 0.5, 1.3], [233, -0.1, 0.7], [248, 0.8, 1.1], [262, -0.9, 1.5]].forEach(([f, pan, rate]) => {
    const pn = v.panner(pan);
    pn.connect(mix);
    if (pn.pan) v.lfo(pn.pan, rate, 0.35, 0, dur);
    const a = rnd(0.35, 0.55);
    const h = rnd(0.2, 0.4);
    v.tone({ type: 'sawtooth', f: f * rnd(0.98, 1.02), a, h, d: dur - a - h, g: 0.09, out: pn, vib: { r: rnd(8, 13), d: f * 0.03 } });
  });
});
def('honey', 1.1, 2, 0.05, 3, (v) => {
  // gloopy resonant sweep + wobbly low goo, a "blop" and a sticky release tick
  v.noise({ k: 'b', a: 0.02, h: 0.08, d: 0.18, g: 1.4, ft: 'bandpass', f: 260, pts: [[0.09, 1100], [0.24, 380]], Q: 5 });
  const lp = v.filter('lowpass', 900, 3);
  lp.connect(v.out);
  v.tone({ type: 'sawtooth', f: 110, pts: [[0.1, 230], [0.26, 140]], a: 0.02, h: 0.1, d: 0.15, g: 0.18, out: lp, vib: { r: 23, d: 18 } });
  v.tone({ t: 0.17, f: 260, f1: 720, glide: 0.04, a: 0.002, d: 0.07, g: 0.3 });
  v.noise({ t: 0.26, k: 'w', a: 0.0005, d: 0.01, g: 0.12, ft: 'bandpass', f: 2200, Q: 2 });
});
def('boing', 0.8, 1, 0.03, 4, (v) => {
  // springy mushroom: soft cap thump, then a pitch-bent "boi-oi-oing" with a decaying spring wobble
  v.tone({ f: 150, f1: 80, glide: 0.06, a: 0.002, d: 0.08, g: 0.3 });
  v.noise({ k: 'b', a: 0.002, d: 0.05, g: 0.2, ft: 'lowpass', f: 700 });
  const vib = { r: 15, d: 80, d1: 5, t1: 0.34 };
  v.tone({ type: 'triangle', f: 170, pts: [[0.035, 520], [0.34, 390]], a: 0.004, h: 0.05, d: 0.3, g: 0.38, vib });
  v.tone({ f: 340, pts: [[0.035, 1040], [0.3, 780]], a: 0.003, d: 0.18, g: 0.08, vib: { r: 15, d: 160, d1: 10, t1: 0.3 } });
  const bp = v.filter('bandpass', 1500, 4);
  v.sweep(bp.frequency, 0, 1500, 800, 0.3);
  bp.connect(v.out);
  v.tone({ type: 'sawtooth', f: 170, pts: [[0.035, 520], [0.34, 390]], a: 0.004, h: 0.03, d: 0.25, g: 0.12, out: bp, vib });
});
def('rustle', 2.4, 1, 0.04, 3, (v) => {
  // crisp leaf grains in two bands + a soft swish and a few lower twiggy grains
  v.noise({ k: 'c', a: 0.06, h: 0.15, d: 0.3, g: 0.9, ft: 'bandpass', f: 3200, Q: 0.8, rate: 1.0 });
  v.noise({ t: 0.03, k: 'c', a: 0.05, h: 0.1, d: 0.3, g: 0.6, ft: 'bandpass', f: 5500, Q: 1.2, rate: 1.4 });
  v.noise({ k: 'p', a: 0.08, h: 0.12, d: 0.3, g: 0.25, ft: 'bandpass', f: 2200, pts: [[0.2, 3200], [0.5, 1800]], Q: 0.9 });
  v.noise({ t: 0.05, k: 'c', a: 0.04, d: 0.3, g: 0.4, ft: 'bandpass', f: 1600, Q: 1, rate: 0.6 });
});

/* ------------------------------------------------------------------------ */
/* Music instruments: (voice, freq|freq[], lengthSeconds, velocity)          */
/* ------------------------------------------------------------------------ */

const arr = (f) => (Array.isArray(f) ? f : [f]);

const INST = {
  // plucky marimba / ukulele lead: triangle carrier with a decaying FM "pluck"
  pluck(v, f, len, vel) {
    const d = Math.min(0.9, 0.22 + len * 0.7);
    const osc = v.tone({ type: 'triangle', f, a: 0.003, d, g: 0.42 * vel });
    const m = v.c.createOscillator();
    m.frequency.value = f;
    const mg = v.gain(0);
    mg.gain.setValueAtTime(f * 1.1, v.t0);
    mg.gain.exponentialRampToValueAtTime(1, v.t0 + 0.09);
    m.connect(mg);
    mg.connect(osc.frequency);
    v.src(m, 0, 0.1);
    v.tone({ f: f * 4, a: 0.001, d: 0.05, g: 0.07 * vel });
  },
  // soft strummed chord
  uke(v, f, len, vel) {
    const fs = arr(f);
    const lp = v.filter('lowpass', 2200, 0.5);
    lp.connect(v.out);
    fs.forEach((fr, i) => {
      v.tone({ t: i * 0.012, type: 'triangle', f: fr, a: 0.004, d: 0.32, g: 0.16 * vel, out: lp });
      v.tone({ t: i * 0.012, f: fr * 2, a: 0.002, d: 0.1, g: 0.04 * vel, out: lp });
    });
  },
  // soft round bass (+2nd/3rd harmonics so it reads on phone speakers)
  sbass(v, f, len, vel) {
    v.tone({ f, a: 0.01, h: len * 0.45, d: len * 0.6 + 0.08, g: 0.3 * vel });
    v.tone({ type: 'triangle', f: f * 2, a: 0.008, h: len * 0.3, d: len * 0.4 + 0.05, g: 0.15 * vel });
    v.tone({ f: f * 3, a: 0.005, d: 0.08, g: 0.05 * vel });
  },
  // pizzicato bass
  pizz(v, f, len, vel) {
    const lp = v.filter('lowpass', 1500, 3);
    v.sweep(lp.frequency, 0, 1500, 280, 0.14);
    lp.connect(v.out);
    v.tone({ type: 'sawtooth', f, a: 0.003, d: 0.22, g: 0.3 * vel, out: lp });
    v.tone({ type: 'triangle', f, a: 0.003, d: 0.26, g: 0.38 * vel });
  },
  // "pah" chord stab
  stab(v, f, len, vel) {
    const lp = v.filter('lowpass', 1900, 1);
    lp.connect(v.out);
    arr(f).forEach((fr) => v.tone({ type: 'square', f: fr, a: 0.002, d: 0.11, g: 0.06 * vel, out: lp }));
  },
  // whimsical toy lead (25% pulse)
  toy(v, f, len, vel) {
    const lp = v.filter('lowpass', 3400, 1);
    lp.connect(v.out);
    v.tone({
      wave: pulseWave(v.c), f, a: 0.004, h: len * 0.5, d: 0.08 + len * 0.3, g: 0.19 * vel, out: lp,
      vib: len > 0.22 ? { r: 6, d: f * 0.012, delay: 0.12 } : null,
    });
    v.tone({ f: f * 2, a: 0.002, d: 0.05, g: 0.05 * vel });
  },
  // brassy detuned saws through an opening lowpass
  brass(v, f, len, vel) {
    const lp = v.filter('lowpass', 500, 2);
    v.sweep(lp.frequency, 0, 500, null, 0, [[0.06, 2800], [Math.max(0.1, len), 1500]]);
    lp.connect(v.out);
    arr(f).forEach((fr) => {
      [-7, 7].forEach((det) =>
        v.tone({
          type: 'sawtooth', f: fr, det, a: 0.03, h: len, d: 0.28, g: 0.12 * vel, out: lp,
          vib: len > 0.5 ? { r: 5.5, d: fr * 0.008, delay: 0.25 } : null,
        })
      );
    });
  },
  tuba(v, f, len, vel) {
    const lp = v.filter('lowpass', 700, 1);
    lp.connect(v.out);
    v.tone({ type: 'sawtooth', f, a: 0.025, h: len * 0.8, d: 0.2, g: 0.28 * vel, out: lp });
    v.tone({ f, a: 0.02, h: len * 0.8, d: 0.2, g: 0.2 * vel });
  },
  timp(v, f, len, vel) {
    v.tone({ f: f * 1.25, f1: f, glide: 0.04, a: 0.002, d: 0.8, g: 0.5 * vel });
    v.tone({ f: f * 1.5, a: 0.002, d: 0.4, g: 0.16 * vel });
    v.tone({ f: f * 1.98, a: 0.002, d: 0.3, g: 0.12 * vel });
    v.noise({ k: 'b', a: 0.001, d: 0.12, g: 0.35 * vel, ft: 'lowpass', f: 700 });
  },
  glock(v, f, len, vel) {
    v.tone({ f, a: 0.001, d: 0.7, g: 0.16 * vel });
    v.tone({ f: f * 2.76, a: 0.001, d: 0.22, g: 0.05 * vel });
  },
  kick(v, f, len, vel) {
    v.tone({ f: 150, f1: 48, glide: 0.1, a: 0.002, d: 0.22, g: 0.55 * vel });
    v.tone({ type: 'triangle', f: 300, f1: 100, glide: 0.05, a: 0.001, d: 0.05, g: 0.12 * vel });
  },
  snare(v, f, len, vel) {
    v.noise({ k: 'w', a: 0.001, d: 0.13, g: 0.26 * vel, ft: 'bandpass', f: 2600, Q: 0.7 });
    v.tone({ type: 'triangle', f: 200, f1: 160, glide: 0.05, a: 0.001, d: 0.07, g: 0.2 * vel });
  },
  rim(v, f, len, vel) {
    v.tone({ f: 1700, a: 0.0008, d: 0.03, g: 0.1 * vel });
    v.noise({ k: 'w', a: 0.0005, d: 0.012, g: 0.08 * vel, ft: 'bandpass', f: 3000, Q: 2 });
  },
  hat(v, f, len, vel) {
    v.noise({ k: 'w', a: 0.001, d: 0.035, g: 0.13 * vel, ft: 'highpass', f: 7500 });
  },
  shaker(v, f, len, vel) {
    v.noise({ k: 'w', a: 0.012, d: 0.05, g: 0.13 * vel, ft: 'bandpass', f: 7000, Q: 1.2 });
  },
  crash(v, f, len, vel) {
    v.noise({ k: 'w', a: 0.003, d: 1.4, g: 0.14 * vel, ft: 'highpass', f: 4500 });
    v.noise({ k: 'p', a: 0.003, d: 0.6, g: 0.1 * vel, ft: 'bandpass', f: 3000, Q: 0.5 });
  },
};

/* ------------------------------------------------------------------------ */
/* Compositions. Notes are [step(16th), note|'chord notes', lengthSteps, vel] */
/* ------------------------------------------------------------------------ */

const NOTE_IDX = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function nm(s) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(s);
  if (!m) return 60;
  return 12 * (+m[3] + 1) + NOTE_IDX[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
/** Flatten a list of bars (each a list of [step, note, len, vel]) starting at bar `start`. */
function bars(list, start = 0) {
  const out = [];
  list.forEach((bar, bi) => bar.forEach((e) => out.push([(start + bi) * 16 + e[0], e[1], e[2], e[3]])));
  return out;
}
/** Repeat a 16-step percussion pattern [[step, vel], ...] over bar indices. */
function perc(barIdx, pattern) {
  const out = [];
  barIdx.forEach((b) => pattern.forEach(([s, vel]) => out.push([b * 16 + s, 0, 1, vel])));
  return out;
}
const range = (a, b) => {
  const r = [];
  for (let i = a; i < b; i++) r.push(i);
  return r;
};

/* ---- MENU: relaxed island-y C major, 100 BPM, 8-bar phrase played twice with a different last 2 bars ---- */
const MENU_A = [
  [[0, 'G4', 2], [2, 'C5', 2], [4, 'E5', 3], [7, 'D5', 1], [8, 'C5', 2], [10, 'E5', 2], [12, 'G5', 4]], // C
  [[0, 'A5', 3], [3, 'G5', 1], [4, 'E5', 2], [6, 'C5', 2], [8, 'D5', 2], [10, 'E5', 1], [11, 'D5', 1], [12, 'C5', 2], [14, 'A4', 2]], // Am
  [[0, 'A4', 2], [2, 'C5', 2], [4, 'F5', 3], [7, 'E5', 1], [8, 'F5', 2], [10, 'A5', 2], [12, 'G5', 2], [14, 'F5', 2]], // F
  [[0, 'D5', 3], [3, 'B4', 1], [4, 'G4', 2], [6, 'B4', 2], [8, 'D5', 2], [10, 'F5', 2], [12, 'E5', 2], [14, 'D5', 2]], // G
  [[0, 'G4', 2], [2, 'C5', 2], [4, 'E5', 3], [7, 'D5', 1], [8, 'C5', 2], [10, 'E5', 2], [12, 'G5', 3], [15, 'A5', 1]], // C
  [[0, 'C6', 3], [3, 'B5', 1], [4, 'A5', 2], [6, 'E5', 2], [8, 'A5', 2], [10, 'G5', 1], [11, 'E5', 1], [12, 'C5', 4]], // Am
  [[0, 'D5', 2], [2, 'F5', 2], [4, 'A5', 3], [7, 'G5', 1], [8, 'F5', 2], [10, 'E5', 2], [12, 'D5', 2], [14, 'C5', 2]], // Dm
  [[0, 'B4', 3], [3, 'D5', 1], [4, 'G5', 2], [6, 'F5', 2], [8, 'E5', 1], [9, 'F5', 1], [10, 'E5', 1], [11, 'D5', 1], [12, 'B4', 2], [14, 'D5', 2]], // G7
];
const MENU_END = [
  [[0, 'A5', 2], [2, 'G5', 2], [4, 'F5', 2], [6, 'A5', 2], [8, 'C6', 3], [11, 'A5', 1], [12, 'G5', 2], [14, 'F5', 2]], // F
  [[0, 'E5', 2], [2, 'D5', 1], [3, 'E5', 1], [4, 'F5', 2], [6, 'D5', 2], [8, 'C5', 3], [11, 'G4', 1], [12, 'C5', 3]], // G | C
];
const MENU_GLOCK = [
  [[3, 'E6', 2], [11, 'G6', 2]],
  [[3, 'C6', 2], [11, 'E6', 2]],
  [[3, 'A5', 2], [11, 'C6', 2]],
  [[3, 'B5', 2], [11, 'D6', 2]],
  [[3, 'E6', 2], [11, 'G6', 2]],
  [[3, 'C6', 2], [11, 'A6', 2]],
];
const MENU_CH = ['C', 'Am', 'F', 'G', 'C', 'Am', 'Dm', 'G7', 'C', 'Am', 'F', 'G', 'C', 'Am', 'F', ['G', 'C']];
const MCH = {
  C: { r: 'C3', f: 'G2', v: 'C4 E4 G4' },
  Am: { r: 'A2', f: 'E3', v: 'C4 E4 A4' },
  F: { r: 'F2', f: 'C3', v: 'C4 F4 A4' },
  G: { r: 'G2', f: 'D3', v: 'B3 D4 G4' },
  G7: { r: 'G2', f: 'D3', v: 'B3 F4 G4' },
  Dm: { r: 'D3', f: 'A2', v: 'D4 F4 A4' },
};
function menuBass() {
  const out = [];
  MENU_CH.forEach((ch, b) => {
    const o = b * 16;
    if (Array.isArray(ch)) {
      const x = MCH[ch[0]];
      const y = MCH[ch[1]];
      out.push([o, x.r, 6], [o + 6, x.f, 2], [o + 8, y.r, 6], [o + 14, y.f, 2]);
    } else {
      const x = MCH[ch];
      out.push([o, x.r, 6], [o + 6, x.r, 2], [o + 8, x.f, 6], [o + 14, x.r, 2]);
    }
  });
  return out;
}
function menuStrum() {
  const STRUM = [[0, 1], [4, 0.6], [6, 0.5], [10, 0.5], [12, 0.75], [14, 0.45]];
  const out = [];
  MENU_CH.forEach((ch, b) =>
    STRUM.forEach(([s, vel]) => {
      const name = Array.isArray(ch) ? ch[s < 8 ? 0 : 1] : ch;
      out.push([b * 16 + s, MCH[name].v, 2, vel]);
    })
  );
  return out;
}
const MENU = {
  bpm: 100,
  gain: 0.8,
  steps: 256,
  loop: true,
  swing: 0.12,
  echo: { time: 0.45, fb: 0.25, wet: 0.5 },
  parts: [
    { i: 'pluck', v: 1, send: 0.22, n: bars([...MENU_A, ...MENU_A.slice(0, 6), ...MENU_END]) },
    { i: 'glock', v: 0.55, send: 0.3, n: bars(MENU_GLOCK, 8) },
    { i: 'uke', v: 0.7, n: menuStrum() },
    { i: 'sbass', v: 1, n: menuBass() },
    { i: 'shaker', v: 1, n: perc(range(0, 16), [[0, 0.35], [2, 0.6], [3, 0.15], [4, 0.35], [6, 0.6], [7, 0.15], [8, 0.35], [10, 0.6], [11, 0.15], [12, 0.35], [14, 0.6], [15, 0.25]]) },
    { i: 'kick', v: 0.3, n: perc(range(0, 16), [[0, 1], [8, 0.8]]) },
    { i: 'rim', v: 0.6, n: perc(range(0, 16), [[4, 0.7], [12, 1]]) },
  ],
};

/* ---- BATTLE: bouncy cartoon march/polka, 128 BPM. A = sneaky D minor, B = heroic F major ---- */
const BATTLE_CH = ['Dm', 'Gm', 'A7', 'Dm', 'Dm', 'Gm', 'Gm', 'C7', 'F', 'Bb', 'C7', 'F', 'Dm', 'Bb', 'C7', 'A7'];
const BCH = { Dm: 'F4 A4 D5', Gm: 'G4 Bb4 D5', A7: 'E4 G4 C#5', C7: 'E4 G4 Bb4', F: 'F4 A4 C5', Bb: 'F4 Bb4 D5' };
const BATTLE_LEAD = [
  // A section
  [[0, 'D5', 1], [2, 'A4', 1], [4, 'D5', 1], [5, 'E5', 1], [6, 'F5', 2], [8, 'E5', 1], [10, 'D5', 1], [12, 'A4', 3], [15, 'A4', 1]],
  [[0, 'Bb4', 1], [2, 'D5', 1], [4, 'G5', 2], [6, 'F5', 1], [7, 'E5', 1], [8, 'D5', 2], [10, 'Bb4', 1], [12, 'G4', 2], [14, 'A4', 1], [15, 'Bb4', 1]],
  [[0, 'C#5', 1], [2, 'E5', 1], [4, 'A5', 2], [6, 'G5', 1], [7, 'F5', 1], [8, 'E5', 2], [10, 'C#5', 1], [12, 'A4', 2], [14, 'E5', 1], [15, 'C#5', 1]],
  [[0, 'D5', 2], [2, 'F5', 1], [3, 'E5', 1], [4, 'D5', 2], [6, 'C#5', 2], [8, 'D5', 2], [12, 'A4', 1], [13, 'Bb4', 1], [14, 'B4', 1], [15, 'C#5', 1]],
  [[0, 'D5', 1], [2, 'A4', 1], [4, 'D5', 1], [5, 'E5', 1], [6, 'F5', 2], [8, 'G5', 1], [10, 'A5', 1], [12, 'F5', 2], [14, 'D5', 2]],
  [[0, 'G5', 2], [2, 'Bb5', 2], [4, 'A5', 1], [5, 'G5', 1], [6, 'F5', 1], [7, 'E5', 1], [8, 'D5', 2], [10, 'G5', 2], [12, 'Bb4', 2], [14, 'D5', 2]],
  [[0, 'Bb4', 1], [1, 'C5', 1], [2, 'D5', 2], [4, 'G5', 2], [6, 'D5', 2], [8, 'Bb5', 1], [9, 'A5', 1], [10, 'G5', 2], [12, 'F5', 2], [14, 'E5', 2]],
  [[0, 'E5', 1], [2, 'G5', 1], [4, 'C6', 2], [6, 'Bb5', 2], [8, 'G5', 1], [9, 'E5', 1], [10, 'C5', 2], [12, 'G4', 1], [13, 'A4', 1], [14, 'Bb4', 1], [15, 'B4', 1]],
  // B section
  [[0, 'C5', 2], [2, 'F5', 2], [4, 'A5', 2], [6, 'F5', 1], [7, 'A5', 1], [8, 'C6', 3], [12, 'A5', 2], [14, 'F5', 2]],
  [[0, 'Bb5', 2], [2, 'A5', 1], [3, 'G5', 1], [4, 'F5', 2], [6, 'D5', 2], [8, 'F5', 2], [10, 'Bb5', 2], [12, 'D6', 4]],
  [[0, 'C6', 2], [2, 'Bb5', 1], [3, 'A5', 1], [4, 'G5', 2], [6, 'E5', 2], [8, 'C5', 2], [10, 'E5', 1], [11, 'G5', 1], [12, 'Bb5', 2], [14, 'A5', 1], [15, 'G5', 1]],
  [[0, 'A5', 2], [2, 'F5', 2], [4, 'C5', 2], [6, 'F5', 1], [7, 'G5', 1], [8, 'A5', 4], [12, 'C5', 1], [13, 'C5', 1], [14, 'D5', 1], [15, 'E5', 1]],
  [[0, 'F5', 2], [2, 'A5', 2], [4, 'D6', 2], [6, 'A5', 2], [8, 'F5', 1], [9, 'G5', 1], [10, 'A5', 2], [12, 'F5', 2], [14, 'D5', 2]],
  [[0, 'D5', 2], [2, 'F5', 2], [4, 'Bb5', 3], [7, 'A5', 1], [8, 'G5', 2], [10, 'F5', 2], [12, 'D5', 2], [14, 'Bb4', 2]],
  [[0, 'C5', 1], [1, 'E5', 1], [2, 'G5', 1], [3, 'C6', 1], [4, 'Bb5', 2], [6, 'G5', 2], [8, 'E5', 2], [10, 'C5', 2], [12, 'G4', 2], [14, 'Bb4', 2]],
  [[0, 'A4', 2], [2, 'C#5', 2], [4, 'E5', 2], [6, 'G5', 2], [8, 'A5', 3], [12, 'E5', 1], [13, 'C#5', 1], [14, 'A4', 2]],
];
const BATTLE_BASS = [
  [[0, 'D3', 2], [8, 'A2', 2]],
  [[0, 'G2', 2], [8, 'D3', 2]],
  [[0, 'A2', 2], [8, 'E3', 2]],
  [[0, 'D3', 2], [8, 'A2', 2], [12, 'A2', 1], [14, 'C#3', 1]],
  [[0, 'D3', 2], [8, 'A2', 2]],
  [[0, 'G2', 2], [8, 'D3', 2]],
  [[0, 'G2', 2], [8, 'Bb2', 2], [12, 'B2', 2]],
  [[0, 'C3', 2], [8, 'G2', 2], [12, 'G2', 1], [14, 'E2', 1]],
  [[0, 'F2', 2], [8, 'C3', 2]],
  [[0, 'Bb2', 2], [8, 'F2', 2]],
  [[0, 'C3', 2], [8, 'G2', 2]],
  [[0, 'F2', 2], [8, 'C3', 2], [12, 'C3', 1], [14, 'C#3', 1]],
  [[0, 'D3', 2], [8, 'A2', 2]],
  [[0, 'Bb2', 2], [8, 'F2', 2]],
  [[0, 'C3', 2], [8, 'G2', 2]],
  [[0, 'A2', 2], [8, 'E2', 2], [12, 'A2', 1], [14, 'C#3', 1]],
];
function battleStabs() {
  const out = [];
  BATTLE_CH.forEach((ch, b) => {
    out.push([b * 16 + 4, BCH[ch], 1, 1], [b * 16 + 12, BCH[ch], 1, 0.9]);
    if (b >= 8) out.push([b * 16 + 14, BCH[ch], 1, 0.45]);
  });
  return out;
}
const NOFILL = range(0, 16).filter((b) => b !== 7 && b !== 15);
const BATTLE = {
  bpm: 128,
  gain: 1.3,
  steps: 256,
  loop: true,
  swing: 0,
  echo: { time: 0.35, fb: 0.2, wet: 0.45 },
  parts: [
    { i: 'toy', v: 1, send: 0.15, n: bars(BATTLE_LEAD) },
    { i: 'pizz', v: 1, n: bars(BATTLE_BASS) },
    { i: 'stab', v: 1, n: battleStabs() },
    { i: 'kick', v: 0.8, n: perc(range(0, 16), [[0, 1], [8, 0.85]]) },
    { i: 'snare', v: 0.8, n: [...perc(NOFILL, [[4, 0.9], [12, 1]]), ...perc([7, 15], [[4, 0.9], [12, 0.55], [13, 0.6], [14, 0.75], [15, 0.95]])] },
    { i: 'hat', v: 1, n: perc(range(0, 16), [[0, 0.35], [2, 0.7], [4, 0.35], [6, 0.7], [8, 0.35], [10, 0.7], [12, 0.35], [14, 0.7]]) },
    { i: 'shaker', v: 0.8, n: perc(range(8, 16), [[1, 0.3], [3, 0.4], [5, 0.3], [7, 0.4], [9, 0.3], [11, 0.4], [13, 0.3], [15, 0.4]]) },
    { i: 'crash', v: 0.6, n: [[0, 0, 1, 0.8], [128, 0, 1, 1]] },
  ],
};

/* ---- VICTORY: ~4 s brassy fanfare, no loop ---- */
const VICTORY = {
  bpm: 120,
  gain: 0.9,
  steps: 32,
  loop: false,
  swing: 0,
  tail: 1.2,
  echo: { time: 0.25, fb: 0.2, wet: 0.35 },
  parts: [
    {
      i: 'brass', v: 1, send: 0.2,
      n: [[0, 'G4', 1], [1, 'C5', 1], [2, 'E5', 1], [3, 'G5', 3], [6, 'E5', 1], [7, 'G5', 1], [8, 'A5', 3], [11, 'A5', 1], [12, 'B5', 2], [14, 'B5', 1], [15, 'D6', 1], [16, 'C6', 12]],
    },
    {
      i: 'brass', v: 0.5,
      n: [[3, 'C4 E4 G4', 3], [6, 'C4 E4 G4', 2], [8, 'C4 F4 A4', 3], [11, 'C4 F4 A4', 1], [12, 'D4 G4 B4', 2], [14, 'D4 G4 B4', 2], [16, 'C4 E4 G4 C5', 12]],
    },
    { i: 'tuba', v: 1, n: [[0, 'C3', 3], [3, 'C3', 3], [8, 'F2', 4], [12, 'G2', 4], [16, 'C3', 12]] },
    { i: 'timp', v: 1, n: [[0, 'C3', 1, 0.7], [3, 'C3', 1, 1], [8, 'C3', 1, 0.8], [12, 'G2', 1, 0.8], [14, 'G2', 1, 0.6], [15, 'G2', 1, 0.8], [16, 'C3', 1, 1.1]] },
    { i: 'snare', v: 0.5, n: [[12, 0, 1, 0.4], [13, 0, 1, 0.5], [14, 0, 1, 0.6], [15, 0, 1, 0.8]] },
    { i: 'crash', v: 1, n: [[16, 0, 1, 1]] },
    { i: 'glock', v: 1, send: 0.3, n: [[16, 'E6', 2], [17, 'G6', 2], [18, 'C7', 4], [20, 'G6', 2], [21, 'C7', 6]] },
  ],
};

const TRACKS = { menu: MENU, battle: BATTLE, victory: VICTORY };

function toHz(n) {
  if (typeof n === 'number') return n > 0 ? mtof(n) : 0;
  if (typeof n !== 'string') return 0;
  return n.indexOf(' ') >= 0 ? n.split(' ').map((x) => mtof(nm(x))) : mtof(nm(n));
}
(function compileTracks() {
  for (const k in TRACKS) {
    const T = TRACKS[k];
    T.sd = 60 / T.bpm / 4;
    T.ev = new Array(T.steps);
    T.parts.forEach((part) => {
      part.n.forEach(([s, n, len, vel]) => {
        if (s < 0 || s >= T.steps) return;
        (T.ev[s] || (T.ev[s] = [])).push({
          i: part.i,
          f: toHz(n),
          len: len || 1,
          vel: (vel != null ? vel : 1) * (part.v != null ? part.v : 1),
          send: part.send || 0,
        });
      });
    });
  }
})();

/* ------------------------------------------------------------------------ */
/* Music player / scheduler                                                  */
/* ------------------------------------------------------------------------ */

function makePlayer(ch, name, startTime) {
  const c = ch.c;
  const def = TRACKS[name];
  const bus = c.createGain();
  bus.gain.value = 0;
  bus.connect(ch.music);
  const e = def.echo || {};
  const dIn = c.createGain();
  const dl = c.createDelay(1.5);
  dl.delayTime.value = e.time || 0.3;
  const fb = c.createGain();
  fb.gain.value = e.fb != null ? e.fb : 0.25;
  const dlp = c.createBiquadFilter();
  dlp.type = 'lowpass';
  dlp.frequency.value = 2400;
  const wet = c.createGain();
  wet.gain.value = e.wet != null ? e.wet : 0.4;
  dIn.connect(dl);
  dl.connect(dlp);
  dlp.connect(fb);
  fb.connect(dl);
  dlp.connect(wet);
  wet.connect(bus);
  return { name, def, ch, bus, dIn, fx: [bus, dIn, dl, fb, dlp, wet], step: 0, next: startTime, stopAt: Infinity, ended: false };
}

function playStep(pl, s, time) {
  const evs = pl.def.ev[s];
  if (!evs) return;
  for (let i = 0; i < evs.length; i++) {
    const e = evs[i];
    const fn = INST[e.i];
    if (!fn) continue;
    const v = new Voice(pl.ch, pl.bus, time, 1, null);
    fn(v, e.f, e.len * pl.def.sd, e.vel);
    if (e.send) {
      const sg = v.gain(e.send);
      v.out.connect(sg);
      sg.connect(pl.dIn);
    }
  }
}

/** Schedule every step of `pl` whose time falls before `horizon`. */
function advance(pl, horizon, t) {
  const def = pl.def;
  const sd = def.sd;
  if (pl.next < t - 0.08) {
    // fell behind (throttled timer / background tab): skip ahead, keep musical position
    const skip = Math.ceil((t - pl.next) / sd);
    pl.step += skip;
    pl.next += skip * sd;
  }
  while (!pl.ended && pl.next < horizon && pl.next < pl.stopAt) {
    if (pl.step >= def.steps) {
      if (def.loop) pl.step %= def.steps;
      else {
        pl.ended = true;
        pl.stopAt = Math.min(pl.stopAt, pl.next + (def.tail || 1));
        break;
      }
    }
    const s = pl.step;
    playStep(pl, s, pl.next + (s & 1 ? def.swing * sd : 0));
    pl.step++;
    pl.next += sd;
  }
}

function disposePlayer(pl) {
  pl.fx.forEach((n) => quiet(() => n.disconnect()));
  if (pl.name === 'victory' && pl.ended && wantTrack === 'victory') wantTrack = null;
}

function pump() {
  timer = 0;
  if (!ctx || paused) return;
  try {
    const t = ctx.currentTime;
    for (let i = players.length - 1; i >= 0; i--) {
      const pl = players[i];
      advance(pl, t + LOOKAHEAD, t);
      if (t > pl.stopAt + 0.1) {
        players.splice(i, 1);
        disposePlayer(pl);
      }
    }
  } catch (e) {
    /* keep going */
  }
  if (players.length) timer = setTimeout(pump, TICK_MS);
}

function ensureTimer() {
  if (!timer && players.length && ctx && !paused) timer = setTimeout(pump, 0);
}

function holdParam(param, t) {
  if (param.cancelAndHoldAtTime) {
    param.cancelAndHoldAtTime(t);
  } else {
    const cur = param.value;
    param.cancelScheduledValues(t);
    param.setValueAtTime(cur, t);
  }
}

function fadeOutPlayer(pl, dur) {
  const t = ctx.currentTime;
  if (pl.stopAt <= t + dur) return;
  quiet(() => {
    holdParam(pl.bus.gain, t);
    pl.bus.gain.linearRampToValueAtTime(0, t + dur);
  });
  pl.stopAt = t + dur + 0.02;
}

function switchTo(track) {
  if (!ctx || !chain) return;
  const t = ctx.currentTime;
  const live = players.filter((p) => p.stopAt === Infinity);
  if (track && live.length === 1 && live[0].name === track) return; // already playing
  const isFanfare = track === 'victory';
  live.forEach((p) => fadeOutPlayer(p, isFanfare ? 0.35 : XFADE));
  if (track && musicEnabled) {
    const pl = makePlayer(chain, track, t + (isFanfare ? 0.12 : 0.06));
    const lvl = pl.def.gain || 1;
    if (isFanfare) {
      pl.bus.gain.setValueAtTime(lvl, t);
    } else {
      pl.bus.gain.setValueAtTime(0, t);
      pl.bus.gain.linearRampToValueAtTime(lvl, t + XFADE);
    }
    players.push(pl);
  }
  ensureTimer();
}

/* ------------------------------------------------------------------------ */
/* Slingshot stretch creak (persistent nodes while dragging)                  */
/* ------------------------------------------------------------------------ */

function stretchStart() {
  const c = ctx;
  const t = c.currentTime;
  const out = c.createGain();
  out.gain.value = 0;
  out.connect(chain.sfx);
  // creak: low sawtooth pulse train ringing a resonant band-pass (stick-slip rubber)
  const co = c.createOscillator();
  co.type = 'sawtooth';
  co.frequency.value = 24;
  const cbp = c.createBiquadFilter();
  cbp.type = 'bandpass';
  cbp.frequency.value = 800;
  cbp.Q.value = 7;
  const cg = c.createGain();
  cg.gain.value = 0;
  co.connect(cbp);
  cbp.connect(cg);
  cg.connect(out);
  // rubbery friction hiss
  const ns = c.createBufferSource();
  ns.buffer = buffers(c).p;
  ns.loop = true;
  const nbp = c.createBiquadFilter();
  nbp.type = 'bandpass';
  nbp.frequency.value = 2000;
  nbp.Q.value = 1.5;
  const ng = c.createGain();
  ng.gain.value = 0;
  ns.connect(nbp);
  nbp.connect(ng);
  ng.connect(out);
  // faint tension hum
  const to = c.createOscillator();
  to.type = 'triangle';
  to.frequency.value = 100;
  const tlp = c.createBiquadFilter();
  tlp.type = 'lowpass';
  tlp.frequency.value = 900;
  const tg = c.createGain();
  tg.gain.value = 0;
  to.connect(tlp);
  tlp.connect(tg);
  tg.connect(out);
  co.start(t);
  ns.start(t, Math.random());
  to.start(t);
  out.gain.setTargetAtTime(1, t, 0.02);
  return { out, co, cbp, cg, ns, nbp, ng, to, tg, nodes: [out, co, cbp, cg, ns, nbp, ng, to, tlp, tg], lastT: null, lastMs: 0, speed: 0 };
}

function stretchStop() {
  const S = stretchState;
  stretchState = null;
  if (!S || !ctx) return;
  const t = ctx.currentTime;
  quiet(() => {
    S.out.gain.cancelScheduledValues(t);
    S.out.gain.setTargetAtTime(0, t, 0.02);
  });
  [S.co, S.ns, S.to].forEach((s) => quiet(() => s.stop(t + 0.15)));
  S.co.onended = () => S.nodes.forEach((n) => quiet(() => n.disconnect()));
}

function stretchUpdate(t01) {
  if (!stretchState) stretchState = stretchStart();
  const S = stretchState;
  const n = ctx.currentTime;
  const ms = nowMs();
  if (S.lastT == null) {
    S.lastT = t01;
    S.lastMs = ms;
  }
  const dt = Math.max(8, ms - S.lastMs) / 1000;
  const vel = Math.min(1, Math.abs(t01 - S.lastT) / dt / 2.5);
  S.speed += (vel - S.speed) * (vel > S.speed ? 0.5 : 0.15);
  S.lastT = t01;
  S.lastMs = ms;
  const k = 0.035;
  const t = t01;
  S.co.frequency.setTargetAtTime((20 + 42 * t) * (0.88 + Math.random() * 0.24), n, 0.02);
  S.cbp.frequency.setTargetAtTime(650 + 1500 * t, n, k);
  S.cg.gain.setTargetAtTime(Math.min(0.6, (0.12 + 0.2 * t) * (0.2 + S.speed * 1.6)), n, k);
  S.nbp.frequency.setTargetAtTime(1600 + 2600 * t, n, k);
  S.ng.gain.setTargetAtTime(0.01 + 0.09 * S.speed * (0.4 + t), n, k);
  S.to.frequency.setTargetAtTime(95 + 230 * t, n, k);
  S.tg.gain.setTargetAtTime(0.008 + 0.03 * t * t, n, 0.08);
}

/* ------------------------------------------------------------------------ */
/* Context lifecycle                                                         */
/* ------------------------------------------------------------------------ */

const GESTURES = ['pointerdown', 'touchstart', 'touchend', 'mousedown', 'keydown', 'click'];
function onGesture() {
  if (!ctx || paused) return;
  if (ctx.state !== 'running') kick();
  else unhookGestures();
}
function hookGestures() {
  if (gesturesHooked || typeof document === 'undefined') return;
  gesturesHooked = true;
  GESTURES.forEach((e) => document.addEventListener(e, onGesture, { capture: true, passive: true }));
}
function unhookGestures() {
  if (!gesturesHooked || typeof document === 'undefined') return;
  gesturesHooked = false;
  GESTURES.forEach((e) => document.removeEventListener(e, onGesture, true));
}

/** Resume the context and (once) play a silent buffer: the classic iOS unlock. */
function kick() {
  if (!ctx) return;
  resumeReqAt = nowMs();
  if (ctx.state !== 'running' && ctx.resume) quiet(() => ctx.resume());
  if (!silentKicked) {
    silentKicked = true;
    quiet(() => {
      const b = ctx.createBuffer(1, 1, ctx.sampleRate);
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.connect(ctx.destination);
      s.onended = () => quiet(() => s.disconnect());
      s.start(0);
    });
  }
}

function create() {
  if (ctx || failed) return !!ctx;
  if (!ACtor) {
    failed = true;
    return false;
  }
  try {
    ctx = new ACtor();
    chain = buildChain(ctx);
    buffers(ctx);
    pulseWave(ctx);
    ctx.onstatechange = () => {
      if (!ctx) return;
      if (ctx.state === 'running') {
        unhookGestures();
        ensureTimer();
      } else if (ctx.state !== 'closed' && !paused) {
        hookGestures(); // e.g. iOS 'interrupted' after a phone call
      }
    };
    hookGestures();
    return true;
  } catch (e) {
    quiet(() => ctx && ctx.close());
    ctx = null;
    chain = null;
    failed = true;
    return false;
  }
}

function init() {
  try {
    if (!create()) return false;
    paused = false;
    kick();
    if (wantTrack && musicEnabled && !players.some((p) => p.stopAt === Infinity && p.name === wantTrack)) switchTo(wantTrack);
    ensureTimer();
    return true;
  } catch (e) {
    return false;
  }
}

function canPlay() {
  if (!ctx || !chain || paused) return false;
  if (ctx.state === 'running') return true;
  // allow scheduling right after a resume() request inside a gesture; otherwise don't queue up sounds
  return ctx.state === 'suspended' && nowMs() - resumeReqAt < 600;
}

/* ------------------------------------------------------------------------ */
/* Voice allocation                                                          */
/* ------------------------------------------------------------------------ */

function onVoiceDone(v) {
  const i = voices.indexOf(v);
  if (i >= 0) voices.splice(i, 1);
}
function steal(v) {
  onVoiceDone(v);
  v.kill();
}
function claim(name, pr, max) {
  let same = 0;
  let oldestSame = null;
  for (let i = 0; i < voices.length; i++) {
    if (voices[i].name === name) {
      same++;
      if (!oldestSame) oldestSame = voices[i];
    }
  }
  if (same >= max && oldestSame) steal(oldestSame);
  if (voices.length < MAX_VOICES) return true;
  for (let i = 0; i < voices.length; i++) {
    if (voices[i].pr <= pr) {
      steal(voices[i]);
      return true;
    }
  }
  return false;
}

/* ------------------------------------------------------------------------ */
/* Offline rendering (dev/testing only)                                      */
/* ------------------------------------------------------------------------ */

function offlineCtx(seconds) {
  const OAC = HAS_WIN && (window.OfflineAudioContext || window.webkitOfflineAudioContext);
  if (!OAC) return null;
  return new OAC(2, Math.ceil(44100 * seconds), 44100);
}

/* ------------------------------------------------------------------------ */
/* Public API                                                                */
/* ------------------------------------------------------------------------ */

function play(name, opts) {
  try {
    if (!sfxEnabled || !canPlay()) return;
    const d = SFX[name];
    if (!d) return;
    const ms = nowMs();
    const last = lastPlay[name];
    if (last !== undefined && ms - last < RATE_LIMIT_MS) return;
    const o = opts || {};
    const vol = clamp(fin(o.vol, 1), 0, 2);
    if (vol <= 0.001) return;
    if (!claim(name, d.pr, d.max)) return;
    lastPlay[name] = ms;
    let p = clamp(fin(o.pitch, 1), 0.25, 4);
    if (d.j) p *= 1 + (Math.random() * 2 - 1) * d.j;
    const pan = clamp(fin(o.pan, 0), -1, 1);
    let dest = chain.sfx;
    let panner = null;
    if (pan && ctx.createStereoPanner) {
      panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      panner.connect(chain.sfx);
      dest = panner;
    }
    const v = new Voice(chain, dest, ctx.currentTime + 0.003, p, onVoiceDone);
    if (panner) v.nodes.push(panner);
    v.name = name;
    v.pr = d.pr;
    v.out.gain.value = d.g * vol;
    d.fn(v);
    voices.push(v);
    if (d.duck) duck(d.duck[0], d.duck[1]);
  } catch (e) {
    /* never throw into game code */
  }
}

function stretch(t) {
  try {
    if (t == null || !sfxEnabled || !canPlay() || !isFinite(t)) {
      if (stretchState) stretchStop();
      return;
    }
    stretchUpdate(clamp(+t, 0, 1));
  } catch (e) {
    /* ignore */
  }
}

function music(track) {
  try {
    if (track != null && !TRACKS[track]) return;
    wantTrack = track || null;
    if (!ctx || !chain) return;
    switchTo(wantTrack);
  } catch (e) {
    /* ignore */
  }
}

function duck(amount = 0.4, seconds = 0.6) {
  try {
    if (!ctx || !chain) return;
    const t = ctx.currentTime;
    const lvl = clamp(1 - fin(amount, 0.4), 0, 1);
    const secs = clamp(fin(seconds, 0.6), 0, 30);
    const active = t < duckUntil;
    duckLevel = active ? Math.min(duckLevel, lvl) : lvl;
    duckUntil = Math.max(active ? duckUntil : 0, t + secs);
    const p = chain.duckG.gain;
    holdParam(p, t);
    p.linearRampToValueAtTime(duckLevel, t + 0.04);
    p.setValueAtTime(duckLevel, Math.max(t + 0.04, duckUntil));
    p.linearRampToValueAtTime(1, duckUntil + 0.45);
  } catch (e) {
    /* ignore */
  }
}

function setSfx(on) {
  sfxEnabled = !!on;
  try {
    if (!sfxEnabled && stretchState) stretchStop();
    if (!ctx || !chain) return;
    const t = ctx.currentTime;
    holdParam(chain.sfx.gain, t);
    chain.sfx.gain.linearRampToValueAtTime(sfxEnabled ? 1 : 0, t + 0.05);
  } catch (e) {
    /* ignore */
  }
}

function setMusic(on) {
  musicEnabled = !!on;
  try {
    if (!ctx || !chain) return;
    const t = ctx.currentTime;
    holdParam(chain.music.gain, t);
    chain.music.gain.linearRampToValueAtTime(musicEnabled ? MUSIC_LEVEL : 0, t + 0.25);
    if (!musicEnabled) {
      players.forEach((p) => fadeOutPlayer(p, 0.3));
    } else if (wantTrack && wantTrack !== 'victory') {
      switchTo(wantTrack);
    }
  } catch (e) {
    /* ignore */
  }
}

function pause() {
  try {
    paused = true;
    if (stretchState) stretchStop();
    if (timer) {
      clearTimeout(timer);
      timer = 0;
    }
    if (ctx && ctx.state === 'running' && ctx.suspend) quiet(() => ctx.suspend());
  } catch (e) {
    /* ignore */
  }
}

function resume() {
  try {
    paused = false;
    if (!ctx) return;
    kick();
    ensureTimer();
  } catch (e) {
    /* ignore */
  }
}

export const Sound = {
  init,
  unlock: init,
  setSfx,
  setMusic,
  get sfxOn() {
    return sfxEnabled;
  },
  get musicOn() {
    return musicEnabled;
  },
  play,
  stretch,
  music,
  duck,
  pause,
  resume,

  /* ---- dev / test helpers (not part of the game API) ---- */
  get _names() {
    return Object.keys(SFX);
  },
  get _tracks() {
    return Object.keys(TRACKS);
  },
  _debug() {
    return {
      state: ctx ? ctx.state : 'none',
      voices: voices.length,
      players: players.map((p) => ({ name: p.name, step: p.step, fading: p.stopAt !== Infinity })),
      wantTrack,
      stretching: !!stretchState,
      paused,
    };
  },
  /** Analyser tapped after the master gain (for meters). */
  _analyser() {
    if (!ctx || !chain) return null;
    if (!chain.an) {
      chain.an = ctx.createAnalyser();
      chain.an.fftSize = 2048;
      chain.out.connect(chain.an);
    }
    return chain.an;
  },
  /** Render one sfx through the full master chain offline. Resolves to an AudioBuffer. */
  _render(name, opts = {}, seconds = 3) {
    const c = offlineCtx(seconds);
    const d = SFX[name];
    if (!c || !d) return Promise.reject(new Error('cannot render ' + name));
    const ch = buildChain(c);
    ch.sfx.gain.value = 1;
    const p = clamp(fin(opts.pitch, 1), 0.25, 4);
    const v = new Voice(ch, ch.sfx, 0.01, p, null);
    v.out.gain.value = d.g * clamp(fin(opts.vol, 1), 0, 2);
    d.fn(v);
    return c.startRendering();
  },
  /** Render `seconds` of a music track offline through the full chain (music bus level included). */
  _renderMusic(track, seconds = 8) {
    const c = offlineCtx(seconds);
    if (!c || !TRACKS[track]) return Promise.reject(new Error('cannot render ' + track));
    const ch = buildChain(c);
    ch.music.gain.value = MUSIC_LEVEL;
    const pl = makePlayer(ch, track, 0.05);
    pl.bus.gain.value = pl.def.gain || 1;
    advance(pl, seconds, 0);
    return c.startRendering();
  },
};

export default Sound;
