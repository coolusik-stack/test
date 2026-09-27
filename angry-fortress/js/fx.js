// Particles, floating texts, screen shake. Positions are world meters (y up).
const TAU = Math.PI * 2;

export class FX {
  constructor() {
    this.parts = [];
    this.texts = [];
    this.shakeAmp = 0;
    this.shakeT = 0;
    this.flash = 0;
  }

  shake(amp) {
    this.shakeAmp = Math.min(0.9, Math.max(this.shakeAmp, amp));
  }

  add(p) {
    if (this.parts.length > 520) this.parts.shift();
    p.life = p.max = p.life || 1;
    p.rot = p.rot || 0;
    p.vr = p.vr || 0;
    p.g = p.g == null ? 1 : p.g;
    p.drag = p.drag == null ? 0.6 : p.drag;
    this.parts.push(p);
    return p;
  }

  text(x, y, str, color = '#fff', size = 0.9, opts = {}) {
    this.texts.push({ x, y, str, color, size, life: opts.life || 1.3, max: opts.life || 1.3, vy: opts.vy ?? 2.2, stroke: opts.stroke || 'rgba(40,20,10,0.9)', pop: 0 });
  }

  // ---- presets ----
  burst(x, y, kind, n, opts = {}) {
    const spread = opts.spread ?? 1;
    const speed = opts.speed ?? 6;
    for (let i = 0; i < n; i++) {
      const a = (opts.dir ?? Math.PI / 2) + (Math.random() - 0.5) * TAU * 0.5 * spread * 2;
      const v = speed * (0.35 + Math.random() * 0.8);
      const base = { x: x + (Math.random() - 0.5) * (opts.jitter || 0.2), y: y + (Math.random() - 0.5) * (opts.jitter || 0.2), vx: Math.cos(a) * v, vy: Math.sin(a) * v };
      if (kind === 'feather') this.add({ ...base, type: 'feather', life: 1.4 + Math.random(), size: 0.16 + Math.random() * 0.12, color: opts.color || '#e5392f', g: 0.18, drag: 2.4, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 8 });
      else if (kind === 'wood') this.add({ ...base, type: 'chip', life: 1 + Math.random() * 0.6, size: 0.1 + Math.random() * 0.16, color: Math.random() < 0.5 ? '#d9934a' : '#a8642a', rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 16 });
      else if (kind === 'stone') this.add({ ...base, type: 'rock', life: 1 + Math.random() * 0.6, size: 0.1 + Math.random() * 0.16, color: Math.random() < 0.5 ? '#9aa3ad' : '#6d7680', rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 12 });
      else if (kind === 'ice') this.add({ ...base, type: 'shard', life: 0.8 + Math.random() * 0.6, size: 0.1 + Math.random() * 0.18, color: Math.random() < 0.5 ? 'rgba(200,240,255,0.9)' : 'rgba(150,215,245,0.9)', rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 18 });
      else if (kind === 'dirt') this.add({ ...base, type: 'rock', life: 0.9 + Math.random() * 0.5, size: 0.08 + Math.random() * 0.14, color: opts.color || '#7a4a24', rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 12 });
      else if (kind === 'dust') this.add({ ...base, vx: base.vx * 0.35, vy: base.vy * 0.25 + 0.4, type: 'puff', life: 0.7 + Math.random() * 0.5, size: 0.25 + Math.random() * 0.35, grow: 1.4, color: opts.color || 'rgba(235,220,200,0.8)', g: -0.02, drag: 2.5 });
      else if (kind === 'spark') this.add({ ...base, type: 'spark', life: 0.3 + Math.random() * 0.35, size: 0.06, color: Math.random() < 0.5 ? '#fff3a0' : '#ffb13b', g: 0.5, drag: 1.2 });
      else if (kind === 'splash') this.add({ ...base, vx: base.vx * 0.5, vy: Math.abs(base.vy) + 2, type: 'drop', life: 0.8 + Math.random() * 0.4, size: 0.08 + Math.random() * 0.1, color: opts.color || '#dff4ff', g: 1.1, drag: 0.3 });
      else if (kind === 'star') this.add({ ...base, type: 'star', life: 0.7 + Math.random() * 0.4, size: 0.14 + Math.random() * 0.12, color: '#ffe45c', g: 0.4, drag: 1.5, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 10 });
      else if (kind === 'leaf') this.add({ ...base, vx: base.vx * 0.6, vy: Math.abs(base.vy) * 0.6 + 1, type: 'leaf', life: 1.6 + Math.random(), size: 0.14 + Math.random() * 0.1, color: Math.random() < 0.5 ? '#7cc443' : Math.random() < 0.5 ? '#f0a23a' : '#d9602c', g: 0.15, drag: 2.2, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 7 });
      else if (kind === 'fur') this.add({ ...base, type: 'feather', life: 1.2 + Math.random() * 0.8, size: 0.12 + Math.random() * 0.1, color: opts.color || '#d9642c', g: 0.2, drag: 2.6, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 8 });
      else if (kind === 'nutbit') this.add({ ...base, type: 'acornbit', life: 1.1 + Math.random() * 0.5, size: 0.1 + Math.random() * 0.05, g: 1, drag: 0.5, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 12 });
      else if (kind === 'shell') this.add({ ...base, type: 'rock', life: 0.8 + Math.random() * 0.5, size: 0.06 + Math.random() * 0.09, color: Math.random() < 0.5 ? '#a8733f' : '#e2c08a', rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 14 });
      else if (kind === 'needle') this.add({ ...base, type: 'needle', life: 0.5 + Math.random() * 0.35, size: 0.2 + Math.random() * 0.14, color: Math.random() < 0.5 ? '#8bc34a' : '#c5e17a', g: 0.35, drag: 1.2 });
      else if (kind === 'honey') this.add({ ...base, type: 'drop', life: 0.9 + Math.random() * 0.5, size: 0.08 + Math.random() * 0.1, color: Math.random() < 0.6 ? '#f6b21b' : '#ffd45a', g: 0.9, drag: 0.6 });
    }
  }

