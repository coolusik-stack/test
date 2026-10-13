// Maps built in floors: every side can start on any of its floors (the seed draws them, and both
// starts land on solid ground), the water on each floor finds its way down to the clouds, and a
// floor with another floor under it is thin: a nut landing next to a cart breaks it and drops the
// cart one floor (hurt, not knocked out).
import { MAPS } from './maps.mjs';

export default {
  name: 'floors',
  what: '층 맵: 출발층 뽑기 · 층마다 흐르는 물 · 얇은 층이 한 방에 깨져 한 층 아래로',
  async run(t) {
    const page = await t.page();
    const floored = await page.evaluate(async (maps) => {
      const { MAPS: defs } = await import('./js/maps.js');
      return maps.filter((m) => defs[m] && defs[m]().starts);
    }, MAPS);
    t.check(floored.length > 0, 'no map is built in floors');
    for (const theme of floored) {
      const r = await page.evaluate(async (theme) => {
        const { Game } = await import('./js/game.js');
        const { MAPS: defs } = await import('./js/maps.js');
        const def = defs[theme]();
        const mk = (o) => { const cv = document.createElement('canvas'); cv.width = 844; cv.height = 390; return new Game(cv, { mode: 'pvp', difficulty: 'normal', theme, wind: 'off', timer: 0, guide: false, seed: 5, flip: false, ...o }, () => {}, { w: 844, h: 390, dpr: 1 }); };
        const out = { starts: [], drawn: new Set(), water: [], drop: null };
        // every start of every side: the cart stands on that floor
        for (const side of [0, 1]) {
          for (let k = 0; k < def.starts[side].length; k++) {
            const g = mk({ starts: side ? [0, k] : [k, 0] });
            for (let i = 0; i < 60; i++) g.update(1 / 60);
            const p = g.players[side].body.getPosition(), want = def.starts[side][k];
            out.starts.push({ side, k, ok: Math.abs(p.x - want.x) < 1 && Math.abs(p.y - 0.75 - want.y) < 0.6, y: p.y, want: want.y });
          }
        }
        // the draw spreads over the floors
        for (let seed = 1; seed <= 40; seed++) { const g = mk({ seed }); out.drawn.add(g.land.startAt.join(',')); }
        out.drawn = out.drawn.size;
        // the water: every spring reaches the clouds
        const g = mk({ starts: [0, 0] });
        g.draw();
        for (const st of g.scene.streams) {
          const legs = st.path || [];
          const last = legs[legs.length - 1];
          out.water.push({ x: st.x, falls: legs.filter((l) => l.kind === 'fall').length, sea: !!(last && last.sea) });
        }
        // a thin floor breaks: the first non-home start that has a floor under it
        for (const side of [0, 1]) {
          for (let k = 0; k < def.starts[side].length && !out.drop; k++) {
            const st = def.starts[side][k];
            const g2 = mk({ starts: side ? [0, k] : [k, 0] });
            for (let i = 0; i < 60; i++) g2.update(1 / 60);
            const p = g2.players[side];
            const pos = p.body.getPosition();
            const th = g2.terrain.thicknessBelow(pos.x, pos.y - 0.7, 0.5);
            const below = g2.terrain.surfaceY(pos.x, pos.y - 0.75 - th - 0.3);
            if (!(th > 0 && th < 1.5) || below < 2) continue;
            // a nut slams into the floor a metre and a half away
            g2.turn = 1 - side;
            g2.state = 'flight';
            const P = g2._spawnProjectile('nut', 'acorn', (await import('./js/config.js')).AMMO.acorn, g2.players[1 - side], pos.x + 1.5, pos.y + 2.5, 0, -18);
            g2.lead = P;
            for (let i = 0; i < 60 * 6; i++) g2.update(1 / 60);
            const q = p.body.getPosition();
            out.drop = { theme, side, k, from: st.y, to: q.y - 0.75, below, hp: p.hp, dead: p.dead };
          }
        }
        return out;
      }, theme);
      for (const s of r.starts) t.check(s.ok, `${theme}: side ${s.side} start ${s.k} not on its floor (cart at ${s.y.toFixed(1)}, floor ${s.want})`);
      t.check(r.drawn >= 4, `${theme}: the draw only ever gave ${r.drawn} start pairs`);
      for (const w of r.water) t.check(w.sea && w.falls >= 2, `${theme}: the spring at x ${w.x} does not cascade to the clouds (${w.falls} falls)`);
      t.check(r.drop, `${theme}: no start stands on a thin floor over another floor`);
      if (r.drop) {
        const d = r.drop;
        t.check(!d.dead && d.to < d.from - 2, `${theme}: a hit next to the cart did not drop it a floor (from ${d.from} to ${d.to.toFixed(1)}${d.dead ? ', dead' : ''})`);
        t.check(d.hp > 40, `${theme}: dropping a floor hurt too much (hp ${d.hp.toFixed(0)})`);
        t.note(`${theme}: ${r.starts.length} starts, ${r.drawn} start pairs drawn, ${r.water.length} springs, a hit dropped the cart ${(d.from - d.to).toFixed(1)} m (hp ${d.hp.toFixed(0)})`);
      }
    }
  },
};
