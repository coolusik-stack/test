// Two Game instances stand in for two phones: A fires, B replays A's shot message; both must end
// on the same snapshot. Covers every map, a crumbling crust, a pad bounce, the thin bridge and a
// spot's nut reward handed out the same on both sides.
import { MAPS } from './maps.mjs';

export default {
  name: 'lockstep',
  what: '두 폰 동기화: 모든 맵 + 땅 무너짐·트램펄린·다리·명당 보상',
  async run(t) {
    const page = await t.page();
    // a walnut next to a captain standing on a thin crust
    for (const theme of MAPS) {
      const r = await page.evaluate(async (theme) => {
        const { Game } = await import('./js/game.js');
        const { planShot } = await import('./js/ai.js');
        const mk = (side, emit) => { const cv = document.createElement('canvas'); cv.width = 844; cv.height = 390; return new Game(cv, { mode: 'online', side, theme, wind: 'normal', timer: 0, guide: false, seed: 31337 }, emit, { w: 844, h: 390, dpr: 1 }); };
        let msg = null;
        const A = mk(0, (e, d) => { if (e === 'net' && d.t === 'shot') msg = d; });
        const B = mk(1, () => {});
        for (const g of [A, B]) {
          const p = g.players[1], pos = p.body.getPosition();
          const top = g.terrain.surfaceY(pos.x);
          g.terrain.carve(pos.x - 0.6, top - 0.85 - 1.7, 1.7);
          g.loadSnapshot(g.snapshot());
          g.turn = 0; g.turnNo = 1; g.setState('aim');
        }
        A.players[0].ammo = { ...A.players[0].ammo, burr: 0, peanut: 0 };
        const plan = planShot(A, A.players[0], 'hard');
        A.players[0].sel = plan.type;
        A.launch(plan.power, plan.angle);
        B.netShot(msg);
        B.netGate = 1e9;
        const abT = plan.abilityAt != null ? Math.round(plan.abilityAt * 60) : -1;
        for (let i = 0; i < 60 * 8; i++) {
          if (i === abT) { A.activateAbility(false, false); B.activateAbility(false, true); }
          A._physicsStep(1 / 60, false); B._physicsStep(1 / 60, false);
        }
        return { same: JSON.stringify(A.snapshot(true)) === JSON.stringify(B.snapshot(true)), type: plan.type, hp: A.players.map((p) => Math.round(p.hp)), fell: A.players[1].fell };
      }, theme);
      t.check(r.same, `${theme}: phones disagree after a ${r.type}`);
      t.note(`${theme}: ${r.type} → hp ${r.hp.join(':')}${r.fell ? ', fell' : ''}`);
    }
    // drive (pads, the bridge, the summit), shoot from there, then the spot pays out
    for (const [theme, start, stop] of [['oak', 24.4, 99], ['night', 12.6, 99], ['maple', 30.0, 35.5], ['pine', 30.0, 34]]) {
      const r = await page.evaluate(async ({ theme, start, stop }) => {
        const { Game } = await import('./js/game.js');
        const { planShot } = await import('./js/ai.js');
        const pl = window.planck;
        const mk = (side, emit) => { const cv = document.createElement('canvas'); cv.width = 844; cv.height = 390; return new Game(cv, { mode: 'online', side, theme, wind: 'normal', timer: 0, guide: false, seed: 4711 }, emit, { w: 844, h: 390, dpr: 1 }); };
        let msg = null;
        const A = mk(0, (e, d) => { if (e === 'net' && d.t === 'shot') msg = d; });
        const B = mk(1, () => {});
        for (const g of [A, B]) {
          g.players[0].body.setPosition(pl.Vec2(start, g.terrain.surfaceY(start) + 0.76));
          g.loadSnapshot(g.snapshot());
          g.turn = 0; g.turnNo = 1; g.setState('aim');
        }
        const p = A.players[0];
        A.setMove(1);
        let flew = false;
        for (let i = 0; i < 60 * 6; i++) { A.update(1 / 60); if (p.padFlight) flew = true; if (flew && !p.padFlight) break; if (!flew && p.body.getPosition().x > stop) break; }
        A.setMove(0);
        for (let k = 0; k < 40; k++) A.update(1 / 60);
        const plan = planShot(A, p, 'hard');
        p.sel = plan.type;
        A.launch(plan.power, plan.angle);
        B.netShot(msg);
        B.netGate = 1e9;
        const abT = plan.abilityAt != null ? Math.round(plan.abilityAt * 60) : -1;
        for (let k = 0; k < 60 * 8; k++) {
          if (k === abT) { A.activateAbility(false, false); B.activateAbility(false, true); }
          A._physicsStep(1 / 60, false); B._physicsStep(1 / 60, false);
        }
        const same = JSON.stringify(A.snapshot(true)) === JSON.stringify(B.snapshot(true));
        for (const g of [A, B]) { g.turnNo = 3; g._spotReward(g.players[0]); }
        return { same, ammo: JSON.stringify(A.players[0].ammo) === JSON.stringify(B.players[0].ammo), flew, hp: p.hp };
      }, { theme, start, stop });
      t.check(r.same, `${theme} drive+shot: phones disagree`);
      t.check(r.ammo, `${theme}: the spot's nut reward differs between phones`);
      t.check(r.hp >= 99, `${theme}: getting there hurt (${r.hp})`);
    }
  },
};
