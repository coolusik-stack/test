// Boot, screens, HUD binding and the main loop.
import { Game } from './game.js';
import { THEMES, THEME_ORDER } from './levels.js';
import { buildLandscape, WORLD } from './terrain.js';
import * as Art from './art.js';
import Sound from './audio.js';
import { storage, prefs, clamp } from './util.js';
import { AMMO, HP_MAX, STAMINA, TEAM, WEB_URL } from './config.js';
import { Online } from './online.js';
import { makeCode, cleanCode } from './net.js';
import { Haptics, isNativeApp } from './haptics.js';
import { infoOf } from './spots.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const canvas = $('#game');
const settings = Object.assign(
  { sfx: true, music: true, vibe: true, difficulty: 'normal', wind: 'normal', timer: '0', guide: 'on', theme: 'oak', bo: '3' },
  storage.get('af.settings', {}),
);
// maps from older versions were renamed when the game moved into the forest
if (settings.theme !== 'random' && !THEMES[settings.theme]) settings.theme = 'oak';
const record = Object.assign({ wins: 0, losses: 0, pvp: 0, fw: 0, fl: 0 }, storage.get('af.record', {}));
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
let online = null; // link to a friend's phone (friend matches)
let series = null; // best-of-3 on this phone (vs CPU / one phone): { bo, wins: [a, b], round }
let nextRound = null; // the series state for the next round, once this one is decided
let hostTries = 0;
let emoteT = 0;
const EMOTES = ['😆', '😤', '😱', '👍', '🔥', '😭'];

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
  // freeze the match (turn timer, CPU) while the overlay covers it; a friend match can't pause
  if (show && game && !game.paused && !game.online) {
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
  for (const s of ['title', 'lobby', 'setup', 'pause', 'settings', 'help', 'result', 'pickmap']) $('#' + s).hidden = s !== id;
}

// ---------------------------------------------------------------- best of 3
const curSeries = () => (lastOpts && lastOpts.mode === 'online' ? online && online.match && online.match.series : series);
const needWins = (S) => Math.floor(S.bo / 2) + 1;
const randomTheme = () => THEME_ORDER[Math.floor(Math.random() * THEME_ORDER.length)];

function roundBanner() {
  const S = curSeries();
  if (!S || S.bo < 2) return;
  const need = needWins(S);
  const mp = S.wins.map((w) => w === need - 1);
  banner(`${S.round}판`, mp[0] && mp[1] ? '결승 판! 이기면 우승' : mp[0] || mp[1] ? '매치 포인트!' : `${S.bo}판 ${need}선승`, '#ffd21f');
}

function renderPips() {
  const S = curSeries();
  for (const i of [0, 1]) {
    const el = $('#pcard-' + i + ' .pwins');
    if (!S || S.bo < 2) { el.innerHTML = ''; continue; }
    el.innerHTML = Array.from({ length: needWins(S) }, (_, k) => `<i class="${k < S.wins[i] ? 'on' : ''}"></i>`).join('');
  }
}

// the loser picks the next battlefield (and shoots first)
function pickMap(title, sub, cb) {
  show('pickmap');
  $('#pick-title').textContent = title;
  $('#pick-sub').textContent = sub;
  const wrap = $('#pick-maps');
  wrap.innerHTML = '';
  for (const id of [...THEME_ORDER, 'random']) {
    const b = document.createElement('button');
    b.className = 'map';
    const cv = document.createElement('canvas');
    cv.width = 192;
    cv.height = 108;
    drawMapPreview(cv, id);
    const name = document.createElement('span');
    name.textContent = id === 'random' ? '랜덤' : THEMES[id].name;
    b.append(cv, name);
    b.addEventListener('click', () => {
      Sound.unlock();
      Sound.play('tap');
      Haptics.tap();
      cb(id === 'random' ? randomTheme() : id);
    });
    wrap.appendChild(b);
  }
}

function startNextLocal(theme) {
  series = nextRound;
  nextRound = null;
  const loser = series.lastWinner < 0 ? 1 - lastOpts.firstTurn : 1 - series.lastWinner;
  startBattle({ ...lastOpts, theme, firstTurn: loser, seed: undefined });
}

// online host: start the next round once the loser's pick (or a draw) is known
function tryStartNextOnline() {
  if (!online || online.role !== 'host' || !online.pendingNext || !online.paired) return;
  const theme = online.pickedTheme || (online.lastWinner < 0 ? randomTheme() : null);
  if (!theme) return;
  const next = online.pendingNext;
  online.pendingNext = null;
  online.pickedTheme = null;
  online.hostStart({ ...lobbySettings(), theme }, next);
}

