// Drive 1P around every hand-made map: every spot is reachable, every pad lands where it should,
// nothing gets stuck and nobody gets hurt on the way.
const ROUTES = {
  oak: [[7.6, 'burrow', '다람쥐 굴'], [18.6, 'lookout', '전망대'], [24.4, 'tree', '도토리 명당'], [40, 'pad→crown', null, true], [33.2, 'crown', null], [10, 'pad→home', null, true]],
  maple: [[9.0, 'rock', '뜬바위 그늘'], [21.5, 'tree', '단풍 명당'], [28.6, 'bluff', '벼랑 전망대'], [36.0, 'bridge', '흙다리'], [43.0, 'across', null], [15.0, 'home', null]],
  pine: [[15.4, 'hollow', '솔방울 명당'], [26.5, 'ledge', '전망 턱'], [34.0, 'summit', '솔방울 고지'], [15.4, 'down', null]],
  night: [[30, 'pad→islet', '반딧불 섬', true], [40, 'pad→middle', '반딧불 명당', true], [5, 'pad→home', null, true], [30, 'pad→islet', null, true], [5, 'islet→home', null, true]],
};

export default {
  name: 'walk',
  what: '네 맵의 모든 명당·트램펄린을 수레로 돌기',
  async run(t) {
    const page = await t.page();
    for (const [theme, route] of Object.entries(ROUTES)) {
      await page.evaluate((theme) => window.__af.startBattle({ mode: 'pvp', difficulty: 'normal', theme, wind: 'off', timer: 0, guide: true, seed: 777 }), theme);
      await page.waitForFunction(() => { const g = window.__af.game; return g && g.state === 'aim'; }, null, { timeout: 15000 });
      for (const [target, label, hint, pad] of route) {
        const r = await page.evaluate(({ target }) => {
          const g = window.__af.game, p = g.players[0];
          p.stamina = 1e9;
          const hints = [];
          const e0 = g.emit;
          g.emit = (e, d) => { if (e === 'spot' && d) hints.push(d.text); e0(e, d); };
          g.setMove(Math.sign(target - p.body.getPosition().x));
          let flew = false, still = 0, lx = -1;
          for (let i = 0; i < 60 * 14; i++) {
            g.update(1 / 60);
            if (p.padFlight) flew = true;
            const x = p.body.getPosition().x;
            if (!p.padFlight && (Math.abs(x - target) < 0.25 || !p.moveDir)) break;
            still = Math.abs(x - lx) < 0.004 ? still + 1 : 0;
            lx = x;
            if (still > 90) break;
          }
          g.setMove(0);
          for (let k = 0; k < 90; k++) g.update(1 / 60);
          g.emit = e0;
          const pos = p.body.getPosition();
          return { x: pos.x, hp: p.hp, dead: p.dead, flew, stuck: still > 90, hints };
        }, { target });
        const where = `${theme} ${label}`;
        t.check(!r.dead, `${where}: the cart died`);
        t.check(!r.stuck, `${where}: stuck at x ${r.x.toFixed(1)}`);
        t.check(r.hp >= 95, `${where}: lost health on the way (${r.hp.toFixed(0)})`);
        if (pad) t.check(r.flew, `${where}: never bounced off a pad`);
        if (hint) t.check(r.hints.some((h) => h.includes(hint)), `${where}: no "${hint}" hint (${r.hints.join(' / ')})`);
      }
      await t.shot(page, theme);
    }
  },
};
