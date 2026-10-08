// Trees and stumps need ground under them: blast the earth out from under a tree and it falls
// (no trunk left standing in the air), and a stump whose ground goes crumbles away instead of
// floating. Both phones see the same: the forest state is part of the lockstep snapshot.
export default {
  name: 'rooted',
  what: '땅이 사라지면 나무가 쓰러지고 그루터기도 공중에 남지 않음',
  async run(t) {
    const page = await t.page();
    const r = await page.evaluate(async () => {
      const { Game } = await import('./js/game.js');
      const { AMMO } = await import('./js/config.js');
      const cv = document.createElement('canvas'); cv.width = 844; cv.height = 390;
      const g = new Game(cv, { mode: 'pvp', theme: 'oak', wind: 'off', timer: 0, guide: false, seed: 5, flip: false }, () => {}, { w: 844, h: 390, dpr: 1 });
      for (let i = 0; i < 120; i++) g.update(1 / 60);
      const tree = g.forest.trees[0];
      const step = (n) => { for (let i = 0; i < n; i++) g.update(1 / 60); };
      // 1) knock the tree down with a hit to the trunk, ground untouched: a stump stays
      g.forest.damageTree(tree, 9999, tree.x - 2);
      step(30);
      const stumpAfterFell = g.forest.stumps.length;
      // 2) blow the ground out from under the stump: it must not float
      for (const dx of [-1.2, 0, 1.2]) { g.state = 'flight'; g.blastQueue.push({ x: tree.x + dx, y: tree.ground - 1.0, spec: AMMO.burr.blast, owner: g.players[0], kind: 'burr' }); step(20); }
      step(60);
      const floating = g.forest.stumps.filter((s) => !g.terrain.solid(s.x, s.ground - 0.3)).length;
      const snap = g.forest.state().t[0];
      // 3) a fresh match: blow the ground from under a standing tree
      const h = new Game(cv, { mode: 'pvp', theme: 'oak', wind: 'off', timer: 0, guide: false, seed: 5, flip: false }, () => {}, { w: 844, h: 390, dpr: 1 });
      for (let i = 0; i < 120; i++) h.update(1 / 60);
      const t2 = h.forest.trees[0];
      for (const dx of [-1.2, 0, 1.2]) { h.state = 'flight'; h.blastQueue.push({ x: t2.x + dx, y: t2.ground - 1.0, spec: AMMO.burr.blast, owner: h.players[0], kind: 'burr' }); for (let i = 0; i < 20; i++) h.update(1 / 60); }
      for (let i = 0; i < 60; i++) h.update(1 / 60);
      return { stumpAfterFell, floating, snap, standing: !t2.dead, stumps2: h.forest.stumps.filter((s) => !h.terrain.solid(s.x, s.ground - 0.3)).length };
    });
    t.check(r.stumpAfterFell === 1, `a felled tree on solid ground should leave a stump (${r.stumpAfterFell})`);
    t.check(r.floating === 0, `${r.floating} stump(s) left floating after the ground went`);
    t.check(r.snap[2] === 2, `the snapshot should say the stump is gone (${JSON.stringify(r.snap)})`);
    t.check(!r.standing, 'a tree with the ground blown out from under it is still standing');
    t.check(r.stumps2 === 0, 'a tree that fell for lack of ground left a floating stump');
  },
};
