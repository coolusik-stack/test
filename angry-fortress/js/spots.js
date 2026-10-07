// Spots on a hand-made map: places worth standing on, each with an upside and a catch.
//   high   전망대        the aim guide reaches twice as far; no cover
//   burrow 다람쥐 굴     ground overhead: lobs land on the roof (the terrain does the work, plus
//                        blasts lose most of their bite through solid ground); only flat shots
//                        get in or out, and a drilled roof is a hole
//   tree   명당          a special nut every time your turn starts here; the tree overhead gets in
//                        the way of your own lobs and drops its nuts on whoever stands under it
//   crown  고지          lookout + tree in one, out in the open
//   bridge 다리          the one way across; thin, so a hit nearby can drop it (and you)
//   pad    버섯 트램펄린  drive onto it to bounce across to the next island
// Where they are comes from the landscape (land.spots); what they do is applied by Game. A spot
// may carry its own `label` ({icon, name, desc}) so each map can dress the same kind its own way.
import { GRAV, CART_R } from './config.js';
import { clamp } from './util.js';

export const PAD_COST = 40; // stamina a bounce takes
export const POCKET = 4; // specials of one kind the tree will top you up to

export const SPOT_INFO = {
  high: { icon: '🔭', name: '전망대', desc: '조준선이 두 배로 길어져요', color: '#7fd0ff' },
  burrow: { icon: '🛡️', name: '다람쥐 굴', desc: '위에서 오는 공격을 막아 줘요. 낮게 쏜 것만 드나들어요', color: '#c79a6a' },
  tree: { icon: '🌰', name: '도토리 명당', desc: '내 차례가 시작될 때마다 특수 견과 +1', color: '#ffd24d' },
  crown: { icon: '👑', name: '대왕참나무 고지', desc: '조준선 두 배 + 내 차례마다 특수 견과 +1', color: '#ffb02e' },
  bridge: { icon: '🌉', name: '흙다리', desc: '건너편으로 가는 유일한 길. 얇아서 근처에 맞으면 무너져요', color: '#ffa25e' },
  pad: { icon: '🍄', name: '버섯 트램펄린', desc: '올라타면 건너편 섬으로 슝!', color: '#ff7a8a' },
};

// What a spot looks like to players: its kind's defaults, dressed in the map's own words.
export function infoOf(s) {
  return s.label ? { ...SPOT_INFO[s.kind], ...s.label } : SPOT_INFO[s.kind];
}

// `at` is an x, or { x, foot } for a cart standing with its wheels at height `foot`. A spot with a
// `band` [lo, hi] only counts for feet inside it: on 두더지 굴 산 the tunnel floor and the
// mountain top share the same x, and only one of them is the lookout.
const where = (at) => (typeof at === 'number' ? { x: at, foot: null } : at);
const inBand = (s, foot) => foot == null || !s.band || (foot >= s.band[0] && foot <= s.band[1]);

export function spotsAt(land, at) {
  if (!land || !land.spots) return [];
  const { x, foot } = where(at);
  return land.spots.filter((s) => x >= s.range[0] && x <= s.range[1] && inBand(s, foot));
}

export function hasSpot(land, at, ...kinds) {
  return spotsAt(land, at).some((s) => kinds.includes(s.kind));
}

// The pad under a cart driving in direction `dir`, if any.
export function padAt(land, at, dir) {
  return spotsAt(land, at).find((s) => s.kind === 'pad' && s.dir === dir) || null;
}

// Launch velocity for a bounce from (x, y) (cart centre) that peaks at the pad's apex and lands
// with the cart resting on its target. Pure ballistics: the cart flies with no damping.
export function padLaunch(pad, x, y) {
  const y1 = pad.to.y + CART_R + 0.02;
  const vy = Math.sqrt(2 * GRAV * Math.max(0.5, pad.apex - y));
  const disc = Math.max(0, vy * vy - 2 * GRAV * (y1 - y));
  const T = (vy + Math.sqrt(disc)) / GRAV;
  return { vx: (pad.to.x - x) / T, vy };
}

