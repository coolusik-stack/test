// The hand-made maps. Every spot means something (see spots.js) and the shapes stay put from match
// to match so players can learn them; only small things vary (wind, fort design, decor).
//
// Each map is drawn whole, left to right: the two homes are not mirror images. They start at
// different heights on different ground, and each side pays for what it has in another currency
// (height costs ground under you or cover; cover costs reach; nuts cost a drive). Which player gets
// which home is down to the draw (terrain.js flips the map), and every map keeps one idea:
//   도토리 숲 a hill · 벚꽃 분지 a bowl · 두더지 굴 산 a tunnel · 해바라기 비탈 a tilted island ·
//   반딧불 징검다리 stepping stones · 무지개 하늘다리 a rock arch in the sky · 단풍 협곡 a bridge ·
//   은행나무 참호 trenches · 소나무 절벽 a cliff · 살얼음 두 섬 two islands · 이글루 눈처마 an
//   overhang and an igloo · 오로라 호수 thin lake ice
// Nothing stands in the exact middle just for show, and no map stacks more than one or two kinds
// of spot.
//
// Every map is also built in floors, like 반딧불 징검다리: a floating rock (or a floe, or an eave)
// sits a floor above or below the ground, reached by a mushroom pad, so where you shoot from is a
// choice and not only your start. A floor up sees further and shoots down over cover but stands on
// thin rock in plain view; under an eave the roof stops lobs. These rocks keep to the middle band,
// 13 m or more from either start, so neither home's own lobs clip one, and they hang between the
// lob paths rather than across all of them.
//
// A map is a function returning the battlefield (world width 72 m, x from left to right):
//   top      the grass line as [x, y] points joined by cosine curves (between islands it is unused)
//   flat     [a, b] stretches kept free of the little random bumps (spots, roads, slopes to drive)
//   islands  [{ a, b, under: [[x, y]…], calm? }] each island's rocky underside (calm: less jagged)
//   bases    where the two carts start: team 0 on the left, team 1 on the right
//   forts    [{ back, facing }] for team 0 and team 1
//   ops      lumps and crags ('add') and carves ('sub'), as ellipses
//   spots    see spots.js; team 0 = the left home's, 1 = the right home's, -1 = anyone's
//   features { trees, crates }; backs: hollows drawn filled in while their roof stands
// Slopes a cart has to drive up stay at about 1:2 or gentler (steeper ones read as walls).

// a crag hanging under an island: a lump with a smaller tip under it (s scales it). Its top should
// sit well inside the island (about 0.7 m above the underside) so the two read as one rock.
const crag = (x, y, s = 1) => [
  { type: 'add', x, y, rx: 0.9 * s, ry: 1.5 * s },
  { type: 'add', x: x + 0.3 * s, y: y - 1.35 * s, rx: 0.45 * s, ry: 0.85 * s },
];
// a tree standing on the field (see obstacles.js); room is the clear ground it keeps around it
const tree = (x, kind, o = {}) => ({ x, kind, h: 4.6, canopyR: 1.9, nuts: 5, hive: false, web: false, room: 1.4, ...o });
// a row of circles carving a passage a cart drives through, floor at `floor`, r high
const passage = (x0, x1, floor, r, step = 0.4) => {
  const ops = [];
  for (let x = x0; x <= x1 + 1e-6; x += step) ops.push({ type: 'sub', x, y: floor + r, rx: r, ry: r });
  return ops;
};
// a floating rock ledge: a flat top at `top`, w wide, about `deep` thick in the middle, and a small
// crag hanging under it at `crag` (an x, or null for a clean underside to shelter under)
const ledge = (cx, top, w, { deep = 2.2, crag: cx2 = cx + w * 0.12 } = {}) => {
  const r = 0.6, ops = [];
  for (let x = cx - w / 2 + r; x <= cx + w / 2 - r + 1e-6; x += 0.3) ops.push({ type: 'add', x, y: top - r, rx: r, ry: r });
  ops.push({ type: 'add', x: cx, y: top - deep / 2 - 0.2, rx: w / 2 - 0.3, ry: deep / 2 + 0.1 });
  if (cx2 != null) ops.push(...crag(cx2, top - deep + 0.4, 0.7));
  return ops;
};
// the spot fields that pin a spot to a ledge's top (and not the ground under it)
const on = (top) => ({ top: top + 1, band: [top - 0.8, top + 1.6] });
// …and to the ground under one (not its top)
const below = (ground) => ({ band: [ground - 0.8, ground + 1.6] });
// a snow dome with a room inside and a low door on each side; the road runs through it
const igloo = (cx, ground) => {
  const ops = [{ type: 'add', x: cx, y: ground, rx: 3.4, ry: 4.5 }];
  for (let x = cx - 3.6; x <= cx + 3.6 + 1e-6; x += 0.4) {
    const r = Math.abs(x - cx) <= 1.2 ? 1.3 : 1.15; // room 2.6 m high, doors 2.3 m
    ops.push({ type: 'sub', x, y: ground + r, rx: r, ry: r });
  }
  return ops;
};

