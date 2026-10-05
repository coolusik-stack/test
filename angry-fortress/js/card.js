// The result card: one picture of how a match ended (the winner in their outfit, the headline,
// a few numbers, the map), made to be shared to a chat. 1200×675, drawn on a canvas.
//   makeCard(info) → canvas      info: { title, sub, team, look, map, stats:[[label, value]], stars, url }
//   shareCard(canvas, text)      the phone's share sheet (app: via a cached file), else a download
import * as Art from './art.js';

const W = 1200, H = 675;
const DISPLAY = "'Black Han Sans', 'Jua', sans-serif";
const UI = "'Jua', sans-serif";

function outlined(ctx, text, x, y, size, fill, stroke, sw, font = DISPLAY) {
  ctx.font = `${size}px ${font}`;
  ctx.lineJoin = 'round';
  ctx.lineWidth = sw;
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function fit(ctx, text, max, size, font) {
  let s = size;
  ctx.font = `${s}px ${font}`;
  while (s > 18 && ctx.measureText(text).width > max) { s -= 2; ctx.font = `${s}px ${font}`; }
  return s;
}

export function makeCard(info) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  // sky, sun, clouds, a floating island
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#5fb6f0'); sky.addColorStop(0.65, '#bfe6ff'); sky.addColorStop(1, '#fff3d6');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (const [x, y, r] of [[120, 120, 46], [180, 104, 60], [250, 128, 40], [930, 90, 40], [990, 74, 54], [1060, 98, 38]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = '#8b5a2b';
  ctx.beginPath(); ctx.moveTo(40, 560); ctx.quadraticCurveTo(250, 520, 470, 560); ctx.quadraticCurveTo(420, 660, 260, 672); ctx.quadraticCurveTo(110, 660, 40, 560); ctx.fill();
  ctx.fillStyle = '#6cc04a';
  ctx.beginPath(); ctx.moveTo(30, 566); ctx.quadraticCurveTo(250, 512, 480, 566); ctx.quadraticCurveTo(250, 540, 30, 566); ctx.fill();
  ctx.lineWidth = 6; ctx.strokeStyle = '#2b1a12';
  ctx.beginPath(); ctx.moveTo(40, 560); ctx.quadraticCurveTo(250, 520, 470, 560); ctx.stroke();

  // the winner, big, in their outfit
  const fig = document.createElement('canvas');
  fig.width = 520; fig.height = 476;
  try { Art.drawCaptainFigure(fig, info.team || 0, info.look, 0.6); } catch (e) { /* art not ready */ }
  ctx.drawImage(fig, -10, 110, 520, 476);

  // headline and story
  const x = 520, right = W - 50;
  ctx.textBaseline = 'alphabetic';
  if (info.map) {
    ctx.font = `28px ${UI}`;
    const tw = ctx.measureText(info.map).width;
    ctx.fillStyle = '#2b1a12'; roundRect(ctx, x, 70, tw + 36, 48, 24); ctx.fill();
    ctx.fillStyle = '#ffd21f'; ctx.fillText(info.map, x + 18, 104);
  }
  const ts = fit(ctx, info.title, right - x, 112, DISPLAY);
  outlined(ctx, info.title, x, 240, ts, '#ffd21f', '#2b1a12', 18);
  if (info.sub) {
    const ss = fit(ctx, info.sub, right - x, 38, UI);
    outlined(ctx, info.sub, x, 300, ss, '#ffffff', '#2b1a12', 9, UI);
  }
  if (info.stars != null) {
    for (let i = 0; i < 3; i++) {
      ctx.save(); ctx.translate(x + 34 + i * 74, 362);
      ctx.beginPath();
      for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k & 1 ? 14 : 32; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath();
      ctx.fillStyle = i < info.stars ? '#ffc21f' : 'rgba(43,26,18,0.2)'; ctx.fill();
      ctx.lineWidth = 5; ctx.strokeStyle = '#2b1a12'; ctx.stroke();
      ctx.restore();
    }
  }
  // numbers
  const stats = info.stats || [];
  const top = info.stars != null ? 420 : 350;
  stats.slice(0, 3).forEach(([label, value], i) => {
    const bx = x + i * 214, by = top;
    ctx.fillStyle = 'rgba(255,250,235,0.92)'; roundRect(ctx, bx, by, 196, 104, 22); ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = '#2b1a12'; ctx.stroke();
    ctx.fillStyle = 'rgba(43,26,18,0.7)'; ctx.font = `24px ${UI}`; ctx.fillText(label, bx + 18, by + 36);
    ctx.fillStyle = '#2b1a12'; ctx.font = `46px ${DISPLAY}`; ctx.fillText(String(value), bx + 18, by + 88);
  });

  // footer: the name of the game and where to get it
  outlined(ctx, '도토리깡', x, H - 52, 54, '#ffffff', '#2b1a12', 12);
  ctx.font = `24px ${UI}`; ctx.fillStyle = '#2b1a12';
  ctx.fillText(info.url ? info.url.replace(/^https?:\/\//, '') : '친구랑 폰 두 대로 다람쥐 새총 1:1', x + 250, H - 60);
  return cv;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

// Returns 'shared' | 'saved' | 'cancelled' | 'failed'.
export async function shareCard(cv, text) {
  const name = `dotori-kkang-${Date.now()}.png`;
  const cap = window.Capacitor;
  const plugins = cap && cap.Plugins;
  if (cap && cap.isNativePlatform && cap.isNativePlatform() && plugins && plugins.Filesystem && plugins.Share) {
    try {
      const data = cv.toDataURL('image/png').split(',')[1];
      const file = await plugins.Filesystem.writeFile({ path: name, data, directory: 'CACHE' });
      await plugins.Share.share({ title: '도토리깡', text, files: [file.uri], dialogTitle: '결과 카드 보내기' });
      return 'shared';
    } catch (e) {
      return /cancel/i.test(String(e && (e.message || e))) ? 'cancelled' : 'failed';
    }
  }
  const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
  if (!blob) return 'failed';
  const file = new File([blob], name, { type: 'image/png' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: '도토리깡', text });
      return 'shared';
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancelled';
  }
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return 'saved';
  } catch (e) {
    return 'failed';
  }
}
