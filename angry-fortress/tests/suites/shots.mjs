// From its start, a CPU that does not move can still hit the other start on every map (nothing of
// your own, a rock or a tree, blocks the lanes out of the start).
import { MAPS } from './maps.mjs';

export default {
  name: 'shots',
  what: '출발점에서 상대 출발점을 맞힐 수 있음',
  async run(t) {
    const page = await t.page();
    const tries = 4;
    for (const theme of MAPS) {
      const hits = await page.evaluate(async ({ theme, tries }) => {
        const { Game } = await import('./js/game.js');
        let hits = 0;
        for (let k = 0; k < tries; k++) {
          // the CPU's aim wobble comes from Math.random: seed it so the test says the same every run
          let s = 0x9e3779b9 ^ (k * 2654435761);
          Math.random = () => ((s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) ^ Math.imul(s ^ (s >>> 13), 0x297a2d39) ^ (s + 0x6d2b79f5)) >>> 0) / 4294967296;
          const cv = document.createElement('canvas'); cv.width = 844; cv.height = 390;
          const g = new Game(cv, { mode: 'cpu', difficulty: 'hard', theme, wind: 'off', timer: 0, guide: false, seed: 300 + k }, () => {}, { w: 844, h: 390, dpr: 1 });
          g.players[0].isAI = true;
          const q = g.players[1];
          let i = 0;
          for (; i < 600 && !(g.state === 'ai-think' && g.turn === 0); i++) g.update(1 / 60);
          g.aiMoved = true; // shoot from where it stands
          const hp0 = q.hp;
          for (; i < 60 * 30 && g.turn === 0; i++) g.update(1 / 60);
          if (q.hp < hp0 - 1) hits++;
        }
        return hits;
      }, { theme, tries });
      t.check(hits * 2 >= tries, `${theme}: only ${hits}/${tries} start-to-start shots landed`);
      t.note(`${theme} ${hits}/${tries}`);
    }
  },
};