// A little crew member living in a UI canvas (title logo, result card), animated while visible.
const crewCanvases = new Map();
function crewCanvas(cv, team, variant, pose) {
  if (!cv) return;
  crewCanvases.set(cv, { team, variant, pose, t0: performance.now() });
  if (crewCanvases.size === 1) requestAnimationFrame(tickCrewCanvases);
}
function tickCrewCanvases(now) {
  for (const [cv, c] of crewCanvases) {
    if (!cv.isConnected) { crewCanvases.delete(cv); continue; }
    if (cv.offsetParent === null) continue; // hidden: skip the work
    const g = cv.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    if (!Art.drawCrew) continue;
    const k = cv.height / 1.05; // pixels per metre: a crew member is ~0.65 m tall
    g.setTransform(k, 0, 0, k, cv.width / 2, cv.height * 0.9);
    const t = (now - c.t0) / 1000;
    try { Art.drawCrew(g, 0, 0, { team: c.team, variant: c.variant, facing: 1, pose: c.pose, t: t % 2.4, time: t, blink: (t % 3.7) < 0.12 ? 1 : 0 }); } catch (e) { /* art not ready */ }
  }
  if (crewCanvases.size) requestAnimationFrame(tickCrewCanvases);
}

function goTitle() {
  screen = 'title';
  rotatePaused = false;
  show('title');
  $('#hud').hidden = true;
  $('#netlost').hidden = true;
  renderRejoin();
  crewCanvas($('#logo-crew'), 0, 0, 'cheer');
  startDemo();
  Sound.music(settings.music ? 'menu' : null);
  renderRecord();
  updateRotateHint();
}

function goSetup(m) {
  mode = m;
  screen = 'setup';
  show('setup');
  $('#setup-title').textContent = m === 'cpu' ? 'CPU 연습' : m === 'online' ? '친구 대결 전장' : '한 폰으로 번갈아 대결';
  $('#field-diff').hidden = m !== 'cpu';
  $('#btn-go').textContent = m === 'online' ? '이걸로 할래요' : '전투 시작!';
  syncSegs();
  renderMaps();
}

function renderRecord() {
  const parts = [];
  if (record.fw + record.fl) parts.push(`친구 대결 ${record.fw}승 ${record.fl}패`);
  if (record.wins + record.losses) parts.push(`CPU ${record.wins}승 ${record.losses}패`);
  if (record.pvp) parts.push(`한 폰 대결 ${record.pvp}판`);
  $('#record').textContent = parts.join(' · ');
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
  const g = new Game(canvas, { ...opts, seed: opts.seed ?? ((Math.random() * 1e9) | 0) }, (evt, data) => {
    if (g === game) onGameEvent(evt, data); // ignore late events from a replaced match
  }, size);
  game = g;
  renderPips();
  roundBanner();
  $('#btn-emote').hidden = !g.online;
  $('#forecast').hidden = true;
  $('#emote-pop').hidden = true;
  $('#btn-restart').hidden = !!g.online;
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
  if (isNativeApp() || !matchMedia('(pointer: coarse)').matches) return;
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
      const ev = data.ev || {};
      banner(turnLabel(p, true), data.flood || (ev.starting ? `${ev.name}! ${ev.desc}` : ev.next ? `다음 턴 예보: ${ev.name}` : windText(data.wind)), team.color);
      renderForecast(ev);
      syncTurn();
      renderSlots();
      if (p.remote) hint('친구가 조준하고 있어요…', 0);
      else if (!p.isAI) {
        if (!seen.tutorial) hint('새총 근처를 누른 채 뒤로 당겼다 놓으세요!', 0);
        else hint('', 0);
      } else hint('CPU가 조준하고 있어요…', 0);
      if (!p.remote && !p.isAI && game.online) {
        Sound.play('select', { vol: 0.8 });
        Haptics.myTurn();
      }
      break;
    }
    case 'fired': {
      const p = game.players[data.player];
      renderSlots();
      $('#tip').hidden = true;
      if (!p.isAI && !p.remote && AMMO[data.type].ability) hint('날아가는 중 화면을 터치하면 능력 발동!', 2.5);
      else hint('', 0);
      if (!p.isAI && !p.remote && !seen.tutorial) {
        seen.tutorial = true;
        storage.set('af.seen', seen);
      }
      break;
    }
    case 'banner':
      banner(data.text, data.sub, '#fff');
      break;
    case 'fall': {
      // the big one: somebody went over the edge
      const p = game.players[data.player];
      const who = game.online ? (p.remote ? '친구' : '내 다람쥐') : game.opts.mode === 'cpu' ? (p.isAI ? 'CPU' : '내 다람쥐') : `${p.id + 1}P`;
      banner('추락 K.O.!', `${who}가 구름 아래로 떨어졌어요`, '#ffd21f');
      break;
    }
    case 'danger':
      hint(data.edge ? '벼랑 끝이에요! 안쪽으로 움직여 피하세요' : '발밑이 갈라지고 있어요! 옆으로 움직여 피하세요', 3.5);
      break;
    case 'cliff':
      hint('낭떠러지! 더 가면 떨어져요', 1.6);
      break;
    case 'spot':
      hint(data.text, 3.2);
      break;
    case 'hud':
      renderSlots();
      break;
    case 'over':
      showResult(data);
      break;
    case 'net':
      if (online) online.onGameNet(data);
      break;
  }
}

