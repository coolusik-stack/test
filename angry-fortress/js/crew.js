// 깡단: two little squirrels tag along with each captain. One perches on the captain's acorn hat,
// the other runs along behind the cart. They react to everything that happens with poses (a cheer
// when a shot lands, a tumble and a salute when they get hit) and stay plucky even when they lose.
// They talk sparingly so a line still means something: never while someone is aiming, at most one
// speech bubble on screen and one per turn, 20 s or more apart and only every other chance, except
// for the big moments (a fall, the win, the loss), which always get their line.
//
// Presentation only: nothing here touches the physics, so friend matches stay in lockstep.
import * as Art from './art.js';
import { CART_R } from './config.js';
import { WORLD } from './terrain.js';
import { clamp, lerp } from './util.js';
import Sound from './audio.js';

// Where a sitting crew member's bottom goes on the captain's hat, relative to the captain's draw
// point (render space, facing +x).
const HAT = { x: -0.06, y: -1.47 };
const GROUND_BACK = 1.25; // how far behind the cart the runner stays
const LINES = {
  hit: ['나이스!', '깡깡!', '맞았다!', '우와아!', '봤지?'],
  hurt: ['끄떡없어!', '하나도 안 아파!', '괜찮아 괜찮아!', '간지러워!', '안 아파!'],
  miss: ['아까비!', '다음엔 맞아!', '바람 탓이야!'],
  danger: ['히익…', '여기 낭떠러지야!', '발밑 조심!', '흔들려…'],
  fall: ['으아아!', '엄마아!', '꽉 잡아!'],
  win: ['깡단 최고!', '도토리 몽땅!', '이겼다아!', '깡깡깡!'],
  lose: ['다음엔 이긴다!', '울긴 누가 울어!', '한 판 더!', '깡은 안 졌어!'],
  drop: ['보급이다!', '내 거!', '와아!'],
  boar: ['멧돼지다!', '도망쳐!', '히이익!'],
  whiff: ['어디 쏜 거야?!', '구름 맛있겠다…', '바람 탓이야!', '안 보였어!'],
  hurry: ['빨리 쏴~!', '깡 언제 해?', '졸려…', '쏴! 쏴!'],
  gust: ['바람 장난 아니야!', '모자 날아가!', '으으 추워!'],
  pad: ['슝~!', '날아라 깡!', '꽉 잡아!', '우와아아!'],
};

export class Crew {
  constructor(game) {
    this.g = game;
    this.squad = game.players.map((p) => [this._member(p, 0, 'hat'), this._member(p, 1, 'ground')]);
    this.lastSay = -99; // game time of the last ordinary line
    this.saidTurn = -1;
  }

  _member(p, variant, slot) {
    return {
      p, variant, slot, pose: slot === 'hat' ? 'sit' : 'idle', t: 0, hold: 0, then: null,
      x: NaN, y: NaN, ox: 0, oy: 0, rot: 0, bubble: null, idleT: 6 + Math.random() * 8, blinkT: Math.random() * 3, blink: 0,
    };
  }

  // ------------------------------------------------------------------ reactions
  // Something happened to player `p`'s side. `kind` picks the poses and a line from LINES.
  react(p, kind, opt = {}) {
    const [hat, run] = this.squad[p.id];
    const say = (m, k = kind, chance = 1, big = false) => { if (Math.random() < chance) this._say(m, pick(LINES[k]), big); };
    switch (kind) {
      case 'fire':
        this._pose(hat, 'shout', 0.9);
        this._pose(run, 'cheer', 0.9);
        this._sfx('kkang', { pitch: p.team ? 0.9 : 1.1 });
        break;
      case 'hit':
        this._pose(hat, 'cheer', 1.4);
        this._pose(run, 'dance', 1.4);
        say(Math.random() < 0.5 ? hat : run, 'hit', 0.8);
        this._sfx('chitter', { vol: 0.6, pitch: 1.3 });
        break;
      case 'hurt': {
        // knocked flying… and straight back up with a salute
        const big = (opt.dmg || 0) >= 12;
        for (const m of [hat, run]) {
          if (m.pose === 'tumble') continue;
          this._pose(m, 'tumble', big ? 0.9 : 0.6, { pose: 'salute', hold: 1.4, line: 'hurt' });
        }
        break;
      }
      case 'miss':
        this._pose(run, 'cry', 0.9, { pose: 'flex', hold: 1 });
        say(hat, 'miss', 0.7);
        break;
      case 'danger':
        this._pose(run, 'peek', 2.2);
        this._pose(hat, 'scared', 1.6);
        say(run);
        break;
      case 'fall':
        this._pose(hat, 'scared', 9);
        this._pose(run, 'cling', 9);
        say(hat, 'fall', 1, true);
        break;
      case 'win':
        this._pose(hat, 'dance', 99);
        this._pose(run, 'cheer', 99);
        say(hat, 'win', 1, true);
        setTimeout(() => this._say(run, pick(LINES.win), true), 900);
        break;
      case 'lose':
        // a little cry, then chins up
        this._pose(hat, 'cry', 1.8, { pose: 'flex', hold: 99, line: 'lose', big: true });
        this._pose(run, 'cry', 2.2, { pose: 'salute', hold: 99 });
        break;
      case 'turn':
        this._pose(run, 'cheer', 0.8);
        break;
      case 'drop':
        this._pose(hat, 'cheer', 1.2);
        this._pose(run, 'dance', 1.5);
        say(run);
        break;
      case 'whiff':
        // the nut sailed off into the clouds
        this._pose(run, 'peek', 1.6);
        this._pose(hat, 'cry', 1.2, { pose: 'flex', hold: 0.9 });
        say(Math.random() < 0.5 ? hat : run, 'whiff', 0.8);
        break;
      case 'pad':
        this._pose(hat, 'cheer', 1.6);
        this._pose(run, 'cling', 1.6);
        say(hat);
        break;
      case 'gust':
        this._pose(hat, 'scared', 1.4);
        say(hat, 'gust', 0.6);
        break;
      case 'boar':
        this._pose(hat, 'scared', 2);
        this._pose(run, 'scared', 2);
        say(Math.random() < 0.5 ? hat : run, 'boar', 0.6);
        break;
    }
  }

