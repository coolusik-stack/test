// Drive both carts around every hand-made map, each from its own home (the two homes are not mirror
// images): every spot is reachable, every pad lands where it should, nothing gets stuck and nobody
// gets hurt on the way. A step is [target x, label, hint to expect, rides a pad?, 'once' = stop at
// the first landing].
const ROUTES = {
  oak: {
    0: [[16.4, 'tree', '도토리 명당'], [24, 'pad→cloud rock', '구름 바위', true, 'once'], [30, 'pad→meadow', null, true, 'once'], [41.0, 'hilltop', '언덕 꼭대기'], [10.0, 'home', null]],
    1: [[66, 'pad→cloud rock', '구름 바위', true, 'once'], [45, 'pad→shelf', null, true, 'once'], [41.0, 'hilltop', '언덕 꼭대기'], [61.0, 'home', null]],
  },
  blossom: {
    0: [[29.6, 'bottom', '벚꽃 명당'], [36, 'pad→petal isle', '꽃잎 섬', true, 'once'], [30, 'pad→left rim', null, true, 'once'], [9.0, 'home', null]],
    1: [[51.2, 'rim', '분지 전망대'], [29.6, 'bottom', '벚꽃 명당'], [36, 'pad→petal isle', '꽃잎 섬', true, 'once'], [50, 'pad→right rim', null, true, 'once'], [61.0, 'home', null]],
  },
  mole: {
    0: [[28.4, 'tunnel', '두더지 굴'], [10.6, 'out', null], [2, 'pad→top', '두더지 산 꼭대기', true, 'once'], [20, 'pad→home', null, true, 'once']],
    1: [[53.4, 'tree', '언덕 벚나무'], [30.0, 'down the ramp', '두더지 굴'], [61.0, 'up home', null], [66, 'pad→cloud rock', '구름 바위', true, 'once'], [40, 'pad→mountain top', '두더지 산 꼭대기', true, 'once'], [50, 'pad→terrace', null, true, 'once'], [61.0, 'home', null]],
  },
  sunflower: {
    0: [[53.0, 'downhill', '느티나무 그늘'], [9.0, 'uphill home', null]],
    1: [[53.0, 'tree', '느티나무 그늘'], [66, 'pad→sky isle', '해바라기 구름섬', true, 'once'], [50, 'pad→home', null, true, 'once'], [66, 'pad→sky isle', '해바라기 구름섬', true, 'once'], [30, 'pad→slope', null, true, 'once'], [61.0, 'home', null]],
  },
  night: {
    0: [[20, 'pad→stone', '반딧불 섬', true, 'once'], [30, 'pad→firefly stone', null, true, 'once'], [31.5, 'tree', '반딧불 명당'], [20, 'pad→home', null, true, 'once']],
    1: [[50, 'pad→low stone', null, true, 'once'], [40, 'pad→firefly stone', null, true, 'once'], [31.5, 'tree', '반딧불 명당'], [45, 'pad→home', null, true, 'once']],
  },
  arch: {
    0: [[26, 'pad→arch', '무지개 꼭대기', true, 'once'], [30, 'pad→home', null, true, 'once']],
    1: [[56.0, 'tree', '여름 그늘'], [45, 'pad→arch', '무지개 꼭대기', true, 'once'], [50, 'pad→field', null, true, 'once']],
  },
  maple: {
    0: [[5, 'pad→sky stone', '단풍 구름섬', true, 'once'], [45, 'pad→right side', null, true, 'once'], [46.0, 'tree', '단풍 명당'], [35.0, 'bridge', '흙다리'], [26.6, 'bluff', '벼랑 전망대'], [10.0, 'home', null]],
    1: [[66, 'pad→sky stone', '단풍 구름섬', true, 'once'], [25, 'pad→left rim', null, true, 'once'], [26.6, 'bluff', '벼랑 전망대'], [35.0, 'bridge', '흙다리'], [46.0, 'tree', '단풍 명당'], [61.6, 'home', null]],
  },
  ginkgo: {
    0: [[5, 'pad→bunker roof', '벙커 지붕', true, 'once'], [25, 'pad→ridge', '은행 봉우리', true, 'once'], [35.0, 'into the bunker', '골짜기 벙커'], [9.6, 'home', null]],
    1: [[66, 'pad→bunker roof', '벙커 지붕', true, 'once'], [45, 'pad→ridge', '은행 명당', true, 'once'], [35.0, 'into the bunker', '골짜기 벙커'], [61.0, 'home', null]],
  },
  pine: {
    0: [[23.0, 'edge', '벼랑 끝'], [10.2, 'home', null]],
    1: [[31.8, 'tree', '절벽 밑 소나무'], [20, 'pad→plateau', null, true, 'once']],
  },
  snowcliff: {
    0: [[21.0, 'edge', '살얼음 벼랑 끝'], [24, 'pad→floe', null, true, 'once'], [35, 'pad→right island', null, true, 'once'], [40.7, 'tree', '눈꽃 명당'], [30, 'pad→floe', null, true, 'once'], [20, 'pad→left island', null, true, 'once'], [10.0, 'home', null]],
    1: [[40.7, 'tree', '눈꽃 명당'], [30, 'pad→floe', null, true, 'once'], [20, 'pad→left island', null, true, 'once'], [21.0, 'edge', '살얼음 벼랑 끝'], [24, 'pad→floe', null, true, 'once'], [35, 'pad→right island', null, true, 'once'], [61.0, 'home', null]],
  },
  igloo: {
    0: [[22.0, 'cornice', '눈처마 끝'], [9.6, 'home', null]],
    1: [[66, 'pad→ice rock', '얼음 바위', true, 'once'], [45, 'pad→field', null, true, 'once'], [50.0, 'igloo', '이글루'], [25.0, 'under the cornice', null], [61.0, 'home', null], [66, 'pad→ice rock', '얼음 바위', true, 'once'], [30, 'pad→left shelf', null, true, 'once'], [22.0, 'cornice', '눈처마 끝']],
  },
  aurora: {
    0: [[17.4, 'tree', '눈꽃 명당'], [29.0, 'under the ice eave', '얼음 처마 밑'], [33.0, 'on the ice', null], [8.4, 'home', null]],
    1: [[67, 'pad→eave top', '오로라 처마', true, 'once'], [40, 'pad→home', null, true, 'once'], [29.0, 'under the ice eave', '얼음 처마 밑'], [62.0, 'up home', null]],
  },
};

