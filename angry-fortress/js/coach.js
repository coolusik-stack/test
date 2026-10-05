// The first-match coach: a speech bubble and a pointing finger that walk a new player through one
// easy CPU match on 도토리 숲 — pull and release, move, pick the walnut, tap mid-flight, and what
// digging someone out means. Each step waits for the player to actually do it.
//
// main.js creates one for the tutorial match and feeds it game events (event) and frames (tick).
import { STAMINA } from './config.js';

const STEPS = {
  pull: '내 다람쥐 옆 새총을 누른 채 뒤로 쭉 당겨 보세요',
  release: '점선이 상대 쪽으로 가게 맞추고 손을 떼면 깡!',
  move: '◀ ▶ 버튼을 꾹 누르면 수레가 움직여요',
  pick: '특수 견과! 아래에서 호두를 골라 보세요',
  shoot: '이번엔 호두를 쏴요. 날아가는 중에 화면을 톡!',
  tap: '지금 화면을 톡!',
  free: '이제 마음껏! 체력을 0으로 만들거나 구름 아래로 떨어뜨리면 이겨요',
};

export class Coach {
  constructor(root, { onTrained } = {}) {
    this.root = root;
    this.bubble = root.querySelector('.coach-bubble');
    this.text = root.querySelector('.coach-text');
    this.hand = root.querySelector('.coach-hand');
    this.banner = document.getElementById('banner');
    this.onTrained = onTrained || (() => {});
    this.game = null;
    this.step = null;
    this.say = '';
    this.sayT = 0;
    this.myTurns = 0;
  }

  start(game) {
    this.game = game;
    this.step = 'wait';
    this.myTurns = 0;
    this.used = false;
    this.walnut = false;
    this.trained = false;
    this.cpuHp = undefined;
    this.root.hidden = false;
    this._show('', null);
  }

  stop() {
    this.game = null;
    this.step = null;
    this.root.hidden = true;
    this.hand.className = 'coach-hand';
  }

  get me() {
    return this.game.players[0];
  }

  // ------------------------------------------------------------------ game events
  event(evt, data) {
    if (!this.game) return;
    const g = this.game;
    if (evt === 'turn') {
      if (data.player === 0) {
        this.myTurns++;
        this.startX = this.me.body.getPosition().x;
        if (this.myTurns === 1) this._go('pull');
        else if (this.myTurns === 2) this._go('move');
        else if (!this.walnut && this.me.ammo.walnut > 0 && this.myTurns <= 4) this._go('pick'); // didn't get to it last turn
        else this._go('free');
      } else {
        // the CPU's turn: say how the last shot went and what comes next
        const hp = g.players[1].hp;
        const hit = hp < (this.cpuHp ?? 100) - 0.5;
        this.cpuHp = hp;
        if (this.myTurns === 1) this._go('cpu', hit ? '명중! 상대 체력이 줄었어요. 이제 CPU 차례예요' : '아깝다! 다음엔 점선을 보며 힘과 각도를 바꿔 봐요. 이제 CPU 차례');
        else if (this.used) this._go('cpu', '호두는 땅을 파고 들어가 터져요. 상대 발밑을 파내면 구름 아래로 떨어져 바로 K.O.!');
        else this._go('cpu', hit ? '좋아요! 이제 CPU 차례예요' : '이제 CPU 차례예요');
      }
    } else if (evt === 'fired' && data.player === 0) {
      if (data.type === 'walnut' && !this.walnut) { this.walnut = true; this._go('tap'); }
      else if (this.step !== 'free') this._go('flight');
    } else if (evt === 'over') {
      this.onTrained();
      this.stop();
    }
  }

  // ------------------------------------------------------------------ every frame
  tick(dt) {
    if (!this.game) return;
    const g = this.game;
    if (this.sayT > 0) {
      this.sayT -= dt;
      if (this.sayT <= 0) this._show('', null);
    }
    // the big turn banner speaks first; the bubble waits until it has gone
    const quiet = this.banner.hidden;
    if (this.bubble.hidden === !!(this.say && quiet)) {
      this.bubble.hidden = !(this.say && quiet);
      if (!this.bubble.hidden) this._pop();
    }
    const mine = g.turn === 0 && g.state === 'aim';
    switch (this.step) {
      case 'pull':
        if (g.aim && !g.aim.ai && g.aim.power > 0.22) this._go('release');
        else this._pointAtSling(true);
        break;
      case 'release':
        if (!g.aim && mine) this._go('pull'); // let go too early: show it again
        break;
      case 'move': {
        const moved = Math.abs(this.me.body.getPosition().x - this.startX);
        if (moved > 0.8 || this.me.stamina < STAMINA * 0.85) this._go('pick');
        else this._pointAt('#mv-right');
        break;
      }
      case 'pick':
        if (this.me.sel === 'walnut') this._go('shoot');
        else if (this.me.ammo.walnut <= 0) this._go('free');
        else this._pointAt('#ammo .slot[data-type="walnut"]');
        break;
      case 'shoot':
        if (this.me.sel !== 'walnut') this._go('pick');
        else if (mine && !g.aim) this._pointAtSling(false);
        else this._hand(null);
        break;
      case 'tap':
        if (g.lead && g.lead.used) { this.used = true; this._go('flight', '쿵! 땅을 뚫고 들어가요'); }
        else if (g.state !== 'flight') this._go('flight', '다음엔 날아가는 중에 톡 눌러 봐요');
        else this._tapAnywhere();
        break;
      case 'free':
        if (this.sayT <= 0 && !this.trained) { this.trained = true; this.onTrained(); }
        break;
    }
  }

  // ------------------------------------------------------------------ helpers
  _go(step, line) {
    this.step = step;
    this._hand(null);
    if (step === 'free') { this._show(STEPS.free, 6); return; }
    if (step === 'cpu' || step === 'flight') { this._show(line || '', line ? 3.5 : 0); return; }
    this._show(STEPS[step] || line || '', 0);
  }

  _show(text, secs) {
    this.say = text;
    this.sayT = secs || 0;
    this.bubble.hidden = !text || !this.banner.hidden;
    if (text) {
      this.text.textContent = text;
      if (!this.bubble.hidden) this._pop();
    }
  }

  _pop() {
    this.bubble.classList.remove('pop');
    void this.bubble.offsetWidth;
    this.bubble.classList.add('pop');
  }

  _hand(kind, x, y) {
    const h = this.hand;
    if (!kind) { if (h.className !== 'coach-hand') h.className = 'coach-hand'; return; }
    const cls = `coach-hand on ${kind}`;
    if (h.className !== cls) h.className = cls;
    h.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  _pointAtSling(drag) {
    const g = this.game;
    if (g.turn !== 0 || g.state !== 'aim') { this._hand(null); return; }
    const r = g.restPos(this.me);
    const s = g.cam.toScreen(r.x, r.y);
    this._hand(drag ? 'drag' : 'tap', s.x, s.y);
  }

  _pointAt(sel) {
    const el = document.querySelector(sel);
    if (!el || this.game.turn !== 0) { this._hand(null); return; }
    const b = el.getBoundingClientRect();
    this._hand('tap', b.left + b.width / 2, b.top + b.height / 2);
  }

  _tapAnywhere() {
    this._hand('tap', window.innerWidth * 0.62, window.innerHeight * 0.45);
  }
}