  // Both sides at once (the boar, the end of the match).
  reactAll(kind) {
    for (const p of this.g.players) this.react(p, kind);
  }

  _pose(m, pose, hold, then = null) {
    m.pose = pose;
    m.t = 0;
    m.hold = hold;
    m.then = then;
    if (pose === 'tumble') { m.vx = -(m.p.facing || 1) * (m.slot === 'hat' ? 2.2 : 1.4); m.vy = m.slot === 'hat' ? -5.5 : -4; }
  }

  // `big`: a moment that always gets its line (a fall, the win, the loss)
  _say(m, text, big = false) {
    if (!text) return;
    const g = this.g;
    if (!big) {
      if (g.state === 'aim' || g.state === 'ai-aim' || g.state === 'ai-think') return;
      if (this.squad.some((pair) => pair.some((x) => x.bubble))) return;
      if (g.time - this.lastSay < 20 || this.saidTurn === g.turnNo || Math.random() < 0.5) return;
      this.lastSay = g.time;
      this.saidTurn = g.turnNo;
    } else if (m.bubble && m.bubble.t < 0.9) return;
    m.bubble = { text, t: 0, life: 1.5 + text.length * 0.05 };
    if (!this.g.silent && Math.random() < 0.7) this._sfx('chitter', { vol: 0.45, pitch: (m.variant ? 0.95 : 1.25) * (m.p.team ? 0.92 : 1.05) });
  }

  _sfx(name, opts) {
    if (!this.g.silent) Sound.play(name, opts);
  }

  // ------------------------------------------------------------------ per frame
  update(dt) {
    const g = this.g;
    for (const pair of this.squad) {
      for (const m of pair) {
        const p = m.p;
        m.t += dt;
        m.blinkT -= dt;
        if (m.blinkT < 0) { m.blink = 0.14; m.blinkT = 1.8 + Math.random() * 3; }
        m.blink = Math.max(0, m.blink - dt);
        if (m.bubble && (m.bubble.t += dt) > m.bubble.life) m.bubble = null;
        // the tumble arc (render space, y down) lands back on the slot
        if (m.pose === 'tumble') {
          m.vy += 16 * dt;
          m.ox += m.vx * dt;
          m.oy += m.vy * dt;
          if (m.oy > 0 && m.vy > 0) { m.oy = 0; m.vy = 0; m.vx = 0; }
        } else {
          m.ox *= Math.exp(-10 * dt);
          m.oy = Math.min(0, m.oy * Math.exp(-10 * dt));
        }
        if (m.hold > 0 && (m.hold -= dt) <= 0) {
          const nx = m.then;
          if (nx) {
            this._pose(m, nx.pose, nx.hold ?? 1.2, null);
            if (nx.line) this._say(m, pick(LINES[nx.line]), !!nx.big);
          } else this._pose(m, m.slot === 'hat' ? 'sit' : 'idle', 0);
        }
        this._place(m);
        // the captain is taking forever: the one on the hat gets impatient
        if (m.slot === 'hat' && g.state === 'aim' && p === g.players[g.turn] && !p.isAI && !p.remote && g.stateT > 12 && m.nudged !== g.turnNo) {
          m.nudged = g.turnNo;
          this._pose(m, 'cheer', 0.8);
          this._say(m, pick(LINES.hurry), true); // once a turn, and only after 12 s of waiting
        }
        // fidgets when nothing is going on
        if (m.hold <= 0 && !g.over && !p.dead) {
          if (m.slot === 'ground') {
            if (p.moving) { if (m.pose !== 'push') this._pose(m, 'push', 0); }
            else if (m.pose === 'push') this._pose(m, 'idle', 0);
            if (m.cling && m.pose !== 'cling') this._pose(m, 'cling', 0);
            else if (!m.cling && m.pose === 'cling' && !p.falling) this._pose(m, 'idle', 0);
          }
          if ((m.idleT -= dt) <= 0) {
            m.idleT = 7 + Math.random() * 9;
            this._fidget(m);
          }
        }
      }
    }
  }