  // A buzzing swarm that circles the spot, then scatters.
  swarm(x, y, r) {
    const n = Math.round(8 + r * 4);
    for (let i = 0; i < n; i++) {
      this.add({ x, y, vx: 0, vy: 0, type: 'bee', life: 1.6 + Math.random() * 0.9, size: 0.13, g: 0, drag: 0, cx: x, cy: y, rad: r * (0.35 + Math.random() * 0.7), ph: Math.random() * TAU, spd: (Math.random() < 0.5 ? -1 : 1) * (5 + Math.random() * 4) });
    }
  }

  explosion(x, y, r) {
    this.add({ x, y, vx: 0, vy: 0, type: 'ring', life: 0.45, size: r * 0.3, grow: r * 5.5, color: 'rgba(255,255,255,0.9)', g: 0, drag: 0 });
    this.add({ x, y, vx: 0, vy: 0, type: 'flashball', life: 0.22, size: r * 1.25, color: '#fff7c2', g: 0, drag: 0 });
    const n = Math.round(10 + r * 8);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = r * (1 + Math.random() * 3);
      this.add({ x: x + Math.cos(a) * r * 0.2, y: y + Math.sin(a) * r * 0.2, vx: Math.cos(a) * v, vy: Math.sin(a) * v + 1, type: 'fire', life: 0.35 + Math.random() * 0.35, size: r * (0.25 + Math.random() * 0.3), grow: 0.6, g: -0.1, drag: 3 });
    }
    for (let i = 0; i < n * 0.8; i++) {
      const a = Math.random() * TAU, v = r * (0.4 + Math.random() * 1.8);
      this.add({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v + 1.2, type: 'smoke', life: 1.1 + Math.random() * 0.9, size: r * (0.25 + Math.random() * 0.35), grow: 1.1, color: Math.random() < 0.5 ? 'rgba(90,80,80,0.55)' : 'rgba(140,130,125,0.5)', g: -0.12, drag: 2.2 });
    }
    this.burst(x, y, 'spark', Math.round(8 + r * 6), { speed: 9 + r * 3 });
    this.flash = Math.max(this.flash, Math.min(0.5, r * 0.18));
  }

  update(dt) {
    const ps = this.parts;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) { ps.splice(i, 1); continue; }
      p.vy -= 12 * p.g * dt;
      const d = Math.exp(-p.drag * dt);
      p.vx *= d; p.vy *= d;
      if (p.type === 'feather' || p.type === 'leaf') p.vx += Math.sin(p.life * 6 + p.size * 40) * 3 * dt;
      if (p.type === 'bee') {
        // orbit for a while, then fly off
        p.ph += p.spd * dt;
        const k = p.life / p.max;
        const out = k < 0.35 ? (0.35 - k) * 18 : 0;
        const tx = p.cx + Math.cos(p.ph) * (p.rad + out) , ty = p.cy + Math.sin(p.ph * 1.3) * p.rad * 0.6 + 0.4 + out * 0.3;
        p.vx = (tx - p.x) * 8; p.vy = (ty - p.y) * 8;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      t.pop = Math.min(1, t.pop + dt * 6);
      t.y += t.vy * dt;
      t.vy *= Math.exp(-2.5 * dt);
      if (t.life <= 0) this.texts.splice(i, 1);
    }
    this.shakeT += dt;
    this.shakeAmp *= Math.exp(-7 * dt);
    if (this.shakeAmp < 0.004) this.shakeAmp = 0;
    this.flash *= Math.exp(-9 * dt);
  }

  shakeOffset() {
    if (!this.shakeAmp) return [0, 0];
    const t = this.shakeT * 60;
    return [Math.sin(t * 1.3) * this.shakeAmp, Math.cos(t * 1.7) * this.shakeAmp * 0.8];
  }

  // Render in world render-space (y down = -y).
  draw(ctx) {
    for (const p of this.parts) {
      const k = p.life / p.max;
      const x = p.x, y = -p.y;
      switch (p.type) {
        case 'feather': {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(p.rot);
          ctx.globalAlpha = Math.min(1, k * 2);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size, p.size * 0.38, 0, 0, TAU);
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.25)';
          ctx.lineWidth = 0.02;
          ctx.beginPath();
          ctx.moveTo(-p.size, 0);
          ctx.lineTo(p.size, 0);
          ctx.stroke();
          ctx.restore();
          break;
        }
        case 'chip':
        case 'rock':
        case 'shard': {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(p.rot);
          ctx.globalAlpha = Math.min(1, k * 3);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          if (p.type === 'chip') ctx.rect(-p.size, -p.size * 0.35, p.size * 2, p.size * 0.7);
          else if (p.type === 'shard') { ctx.moveTo(-p.size, p.size * 0.6); ctx.lineTo(p.size * 0.2, -p.size); ctx.lineTo(p.size, p.size * 0.5); }
          else { ctx.moveTo(-p.size, 0); ctx.lineTo(-p.size * 0.3, -p.size * 0.9); ctx.lineTo(p.size * 0.8, -p.size * 0.5); ctx.lineTo(p.size, p.size * 0.4); ctx.lineTo(0, p.size * 0.9); }
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          break;
        }
        case 'puff':
        case 'smoke': {
          const s = p.size * (1 + (1 - k) * (p.grow || 1));
          ctx.globalAlpha = k * (p.type === 'smoke' ? 0.9 : 0.7);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(x, y, s, 0, TAU);
          ctx.fill();
          break;
        }
        case 'fire': {
          const s = p.size * (1 + (1 - k) * p.grow);
          ctx.globalAlpha = Math.min(1, k * 1.6);
          ctx.fillStyle = k > 0.7 ? '#fff4b0' : k > 0.45 ? '#ffc23a' : k > 0.25 ? '#ff7a1f' : '#9a3b1c';
          ctx.beginPath();
          ctx.arc(x, y, s, 0, TAU);
          ctx.fill();
          break;
        }
        case 'flashball': {
          ctx.globalAlpha = k;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(x, y, p.size * (1.2 - k * 0.2), 0, TAU);
          ctx.fill();
          break;
        }
        case 'ring': {
          const s = p.size + (1 - k) * p.grow * 0.35;
          ctx.globalAlpha = k * 0.8;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 0.18 * k + 0.02;
          ctx.beginPath();
          ctx.arc(x, y, s, 0, TAU);
          ctx.stroke();
          break;
        }
        case 'spark': {
          ctx.globalAlpha = Math.min(1, k * 3);
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 0.07;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - p.vx * 0.035, y + p.vy * 0.035);
          ctx.stroke();
          break;
        }
        case 'drop': {
          ctx.globalAlpha = Math.min(1, k * 2);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(x, y, p.size, 0, TAU);
          ctx.fill();
          break;
        }
        case 'star': {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(p.rot);
          ctx.globalAlpha = Math.min(1, k * 2);
          ctx.fillStyle = p.color;
          starPath(ctx, p.size);
          ctx.fill();
          ctx.restore();
          break;
        }
        case 'leaf': {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(p.rot);
          ctx.globalAlpha = Math.min(1, k * 2);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.moveTo(-p.size, 0);
          ctx.quadraticCurveTo(0, -p.size * 0.7, p.size, 0);
          ctx.quadraticCurveTo(0, p.size * 0.7, -p.size, 0);
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.25)';
          ctx.lineWidth = 0.015;
          ctx.beginPath();
          ctx.moveTo(-p.size, 0);
          ctx.lineTo(p.size, 0);
          ctx.stroke();
          ctx.restore();
          break;
        }
        case 'acornbit': {
          // a tiny acorn popping out of stuffed cheeks
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(p.rot);
          ctx.globalAlpha = Math.min(1, k * 3);
          ctx.fillStyle = '#c47a35';
          ctx.beginPath();
          ctx.ellipse(0, p.size * 0.2, p.size * 0.8, p.size, 0, 0, TAU);
          ctx.fill();
          ctx.fillStyle = '#7a4a22';
          ctx.beginPath();
          ctx.ellipse(0, -p.size * 0.55, p.size * 0.95, p.size * 0.45, 0, 0, TAU);
          ctx.fill();
          ctx.restore();
          break;
        }
        case 'needle': {
          ctx.globalAlpha = Math.min(1, k * 2.5);
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 0.045;
          ctx.lineCap = 'round';
          const l = Math.hypot(p.vx, p.vy) || 1;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - (p.vx / l) * p.size, y + (p.vy / l) * p.size);
          ctx.stroke();
          break;
        }
        case 'bee': {
          const dir = p.vx >= 0 ? 1 : -1;
          ctx.save();
          ctx.translate(x, y);
          ctx.globalAlpha = Math.min(1, k * 3);
          // wings (flutter)
          const flap = Math.abs(Math.sin(p.life * 60)) * 0.6 + 0.4;
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.beginPath();
          ctx.ellipse(-0.02 * dir, -p.size * 0.75, p.size * 0.45, p.size * 0.7 * flap, -0.3 * dir, 0, TAU);
          ctx.fill();
          ctx.fillStyle = '#ffc928';
          ctx.beginPath();
          ctx.ellipse(0, 0, p.size, p.size * 0.72, 0, 0, TAU);
          ctx.fill();
          ctx.fillStyle = '#2b1a12';
          ctx.fillRect(-p.size * 0.25, -p.size * 0.7, p.size * 0.22, p.size * 1.4);
          ctx.fillRect(p.size * 0.2 * -dir - p.size * 0.1, -p.size * 0.66, p.size * 0.2, p.size * 1.32);
          ctx.beginPath();
          ctx.arc(p.size * 0.72 * dir, -p.size * 0.1, p.size * 0.14, 0, TAU);
          ctx.fill();
          ctx.restore();
          break;
        }
        case 'trailpuff': {
          ctx.globalAlpha = Math.min(0.9, k * 1.5);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(x, y, p.size, 0, TAU);
          ctx.fill();
          break;
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  drawTexts(ctx, zoom) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const k = t.life / t.max;
      const pop = t.pop < 1 ? 0.6 + 0.6 * Math.sin(t.pop * Math.PI * 0.75) : 1;
      const px = Math.max(14, t.size * zoom) * pop;
      ctx.save();
      ctx.translate(t.x, -t.y);
      ctx.scale(1 / zoom, 1 / zoom);
      ctx.globalAlpha = Math.min(1, k * 3);
      ctx.font = `${Math.round(px)}px Jua, "Black Han Sans", system-ui, sans-serif`;
      ctx.lineWidth = Math.max(3, px * 0.16);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = t.stroke;
      ctx.strokeText(t.str, 0, 0);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, 0, 0);
      ctx.restore();
    }
  }
}

export function starPath(ctx, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
}
