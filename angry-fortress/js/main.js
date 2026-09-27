// Boot, screens, HUD binding and the main loop.
import { Game } from './game.js';
import { THEMES, THEME_ORDER } from './levels.js';
import { buildLandscape, WORLD } from './terrain.js';
import * as Art from './art.js';
import Sound from './audio.js';
import { storage, prefs, clamp } from './util.js';
import { AMMO, HP_MAX, STAMINA, TEAM } from './config.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const canvas = $('#game');
const settings = Object.assign(
  { sfx: true, music: true, vibe: true, difficulty: 'normal', wind: 'normal', timer: '0', guide: 'on', theme: 'oak' },
  storage.get('af.settings', {}),
);
// maps from older versions were renamed when the game moved into the forest
if (settings.theme !== 'random' && !THEMES[settings.theme]) settings.theme = 'oak';
const record = Object.assign({ wins: 0, losses: 0, pvp: 0 }, storage.get('af.record', {}));
const seen = storage.get('af.seen', { tutorial: false });

let game = null; // the active match (or the title-screen demo)
let mode = 'cpu';
let screen = 'title';
let lastOpts = null;
let size = { w: 0, h: 0, dpr: 1 };
let hudTimer = 0;
let rotateDismissed = false;
let demoRestartT = null;
let releaseKeys = () => {};
let rotatePaused = false;

// ---------------------------------------------------------------- sizing
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth, h = window.innerHeight;
  size = { w, h, dpr };
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  if (game) game.resize(w, h, dpr);
  updateRotateHint();
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));

function updateRotateHint() {
  const portrait = size.h > size.w * 1.05;
  const show = screen === 'battle' && portrait && !rotateDismissed;
  $('#rotate').hidden = !show;
  // freeze the match (turn timer, CPU) while the overlay covers it
  if (show && game && !game.paused) {
    game.paused = true;
    game.cancelInput();
    rotatePaused = true;
  } else if (!show && rotatePaused) {
    rotatePaused = false;
    if (game && screen === 'battle') game.paused = false;
  }
}

// ---------------------------------------------------------------- screens
function show(id) {
  for (const s of ['title', 'setup', 'pause', 'settings', 'help', 'result']) $('#' + s).hidden = s !== id;
}

function goTitle() {
  screen = 'title';
  rotatePaused = false;
  show('title');
  $('#hud').hidden = true;
  startDemo();
  Sound.music(settings.music ? 'menu' : null);
  renderRecord();
  updateRotateHint();
}

function goSetup(m) {
  mode = m;
  screen = 'setup';
  show('setup');
  $('#setup-title').textContent = m === 'cpu' ? 'CPU와 대결' : '한 폰으로 2인 대결';
  $('#field-diff').hidden = m !== 'cpu';
  syncSegs();
  renderMaps();
}

function renderRecord() {
  const total = record.wins + record.losses;
  $('#record').textContent = total || record.pvp ? `CPU 전적 ${record.wins}승 ${record.losses}패${record.pvp ? ` · 2인 대결 ${record.pvp}판` : ''}` : '';
}

// ---------------------------------------------------------------- demo
function startDemo() {
  if (game) game.destroy();
  clearTimeout(demoRestartT);
  const theme = THEME_ORDER[Math.floor(Math.random() * THEME_ORDER.length)];
  const g = new Game(canvas, { demo: true, mode: 'cpu', difficulty: 'normal', theme, wind: 'normal', timer: 0, guide: false }, (evt) => {
    if (evt === 'over' && g === game) demoRestartT = setTimeout(() => { if (g === game) startDemo(); }, 2200);
  }, size);
  game = g;
}

// ---------------------------------------------------------------- battle
function startBattle(opts) {
  if (game) game.destroy();
  clearTimeout(demoRestartT);
  lastOpts = opts;
  screen = 'battle';
  show(null);
  $('#hud').hidden = false;
  $('#banner').hidden = true;
  $('#tip').hidden = true;
  hint('', 0);
  rotatePaused = false;
  const g = new Game(canvas, { ...opts, seed: (Math.random() * 1e9) | 0 }, (evt, data) => {
    if (g === game) onGameEvent(evt, data); // ignore late events from a replaced match
  }, size);
  game = g;
  setupHud();
  Sound.play('start');
  Sound.music(settings.music ? 'battle' : null);
  updateRotateHint();
}

