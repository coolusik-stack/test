// 깡단 원정: twelve CPU stages, three on each of the four maps, played in order. Each stage has
// three stars: win, win with half your health or more, and the stage's own challenge. Stars open
// the 깡단 옷장 (looks.js). Progress lives on the phone.
import { storage } from './util.js';
import { THEMES } from './levels.js';

const WIN = { id: 'win', text: '이기기' };
const HALF = { id: 'hp50', text: '체력 50 이상 남기고 이기기', test: (r, me) => me.hp >= 50 };
const GOALS = {
  fall: { text: '구름 아래로 떨어뜨려 이기기', test: (r, me, foe) => foe.fell },
  acorn: { text: '특수 견과 없이 도토리만으로 이기기', test: (r, me) => !me.specials },
  hp80: { text: '체력 80 이상 남기고 이기기', test: (r, me) => me.hp >= 80 },
  shots6: { text: '6번 안에 쏴서 이기기', test: (r, me) => me.shots <= 6 },
  shots8: { text: '8번 안에 쏴서 이기기', test: (r, me) => me.shots <= 8 },
  hits4: { text: '4번 이상 명중시키고 이기기', test: (r, me) => me.hits >= 4 },
};

// foe: the CPU captain's name; look: what it wears (the bosses dress up)
export const STAGES = [
  { id: 'oak-1', theme: 'oak', foe: '솔숲단 막내 솔솔', difficulty: 'easy', wind: 'off', goal: 'shots8', look: { hat: 'acorn' } },
  { id: 'oak-2', theme: 'oak', foe: '솔숲단 정찰병 솔방', difficulty: 'easy', wind: 'normal', goal: 'acorn', look: { hat: 'leaf' } },
  { id: 'oak-3', theme: 'oak', foe: '도토리 숲 수문장 솔이', difficulty: 'normal', wind: 'normal', goal: 'fall', look: { hat: 'leaf', cart: 'red' } },
  { id: 'maple-1', theme: 'maple', foe: '단풍 협곡 뜀박이', difficulty: 'normal', wind: 'off', goal: 'fall', look: { hat: 'mushroom' } },
  { id: 'maple-2', theme: 'maple', foe: '흙다리 지킴이', difficulty: 'normal', wind: 'normal', goal: 'hp80', look: { hat: 'acorn', cart: 'red' } },
  { id: 'maple-3', theme: 'maple', foe: '단풍 협곡 대장 붉은솔', difficulty: 'normal', wind: 'strong', goal: 'shots8', look: { hat: 'mushroom', cart: 'red', trail: 'leaf' } },
  { id: 'pine-1', theme: 'pine', foe: '솔방울 굴리기 선수', difficulty: 'normal', wind: 'normal', goal: 'acorn', look: { hat: 'pinecone' } },
  { id: 'pine-2', theme: 'pine', foe: '고지의 명사수', difficulty: 'hard', wind: 'off', goal: 'hits4', look: { hat: 'straw', cart: 'sky' } },
  { id: 'pine-3', theme: 'pine', foe: '소나무 언덕 대장 솔바람', difficulty: 'hard', wind: 'normal', goal: 'fall', look: { hat: 'pinecone', cart: 'leaf', trail: 'leaf' } },
  { id: 'night-1', theme: 'night', foe: '반딧불 길잡이', difficulty: 'normal', wind: 'normal', goal: 'shots8', look: { hat: 'straw' } },
  { id: 'night-2', theme: 'night', foe: '버섯 섬 파수꾼', difficulty: 'hard', wind: 'normal', goal: 'hp80', look: { hat: 'mushroom', cart: 'sky', trail: 'star' } },
  { id: 'night-3', theme: 'night', foe: '솔숲단 큰대장 솔왕', difficulty: 'hard', wind: 'strong', goal: 'fall', look: { hat: 'crown', cart: 'gold', trail: 'star' }, boss: true },
];
export const MAX_STARS = STAGES.length * 3;

export function stage(id) {
  return STAGES.find((s) => s.id === id) || null;
}

export function stageIndex(id) {
  return STAGES.findIndex((s) => s.id === id);
}

export function stageName(s) {
  const n = Number(s.id.split('-')[1]);
  return `${THEMES[s.theme].name} ${n}`;
}

// The three goals of a stage, in star order.
export function goals(s) {
  return [WIN, HALF, { id: s.goal, ...GOALS[s.goal] }];
}

export function progress() {
  const p = storage.get('af.campaign', null);
  const stars = {};
  if (p && p.stars && typeof p.stars === 'object') for (const s of STAGES) { const v = p.stars[s.id]; if (Array.isArray(v)) stars[s.id] = [0, 1, 2].map((i) => !!v[i]); }
  return { stars };
}

export function starCount(prog, id) {
  const v = prog.stars[id];
  return v ? v.filter(Boolean).length : 0;
}

export function totalStars(prog = progress()) {
  return STAGES.reduce((n, s) => n + starCount(prog, s.id), 0);
}

// A stage is open once the one before it has been won.
export function isOpen(prog, i) {
  return i === 0 || starCount(prog, STAGES[i - 1].id) > 0;
}

// The battle options for a stage (main.js adds the player's own look).
export function battleOpts(s) {
  return { mode: 'cpu', difficulty: s.difficulty, theme: s.theme, wind: s.wind, timer: 0, guide: true, firstTurn: 0, campaign: s.id, foe: s.foe };
}

// Which of the stage's goals this result met (only a win earns any), and the stars it adds.
export function judge(s, r) {
  const me = r.players[0], foe = r.players[1];
  const won = r.winner === 0;
  const met = goals(s).map((g) => won && (!g.test || !!g.test(r, me, foe)));
  const prog = progress();
  const before = totalStars(prog);
  const old = prog.stars[s.id] || [false, false, false];
  prog.stars[s.id] = old.map((v, i) => v || met[i]);
  storage.set('af.campaign', prog);
  const after = totalStars(prog);
  return { met, best: prog.stars[s.id], before, after, gained: after - before };
}
