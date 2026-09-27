// Haptic "손맛": every pattern is a short list of taps and buzzes
//   { t: start (s), i: intensity 0..1, s: sharpness 0..1 (dull thud → crisp click), d: buzz length (s) }
// In the iOS app they play on the Taptic Engine through Core Haptics (the DotoriHaptics plugin in
// ios/App/App/GameViewController.swift); on phones without it they fall back to the stock impact
// taps, and in an Android browser to navigator.vibrate. iPhone Safari itself has no vibration at all.
import { prefs, clamp } from './util.js';

const cap = () => window.Capacitor;
export const isNativeApp = () => {
  const c = cap();
  return !!(c && typeof c.isNativePlatform === 'function' && c.isNativePlatform());
};

let lastT = 0;
let lastW = 0;

// Bursts (dozens of contacts in one physics step) collapse into the strongest pattern.
function play(events, weight) {
  if (!prefs.vibe) return;
  const now = performance.now();
  if (now - lastT < 60 && weight <= lastW) return;
  lastT = now;
  lastW = weight;
  const P = cap() && cap().Plugins;
  if (P && P.DotoriHaptics) {
    P.DotoriHaptics.play({ events }).then((r) => { if (!r || !r.played) fallback(events); }).catch(() => fallback(events));
    return;
  }
  fallback(events);
}

function fallback(events) {
  const P = cap() && cap().Plugins;
  if (P && P.Haptics) {
    // older iPhones: one stock impact per tap/buzz start
    for (const e of events.slice(0, 5)) {
      const style = e.i > 0.72 ? 'HEAVY' : e.i > 0.42 ? 'MEDIUM' : 'LIGHT';
      setTimeout(() => P.Haptics.impact({ style }).catch(() => {}), (e.t || 0) * 1000);
    }
    return;
  }
  if (!navigator.vibrate) return;
  // Android browsers: on/off durations; strength becomes length
  const pat = [];
  let at = 0;
  for (const e of [...events].sort((a, b) => a.t - b.t)) {
    const start = Math.round((e.t || 0) * 1000);
    const len = Math.round(e.d ? e.d * 1000 * (0.4 + e.i * 0.6) : 8 + e.i * 32);
    if (start > at || !pat.length) {
      if (pat.length) pat.push(start - at);
      else if (start > 0) pat.push(0, start);
      pat.push(len);
      at = start + len;
    } else {
      pat[pat.length - 1] += len;
      at += len;
    }
  }
  try { navigator.vibrate(pat); } catch (err) { /* not allowed */ }
}

const T = (t, i, s) => ({ t, i, s });
const B = (t, i, s, d) => ({ t, i, s, d });

export const Haptics = {
  // UI
  tap: () => { if (isNativeApp()) play([T(0, 0.3, 0.75)], 0.05); },
  select: () => play([T(0, 0.45, 0.85)], 0.1),

  // slingshot: a ratchet click for every notch of pull, a hard click at full power
  pull: (power) => play([T(0, 0.12 + 0.4 * power, 0.9)], 0.02),
  pullMax: () => play([T(0, 0.8, 1), T(0.05, 0.45, 1)], 0.3),
  launch: (power) => play([T(0, 0.45 + 0.55 * power, 0.95), B(0.02, 0.25 + 0.5 * power, 0.25, 0.05 + 0.09 * power)], 0.6),
  friendLaunch: () => play([T(0, 0.35, 0.6)], 0.2),

  ability: (kind) => {
    if (kind === 'dash') play([T(0, 0.85, 1), B(0.02, 0.5, 0.8, 0.12)], 0.6);
    else if (kind === 'split') play([T(0, 0.7, 0.9), T(0.05, 0.6, 0.9), T(0.1, 0.5, 0.9)], 0.6);
    else if (kind === 'pound') play([B(0, 0.6, 0.5, 0.05), T(0.07, 0.9, 0.6)], 0.6);
    else play([T(0, 0.6, 0.8)], 0.5);
  },

  // our nut hit the other captain: harder hits hit harder, big ones double-thump
  hit: (dmg) => {
    const k = clamp(dmg / 30, 0, 1);
    const ev = [T(0, 0.5 + 0.5 * k, 0.55 + 0.3 * k), B(0.015, 0.35 + 0.6 * k, 0.3, 0.06 + 0.18 * k)];
    if (dmg >= 25) ev.push(T(0.17, 1, 0.8), B(0.19, 0.75, 0.2, 0.14));
    play(ev, 0.5 + 0.5 * k);
  },
  // we got hit: a dull body blow
  hurt: (dmg) => {
    const k = clamp(dmg / 30, 0, 1);
    play([T(0, 0.55 + 0.45 * k, 0.12), B(0.02, 0.45 + 0.5 * k, 0.05, 0.1 + 0.25 * k)], 0.55 + 0.45 * k);
  },

  boom: (r) => {
    const k = clamp(r / 2.6, 0, 1);
    play([T(0, 0.5 + 0.5 * k, 0.5), B(0.01, 0.35 + 0.6 * k, 0.15, 0.12 + 0.3 * k), B(0.2 + 0.2 * k, 0.25 + 0.3 * k, 0.08, 0.15 + 0.2 * k)], 0.4 + 0.45 * k);
  },
  dent: () => play([T(0, 0.3, 0.4)], 0.1),
  block: (mat) => play([T(0, mat === 'stone' ? 0.5 : 0.35, mat === 'stone' ? 0.95 : mat === 'leaf' ? 0.2 : 0.55)], 0.15),
  topple: () => play([T(0, 0.7, 0.3), B(0.05, 0.45, 0.1, 0.35), T(0.45, 0.95, 0.4), B(0.47, 0.6, 0.08, 0.22)], 0.8),

  ko: (mine) => play(mine
    ? [T(0, 1, 0.2), B(0.02, 0.9, 0.05, 0.5)]
    : [T(0, 1, 0.9), B(0.03, 0.8, 0.3, 0.2), T(0.3, 1, 0.9), B(0.32, 0.7, 0.3, 0.25)], 1),
  win: () => play([T(0, 0.55, 0.9), T(0.12, 0.65, 0.9), T(0.24, 0.75, 0.9), T(0.42, 1, 0.7), B(0.44, 0.6, 0.3, 0.3)], 1),
  lose: () => play([B(0, 0.7, 0.1, 0.25), B(0.4, 0.45, 0.05, 0.5)], 1),

  myTurn: () => play([T(0, 0.5, 0.7), T(0.14, 0.65, 0.8)], 0.4),
  // lub-dub; k = how hard the heart is pounding (0..1)
  heartbeat: (k = 0.7) => play([B(0, 0.45 + 0.5 * k, 0.1, 0.07), B(0.17, 0.3 + 0.45 * k, 0.08, 0.06)], 0.35 + 0.3 * k),
  nearMiss: () => play([T(0, 0.55, 0.9), T(0.08, 0.35, 0.9)], 0.35),
  pickup: () => play([T(0, 0.45, 0.9), T(0.08, 0.6, 0.9), T(0.16, 0.8, 0.9)], 0.5),
  boar: () => play([T(0, 0.8, 0.3), B(0.05, 0.5, 0.1, 0.4)], 0.6),
  emote: () => play([T(0, 0.35, 0.9), T(0.09, 0.35, 0.9)], 0.2),
};