function buildOpts() {
  let theme = settings.theme;
  if (theme === 'random') theme = THEME_ORDER[Math.floor(Math.random() * THEME_ORDER.length)];
  return {
    mode,
    difficulty: settings.difficulty,
    theme,
    wind: settings.wind,
    timer: Number(settings.timer) || 0,
    guide: settings.guide !== 'off',
    firstTurn: 0,
  };
}

function tryFullscreen() {
  if (!matchMedia('(pointer: coarse)').matches) return;
  const el = document.documentElement;
  try {
    const p = el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : null;
    if (p && p.then) {
      p.then(() => {
        try { window.screen.orientation?.lock?.('landscape')?.catch(() => {}); } catch (e) { /* not allowed */ }
      }).catch(() => {});
    }
  } catch (e) {
    /* fullscreen not available here */
  }
}

function onGameEvent(evt, data) {
  if (!game || screen !== 'battle') return;
  switch (evt) {
    case 'turn': {
      const p = game.players[data.player];
      const team = TEAM[p.team];
      const who = game.opts.mode === 'cpu' ? (p.isAI ? 'CPU 차례' : '내 차례!') : `${p.id + 1}P 차례!`;
      banner(who, data.flood || windText(data.wind), team.color);
      syncTurn();
      renderSlots();
      if (!p.isAI) {
        if (!seen.tutorial) hint('새총 근처를 누른 채 뒤로 당겼다 놓으세요!', 0);
        else hint('', 0);
      } else hint('CPU가 조준하고 있어요…', 0);
      break;
    }
    case 'fired': {
      const p = game.players[data.player];
      renderSlots();
      $('#tip').hidden = true;
      if (!p.isAI && AMMO[data.type].ability) hint('날아가는 중 화면을 터치하면 능력 발동!', 2.5);
      else hint('', 0);
      if (!p.isAI && !seen.tutorial) {
        seen.tutorial = true;
        storage.set('af.seen', seen);
      }
      break;
    }
    case 'banner':
      banner(data.text, data.sub, '#fff');
      break;
    case 'hud':
      renderSlots();
      break;
    case 'over':
      showResult(data);
      break;
  }
}

function windText(w) {
  if (!w) return '바람 없음';
  return `바람 ${w > 0 ? '→' : '←'} ${Math.abs(w)}`;
}

let bannerTimer = null;
function banner(text, sub, color) {
  const b = $('#banner');
  b.hidden = true;
  void b.offsetWidth;
  $('#banner-text').textContent = text;
  $('#banner-sub').textContent = sub || '';
  b.style.setProperty('--team', color || '#fff');
  b.hidden = false;
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => (b.hidden = true), 1500);
}

let hintTimer = null;
function hint(text, secs) {
  const h = $('#hint');
  clearTimeout(hintTimer);
  if (!text) { h.classList.remove('show'); return; }
  h.textContent = text;
  h.classList.add('show');
  if (secs) hintTimer = setTimeout(() => h.classList.remove('show'), secs * 1000);
}

// ---------------------------------------------------------------- HUD
// Write a style/text only when it changed (the HUD syncs every frame).
function put(el, key, val) {
  const memo = el._memo || (el._memo = {});
  if (memo[key] === val) return;
  memo[key] = val;
  if (key === 'text') el.textContent = val;
  else if (key.startsWith('class:')) el.classList.toggle(key.slice(6), val);
  else el.style[key] = val;
}

function setupHud() {
  for (const p of game.players) {
    const card = $('#pcard-' + p.id);
    card.querySelector('.pname').textContent = p.name;
    card.style.setProperty('--team', TEAM[p.team].color);
    const face = card.querySelector('.pface');
    const c = face.getContext('2d');
    c.clearRect(0, 0, face.width, face.height);
    try { Art.drawCaptainIcon(face, p.team); } catch (e) { /* art not ready */ }
    card.classList.remove('dead');
  }
  const wrap = $('#ammo');
  wrap.innerHTML = '';
  for (const type of Art.AMMO_TYPES) {
    const b = document.createElement('button');
    b.className = 'slot';
    b.dataset.type = type;
    b.setAttribute('aria-label', `${Art.AMMO_INFO[type].name}: ${Art.AMMO_INFO[type].desc}`);
    const cv = document.createElement('canvas');
    cv.width = cv.height = 96;
    try { Art.drawAmmoIcon(cv, type); } catch (e) { /* art not ready */ }
    const cnt = document.createElement('span');
    cnt.className = 'cnt';
    b.append(cv, cnt);
    b.addEventListener('click', () => {
      Sound.unlock();
      if (game && game.selectBird(type)) {
        renderSlots();
        showTip(type);
      }
    });
    wrap.appendChild(b);
  }
  $('#btn-overview').classList.remove('on');
  syncTurn();
  renderSlots();
  syncHud(true);
}