// ------------------------------------------------------------------ drawing
// Glowing strips on the ground marking each spot, a little sign with its icon, and the pads.
export function drawSpots(ctx, game, view) {
  const land = game.land;
  if (!land.spots) return;
  const t = game.time, z = game.cam.zoom, ter = game.terrain;
  const cur = game.players[game.turn];
  const cx = cur && !cur.dead ? cur.body.getPosition().x : -99;
  for (const s of land.spots) {
    const [a, b] = s.range;
    if (b < view.x0 - 2 || a > view.x1 + 2) continue;
    const info = infoOf(s);
    if (s.kind === 'pad') { drawPad(ctx, game, s); continue; }
    // the strip follows the ground (and vanishes where the ground has been blown away)
    const inside = cx >= a && cx <= b;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = info.color;
    ctx.globalAlpha = inside ? 0.75 + 0.2 * Math.sin(t * 5) : 0.32;
    ctx.lineWidth = inside ? 0.16 : 0.11;
    ctx.setLineDash([0.32, 0.22]);
    ctx.lineDashOffset = -t * 0.6;
    ctx.beginPath();
    let pen = false;
    for (let x = a; x <= b + 0.001; x += 0.2) {
      const y = s.floor != null ? floorAt(ter, x, s.floor) : ter.surfaceY(x, s.top ?? undefined);
      if (y < 0) { pen = false; continue; }
      if (pen) ctx.lineTo(x, -y - 0.06); else ctx.moveTo(x, -y - 0.06);
      pen = true;
    }
    ctx.stroke();
    ctx.restore();
    for (const sx of s.signs || (s.sign != null ? [s.sign] : [])) drawSign(ctx, sx, info, ter, z, inside, t, s.top);
  }
}

// under a roof the floor is not the top surface: look down from just above where it was built
function floorAt(ter, x, floor) {
  if (ter.solid(x, floor + 0.6)) return -1; // the roof came down
  for (let y = floor + 0.6; y > floor - 2; y -= 0.1) if (ter.solid(x, y)) return y + 0.05;
  return -1;
}

function drawSign(ctx, sx, info, ter, z, active, t, top) {
  const gy = ter.surfaceY(sx, top ?? undefined);
  if (gy < 0) return;
  const bob = active ? Math.sin(t * 6) * 0.04 : 0;
  ctx.save();
  ctx.translate(sx, -gy);
  // post
  ctx.strokeStyle = '#5a3a1c';
  ctx.lineWidth = 0.09;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -0.78); ctx.stroke();
  // board (pixel-sized so it reads at any zoom)
  ctx.translate(0, -0.95 + bob);
  ctx.scale(1 / z, 1 / z);
  const S = clamp(z * 0.62, 18, 30);
  ctx.fillStyle = active ? '#fff3c4' : '#f4e2bf';
  ctx.strokeStyle = '#3e240e';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(-S * 0.62, -S * 0.5, S * 1.24, S, S * 0.28); else ctx.rect(-S * 0.62, -S * 0.5, S * 1.24, S);
  ctx.fill();
  ctx.stroke();
  ctx.font = `${Math.round(S * 0.66)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000';
  ctx.fillText(info.icon, 0, S * 0.04);
  ctx.restore();
}

// A wide bouncy toadstool lying flat on the ground; squashes when someone bounces off it.
function drawPad(ctx, game, s) {
  const x = (s.range[0] + s.range[1]) / 2;
  const gy = game.terrain.surfaceY(x, s.top ?? undefined);
  if (gy < 0) return;
  s.squash = Math.max(0, (s.squash || 0) - (game._frameDt || 0.016) * 3);
  const k = s.squash, wob = Math.sin(game.time * 30) * k;
  const w = 0.82 * (1 + 0.25 * k), h = 0.42 * (1 - 0.45 * k + 0.1 * wob);
  ctx.save();
  ctx.translate(x, -gy);
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#3e1a10';
  ctx.lineWidth = 0.05;
  // stem
  ctx.fillStyle = '#f4ead2';
  ctx.beginPath();
  ctx.rect(-0.2, -0.32 * (1 - 0.4 * k), 0.4, 0.34 * (1 - 0.4 * k));
  ctx.fill(); ctx.stroke();
  // cap
  const cy = -0.3 * (1 - 0.4 * k);
  ctx.fillStyle = '#ff5a6e';
  ctx.beginPath();
  ctx.ellipse(0, cy, w, h, 0, Math.PI, Math.PI * 2);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff6f0';
  for (const [dx, dy, r] of [[-0.42, -0.14, 0.09], [0.05, -0.27, 0.11], [0.45, -0.12, 0.08], [-0.15, -0.1, 0.06]]) {
    ctx.beginPath(); ctx.arc(dx * w / 0.82, cy + dy * h / 0.42, r, 0, Math.PI * 2); ctx.fill();
  }
  // which way it throws you
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath();
  const d = s.dir;
  ctx.moveTo(d * 0.95, cy - h - 0.25);
  ctx.lineTo(d * 0.55, cy - h - 0.42);
  ctx.lineTo(d * 0.6, cy - h - 0.08);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