function turnLabel(p, shout) {
  if (game.online) return p.remote ? '친구 차례' : shout ? '내 차례!' : '내 차례';
  if (game.opts.mode === 'cpu') return p.isAI ? 'CPU 차례' : shout ? '내 차례!' : '내 차례';
  return `${p.id + 1}P 차례${shout ? '!' : ''}`;
}

// the forest forecast chip under the wind gauge: what's on now, or what's coming next turn
function renderForecast(ev) {
  const el = $('#forecast');
  const kind = ev && (ev.now || ev.next);
  if (!kind) { el.hidden = true; return; }
  el.hidden = false;
  el.classList.toggle('next', !ev.now);
  const cv = el.querySelector('canvas');
  if (cv._kind !== kind) {
    cv._kind = kind;
    try { Art.drawEventIcon(cv, kind); } catch (e) { /* art not ready */ }
  }
  el.querySelector('span').textContent = ev.now ? `${ev.name}${ev.left > 1 ? ` · ${ev.left}턴` : ' · 마지막 턴'}` : `다음 턴: ${ev.name}`;
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
  $('#turntext').textContent = game.state === 'intro' ? (game.hold ? '친구와 맞추는 중' : '전투 준비') : turnLabel(p, false);
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
  // in a friend match the ammo bar always shows *my* pouch
  const p = game.online ? game.players.find((q) => !q.remote) : game.players[game.turn];
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
  if (game.opts.timer && game.state === 'aim' && !cur.isAI && !cur.remote) {
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
  const friend = lastOpts.mode === 'online';
  const me = friend ? lastOpts.side : 0;
  let title, sub;
  $('#rematch-note').hidden = true;
  $('#again-label').textContent = '한 판 더';
  $('#btn-again').disabled = false;
  // best of 3: where the series stands after this round
  const S = curSeries();
  let done = true, wins = null;
  if (S && S.bo > 1) {
    wins = S.wins.slice();
    if (r.winner >= 0) wins[r.winner]++;
    done = wins.some((w) => w >= needWins(S));
    const next = done ? null : { bo: S.bo, wins, round: S.round + 1, lastWinner: r.winner };
    if (friend && online) { online.pendingNext = next; online.lastWinner = r.winner; }
    else nextRound = next;
  } else if (friend && online) { online.pendingNext = null; online.lastWinner = r.winner; }
  const sw = wins && done ? wins.findIndex((w) => w >= needWins(S)) : r.winner; // who won it all
  const fell = r.winner >= 0 && r.players[1 - r.winner].fell; // won by dropping the other one
  const pre = wins ? (done ? '최종 ' : `${S.round}판 `) : '';
  if (r.winner < 0) {
    title = `${pre}무승부`;
    sub = '둘 다 쓰러졌어요!';
  } else if (friend) {
    const won = r.winner === me;
    title = pre + (won ? '승리!' : '패배…');
    sub = won ? (fell ? '친구를 구름 아래로 떨어뜨렸어요! 도토리는 몽땅 우리 거!' : `친구 도토리까지 몽땅 우리 거! 남은 체력 ${r.players[me].hp}`)
      : done ? (fell ? '구름 아래로 떨어졌어요… 복수전 한 판?' : '친구가 이겼어요. 복수전 한 판?') : fell ? '구름 아래로 떨어졌지만, 아직 끝나지 않았어요!' : '아직 끝나지 않았어요!';
    if (done) { if (sw === me) record.fw++; else record.fl++; }
  } else if (cpu) {
    title = pre + (r.isAIWin ? '패배…' : '승리!');
    sub = r.isAIWin ? (fell ? '구름 아래로 떨어졌어요… 그래도 깡으로 다시 도전!' : `CPU ${TEAM[1].name}이 도토리를 몽땅 가져갔어요. 다시 도전!`)
      : fell ? 'CPU를 구름 아래로 떨어뜨렸어요! 도토리는 몽땅 우리 거!' : `겨울 도토리는 몽땅 우리 거! 남은 체력 ${r.players[r.winner].hp}`;
    if (done) { if (sw === 1) record.losses++; else record.wins++; }
  } else {
    title = `${pre}${r.winner + 1}P 승리!`;
    sub = fell ? `${TEAM[r.winner].name}이 상대를 구름 아래로 떨어뜨렸어요!` : `${TEAM[r.winner].name} · 남은 체력 ${r.players[r.winner].hp}`;
    if (done) record.pvp++;
  }
  storage.set('af.record', record);
  const sc = $('#series-score');
  sc.hidden = !wins;
  if (wins) { sc.querySelector('.t0').textContent = wins[0]; sc.querySelector('.t1').textContent = wins[1]; }
  // what the big button does next
  const loser = r.winner < 0 ? -1 : 1 - r.winner;
  if (!done) {
    if (friend) {
      if (loser === me) $('#again-label').textContent = '다음 판 · 전장 고르기';
      else { $('#again-label').textContent = r.winner < 0 ? '곧 다음 판…' : '친구가 전장 고르는 중…'; $('#btn-again').disabled = true; }
      tryStartNextOnline();
      if (online && online.role === 'host' && loser >= 0 && loser !== me) {
        // a guest who never picks shouldn't stall the series
        const m = online.match && online.match.id;
        setTimeout(() => { if (online && online.match && online.match.id === m && online.pendingNext && !online.pickedTheme) { online.pickedTheme = randomTheme(); tryStartNextOnline(); } }, 30000);
      }
    } else if (cpu && loser === 1) $('#again-label').textContent = '다음 판';
    else $('#again-label').textContent = loser < 0 ? '다음 판' : cpu ? '다음 판 · 전장 고르기' : `다음 판 · ${loser + 1}P가 전장 고르기`;
  } else if (wins) $('#again-label').textContent = '새 대결';
  const iWon = r.winner >= 0 && (friend ? r.winner === me : cpu ? !r.isAIWin : true);
  if (iWon) Haptics.win(); else Haptics.lose();
  $('#result-title').textContent = title;
  $('#result-sub').textContent = sub;
  const face = $('#result-face');
  face.getContext('2d').clearRect(0, 0, face.width, face.height);
  try { Art.drawCaptainIcon(face, r.winner < 0 ? 0 : r.winner); } catch (e) { /* ignore */ }
  // the 깡단 next to the winner: dancing when you won, flexing ("다음엔 이긴다!") when you didn't
  const myTeam = friend ? me : 0;
  crewCanvas($('#result-crew'), iWon || (!cpu && !friend && r.winner >= 0) ? Math.max(0, r.winner) : myTeam, 0, iWon || (!cpu && !friend) ? 'dance' : 'flex');
  const stars = $$('#stars i');
  const n = r.winner < 0 || (cpu && r.isAIWin) || (friend && r.winner !== me) ? 0 : r.stars;
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
  // the cloud sea first, then the floating islands over it
  const ab = t.abyss;
  const cg = g.createLinearGradient(0, toY(WORLD.SEA0 + 1.5), 0, H);
  cg.addColorStop(0, ab.cloud);
  cg.addColorStop(1, ab.deep);
  g.fillStyle = cg;
  g.fillRect(0, toY(WORLD.SEA0 + 1.5), W, H);
  g.fillStyle = ab.cloud;
  for (let x = 4; x < W; x += 13) {
    g.beginPath();
    g.arc(x, toY(WORLD.SEA0 + 1.3), 7 + (x % 5), 0, Math.PI * 2);
    g.fill();
  }
  for (const sp of land.spans) {
    g.beginPath();
    for (let x = sp.a; x <= sp.b; x += 0.5) g.lineTo(x * sx, toY(land.heights(x)));
    for (let x = sp.b; x >= sp.a; x -= 0.5) g.lineTo(x * sx, toY(Math.min(land.under(x), land.heights(x))));
    g.closePath();
    g.fillStyle = t.ground.dirt;
    g.fill();
  }
  // carve preview ops
  for (const op of land.ops) {
    g.fillStyle = op.type === 'sub' ? t.ground.dirtDark : t.ground.dirt;
    g.beginPath();
    g.ellipse(op.x * sx, toY(op.y), op.rx * sx, op.ry * sy, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.lineWidth = 4;
  g.strokeStyle = t.ground.grass;
  for (const sp of land.spans) {
    g.beginPath();
    for (let x = sp.a + 0.4; x <= sp.b - 0.4; x += 0.5) g.lineTo(x * sx, toY(land.heights(x)));
    g.stroke();
  }
  for (const bx of land.bases) {
    g.fillStyle = bx < WORLD.W / 2 ? TEAM[0].color : TEAM[1].color;
    g.strokeStyle = '#2b1a12';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(bx * sx, toY(land.heights(bx)) - 5, 5, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
  // hand-made maps: where the good spots are
  for (const s of land.spots || []) {
    const x = (s.range[0] + s.range[1]) / 2;
    if (s.kind === 'pad') {
      g.fillStyle = '#ff5a6e';
      g.beginPath();
      g.ellipse(x * sx, toY(land.heights(x)) - 1, 4, 3, 0, Math.PI, Math.PI * 2);
      g.fill();
      continue;
    }
    const y = s.floor != null ? toY(s.floor + 0.4) : s.top != null ? toY(s.top - 1.4) - 9 : toY(land.heights(x)) - 9;
    g.font = '11px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(infoOf(s).icon, x * sx, y);
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


// ---------------------------------------------------------------- friend matches (two phones)
function goLobby(pane) {
  screen = 'lobby';
  show('lobby');
  $('#hud').hidden = true;
  setPane(pane || (online ? 'room' : 'choose'));
  if (!game || !game.opts.demo) startDemo();
}

function setPane(p) {
  for (const id of ['choose', 'enter', 'room']) $('#lobby-' + id).hidden = id !== p;
  $('#lobby-title').textContent = p === 'room' ? (online && online.role === 'host' ? '내가 만든 방' : '친구의 방') : '친구와 대결';
  if (p === 'enter') setTimeout(() => $('#code-input').focus(), 60);
  if (p === 'room') renderRoom();
}

function lobbySettings() {
  return { theme: settings.theme, wind: settings.wind, timer: Number(settings.timer) || 0, bo: Number(settings.bo) || 1 };
}

function describe(ls) {
  if (!ls) return '';
  const map = ls.theme === 'random' ? '랜덤 전장' : THEMES[ls.theme] ? THEMES[ls.theme].name : '';
  const wind = { off: '바람 없음', normal: '바람 보통', strong: '강풍' }[ls.wind] || '';
  const timer = ls.timer ? `턴 ${ls.timer}초` : '턴 제한 없음';
  const bo = ls.bo > 1 ? `${ls.bo}판 ${Math.floor(ls.bo / 2) + 1}선승` : '단판';
  return [map, wind, timer, bo].filter(Boolean).join(' · ');
}

function saveSession() {
  try { sessionStorage.setItem('af.online', JSON.stringify({ code: online.code, role: online.role, t: Date.now() })); } catch (e) { /* private mode */ }
}

function savedSession() {
  try {
    const v = JSON.parse(sessionStorage.getItem('af.online') || 'null');
    return v && Date.now() - v.t < 20 * 60 * 1000 ? v : null;
  } catch (e) { return null; }
}

function renderRejoin() {
  const v = !online && savedSession();
  const b = $('#btn-rejoin');
  b.hidden = !v;
  if (v) b.textContent = `방 ${v.code}로 돌아가기`;
}

function openLink(role, code, resume) {
  leaveOnline(false);
  const o = new Online({ role, code, onEvent: (evt, data) => { if (o === online) onOnline(evt, data); } });
  online = o;
  o.resume = !!resume;
  saveSession();
  setPane('room');
  lobbyStatus(role === 'host' ? '방을 여는 중…' : '방을 찾는 중…');
  o.start().then(() => {
    if (o !== online) return;
    if (role === 'host') o.setLobby(lobbySettings());
    renderRoom();
  }).catch((e) => {
    if (o !== online) return;
    if (o.status === 'taken' && role === 'host' && !resume && hostTries++ < 4) { openLink('host', makeCode()); return; }
    if (o.status === 'taken' && resume && hostTries++ < 6) { setTimeout(() => { if (o === online) openLink(role, code, true); }, 2500); return; }
    console.warn('online link failed', e);
    lobbyStatus('연결할 수 없어요. 인터넷 연결을 확인하거나, 폰 하나로 번갈아 대결을 해 보세요.', true);
  });
}

function leaveOnline(bye = true) {
  if (!online) return;
  online.close(bye);
  online = null;
  try { sessionStorage.removeItem('af.online'); } catch (e) { /* ignore */ }
}

function lobbyStatus(text, bad) {
  const el = $('#lobby-status');
  el.textContent = text;
  el.classList.toggle('bad', !!bad);
}

function renderRoom() {
  if (!online) return;
  const host = online.role === 'host';
  const tiles = $('#code-tiles');
  tiles.innerHTML = '';
  for (const ch of online.code) {
    const t = document.createElement('b');
    t.textContent = ch;
    tiles.appendChild(t);
  }
  const mine = host ? 0 : 1;
  for (const i of [0, 1]) {
    const side = $('#vs-' + i);
    const c = side.querySelector('canvas');
    c.getContext('2d').clearRect(0, 0, c.width, c.height);
    const present = i === mine || online.paired;
    side.classList.toggle('empty', !present);
    side.style.setProperty('--team', TEAM[i].color);
    if (present) { try { Art.drawCaptainIcon(c, i); } catch (e) { /* art not ready */ } }
    side.querySelector('b').textContent = i === mine ? '나' : online.paired ? '친구' : '???';
  }
  $('#btn-room-setup').hidden = !host;
  const go = $('#btn-room-go');
  go.hidden = !host;
  go.disabled = !online.paired;
  const ls = host ? lobbySettings() : online.peer && online.peer.lobby;
  $('#lobby-rule').textContent = describe(ls);
  const st = online.status;
  if (st === 'paired') lobbyStatus(host ? '친구가 들어왔어요! 준비되면 시작하세요' : '연결됐어요! 방장이 시작하면 전투가 시작돼요');
  else if (st === 'waiting') lobbyStatus(host ? '친구를 기다리는 중… 코드를 알려주세요' : '방장을 기다리는 중…');
  else if (st === 'nohost') lobbyStatus('이 코드의 방을 찾고 있어요… 코드를 다시 확인해 주세요', true);
  else if (st === 'lost') lobbyStatus('친구 연결이 끊겼어요. 다시 들어오기를 기다리는 중…', true);
  else if (st === 'error') lobbyStatus('연결할 수 없어요. 인터넷 연결을 확인해 주세요', true);
}

function onOnline(evt, data) {
  switch (evt) {
    case 'status':
      if (data === 'taken' && online.role === 'host' && !online.match && !online.resume && hostTries++ < 4) { openLink('host', makeCode()); return; }
      if (data === 'paired') Sound.play('chitter', { vol: 0.8 });
      if (screen === 'lobby') renderRoom();
      syncNetLost();
      break;
    case 'peer':
      if (screen === 'lobby') renderRoom();
      syncNetLost();
      break;
    case 'match': {
      const { match, needSync } = data;
      const side = online.role === 'host' ? 0 : 1;
      tryFullscreen();
      startBattle({
        mode: 'online', side, names: side === 0 ? ['나', '친구'] : ['친구', '나'], seed: match.seed,
        theme: THEMES[match.theme] ? match.theme : 'oak', wind: match.wind, timer: match.timer,
        guide: settings.guide !== 'off', firstTurn: match.first, difficulty: 'normal',
      });
      online.attach(game, needSync);
      saveSession();
      break;
    }
    case 'emote':
      if (!EMOTES.includes(data)) break; // only our own six, never arbitrary text
      if (game && game.online) {
        const i = game.players.findIndex((p) => p.remote);
        game.showEmote(i, data);
        cardEmote(i, data);
        Haptics.emote();
      }
      break;
    case 'rematch-asked':
      if (screen === 'result') {
        const n = $('#rematch-note');
        n.textContent = online.mine.rm ? '곧 시작해요!' : '친구가 한 판 더 원해요!';
        n.hidden = false;
        Sound.play('select');
      }
      break;
    case 'pick':
      online.pickedTheme = THEMES[data] ? data : randomTheme();
      tryStartNextOnline();
      break;
    case 'rematch-go': {
      const ls = lobbySettings();
      let theme = ls.theme;
      if (theme === 'random') theme = THEME_ORDER[Math.floor(Math.random() * THEME_ORDER.length)];
      online.pendingNext = null;
      online.hostStart({ ...ls, theme });
      break;
    }
    case 'bye':
      if (screen === 'lobby') {
        lobbyStatus('친구가 방을 나갔어요', true);
      } else if (screen === 'battle' || screen === 'paused' || screen === 'result') {
        showNetLost('친구가 나갔어요', '대결이 끝났어요. 메뉴로 돌아가 새 방을 만들어 주세요.', false);
      }
      break;
  }
}

// connection trouble during a match
function syncNetLost() {
  if (!online || !game || !game.online || screen === 'title' || screen === 'lobby') { $('#netlost').hidden = true; return; }
  if (online.peer && online.peer.bye) return;
  const lost = online.status === 'lost' || online.status === 'error';
  if (lost) showNetLost('연결이 끊겼어요', '친구가 돌아오기를 기다리는 중…', true);
  else $('#netlost').hidden = true;
}

function showNetLost(title, sub, spin) {
  $('#netlost-title').textContent = title;
  $('#netlost-sub').textContent = sub;
  $('#netlost .spinner').hidden = !spin;
  $('#netlost').hidden = false;
}

async function shareCode() {
  if (!online) return;
  const code = online.code;
  const inClaude = !!(window.claude && window.claude.use);
  const web = WEB_URL || (/^https?:$/.test(location.protocol) && !inClaude ? `${location.origin}${location.pathname}` : '');
  const url = web ? `${web}?join=${code}` : '';
  const text = `도토리깡 한 판 붙자! 🐿️ '친구와 대결 → 방 들어가기'에서 코드 ${code}`;
  const native = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Share;
  if (isNativeApp() && native) {
    try {
      await native.share(url ? { title: '도토리깡', text, url, dialogTitle: '친구에게 코드 알려주기' } : { title: '도토리깡', text, dialogTitle: '친구에게 코드 알려주기' });
      return;
    } catch (e) { /* cancelled or unavailable: fall through */ }
  }
  try {
    if (navigator.share) {
      await navigator.share(url ? { title: '도토리깡', text, url } : { title: '도토리깡', text });
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(url ? `${text}\n${url}` : text);
    toast('초대 문구를 복사했어요');
  } catch (e) {
    toast(`코드: ${code}`);
  }
}

let toastT = null;
function toast(text) {
  const t = $('#toast');
  t.textContent = text;
  t.hidden = true;
  void t.offsetWidth;
  t.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => { t.hidden = true; }, 1900);
}

// the emote also pops beside the sender's HUD card, in case their captain is off-screen
function cardEmote(i, e) {
  const el = $('#pcard-' + i + ' .pemote');
  el.textContent = e;
  el.hidden = true;
  void el.offsetWidth;
  el.hidden = false;
  clearTimeout(el._t);
  el._t = setTimeout(() => (el.hidden = true), 2400);
}

function renderEmotes() {
  const pop = $('#emote-pop');
  if (pop.childElementCount) return;
  for (const e of EMOTES) {
    const b = document.createElement('button');
    b.textContent = e;
    b.addEventListener('click', () => {
      pop.hidden = true;
      if (!online || !game || !game.online || game.time - emoteT < 1) return;
      emoteT = game.time;
      online.sendEmote(e);
      const i = game.players.findIndex((p) => !p.remote);
      game.showEmote(i, e);
      cardEmote(i, e);
    });
    pop.appendChild(b);
  }
}

// ---------------------------------------------------------------- wiring
function bind() {
  const click = (sel, fn) => $(sel).addEventListener('click', (e) => {
    Sound.unlock();
    Haptics.tap();
    fn(e);
  });
  click('#btn-solo', () => { Sound.play('tap'); goSetup('cpu'); });
  click('#btn-duo', () => { Sound.play('tap'); goSetup('pvp'); });
  click('#btn-friend', () => { Sound.play('tap'); goLobby(); });
  click('#btn-rejoin', () => {
    const v = savedSession();
    if (!v) return;
    Sound.play('tap');
    goLobby('room');
    hostTries = 0;
    openLink(v.role, v.code, true);
  });
  click('#lobby-back', () => {
    Sound.play('back');
    const enter = !$('#lobby-enter').hidden;
    if (online || enter) { leaveOnline(); setPane('choose'); } else goTitle();
  });
  click('#btn-host', () => { Sound.play('tap'); hostTries = 0; openLink('host', makeCode()); });
  click('#btn-join', () => { Sound.play('tap'); $('#code-input').value = ''; setPane('enter'); });
  const joinGo = () => {
    const code = cleanCode($('#code-input').value);
    if (code.length !== 4) { Sound.play('deny'); $('#code-input').classList.add('shake'); setTimeout(() => $('#code-input').classList.remove('shake'), 400); return; }
    Sound.play('tap');
    $('#code-input').blur();
    openLink('guest', code);
  };
  click('#btn-join-go', joinGo);
  $('#code-input').addEventListener('input', (e) => {
    const v = cleanCode(e.target.value);
    if (e.target.value !== v) e.target.value = v;
  });
  $('#code-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { Sound.unlock(); joinGo(); } });
  click('#btn-share', () => { Sound.play('tap'); shareCode(); });
  click('#btn-room-setup', () => { Sound.play('tap'); goSetup('online'); });
  click('#btn-room-go', () => {
    if (!online || !online.paired) return;
    Sound.play('tap');
    let theme = settings.theme;
    if (theme === 'random') theme = THEME_ORDER[Math.floor(Math.random() * THEME_ORDER.length)];
    online.hostStart({ ...lobbySettings(), theme });
  });
  click('#btn-emote', () => {
    renderEmotes();
    Sound.play('tap', { vol: 0.5 });
    $('#emote-pop').hidden = !$('#emote-pop').hidden;
  });
  click('#btn-netlost-leave', () => { Sound.play('back'); leaveOnline(); goTitle(); });
  click('#btn-help', () => { Sound.play('tap'); renderHelpBirds(); show('help'); });
  click('#help-close', () => { Sound.play('back'); show('title'); });
  click('#help-x', () => { Sound.play('back'); show('title'); });
  click('#btn-settings', () => { Sound.play('tap'); syncToggles(); show('settings'); });
  click('#settings-close', () => { Sound.play('back'); show('title'); });
  click('#setup-back', () => { Sound.play('back'); if (mode === 'online') goLobby('room'); else goTitle(); });
  click('#btn-go', () => {
    if (mode === 'online') {
      Sound.play('tap');
      if (online) online.setLobby(lobbySettings());
      goLobby('room');
      return;
    }
    tryFullscreen();
    series = Number(settings.bo) === 3 ? { bo: 3, wins: [0, 0], round: 1 } : null;
    nextRound = null;
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
  click('#btn-home', () => { Sound.play('back'); leaveOnline(); goTitle(); });
  click('#btn-again', () => {
    Sound.play('tap');
    if (lastOpts.mode !== 'online') {
      if (nextRound) {
        const loser = nextRound.lastWinner < 0 ? -1 : 1 - nextRound.lastWinner;
        if (loser < 0 || (lastOpts.mode === 'cpu' && loser === 1)) startNextLocal(randomTheme()); // draws and the CPU pick at random
        else pickMap(`${lastOpts.mode === 'cpu' ? '' : `${loser + 1}P, `}다음 전장 고르기`, '진 쪽이 전장을 고르고 먼저 쏴요', (theme) => startNextLocal(theme));
        return;
      }
      series = Number(settings.bo) === 3 ? { bo: 3, wins: [0, 0], round: 1 } : null;
      startBattle({ ...lastOpts, seed: undefined, firstTurn: 0 });
      return;
    }
    if (!online || !online.paired) { toast('친구와 연결이 끊겼어요'); return; }
    if (online.pendingNext) {
      // I lost this round: I choose where we fight next
      pickMap('다음 전장 고르기', '진 쪽이 전장을 고르고 먼저 쏴요', (theme) => {
        show('result');
        $('#again-label').textContent = '곧 시작해요…';
        $('#btn-again').disabled = true;
        if (online.role === 'host') { online.pickedTheme = theme; tryStartNextOnline(); } else online.sendPick(theme);
      });
      return;
    }
    online.requestRematch();
    $('#again-label').textContent = '친구 기다리는 중…';
    $('#btn-again').disabled = true;
  });
  click('#pick-x', () => { Sound.play('back'); show('result'); });
  click('#btn-menu', () => { Sound.play('back'); leaveOnline(); goTitle(); });
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
    $('#emote-pop').hidden = true;
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
    if (!game.online) game.paused = true;
    game.cancelInput();
    releaseKeys();
    screen = 'paused';
    syncToggles();
    $('#pause-title').textContent = game.online ? '메뉴' : '일시정지';
    $('#pause-note').hidden = !game.online;
    $('#btn-home').lastChild.textContent = game.online ? '나가기' : '메뉴로';
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
  const join = cleanCode(new URLSearchParams(location.search).get('join') || '');
  if (join.length === 4) {
    goLobby('enter');
    $('#code-input').value = join;
  }
  requestAnimationFrame((t) => { last = t; frame(t); });
  setTimeout(() => $('#boot').classList.add('gone'), 150);
  if ('serviceWorker' in navigator && /^https:|^http:\/\/localhost/.test(location.href) && !window.claude) {
    try { navigator.serviceWorker.register('sw.js').catch(() => {}); } catch (e) { /* not available */ }
  }
}

// expose for debugging / automated checks
window.__af = { get game() { return game; }, get online() { return online; }, startBattle, buildOpts, goTitle };

boot();