function showTip(type) {
  const t = $('#tip');
  const info = Art.AMMO_INFO[type];
  t.innerHTML = `<b>${info.name}</b>${info.desc}`;
  t.hidden = true;
  void t.offsetWidth;
  t.hidden = false;
  clearTimeout(showTip.tm);
  showTip.tm = setTimeout(() => (t.hidden = true), 2200);
}

function syncTurn() {
  if (!game) return;
  const p = game.players[game.turn];
  const pill = $('#turnpill');
  pill.style.setProperty('--team', TEAM[p.team].color);
  $('#turntext').textContent = game.state === 'intro' ? '전투 준비' : game.opts.mode === 'cpu' ? (p.isAI ? 'CPU 차례' : '내 차례') : `${p.id + 1}P 차례`;
  for (const q of game.players) $('#pcard-' + q.id).classList.toggle('active', q === p && game.state !== 'intro');
  const w = game.wind, max = 10;
  const fill = $('#windfill');
  const pct = (Math.abs(w) / max) * 50;
  fill.classList.toggle('neg', w < 0);
  fill.style.left = w >= 0 ? '50%' : `${50 - pct}%`;
  fill.style.width = `${pct}%`;
  $('#windnum').textContent = w ? `${w > 0 ? '→' : '←'}${Math.abs(w)}` : '0';
}

function renderSlots() {
  if (!game) return;
  const p = game.players[game.turn];
  for (const b of $$('#ammo .slot')) {
    const type = b.dataset.type;
    const n = p.ammo[type];
    b.querySelector('.cnt').textContent = n === Infinity ? '∞' : n;
    b.classList.toggle('on', p.sel === type);
    b.classList.toggle('empty', n <= 0);
  }
}

function syncHud(force) {
  if (!game) return;
  for (const p of game.players) {
    const card = $('#pcard-' + p.id);
    const k = clamp(p.shownHp / HP_MAX, 0, 1);
    const fill = card.querySelector('.hpfill');
    put(fill, 'width', `${(k * 100).toFixed(1)}%`);
    put(fill, 'class:mid', k <= 0.5 && k > 0.25);
    put(fill, 'class:low', k <= 0.25);
    put(card.querySelector('.hpghost'), 'width', `${(clamp(p.hp / HP_MAX, 0, 1) * 100).toFixed(1)}%`);
    put(card.querySelector('.hpnum'), 'text', String(Math.ceil(p.hp)));
    put(card, 'class:dead', p.dead);
  }
  const cur = game.players[game.turn];
  put($('#controls'), 'class:off', !game.canControl());
  put($('#stfill'), 'width', `${Math.round((cur.stamina / STAMINA) * 100)}%`);
  const tm = $('#timer');
  if (game.opts.timer && game.state === 'aim' && !cur.isAI) {
    tm.hidden = false;
    const sec = Math.max(0, Math.ceil(game.turnTimer));
    put(tm, 'text', String(sec));
    put(tm, 'class:urgent', sec <= 5);
  } else tm.hidden = true;
  if (force || hudTimer <= 0) syncTurn();
}