  // A small idle move now and then; nothing while a shot is being lined up or is in the air.
  _fidget(m) {
    const p = m.p, g = this.g;
    if (g.state === 'flight' || g.state === 'aim' || g.state === 'ai-aim') return;
    if (m.slot === 'ground' && p.edge && !m.cling) { this._pose(m, 'peek', 1.8); if (Math.random() < 0.4) this._say(m, pick(LINES.danger)); return; }
    if (m.slot === 'ground' && !m.cling && !p.moving) {
      const r = Math.random();
      if (r < (m.variant ? 0.55 : 0.3)) this._pose(m, 'nibble', 2.2);
      else if (r < 0.7) this._pose(m, 'cheer', 0.7);
    } else if (m.slot === 'hat' && Math.random() < 0.35) this._pose(m, 'cheer', 0.6);
  }

  // Keep each member where it belongs: on the hat, or on the ground behind the cart (hanging on
  // to the cart when there is no ground there).
  _place(m) {
    const p = m.p, pos = p.body.getPosition(), f = p.facing || 1;
    let tx, ty;
    m.cling = false;
    if (m.slot === 'hat') {
      tx = pos.x + f * HAT.x;
      ty = -pos.y + HAT.y;
    } else {
      const back = p.moving ? 1.15 : GROUND_BACK; // pushing: paws on the back wheel
      const gx = pos.x - f * back;
      const ground = this.g.terrain.surfaceY(gx, pos.y + 1.2);
      const foot = pos.y - CART_R;
      if (p.falling || ground < WORLD.SEA + 0.3 || foot - ground > 1.3) {
        // nothing to stand on: grab the back of the cart
        m.cling = true;
        tx = pos.x - f * 0.86;
        ty = -(pos.y + 0.22);
      } else {
        tx = gx;
        ty = -ground;
      }
    }
    if (!isFinite(m.x) || Math.abs(m.x - tx) > 3 || Math.abs(m.y - ty) > 3) { m.x = tx; m.y = ty; }
    const k = m.slot === 'hat' ? 1 : 1 - Math.exp(-14 * (this.g._frameDt || 0.016));
    m.x = lerp(m.x, tx, k);
    m.y = lerp(m.y, ty, k);
  }

  // ------------------------------------------------------------------ drawing
  _draw(ctx, m) {
    const p = m.p;
    if (!Art.drawCrew || (p.fell && p.dead)) return; // gone with the cart into the clouds
    const pose = m.pose === 'sit' && m.slot !== 'hat' ? 'idle' : m.pose;
    Art.drawCrew(ctx, m.x + m.ox, m.y + m.oy, { team: p.team, variant: m.variant, facing: p.facing, pose, t: m.t, time: this.g.time + m.variant * 1.3, blink: m.blink > 0 ? 1 : 0 });
  }

  // the runner, behind the cart (unless it is hanging off the back of it)
  drawBack(ctx) {
    for (const [, run] of this.squad) if (!run.cling) this._draw(ctx, run);
  }

  // the one on the hat over the captain, and a runner clinging to the rim
  drawFront(ctx) {
    for (const [hat, run] of this.squad) {
      if (run.cling) this._draw(ctx, run);
      this._draw(ctx, hat);
    }
  }

  // speech bubbles, a constant size on screen
  drawBubbles(ctx, zoom) {
    for (const pair of this.squad) {
      for (const m of pair) {
        const b = m.bubble;
        if (!b || (m.p.fell && m.p.dead)) continue;
        const pop = b.t < 0.15 ? b.t / 0.15 : b.t > b.life - 0.25 ? Math.max(0, (b.life - b.t) / 0.25) : 1;
        const s = (0.75 + 0.25 * pop) / zoom;
        const f = m.p.facing || 1;
        const side = m.slot === 'hat' ? f : -f;
        ctx.save();
        // the hat one talks off to the side, clear of the HP bar; the runner talks overhead
        ctx.translate(m.x + m.ox + side * (m.slot === 'hat' ? 0.6 : 0.35), m.y + m.oy - (m.slot === 'hat' ? 0.4 : 0.85));
        ctx.scale(s, s);
        ctx.globalAlpha = clamp(pop * 1.5, 0, 1);
        ctx.font = '15px Jua, "Black Han Sans", system-ui, sans-serif';
        const w = ctx.measureText(b.text).width + 18, h = 26;
        const bx = side > 0 ? -6 : -w + 6;
        ctx.fillStyle = '#fffaf0';
        ctx.strokeStyle = '#2b1a12';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(bx, -h - 8, w, h, 12); else ctx.rect(bx, -h - 8, w, h);
        ctx.fill();
        ctx.stroke();
        // the little tail pointing at the speaker
        ctx.beginPath();
        ctx.moveTo(-4 * side, -9); ctx.lineTo(-side * 2, 2); ctx.lineTo(6 * side, -9);
        ctx.fill();
        ctx.stroke();
        ctx.fillRect(Math.min(-4 * side, 6 * side) + 1, -11, 9, 4);
        ctx.fillStyle = '#2b1a12';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(b.text, bx + w / 2, -h / 2 - 7);
        ctx.restore();
      }
    }
  }
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}
