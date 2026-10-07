// 깡단 원정: twelve CPU stages through the year, three in each season, every stage on its own map,
// played in order. Each stage has three stars: win, win with half your health or more, and the
// stage's own challenge. Stars open the 깡단 옷장 (looks.js). Progress lives on the phone.
import { storage } from './util.js';
import { THEMES, SEASONS } from './levels.js';

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

// foe: the CPU captain's name; look: what it wears (the season bosses dress up)
export const STAGES = [
  { id: 'spring-1', season: 'spring', theme: 'oak', foe: '솔숲단 막내 솔솔', difficulty: 'easy', wind: 'off', goal: 'shots8', look: { hat: 'acorn' } },
  { id: 'spring-2', season: 'spring', theme: 'blossom', foe: '꽃잎 줍는 솔방', difficulty: 'easy', wind: 'normal', goal: 'acorn', look: { hat: 'leaf' } },
  { id: 'spring-3', season: 'spring', theme: 'mole', foe: '두더지 굴 수문장 솔이', difficulty: 'normal', wind: 'normal', goal: 'fall', look: { hat: 'leaf', cart: 'red' } },
  { id: 'summer-1', season: 'summer', theme: 'sunflower', foe: '해바라기 비탈 뜀박이', difficulty: 'normal', wind: 'off', goal: 'shots8', look: { hat: 'straw' } },
  { id: 'summer-2', season: 'summer', theme: 'night', foe: '반딧불 징검다리 길잡이', difficulty: 'normal', wind: 'normal', goal: 'hp80', look: { hat: 'mushroom', cart: 'sky' } },
  { id: 'summer-3', season: 'summer', theme: 'arch', foe: '하늘다리 대장 무지개솔', difficulty: 'normal', wind: 'strong', goal: 'fall', look: { hat: 'straw', cart: 'red', trail: 'leaf' } },
  { id: 'autumn-1', season: 'autumn', theme: 'maple', foe: '흙다리 지킴이', difficulty: 'normal', wind: 'normal', goal: 'acorn', look: { hat: 'acorn', cart: 'red' } },
  { id: 'autumn-2', season: 'autumn', theme: 'ginkgo', foe: '은행 참호 명사수', difficulty: 'hard', wind: 'off', goal: 'hits4', look: { hat: 'mushroom', cart: 'leaf' } },
  { id: 'autumn-3', season: 'autumn', theme: 'pine', foe: '소나무 절벽 대장 솔바람', difficulty: 'hard', wind: 'normal', goal: 'fall', look: { hat: 'pinecone', cart: 'leaf', trail: 'leaf' } },
  { id: 'winter-1', season: 'winter', theme: 'snowcliff', foe: '살얼음 썰매꾼', difficulty: 'hard', wind: 'normal', goal: 'shots8', look: { hat: 'pinecone', cart: 'sky' } },
  { id: 'winter-2', season: 'winter', theme: 'igloo', foe: '이글루 파수꾼', difficulty: 'hard', wind: 'normal', goal: 'hp80', look: { hat: 'mushroom', cart: 'sky', trail: 'star' } },
  { id: 'winter-3', season: 'winter', theme: 'aurora', foe: '솔숲단 큰대장 솔왕', difficulty: 'hard', wind: 'strong', goal: 'fall', look: { hat: 'crown', cart: 'gold', trail: 'star' }, boss: true },
];
export const MAX_STARS = STAGES.length * 3;
export const SEASON_ORDER = ['spring', 'summer', 'autumn', 'winter'];

// The first campaign had three stages on each of four maps; its stars carry over stage for stage.
const OLD_IDS = ['oak-1', 'oak-2', 'oak-3', 'maple-1', 'maple-2', 'maple-3', 'pine-1', 'pine-2', 'pine-3', 'night-1', 'night-2', 'night-3'];

export function stage(id) {
  return STAGES.find((s) => s.id === id) || null;
}

export function stageIndex(id) {
  return STAGES.findIndex((s) => s.id === id);
}

// '봄 1 · 도토리 숲'
export function stageName(s) {
  return `${SEASONS[s.season]} ${stageNumber(s)} · ${THEMES[s.theme].name}`;
}

export const stageNumber = (s) => Number(s.id.split('-')[1]);

// The three goals of a stage, in star order.
export function goals(s) {
  return [WIN, HALF, { id: s.goal, ...GOALS[s.goal] }];
}

export function progress() {
  const p = storage.get('af.campaign', null);
  const stars = {};
  if (p && p.stars && typeof p.stars === 'object') {
    const old = !STAGES.some((s) => s.id in p.stars) && OLD_IDS.some((id) => id in p.stars);
    STAGES.forEach((s, i) => {
      const v = p.stars[old ? OLD_IDS[i] : s.id];
      if (Array.isArray(v)) stars[s.id] = [0, 1, 2].map((k) => !!v[k]);
    });
    if (old) storage.set('af.campaign', { stars });
  }
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
  return { mode: 'cpu', difficulty: s.difficulty, theme: s.theme, wind: s.wind, timer: 0, guide: true, firstTurn: 0, flip: !!s.flip, campaign: s.id, foe: s.foe };
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