export default {
  name: 'walk',
  what: '모든 맵, 양쪽 집에서 명당·트램펄린을 수레로 돌기',
  async run(t) {
    const page = await t.page();
    for (const [theme, sides] of Object.entries(ROUTES)) {
      for (const who of [0, 1]) {
        await page.evaluate((theme) => window.__af.startBattle({ mode: 'pvp', difficulty: 'normal', theme, wind: 'off', timer: 0, guide: true, seed: 777, flip: false }), theme);
        await page.waitForFunction(() => { const g = window.__af.game; return g && g.state === 'aim'; }, null, { timeout: 15000 });
        for (const [target, label, hint, pad, once] of sides[who]) {
          const r = await page.evaluate(({ target, once, who }) => {
            const g = window.__af.game, p = g.players[who];
            g.turn = who;
            p.stamina = 1e9;
            const hints = [];
            const e0 = g.emit, j0 = g._padJump;
            g.emit = (e, d) => { if (e === 'spot' && d) hints.push(d.text); e0(e, d); };
            let aim = null;
            g._padJump = function (pl, pad) { aim = pad.to; return j0.call(this, pl, pad); };
            g.setMove(Math.sign(target - p.body.getPosition().x));
            let flew = false, still = 0, lx = -1;
            for (let i = 0; i < 60 * 30; i++) {
              g.update(1 / 60);
              if (p.padFlight) flew = true;
              if (once && flew && !p.padFlight) break; // landed from the bounce: that's the trip
              const x = p.body.getPosition().x;
              if (!p.padFlight && (Math.abs(x - target) < 0.25 || !p.moveDir)) break;
              still = Math.abs(x - lx) < 0.004 ? still + 1 : 0;
              lx = x;
              if (still > 90) break;
            }
            g.setMove(0);
            for (let k = 0; k < 90; k++) g.update(1 / 60);
            g.emit = e0;
            g._padJump = j0;
            const pos = p.body.getPosition();
            return { x: pos.x, y: pos.y, hp: p.hp, dead: p.dead, flew, stuck: still > 90, hints, aim };
          }, { target, once: once === 'once', who });
          const where = `${theme} ${who ? 'right' : 'left'} ${label}`;
          t.check(!r.dead, `${where}: the cart died`);
          t.check(!r.stuck, `${where}: stuck at x ${r.x.toFixed(1)}`);
          t.check(r.hp >= 95, `${where}: lost health on the way (${r.hp.toFixed(0)})`);
          if (pad) t.check(r.flew, `${where}: never bounced off a pad (at x ${r.x.toFixed(1)})`);
          // a bounce comes down where its pad aims (not on a ledge's edge, a tree or the rock above)
          if (pad && r.aim) t.check(Math.abs(r.x - r.aim.x) < 1.6 && Math.abs(r.y - r.aim.y - 0.75) < 1.2, `${where}: landed at (${r.x.toFixed(1)}, ${r.y.toFixed(1)}), aimed at (${r.aim.x}, ${r.aim.y})`);
          if (!pad && !once) t.check(Math.abs(r.x - target) < 1.2, `${where}: stopped at x ${r.x.toFixed(1)}, short of ${target}`);
          if (hint) t.check(r.hints.some((h) => h.includes(hint)), `${where}: no "${hint}" hint (${r.hints.join(' / ')})`);
        }
        await t.shot(page, `${theme}-${who ? 'right' : 'left'}`);
      }
    }
  },
};