// ---------------------------------------------------------------- result
function showResult(r) {
  screen = 'result';
  $('#hud').hidden = true;
  updateRotateHint();
  show('result');
  const cpu = lastOpts.mode === 'cpu';
  let title, sub;
  if (r.winner < 0) {
    title = '무승부';
    sub = '둘 다 쓰러졌어요!';
  } else if (cpu) {
    title = r.isAIWin ? '패배…' : '승리!';
    sub = r.isAIWin ? `CPU ${TEAM[1].name}이 창고를 지켰어요. 다시 도전!` : `남은 체력 ${r.players[r.winner].hp}로 도토리 창고를 지켰어요`;
    if (r.isAIWin) record.losses++; else record.wins++;
  } else {
    title = `${r.winner + 1}P 승리!`;
    sub = `${TEAM[r.winner].name} · 남은 체력 ${r.players[r.winner].hp}`;
    record.pvp++;
  }
  storage.set('af.record', record);
  $('#result-title').textContent = title;
  $('#result-sub').textContent = sub;
  const face = $('#result-face');
  face.getContext('2d').clearRect(0, 0, face.width, face.height);
  try { Art.drawCaptainIcon(face, r.winner < 0 ? 0 : r.winner); } catch (e) { /* ignore */ }
  const stars = $$('#stars i');
  const n = r.winner < 0 || (cpu && r.isAIWin) ? 0 : r.stars;
  stars.forEach((s, i) => s.classList.toggle('on', i < n));
  for (let i = 0; i < n; i++) setTimeout(() => Sound.play('star', { pitch: 1 + i * 0.12 }), 350 + i * 300);
  const P = r.players;
  const rows = [
    ['남은 체력', P[0].hp, P[1].hp],
    ['입힌 피해', P[0].dmg, P[1].dmg],
    ['명중', P[0].hits, P[1].hits],
    ['부순 블록', P[0].blocks, P[1].blocks],
    ['발사', P[0].shots, P[1].shots],
  ];
  $('#stats').innerHTML =
    `<thead><tr><th></th><th class="t0">${esc(P[0].name)}</th><th class="t1">${esc(P[1].name)}</th></tr></thead><tbody>` +
    rows.map((r2) => `<tr><td>${r2[0]}</td><td>${r2[1]}</td><td>${r2[2]}</td></tr>`).join('') +
    '</tbody>';
  Sound.music(settings.music ? 'victory' : null);
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

// ---------------------------------------------------------------- setup widgets
function syncSegs() {
  for (const seg of $$('.seg')) {
    const key = seg.dataset.key;
    for (const b of seg.querySelectorAll('button')) b.classList.toggle('on', String(settings[key]) === b.dataset.v);
  }
}

function renderMaps() {
  const wrap = $('#maps');
  if (!wrap.childElementCount) {
    for (const id of [...THEME_ORDER, 'random']) {
      const b = document.createElement('button');
      b.className = 'map';
      b.dataset.id = id;
      const cv = document.createElement('canvas');
      cv.width = 192;
      cv.height = 108;
      drawMapPreview(cv, id);
      const name = document.createElement('span');
      name.textContent = id === 'random' ? '랜덤' : THEMES[id].name;
      const desc = document.createElement('small');
      desc.textContent = id === 'random' ? '어디로 갈지 몰라요' : THEMES[id].desc;
      b.append(cv, name, desc);
      b.addEventListener('click', () => {
        Sound.unlock();
        Sound.play('tap');
        settings.theme = id;
        storage.set('af.settings', settings);
        renderMaps();
      });
      wrap.appendChild(b);
    }
  }
  for (const b of wrap.children) b.classList.toggle('on', b.dataset.id === settings.theme);
}

function drawMapPreview(cv, id) {
  const g = cv.getContext('2d');
  const W = cv.width, H = cv.height;
  if (id === 'random') {
    const gr = g.createLinearGradient(0, 0, W, H);
    gr.addColorStop(0, '#7b5cff');
    gr.addColorStop(1, '#ff6fa3');
    g.fillStyle = gr;
    g.fillRect(0, 0, W, H);
    g.fillStyle = '#fff';
    g.font = '64px "Black Han Sans", Jua, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 8;
    g.strokeStyle = '#2b1a12';
    g.strokeText('?', W / 2, H / 2 + 4);
    g.fillText('?', W / 2, H / 2 + 4);
    return;
  }
  const t = THEMES[id];
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, t.sky[0]);
  sky.addColorStop(0.6, t.sky[1]);
  sky.addColorStop(1, t.sky[2]);
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);
  g.fillStyle = t.sun.color;
  g.beginPath();
  g.arc(W * t.sun.x, H * t.sun.y, 9, 0, Math.PI * 2);
  g.fill();
  const land = buildLandscape(t.layout, 1234);
  const sx = W / WORLD.W, sy = H / 26;
  const toY = (y) => H - y * sy;
  g.beginPath();
  g.moveTo(0, H);
  for (let x = 0; x <= W; x += 2) g.lineTo(x, toY(land.heights(x / sx)));
  g.lineTo(W, H);
  g.closePath();
  g.fillStyle = t.ground.dirt;
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = t.ground.grass;
  g.beginPath();
  for (let x = 0; x <= W; x += 2) {
    const y = land.heights(x / sx);
    if (y > WORLD.SEA0) g.lineTo(x, toY(y)); else g.moveTo(x, toY(y));
  }
  g.stroke();
  // carve preview ops
  for (const op of land.ops) {
    g.fillStyle = op.type === 'sub' ? t.sky[2] : t.ground.dirt;
    g.beginPath();
    g.ellipse(op.x * sx, toY(op.y), op.rx * sx, op.ry * sy, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = t.sea.bottom;
  g.fillRect(0, toY(WORLD.SEA0), W, H);
  g.fillStyle = t.sea.top;
  g.fillRect(0, toY(WORLD.SEA0), W, 3);
  for (const bx of land.bases) {
    g.fillStyle = bx < WORLD.W / 2 ? TEAM[0].color : TEAM[1].color;
    g.strokeStyle = '#2b1a12';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(bx * sx, toY(land.heights(bx)) - 5, 5, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
}

function renderHelpBirds() {
  const wrap = $('#help-ammo');
  if (wrap.childElementCount) return;
  for (const type of Art.AMMO_TYPES) {
    const d = document.createElement('div');
    d.className = 'hb';
    const cv = document.createElement('canvas');
    cv.width = cv.height = 96;
    try { Art.drawAmmoIcon(cv, type); } catch (e) { /* ignore */ }
    const b = document.createElement('b');
    b.textContent = Art.AMMO_INFO[type].name;
    const s = document.createElement('small');
    const ammo = AMMO[type].ammo;
    s.textContent = `${Art.AMMO_INFO[type].desc} · ${ammo === Infinity ? '무제한' : ammo + '발'}`;
    d.append(cv, b, s);
    wrap.appendChild(d);
  }
}

function syncToggles() {
  for (const t of $$('.tgl')) t.classList.toggle('on', !!settings[t.dataset.toggle]);
}

// ---------------------------------------------------------------- wiring
function bind() {
  const click = (sel, fn) => $(sel).addEventListener('click', (e) => {
    Sound.unlock();
    fn(e);
  });
  click('#btn-solo', () => { Sound.play('tap'); goSetup('cpu'); });
  click('#btn-duo', () => { Sound.play('tap'); goSetup('pvp'); });
  click('#btn-help', () => { Sound.play('tap'); renderHelpBirds(); show('help'); });
  click('#help-close', () => { Sound.play('back'); show('title'); });
  click('#help-x', () => { Sound.play('back'); show('title'); });
  click('#btn-settings', () => { Sound.play('tap'); syncToggles(); show('settings'); });
  click('#settings-close', () => { Sound.play('back'); show('title'); });
  click('#setup-back', () => { Sound.play('back'); goTitle(); });
  click('#btn-go', () => {
    tryFullscreen();
    startBattle(buildOpts());
  });
  for (const seg of $$('.seg')) {
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      Sound.unlock();
      Sound.play('tap');
      settings[seg.dataset.key] = b.dataset.v;
      storage.set('af.settings', settings);
      syncSegs();
    });
  }
  for (const t of $$('.tgl')) {
    t.addEventListener('click', () => {
      Sound.unlock();
      const k = t.dataset.toggle;
      settings[k] = !settings[k];
      storage.set('af.settings', settings);
      applySettings();
      syncToggles();
      Sound.play('tap');
    });
  }
  click('#btn-pause', () => pause(true));
  click('#btn-resume', () => pause(false));
  click('#btn-restart', () => { Sound.play('tap'); startBattle(lastOpts); });
  click('#btn-home', () => { Sound.play('back'); goTitle(); });
  click('#btn-again', () => { Sound.play('tap'); startBattle(lastOpts); });
  click('#btn-menu', () => { Sound.play('back'); goTitle(); });
  click('#btn-overview', () => {
    if (!game) return;
    Sound.play('tap');
    $('#btn-overview').classList.toggle('on', game.toggleOverview());
  });
  click('#rotate-ok', () => { rotateDismissed = true; updateRotateHint(); });

  // move buttons (hold)
  for (const [sel, dir] of [['#mv-left', -1], ['#mv-right', 1]]) {
    const b = $(sel);
    const down = (e) => {
      e.preventDefault();
      Sound.unlock();
      if (!game || !game.canControl()) return;
      b.classList.add('held');
      try { b.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      game.setMove(dir);
    };
    const up = () => {
      b.classList.remove('held');
      if (game) game.setMove(0);
    };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
  }

  // canvas input
  canvas.addEventListener('pointerdown', (e) => {
    Sound.unlock();
    if (screen !== 'battle' || !game) return;
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    game.pointerDown(e.pointerId, e.clientX, e.clientY);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (screen !== 'battle' || !game) return;
    game.pointerMove(e.pointerId, e.clientX, e.clientY);
  });
  const up = (e) => {
    if (!game) return;
    if (screen !== 'battle') { game.pointers.delete(e.pointerId); return; }
    game.pointerUp(e.pointerId);
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => {
    if (screen !== 'battle' || !game) return;
    e.preventDefault();
    game.wheel(e.deltaY, e.clientX, e.clientY);
  }, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // keyboard (desktop)
  const keysDown = new Set();
  releaseKeys = () => {
    keysDown.clear();
    if (game) game.setMove(0);
  };
  window.addEventListener('blur', () => releaseKeys());
  window.addEventListener('keydown', (e) => {
    if (screen !== 'battle' || !game) {
      if (e.key === 'Escape' && screen === 'paused') pause(false);
      return;
    }
    if (e.repeat) return;
    keysDown.add(e.key);
    if (e.key === 'ArrowLeft' || e.key === 'a') game.setMove(-1);
    else if (e.key === 'ArrowRight' || e.key === 'd') game.setMove(1);
    else if (e.key === ' ' || e.key === 'Enter') game.activateAbility();
    else if (e.key === 'Escape' || e.key === 'p') pause(true);
    else if (/^[1-5]$/.test(e.key)) {
      const type = Art.AMMO_TYPES[Number(e.key) - 1];
      if (game.selectBird(type)) { renderSlots(); showTip(type); }
    }
  });
  window.addEventListener('keyup', (e) => {
    keysDown.delete(e.key);
    if (!game) return;
    // releasing a direction key always stops: a key whose keyup got lost (focus change)
    // must never keep the cart driving on its own
    if (['ArrowLeft', 'ArrowRight', 'a', 'd'].includes(e.key)) game.setMove(0);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (screen === 'battle') pause(true);
      Sound.pause();
    } else {
      Sound.resume();
    }
  });
}

function pause(on) {
  if (!game) return;
  if (on) {
    if (screen !== 'battle') return;
    game.paused = true;
    game.cancelInput();
    releaseKeys();
    screen = 'paused';
    syncToggles();
    show('pause');
    Sound.play('tap');
  } else {
    game.paused = false;
    screen = 'battle';
    show(null);
    Sound.play('back');
  }
}

function applySettings() {
  Sound.setSfx(!!settings.sfx);
  Sound.setMusic(!!settings.music);
  prefs.vibe = !!settings.vibe;
  if (settings.music) {
    const track = screen === 'title' || screen === 'setup' ? 'menu' : screen === 'result' ? null : 'battle';
    if (track) Sound.music(track);
  } else Sound.music(null);
}

// ---------------------------------------------------------------- loop
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (game) {
    try {
      game.update(dt);
      game.draw();
    } catch (err) {
      console.error(err);
    }
    if (screen === 'battle' || screen === 'paused') {
      hudTimer -= dt;
      syncHud(false);
      if (hudTimer <= 0) hudTimer = 0.25;
    }
  }
  requestAnimationFrame(frame);
}

async function boot() {
  resize();
  bind();
  applySettings();
  syncSegs();
  try {
    await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);
  } catch (e) { /* fonts optional */ }
  goTitle();
  requestAnimationFrame((t) => { last = t; frame(t); });
  setTimeout(() => $('#boot').classList.add('gone'), 150);
  if ('serviceWorker' in navigator && /^https:|^http:\/\/localhost/.test(location.href) && !window.claude) {
    try { navigator.serviceWorker.register('sw.js').catch(() => {}); } catch (e) { /* not available */ }
  }
}

// expose for debugging / automated checks
window.__af = { get game() { return game; }, startBattle, buildOpts, goTitle };

boot();
