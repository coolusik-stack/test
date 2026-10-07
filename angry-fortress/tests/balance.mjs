// Balance report: CPU vs CPU on every map, then a table of where the CPUs stood when they shot,
// what that spot dealt and took, pad trips, nut rewards, falls and who won. Who shoots first
// alternates, and so does which player gets which home (maps are not mirror images), so the report
// can tell one home's edge over the other (should be near 50%) from the first shooter's edge (the
// launch bar: under 70%).
//   npm run balance            6 matches per map
//   npm run balance -- 12      more matches, steadier numbers
//   npm run balance -- 48 --only=oak   one map (seeds differ from the full run's: --from=K starts at match K)
// Writes tests/output/balance.md (the weekly workflow posts it on the run page).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { serve } from './serve.mjs';
import { MAPS } from './suites/maps.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const N = +(process.argv[2] || 6);
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const from = +((process.argv.find((a) => a.startsWith('--from=')) || '').slice(7) || 0);
const server = await serve(join(here, '..'));
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(server.url + 'index.html');
await page.waitForFunction(() => window.__af && window.planck);

const md = [`### 도토리깡 balance — CPU vs CPU, ${N} matches per map`, ''];
for (const theme of MAPS.filter((m) => !only.length || only.includes(m))) {
  const r = await page.evaluate(async ({ theme, N, from }) => {
    const { Game } = await import('./js/game.js');
    const { spotsAt } = await import('./js/spots.js');
    const at = {}, deal = {}, take = {};
    let leftWins = 0, firstWins = 0, falls = 0, turns = 0, pads = 0, rewards = 0;
    for (let k = from; k < from + N; k++) {
      let s = 7919 * (k + 1);
      Math.random = () => ((s = Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) ^ Math.imul(s ^ (s >>> 13), 0x297a2d39) ^ (s + 0x6d2b79f5)) >>> 0) / 4294967296;
      const cv = document.createElement('canvas'); cv.width = 844; cv.height = 390;
      const g = new Game(cv, { mode: 'cpu', difficulty: ['hard', 'normal', 'easy'][k % 3], theme, wind: 'normal', timer: 0, guide: false, seed: 900 + k * 131, firstTurn: k % 2, flip: ((k >> 1) & 1) === 1 }, () => {}, { w: 844, h: 390, dpr: 1 });
      g.players[0].isAI = true;
      const spotOf = (p) => { const q = spotsAt(g.land, p.body.getPosition().x).find((x) => x.kind !== 'pad'); return q ? q.kind : 'open'; };
      let cur = null;
      const l0 = g.launch.bind(g);
      g.launch = (pw, an) => { const p = g.players[g.turn], q = g.players[1 - g.turn]; cur = { from: spotOf(p), to: spotOf(q), hp: q.hp, q }; at[cur.from] = (at[cur.from] || 0) + 1; return l0(pw, an); };
      const e0 = g.endTurn.bind(g);
      g.endTurn = () => {
        if (cur) {
          const d = cur.hp - Math.max(0, cur.q.hp) + (cur.q.fell ? 30 : 0);
          (deal[cur.from] ||= [0, 0])[0] += d; deal[cur.from][1]++;
          (take[cur.to] ||= [0, 0])[0] += d; take[cur.to][1]++;
          cur = null;
        }
        return e0();
      };
      const pj = g._padJump.bind(g); g._padJump = (p, pad) => { pads++; return pj(p, pad); };
      const sr = g._spotReward.bind(g); g._spotReward = (p) => { const b = JSON.stringify(p.ammo); sr(p); if (JSON.stringify(p.ammo) !== b) rewards++; };
      for (let f = 0; f < 60 * 60 * 12 && !g.over && g.stateT < 40; f++) g.update(1 / 60);
      const w = g.players[0].dead ? 1 : g.players[1].dead ? 0 : g.players[0].hp > g.players[1].hp ? 0 : 1;
      if (w === (g.flip ? 1 : 0)) leftWins++; // the map's left home, whoever had it
      if (w === k % 2) firstWins++;
      if (g.players.some((p) => p.fell)) falls++;
      turns += g.turnNo;
    }
    const per = (o) => Object.fromEntries(Object.entries(o).map(([k, [a, n]]) => [k, (a / n).toFixed(1)]));
    return { at, deal: per(deal), take: per(take), leftWins, firstWins, falls, turns: turns / N, pads, rewards };
  }, { theme, N, from });
  const kinds = Object.keys(r.at).sort((a, b) => r.at[b] - r.at[a]);
  md.push(`**${theme}** — first shooter wins ${r.firstWins}/${N} · left home wins ${r.leftWins}/${N} · falls ${r.falls} · avg ${r.turns.toFixed(1)} turns · pad trips ${r.pads} · spot rewards ${r.rewards}`, '');
  md.push('| shot from | shots | dealt / shot | taken / shot |', '|---|---|---|---|');
  for (const k of kinds) md.push(`| ${k} | ${r.at[k]} | ${r.deal[k] ?? '-'} | ${r.take[k] ?? '-'} |`);
  md.push('');
  console.log(`${theme}: first ${r.firstWins}/${N}, left home ${r.leftWins}/${N}, falls ${r.falls}, ${kinds.map((k) => `${k} ${r.at[k]}`).join(', ')}`);
}
await browser.close();
await server.close();
mkdirSync(join(here, 'output'), { recursive: true });
writeFileSync(join(here, 'output', 'balance.md'), md.join('\n') + '\n');
console.log('→ tests/output/balance.md');