export const MAPS = {
  // 도토리 숲 (spring) — one hill between you. The first map, with nothing to learn but the hill:
  // a meadow and a round hill off to the right. Left home: low meadow, deep ground and an acorn
  // tree a short drive out (a nut every turn). Right home: a shelf on the hill's shoulder, 1.4 m
  // higher and much nearer the top, on thinner ground. The hilltop (lookout) is anyone's, and a
  // cloud rock floats a floor above it (pads from the meadow and from behind the right home).
  oak: () => ({
    top: [[2.2, 10.6], [3.4, 12.2], [18.4, 12.2], [24.0, 12.8], [30.0, 15.0], [38.6, 17.0], [43.4, 17.0], [48.4, 14.8], [52.0, 13.6], [68.4, 13.6], [69.6, 11.8]],
    flat: [[3.4, 18.4], [38.6, 43.4], [52.0, 68.4]],
    islands: [{
      a: 2.3, b: 69.7,
      under: [[2.3, 10.8], [3.6, 9.0], [8, 8.2], [14, 7.8], [20, 7.6], [26, 7.0], [32, 6.2], [38, 5.8], [43, 6.0], [48, 7.6], [53, 9.8], [58, 10.5], [64, 10.6], [68.4, 10.8], [69.7, 12.0]],
    }],
    bases: [11.0, 61.0],
    forts: [{ back: 4.4, facing: 1 }, { back: 67.6, facing: -1 }],
    ops: [
      ...crag(6.2, 7.8), ...crag(24.0, 6.4), ...crag(40.6, 4.8, 1.3), ...crag(56.4, 9.6, 0.8),
      ...ledge(35.4, 23.8, 6.0), // 구름 바위, a floor above the hilltop
    ],
    spots: [
      { kind: 'tree', team: 0, range: [15.2, 17.6], sign: 14.4, label: { name: '도토리 명당', desc: '내 차례가 시작될 때마다 특수 견과 +1' } },
      { kind: 'high', team: -1, range: [39.0, 43.0], sign: null, signs: [38.4, 43.6], label: { name: '언덕 꼭대기', desc: '조준선이 두 배로 길어져요. 양쪽에서 다 보여요' } },
      { kind: 'pad', team: 0, range: [19.4, 20.2], dir: 1, to: { x: 34.8, y: 23.8 }, apex: 26.6 },
      { kind: 'pad', team: 1, range: [64.4, 65.2], dir: 1, to: { x: 36.0, y: 23.8 }, apex: 27.0 },
      { kind: 'high', team: -1, range: [33.0, 37.8], sign: null, ...on(23.8), label: { name: '구름 바위', desc: '언덕 꼭대기보다 한 층 더 높아요. 조준선 두 배, 대신 얇고 훤히 보여요' } },
      { kind: 'pad', team: -1, range: [33.8, 34.4], dir: -1, to: { x: 21.0, y: 12.2 }, apex: 26.4, ...on(23.8) },
      { kind: 'pad', team: -1, range: [36.4, 37.0], dir: 1, to: { x: 57.6, y: 13.6 }, apex: 26.4, ...on(23.8) },
    ],
    features: { trees: [tree(16.4, 'oak', { h: 4.8, canopyR: 2.0 })] },
  }),

  // 벚꽃 분지 (spring) — go down for it? A wide bowl with a blossom tree at the bottom (a nut every
  // turn, in full view of both rims). Left home: the high, steep rim, 3 m up and close to the tree,
  // but the climb back out is slow and the rim's lip is thin. Right home: the low, gentle rim, a
  // long easy road down, and a lookout over the whole bowl. A petal rock floats over the bowl:
  // go down to the bottom to bounce up to it, then pads drop you on either rim.
  blossom: () => ({
    top: [[2.2, 15.0], [3.4, 17.0], [13.8, 17.0], [26.0, 11.0], [33.0, 11.0], [50.0, 14.0], [68.4, 14.0], [69.6, 12.2]],
    flat: [[3.4, 13.8], [13.8, 26.0], [26.0, 33.0], [50.0, 68.4]],
    islands: [{
      a: 2.3, b: 69.7,
      under: [[2.3, 15.2], [3.6, 13.6], [7, 12.8], [11, 12.9], [13.8, 14.0], [16.5, 12.4], [21, 9.4], [26, 7.4], [32, 7.0], [38, 7.6], [44, 8.8], [50, 9.8], [56, 10.0], [62, 10.0], [66, 10.2], [69.7, 12.4]],
    }],
    bases: [9.0, 61.0],
    forts: [{ back: 4.0, facing: 1 }, { back: 67.8, facing: -1 }],
    ops: [...crag(6.0, 12.0), ...crag(23.0, 7.8), ...crag(35.0, 6.6, 1.3), ...crag(57.0, 9.2, 0.8), ...ledge(40.6, 21.2, 6.0)],
    spots: [
      { kind: 'pad', team: -1, range: [32.6, 33.2], dir: 1, to: { x: 40.6, y: 21.2 }, apex: 24.4 },
      { kind: 'high', team: -1, range: [38.2, 43.0], sign: null, ...on(21.2), label: { name: '꽃잎 섬', desc: '분지 위 하늘섬. 조준선 두 배, 양쪽 집으로 내려가는 버섯이 있어요' } },
      { kind: 'pad', team: -1, range: [39.0, 39.6], dir: -1, to: { x: 11.8, y: 17.0 }, apex: 25.2, ...on(21.2) },
      { kind: 'pad', team: -1, range: [41.6, 42.2], dir: 1, to: { x: 57.4, y: 14.0 }, apex: 24.0, ...on(21.2) },
      { kind: 'tree', team: -1, range: [27.4, 31.8], sign: 26.0, label: { name: '벚꽃 명당', desc: '내 차례가 시작될 때마다 특수 견과 +1. 분지 바닥이라 양쪽에서 다 보여요' } },
      { kind: 'high', team: 1, range: [49.8, 52.6], sign: 53.4, label: { name: '분지 전망대', desc: '조준선이 두 배로 길어져요. 분지가 한눈에 내려다보여요' } },
    ],
    features: { trees: [tree(29.6, 'blossom', { h: 5.2, canopyR: 2.3, nuts: 6, room: 2.0 })] },
  }),

  // 두더지 굴 산 (spring) — through, or over? A flat-topped mountain stands left of the middle, too
  // steep to drive. A mole tunnel runs from the foot of its left face, under the top, and ramps up
  // to the right home's terrace. Left home: low, with the tunnel mouth (a roof over your head) a
  // short drive out and a mushroom pad just behind the start that throws you onto the top
  // (lookout). Right home: a terrace 3.4 m higher, a blossom tree on it (a nut every turn), and
  // the tunnel's far mouth. Pads on top drop you home. Over the tunnel's far mouth floats a cloud
  // rock higher than the mountain (a pad behind the right home), with a hop across to the top.
  mole: () => ({
    top: [[2.2, 10.6], [3.4, 12.2], [22.6, 12.2], [24.8, 20.0], [40.2, 20.0], [42.6, 15.6], [68.4, 15.6], [69.6, 13.8]],
    flat: [[3.4, 22.6], [24.8, 40.2], [42.6, 68.4]],
    islands: [{
      a: 2.3, b: 69.7,
      under: [[2.3, 10.8], [3.6, 9.2], [8, 8.4], [14, 8.0], [20, 7.6], [26, 5.6], [32, 4.8], [38, 5.4], [44, 8.6], [50, 11.0], [56, 11.6], [62, 11.8], [66, 12.0], [69.7, 14.0]],
    }],
    bases: [10.0, 61.0],
    forts: [{ back: 4.2, facing: 1 }, { back: 67.8, facing: -1 }],
    ops: [
      // the tunnel: level under the mountain, then a ramp up to the right terrace
      ...passage(21.4, 34.0, 12.2, 1.3),
      ...Array.from({ length: 30 }, (_, k) => { const x = 34.0 + k * 0.3; return { type: 'sub', x, y: 13.5 + (x - 34.0) / 8.7 * 3.4, rx: 1.3, ry: 1.3 }; }),
      ...crag(6.0, 8.0), ...crag(18.0, 6.8), ...crag(47.0, 9.0, 0.9), ...crag(58.0, 10.8, 0.8),
      ...ledge(46.0, 23.0, 5.6), // 구름 바위
    ],
    spots: [
      {
        kind: 'burrow', team: 0, range: [24.6, 33.6], sign: 21.6, floor: 12.2, band: [11.4, 15.2],
        label: { name: '두더지 굴', desc: '산이 지붕이 되어 위에서 오는 공격을 막아 줘요. 굴을 따라 낮게 쏜 건 그대로 들어와요' },
      },
      { kind: 'pad', team: 0, range: [7.0, 8.0], dir: -1, to: { x: 28.4, y: 20.0 }, apex: 25.4 },
      {
        kind: 'high', team: -1, range: [26.2, 38.8], sign: null, signs: [25.6, 39.4], top: 20, band: [18.4, 23],
        label: { name: '두더지 산 꼭대기', desc: '조준선이 두 배로 길어져요. 양쪽에서 다 보여요' },
      },
      { kind: 'pad', team: -1, range: [25.0, 25.8], dir: -1, to: { x: 12.4, y: 12.2 }, apex: 24.0, top: 20, band: [18.4, 23] },
      { kind: 'pad', team: -1, range: [39.0, 39.8], dir: 1, to: { x: 57.4, y: 15.6 }, apex: 27.4, top: 20, band: [18.4, 23] }, // over the cloud rock
      { kind: 'tree', team: 1, range: [52.2, 54.6], sign: 51.4, label: { name: '언덕 벚나무', desc: '내 차례가 시작될 때마다 특수 견과 +1' } },
      { kind: 'pad', team: 1, range: [64.4, 65.2], dir: 1, to: { x: 46.6, y: 23.0 }, apex: 26.2 },
      { kind: 'high', team: 1, range: [43.8, 48.2], sign: null, ...on(23.0), label: { name: '구름 바위', desc: '산꼭대기보다 높아요. 조준선 두 배, 얇고 훤히 보여요' } },
      { kind: 'pad', team: -1, range: [44.4, 45.0], dir: -1, to: { x: 35.4, y: 20.0 }, apex: 25.6, ...on(23.0) },
    ],
    features: { trees: [tree(53.4, 'blossom', { h: 4.6, canopyR: 2.0 })] },
    backs: [{ x0: 23.0, x1: 42.0, y0: 12.2, y1: 18.6, color: 'rgba(66,38,18,0.82)' }],
  }),

  // 해바라기 비탈 (summer) — the tilted island. One long wedge of sunflower field sloping from high
  // on the left to low on the right, with nowhere to hide. Left home: the high tip, 4.6 m up and
  // shooting downhill, but the tip is thin and hangs over the clouds. Right home: low, on the
  // thick end, with a big shade tree a short drive out (a nut every turn), and a pad behind it up
  // to a sky island higher than the tip, whose pads drop you halfway up the slope or home.
  sunflower: () => ({
    top: [[2.6, 15.6], [3.6, 17.0], [13.0, 17.0], [50.0, 12.4], [68.6, 12.4], [69.8, 10.8]],
    flat: [[3.6, 13.0], [50.0, 68.6]],
    islands: [{
      a: 2.7, b: 69.7,
      under: [[2.7, 15.8], [3.8, 14.4], [8, 14.1], [12, 13.8], [17, 12.2], [24, 10.0], [32, 8.2], [40, 7.0], [48, 6.6], [55, 6.8], [61, 7.4], [66, 8.0], [69.7, 10.6]],
    }],
    bases: [9.0, 61.0],
    forts: [{ back: 4.4, facing: 1 }, { back: 67.8, facing: -1 }],
    ops: [...crag(6.0, 13.4, 0.8), ...crag(22.0, 9.8), ...crag(36.0, 6.8, 1.2), ...crag(50.0, 6.0, 1.2), ...ledge(43.6, 19.6, 6.0)],
    spots: [
      { kind: 'tree', team: 1, range: [51.8, 54.2], sign: 55.0, label: { name: '느티나무 그늘', desc: '내 차례가 시작될 때마다 특수 견과 +1. 나무가 내 높은 샷을 막기도 해요' } },
      { kind: 'pad', team: 1, range: [64.6, 65.4], dir: 1, to: { x: 43.8, y: 19.6 }, apex: 23.0 },
      { kind: 'high', team: 1, range: [41.2, 46.0], sign: null, ...on(19.6), label: { name: '해바라기 구름섬', desc: '비탈 꼭대기보다 높아요. 조준선 두 배, 얇고 훤히 보여요' } },
      { kind: 'pad', team: -1, range: [42.0, 42.6], dir: -1, to: { x: 26.6, y: 15.6 }, apex: 22.6, ...on(19.6) },
      { kind: 'pad', team: -1, range: [44.6, 45.2], dir: 1, to: { x: 59.0, y: 12.4 }, apex: 22.0, ...on(19.6) },
    ],
    features: { trees: [tree(53.0, 'oak', { h: 5.0, canopyR: 2.2 })] },
  }),

  // 반딧불 징검다리 (summer night) — hop the stones. Five floating rocks; mushroom pads throw you
  // from one to the next. Left home: the big low rock (thick, room to drive); its loop goes up to a
  // small high stone (lookout, thin) and on down to the firefly stone (a nut every turn), with a
  // pad home. Right home: a smaller rock 2.2 m higher; its loop goes by a low stone to the same
  // firefly stone and home again.
  night: () => ({
    top: [
      [2.4, 10.8], [3.4, 12.6], [16.0, 12.6], [17.0, 11.6],
      [19.6, 15.4], [20.4, 16.6], [24.4, 16.6], [25.2, 15.4],
      [28.0, 10.4], [29.0, 11.4], [37.0, 11.4], [38.0, 10.4],
      [41.4, 12.6], [42.2, 13.6], [46.6, 13.6], [47.4, 12.6],
      [51.4, 13.6], [52.4, 14.8], [68.6, 14.8], [69.6, 13.2],
    ],
    flat: [[3.4, 16.0], [20.4, 24.4], [29.0, 37.0], [42.2, 46.6], [52.4, 68.6]],
    islands: [
      { a: 2.4, b: 17.0, under: [[2.4, 11.0], [3.8, 9.4], [8, 8.2], [12, 8.0], [15, 8.8], [17.0, 11.4]] },
      { a: 19.6, b: 25.2, under: [[19.6, 15.2], [20.8, 14.4], [22.4, 13.9], [24.0, 14.4], [25.2, 15.2]] },
      { a: 28.0, b: 38.0, under: [[28.0, 10.2], [29.6, 8.6], [33.0, 8.0], [36.4, 8.6], [38.0, 10.2]] },
      { a: 41.4, b: 47.4, under: [[41.4, 12.4], [42.8, 11.6], [44.4, 11.2], [46.0, 11.6], [47.4, 12.4]] },
      { a: 51.4, b: 69.6, under: [[51.4, 13.4], [52.8, 12.0], [57, 11.4], [62, 11.3], [66, 11.6], [69.6, 13.0]] },
    ],
    bases: [9.2, 61.6],
    forts: [{ back: 3.8, facing: 1 }, { back: 68.2, facing: -1 }],
    ops: [...crag(6.4, 7.6, 0.9), ...crag(13.0, 7.6, 0.8), ...crag(33.0, 7.4, 1.0), ...crag(58.0, 10.8, 0.8), ...crag(65.0, 11.0, 0.7)],
    spots: [
      { kind: 'pad', team: 0, range: [14.4, 15.4], dir: 1, to: { x: 22.4, y: 16.6 }, apex: 21.0 },
      {
        kind: 'high', team: 0, range: [20.6, 23.0], sign: 20.0, top: 17,
        label: { name: '반딧불 섬', desc: '조준선이 두 배로 길어져요. 작고 얇아서 잘 무너져요' },
      },
      { kind: 'pad', team: -1, range: [23.4, 24.2], dir: 1, to: { x: 34.4, y: 11.4 }, apex: 20.4, top: 17 },
      { kind: 'pad', team: -1, range: [29.2, 30.0], dir: -1, to: { x: 10.6, y: 12.6 }, apex: 19.6 },
      { kind: 'tree', team: -1, range: [30.2, 32.8], sign: 33.4, label: { name: '반딧불 명당', desc: '내 차례가 시작될 때마다 특수 견과 +1' } },
      { kind: 'pad', team: -1, range: [36.0, 36.8], dir: 1, to: { x: 59.0, y: 14.8 }, apex: 21.4 },
      { kind: 'pad', team: -1, range: [42.4, 43.2], dir: -1, to: { x: 33.0, y: 11.4 }, apex: 18.6, top: 14 },
      { kind: 'pad', team: 1, range: [53.2, 54.2], dir: -1, to: { x: 44.8, y: 13.6 }, apex: 19.6 },
    ],
    features: { trees: [tree(31.5, 'chestnut', { h: 4.4, canopyR: 1.8 })] },
  }),

  // 무지개 하늘다리 (summer) — under it, or over it? A rainbow of rock floats high over the middle
  // of the field like a ceiling: the easy high lob hits it, so shoot under it or very high over it. Mushroom pads throw you onto its
  // crest (lookout), and pads up there drop you home. Left home: a rise 2.2 m up, nearer the arch.
  // Right home: the low field, thick ground, and a big tree a short drive out (a nut every turn).
  arch: () => ({
    top: [[2.2, 13.0], [3.4, 14.6], [15.6, 14.6], [24.0, 12.4], [68.4, 12.4], [69.6, 10.8]],
    flat: [[3.4, 15.6], [24.0, 68.4]],
    islands: [{
      a: 2.3, b: 69.7,
      under: [[2.3, 13.2], [3.6, 11.6], [8, 10.6], [13, 10.4], [17, 10.0], [23, 9.0], [30, 8.0], [38, 7.6], [46, 7.8], [54, 8.4], [60, 8.8], [66, 9.0], [69.7, 10.6]],
    }],
    bases: [9.6, 61.0],
    forts: [{ back: 4.0, facing: 1 }, { back: 67.8, facing: -1 }],
    ops: [
      // the floating arch: a band of rock bent like a rainbow, with a flat crest
      ...Array.from({ length: 27 }, (_, k) => { const a = (25 + k * 5) * Math.PI / 180; return { type: 'add', x: 39.0 + 10.0 * Math.cos(a), y: 22.0 + 6.0 * Math.sin(a), rx: 0.9, ry: 0.9 }; }),
      { type: 'add', x: 39.0, y: 28.2, rx: 3.6, ry: 0.75 },
      ...crag(7.0, 11.0), ...crag(20.0, 9.0, 0.9), ...crag(34.0, 7.0, 1.2), ...crag(56.0, 7.8, 1.0),
    ],
    spots: [
      { kind: 'pad', team: 0, range: [24.6, 25.6], dir: 1, to: { x: 37.6, y: 28.95 }, apex: 32.6 },
      { kind: 'pad', team: 1, range: [53.0, 54.0], dir: -1, to: { x: 40.4, y: 28.95 }, apex: 34.0 },
      {
        kind: 'high', team: -1, range: [36.4, 41.6], sign: null, signs: [36.0, 42.0], top: 30, band: [27.5, 32],
        label: { name: '무지개 꼭대기', desc: '조준선이 두 배로 길어져요. 하늘 한가운데라 다 보여요' },
      },
      { kind: 'pad', team: -1, range: [35.4, 36.0], dir: -1, to: { x: 10.4, y: 14.6 }, apex: 31.0, top: 30, band: [27.5, 32] },
      { kind: 'pad', team: -1, range: [42.0, 42.6], dir: 1, to: { x: 58.0, y: 12.4 }, apex: 31.0, top: 30, band: [27.5, 32] },
      { kind: 'tree', team: 1, range: [54.8, 57.2], sign: 58.0, label: { name: '여름 그늘', desc: '내 차례가 시작될 때마다 특수 견과 +1. 나무가 내 높은 샷을 막기도 해요' } },
    ],
    features: { trees: [tree(56.0, 'oak', { h: 4.8, canopyR: 2.0 })] },
    paints: [{ kind: 'rainbow', x: 39.0, y: 22.0, rx: 10.0, ry: 6.0, w: 1.9 }],
  }),

  // 단풍 협곡 (autumn) — cross, or cut? Two landmasses over a bottomless canyon, joined by one thin
  // earth bridge that slopes down from left to right. Stand on it and it cracks; a hit nearby drops
  // it, and then nobody crosses again. Left home: the high rim (1.6 m up) with a lookout at the
  // canyon's edge. Right home: the low rim, with a maple at the bridge's foot (a nut every turn).
  // A stepping stone floats over the canyon, a pad behind each home away: the other way across,
  // even once the bridge is gone.
  maple: () => ({
    top: [[2.0, 12.6], [3.0, 14.4], [28.6, 14.4], [29.6, 14.2], [41.0, 12.8], [68.6, 12.8], [69.8, 11.2]],
    flat: [[3.0, 28.6], [29.6, 41.0], [41.0, 68.6]],
    islands: [{
      a: 2.1, b: 69.8, calm: [30.0, 40.6], // the bridge's underside stays even, so its thickness is what it says
      under: [[2.1, 12.8], [3.4, 11.0], [8, 9.8], [14, 9.4], [20, 8.8], [25, 7.8], [28.4, 6.8], [29.6, 12.35], [31, 12.36], [33, 12.16], [35, 11.85], [37, 11.53], [39, 11.29], [40.6, 11.0], [41.6, 7.2], [44, 7.0], [48, 7.8], [52, 8.3], [58, 8.3], [64, 8.6], [67.5, 9.0], [69.8, 11.0]],
    }],
    bases: [10.0, 61.6],
    forts: [{ back: 3.6, facing: 1 }, { back: 68.2, facing: -1 }],
    ops: [...crag(6.0, 9.5), ...crag(18.0, 8.0), ...crag(27.6, 5.6, 1.1), ...crag(42.6, 5.8, 1.1), ...crag(58.0, 7.6, 0.8), ...ledge(35.4, 20.6, 6.0)],
    spots: [
      { kind: 'pad', team: 0, range: [6.6, 7.4], dir: -1, to: { x: 35.0, y: 20.6 }, apex: 24.6 },
      { kind: 'pad', team: 1, range: [65.0, 65.8], dir: 1, to: { x: 35.8, y: 20.6 }, apex: 24.6 },
      { kind: 'high', team: -1, range: [33.0, 37.8], sign: null, ...on(20.6), label: { name: '단풍 구름섬', desc: '협곡 위 하늘섬. 조준선 두 배, 다리가 무너져도 건너갈 수 있어요' } },
      { kind: 'pad', team: -1, range: [33.8, 34.4], dir: -1, to: { x: 14.0, y: 14.4 }, apex: 24.0, ...on(20.6) },
      { kind: 'pad', team: -1, range: [36.4, 37.0], dir: 1, to: { x: 56.6, y: 12.8 }, apex: 23.6, ...on(20.6) },
      { kind: 'high', team: 0, range: [25.2, 28.2], sign: 24.4, label: { name: '벼랑 전망대', desc: '조준선이 두 배로 길어져요. 바로 앞은 협곡이에요' } },
      { kind: 'bridge', team: -1, range: [30.2, 40.4], sign: null, signs: [29.6, 41.0] },
      { kind: 'tree', team: 1, range: [44.8, 47.4], sign: 48.2, label: { name: '단풍 명당', desc: '내 차례가 시작될 때마다 특수 견과 +1. 다리 바로 앞이에요' } },
    ],
    features: { trees: [tree(46.0, 'maple', { h: 4.8, canopyR: 2.0 })] },
  }),

  // 은행나무 참호 (autumn) — shoot from behind your hill. Each home sits behind its own ridge with an
  // empty valley between. Left home: deep, behind a tall ridge (flat shots can't reach you, but you
  // must lob too), with a lookout on the ridge top. Right home: 1.6 m higher behind a low ridge (it
  // sees more and is seen more), with a ginkgo on its ridge (a nut every turn, out in the open).
  // Down in the empty valley lies a stone bunker, below every lob: a roof to hide under in
  // no-man's land, and on top a lookout as high as the ridges (a pad behind each home), whose pads
  // drop you on either ridge.
  ginkgo: () => ({
    top: [[2.2, 10.6], [3.4, 12.2], [12.6, 12.2], [20.6, 16.0], [23.6, 16.0], [32.4, 11.4], [37.6, 11.4], [43.6, 14.4], [46.6, 14.4], [49.4, 13.8], [68.4, 13.8], [69.6, 12.0]],
    flat: [[3.4, 68.4]],
    islands: [{
      a: 2.3, b: 69.7,
      under: [[2.3, 10.8], [3.6, 9.2], [8, 8.2], [13, 7.8], [18, 7.4], [22, 7.2], [27, 6.8], [33, 6.6], [38, 6.8], [44, 7.6], [50, 9.6], [56, 10.2], [62, 10.2], [66, 10.4], [69.7, 12.2]],
    }],
    bases: [9.6, 61.0],
    forts: [{ back: 4.0, facing: 1 }, { back: 67.8, facing: -1 }],
    ops: [
      ...crag(6.0, 7.8), ...crag(27.0, 6.0, 1.2), ...crag(54.0, 9.3, 0.9), ...crag(64.0, 9.6, 0.7),
      ...ledge(35.0, 16.4, 6.0, { deep: 2.0, crag: null }), // 골짜기 벙커: a slab down in no-man's land, under every lob
    ],
    spots: [
      { kind: 'pad', team: 0, range: [6.2, 7.0], dir: -1, to: { x: 34.4, y: 16.4 }, apex: 21.4 },
      { kind: 'pad', team: 1, range: [64.4, 65.2], dir: 1, to: { x: 35.6, y: 16.4 }, apex: 24.0 },
      { kind: 'high', team: -1, range: [32.6, 37.4], sign: null, ...on(16.4), label: { name: '벙커 지붕', desc: '능선만큼 높아요. 조준선 두 배, 대신 골짜기 한가운데라 다 보여요' } },
      { kind: 'burrow', team: -1, range: [32.6, 37.4], sign: 31.4, ...below(11.4), label: { name: '골짜기 벙커', desc: '돌 지붕이 높이 쏜 공격을 막아 줘요. 낮게 쏜 건 들어와요' } },
      { kind: 'pad', team: -1, range: [33.4, 34.0], dir: -1, to: { x: 22.6, y: 16.0 }, apex: 19.8, ...on(16.4) },
      { kind: 'pad', team: -1, range: [36.0, 36.6], dir: 1, to: { x: 44.0, y: 14.4 }, apex: 19.4, ...on(16.4) },
      { kind: 'high', team: 0, range: [20.8, 23.4], sign: 19.8, label: { name: '은행 봉우리', desc: '조준선이 두 배로 길어져요. 봉우리라 양쪽에서 다 보여요' } },
      { kind: 'tree', team: 1, range: [43.8, 46.4], sign: 47.4, label: { name: '은행 명당', desc: '내 차례가 시작될 때마다 특수 견과 +1. 언덕 위라 다 보여요' } },
    ],
    features: { trees: [tree(45.1, 'ginkgo', { h: 4.8, canopyR: 2.0 })] },
  }),

  // 소나무 절벽 (autumn) — the cliff. A high plateau drops 6 m sheer to a long lowland. Left home: on
  // the plateau, shooting down, with a lookout at the cliff's thin lip; there is no way down. Right
  // home: the lowland, thick ground, a pine at the cliff's foot (a nut every turn, right under the
  // plateau's guns) and, right at the foot, a mushroom pad that throws you up onto the plateau.
  // Behind the right home a pad throws you onto a pine rock in the sky, higher than the plateau.
  pine: () => ({
    top: [[2.2, 15.8], [3.4, 17.6], [24.6, 17.6], [25.4, 17.4], [27.2, 11.8], [27.8, 11.6], [68.4, 11.6], [69.6, 10.0]],
    flat: [[3.4, 24.6], [27.8, 68.4]],
    islands: [{
      a: 2.3, b: 69.7,
      under: [[2.3, 16.0], [3.6, 14.2], [8, 13.2], [14, 12.8], [19, 13.0], [22.5, 14.0], [24.8, 14.8], [26.2, 10.0], [29, 8.0], [34, 7.4], [42, 7.2], [50, 7.4], [58, 7.6], [65, 8.0], [69.7, 9.8]],
    }],
    bases: [10.2, 61.2],
    forts: [{ back: 4.4, facing: 1 }, { back: 67.8, facing: -1 }],
    ops: [...crag(8.0, 12.4), ...crag(18.0, 12.2, 0.9), ...crag(40.0, 6.4, 1.2), ...crag(55.0, 6.8, 1.0), ...ledge(44.0, 19.8, 6.0)],
    spots: [
      { kind: 'high', team: 0, range: [21.6, 24.4], sign: 20.8, label: { name: '벼랑 끝', desc: '조준선이 두 배로 길어져요. 벼랑 끝이라 땅이 얇아요' } },
      { kind: 'tree', team: 1, range: [30.4, 33.2], sign: 34.0, label: { name: '절벽 밑 소나무', desc: '내 차례가 시작될 때마다 특수 견과 +1. 벼랑 위에서 다 내려다봐요' } },
      { kind: 'pad', team: 1, range: [28.4, 29.2], dir: -1, to: { x: 16.0, y: 17.6 }, apex: 22.4 },
      { kind: 'pad', team: 1, range: [64.6, 65.4], dir: 1, to: { x: 44.0, y: 19.8 }, apex: 23.2 },
      { kind: 'high', team: 1, range: [41.6, 46.4], sign: null, ...on(19.8), label: { name: '솔바위', desc: '벼랑보다 높아요. 조준선 두 배, 얇고 훤히 보여요' } },
      { kind: 'pad', team: -1, range: [42.4, 43.0], dir: -1, to: { x: 35.0, y: 11.6 }, apex: 22.4, ...on(19.8) },
      { kind: 'pad', team: -1, range: [45.0, 45.6], dir: 1, to: { x: 58.4, y: 11.6 }, apex: 22.4, ...on(19.8) },
    ],
    features: { trees: [tree(31.8, 'pine', { h: 5.0, canopyR: 1.9 })] },
  }),

  // 살얼음 두 섬 (winter) — no way across. Two islands with a gap of clouds between: nobody drives
  // over, it's all shooting and digging. Left home: the small high island (3.6 m up), thin ice under
  // it and thinnest at its lookout edge. Right home: the big low island, thick, with a snowy pine a
  // short drive out (a nut every turn). Low in the gap floats an ice floe: no cart drives across,
  // but a pad at each island's end drops you onto it and its pads throw you on, two bounces over.
  snowcliff: () => ({
    top: [[2.4, 14.4], [3.4, 16.2], [21.6, 16.2], [23.6, 15.8], [24.6, 14.8], [33.4, 11.0], [34.4, 12.6], [68.4, 12.6], [69.6, 11.0]],
    flat: [[3.4, 21.6], [34.4, 68.4]],
    islands: [
      { a: 2.4, b: 24.6, under: [[2.4, 14.6], [3.8, 13.4], [8, 13.1], [13, 12.9], [18, 13.1], [21.6, 13.7], [23.6, 14.2], [24.6, 14.6]] },
      { a: 33.4, b: 69.6, under: [[33.4, 10.8], [35, 9.0], [40, 8.0], [48, 7.6], [56, 7.8], [62, 8.0], [66, 8.4], [69.6, 10.8]] },
    ],
    bases: [10.0, 61.0],
    forts: [{ back: 3.8, facing: 1 }, { back: 67.8, facing: -1 }],
    ops: [...crag(8.0, 12.3, 0.8), ...crag(16.0, 12.2, 0.7), ...crag(44.0, 7.0, 1.2), ...crag(58.0, 7.0, 0.9), ...ledge(29.0, 11.4, 5.6, { deep: 2.4 })],
    spots: [
      { kind: 'high', team: 0, range: [19.2, 22.6], sign: 18.4, label: { name: '살얼음 벼랑 끝', desc: '조준선이 두 배로 길어져요. 얼음이 가장 얇은 곳이에요' } },
      { kind: 'tree', team: 1, range: [39.4, 42.0], sign: 43.0, label: { name: '눈꽃 명당', desc: '내 차례가 시작될 때마다 특수 견과 +1' } },
      { kind: 'pad', team: 0, range: [23.0, 23.6], dir: 1, to: { x: 28.6, y: 11.4 }, apex: 18.4 },
      { kind: 'pad', team: 1, range: [35.0, 35.6], dir: -1, to: { x: 29.4, y: 11.4 }, apex: 16.4 },
      { kind: 'pad', team: -1, range: [27.4, 28.0], dir: -1, to: { x: 12.0, y: 16.2 }, apex: 20.2, ...on(11.4) },
      { kind: 'pad', team: -1, range: [30.0, 30.6], dir: 1, to: { x: 37.0, y: 12.6 }, apex: 16.6, ...on(11.4) },
    ],
    features: { trees: [tree(40.7, 'snowpine', { h: 4.6, canopyR: 1.8 })] },
  }),

  // 이글루 눈처마 (winter) — the overhang and the igloo. Left home: a high snow shelf (4 m up) whose
  // front edge juts out as a thin cornice (lookout, and the first thing to break), with a hollow
  // under it. Right home: the low snowfield, thick, with an igloo a short drive out: the road runs
  // through it and its roof stops anything that comes down from above. A pad behind the right
  // home throws you onto an ice rock higher than the shelf, and from there onto the shelf itself.
  igloo: () => ({
    top: [[2.2, 14.6], [3.4, 16.4], [21.6, 16.4], [22.4, 16.0], [23.0, 12.4], [68.4, 12.4], [69.6, 10.8]],
    flat: [[3.4, 21.6], [23.0, 68.4]],
    islands: [{
      a: 2.3, b: 69.7,
      under: [[2.3, 14.8], [3.6, 13.2], [8, 12.4], [14, 12.2], [19, 12.4], [22.0, 11.0], [24, 9.2], [30, 8.2], [38, 7.8], [46, 7.8], [54, 8.0], [60, 8.2], [66, 8.6], [69.7, 10.6]],
    }],
    bases: [9.6, 61.0],
    forts: [{ back: 4.0, facing: 1 }, { back: 67.8, facing: -1 }],
    ops: [
      // the cornice: a slab of packed snow sticking out over the field
      { type: 'add', x: 24.6, y: 15.75, rx: 3.0, ry: 0.65 },
      ...igloo(50.0, 12.4),
      ...ledge(38.0, 19.4, 6.0), // 얼음 바위
      ...crag(8.0, 11.6), ...crag(16.0, 11.4, 0.9), ...crag(34.0, 7.2, 1.2), ...crag(58.0, 7.4, 0.9),
    ],
    spots: [
      { kind: 'high', team: 0, range: [20.0, 24.6], sign: 19.2, label: { name: '눈처마 끝', desc: '조준선이 두 배로 길어져요. 얇은 눈처마라 금방 무너져요' } },
      {
        kind: 'burrow', team: 1, range: [48.6, 51.4], sign: 53.8, floor: 12.4, band: [11.6, 14.8],
        label: { name: '이글루', desc: '눈 지붕이 위에서 오는 공격을 막아 줘요. 문으로 낮게 쏜 것만 드나들어요' },
      },
      { kind: 'pad', team: 1, range: [64.4, 65.2], dir: 1, to: { x: 38.4, y: 19.4 }, apex: 23.0 },
      { kind: 'high', team: 1, range: [35.6, 40.4], sign: null, ...on(19.4), label: { name: '얼음 바위', desc: '눈 선반보다 높아요. 조준선 두 배, 얇고 훤히 보여요' } },
      { kind: 'pad', team: -1, range: [36.4, 37.0], dir: -1, to: { x: 14.0, y: 16.4 }, apex: 23.0, ...on(19.4) },
      { kind: 'pad', team: -1, range: [39.0, 39.6], dir: 1, to: { x: 57.0, y: 12.4 }, apex: 22.6, ...on(19.4) },
    ],
    features: {},
    backs: [
      { x0: 22.8, x1: 27.2, y0: 12.4, y1: 15.4, color: 'rgba(92,120,156,0.85)' }, // the hollow under the cornice
      { x0: 46.6, x1: 53.4, y0: 12.4, y1: 15.2, color: 'rgba(92,120,156,0.9)' }, // inside the igloo
    ],
    paints: [{ kind: 'snow', x: 50.0, y: 12.4, rx: 3.5, ry: 4.6, above: 12.45 }, { kind: 'snow', x: 24.6, y: 15.75, rx: 3.1, ry: 0.7 }],
  }),

  // 오로라 호수 (winter night) — thin ice. A frozen lake fills the middle, ice barely 1.3 m thick:
  // any shot on it opens a hole to the clouds, and a cart out on it is one hit from falling. Left
  // home: the wide low shore, thick, with a snowy oak (a nut every turn). Right home: the narrow
  // high shore (3.4 m up) at the top of a ramp, thinner. An ice eave hangs over the lake: a roof
  // to hide under (on the thinnest ice there is), and a lookout on top (a pad behind the right home).
  aurora: () => ({
    top: [[2.4, 11.0], [3.4, 12.8], [18.4, 12.8], [21.2, 12.0], [41.0, 12.0], [50.0, 16.2], [68.4, 16.2], [69.6, 14.6]],
    flat: [[3.4, 18.4], [21.2, 41.0], [41.0, 50.0], [50.0, 68.4]],
    islands: [{
      a: 2.4, b: 69.6, calm: [21.6, 40.6], // the ice is the same thickness all the way across
      under: [[2.4, 11.2], [3.8, 9.6], [8, 8.6], [13, 8.4], [17, 8.8], [20.4, 10.0], [21.6, 10.6], [24, 10.7], [30, 10.7], [36, 10.7], [40.6, 10.6], [42.4, 10.0], [45, 9.6], [50, 12.0], [55, 12.6], [60, 12.8], [65, 13.0], [69.6, 14.8]],
    }],
    bases: [8.4, 62.0],
    forts: [{ back: 3.6, facing: 1 }, { back: 67.8, facing: -1 }],
    ops: [...crag(8.0, 7.8), ...crag(15.0, 7.8, 0.8), ...crag(45.0, 8.8, 0.9), ...crag(58.0, 11.9, 0.8), ...ledge(29.0, 17.4, 6.0, { deep: 2.0, crag: null })],
    spots: [
      { kind: 'tree', team: 0, range: [16.2, 18.4], sign: 15.4, label: { name: '눈꽃 명당', desc: '내 차례가 시작될 때마다 특수 견과 +1' } },
      { kind: 'burrow', team: -1, range: [26.6, 31.4], sign: 24.8, ...below(12.0), label: { name: '얼음 처마 밑', desc: '얼음 지붕이 높이 쏜 공격을 막아 줘요. 발밑은 살얼음이에요' } },
      { kind: 'pad', team: 1, range: [65.4, 66.2], dir: 1, to: { x: 29.2, y: 17.4 }, apex: 22.0 },
      { kind: 'high', team: 1, range: [26.6, 31.4], sign: null, ...on(17.4), label: { name: '오로라 처마', desc: '호수 한가운데 위. 조준선 두 배, 얇은 얼음이에요' } },
      { kind: 'pad', team: -1, range: [30.0, 30.6], dir: 1, to: { x: 57.0, y: 16.2 }, apex: 22.0, ...on(17.4) },
    ],
    features: { trees: [tree(17.4, 'snowoak', { h: 4.4, canopyR: 1.9 })] },
  }),
};
