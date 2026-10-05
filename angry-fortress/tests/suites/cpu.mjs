// A whole CPU-vs-CPU match on every map plays to the end (moves, pads, specials, falls, the
// rising clouds), drawing now and then so rendering is exercised too.
import { MAPS } from './maps.mjs';

export default {
  name: 'cpu',
  what: '맵마다 CPU끼리 한 판 끝까지',
  async run(t) {
    const page = await t.page();
    for (const theme of t.quick ? ['oak', 'night'] : MAPS) {
      const r = await page.evaluate(async ({ theme }) => {
        const { Game } = await import('./js/game.js');
        let s = 20241;
        Math.random = () => ((s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) ^ Math.imul(s ^ (s >>> 13), 0x297a2d39) ^ (s + 0x6d2b79f5)) >>> 0) / 4294967296; // same match every run
        const cv = document.createElement('canvas'); cv.width = 844; cv.height = 390;
        const g = new Game(cv, { mode: 'cpu', difficulty: 'hard', theme, wind: 'normal', timer: 0, guide: false, seed: 2024 }, () => {}, { w: 844, h: 390, dpr: 1 });
        g.players[0].isAI = true;
        let frames = 0;
        while (!g.over && frames < 60 * 60 * 12) {
          g.update(1 / 60);
          if (frames % 120 === 0) g.draw();
          frames++;
          if (g.stateT > 40) break;
        }
        return { over: !!g.over, turns: g.turnNo, hp: g.players.map((p) => Math.round(p.hp)), fell: g.players.some((p) => p.fell), state: g.state, stateT: g.stateT };
      }, { theme });
      t.check(r.over, `${theme}: match never ended (state ${r.state} for ${r.stateT.toFixed(0)}s, turn ${r.turns})`);
      t.note(`${theme}: ${r.turns} turns, hp ${r.hp.join(':')}${r.fell ? ', fall K.O.' : ''}`);
    }
  },
};
