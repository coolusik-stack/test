// The hand-made maps. Every spot means something (see spots.js) and the shapes stay put from match
// to match so players can learn them; only small things vary (wind, fort design, decor).
//
// Each map is drawn whole, left to right: the two homes are not mirror images. They start at
// different heights on different ground, and each side pays for what it has in another currency
// (height costs ground under you or cover; cover costs reach; nuts cost a drive). Which player gets
// which home is down to the draw (terrain.js flips the map), and every map keeps one idea:
//   도토리 숲 a hill · 벚꽃 분지 a bowl · 다랑이 논 terraces · 왕버섯 숲 giant mushrooms · 두더지 굴 산 a tunnel · 해바라기 비탈 a tilted island ·
//   반딧불 징검다리 stepping stones · 무지개 하늘다리 a rock arch in the sky · 층층 구름섬 shelves · 삼층 다리 three decks ·
//   단풍 협곡 a bridge · 단풍 벼랑 선반 cliff ledges · 낙엽 우물 a well ·
//   은행나무 참호 trenches · 소나무 절벽 a cliff · 살얼음 두 섬 two islands · 이글루 눈처마 an
//   overhang and an igloo · 얼음 누각 an ice pavilion · 빙하 틈새 a crevasse · 오로라 호수 thin lake ice
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
// a long floating shelf: its top follows `pts` ([x, y] points joined by cosine curves), `deep`
// thick under its whole length and rounding off over the last 2 m at each end; crags hang under it
// at the x's in `crags`. A row of circles, so its underside stays as even as its top.
const cosAt = (pts, x) => {
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    if (x <= bx) return ay + (by - ay) * (1 - Math.cos(Math.PI * Math.max(0, (x - ax) / (bx - ax)))) / 2;
  }
  return pts[pts.length - 1][1];
};
// how thick a floor with another floor under it is: thinner than CRUMBLE (config.js), so a hit
// close to a cart standing on one breaks it and drops the cart to the floor below
const THIN = 1.3;
// …and the floor a home stands on: thick enough that the first shot of a match can't drop you
const HOME = 1.8;
const shelf = (pts, deep, crags = []) => {
  const ops = [], x0 = pts[0][0], x1 = pts[pts.length - 1][0];
  for (let x = x0 + 0.3; x <= x1 - 0.3 + 1e-6; x += 0.3) {
    const t = Math.max(0.8, deep * Math.min(1, Math.sqrt(Math.min(x - x0, x1 - x) / 2)));
    ops.push({ type: 'add', x, y: cosAt(pts, x) - t / 2, rx: t / 2, ry: t / 2 });
  }
  for (const c of crags) ops.push(...crag(c, cosAt(pts, c) - deep + 0.5, 0.8));
  return ops;
};
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

  // 다랑이 논 (spring) — the terraced paddies. Thin paddy terraces step down toward the middle from
  // both homes, the water running from the top paddy down every step and off into the clouds.
  // Left home: four small steps, 2 m each, so a cart rolls down them freely (a pad climbs back),
  // over a cellar floor that catches anyone who breaks through and opens toward the enemy. Right
  // home: three tall terraces, 1 m higher at the top, the middle one roofed by the one above, pads
  // between them. Each side starts on a terrace or (left) in the cellar; a pad at the bottom of
  // each side hops the crack in the middle.
  paddy: () => ({
    top: [[1.6, 9.4], [2.4, 11.0], [34.2, 11.0], [34.8, 9.6], [36.0, 10.9], [36.8, 12.5], [65.2, 12.5], [66.0, 10.9]],
    flat: [[2.4, 34.2], [36.8, 65.2]],
    islands: [
      { a: 1.6, b: 34.8, under: [[1.6, 9.6], [3.5, 8.0], [9, 6.6], [15, 6.2], [22, 6.4], [29, 7.2], [34.8, 9.4]] }, // the cellar under the paddies
      { a: 36.0, b: 66.0, under: [[36.0, 11.0], [38, 9.0], [45, 7.6], [55, 7.4], [62, 8.2], [66.0, 10.8]] },
    ],
    starts: [
      [{ x: 13.0, y: 22.0 }, { x: 24.8, y: 18.0 }, { x: 20.0, y: 11.0 }],
      [{ x: 60.0, y: 23.0 }, { x: 47.0, y: 18.2 }, { x: 46.0, y: 12.5 }],
    ],
    forts: [{ back: 6.4, facing: 1 }, { back: 67.2, facing: -1 }],
    ops: [
      ...shelf([[6.0, 22.0], [17.0, 22.0]], HOME), // left paddies, top (home) to bottom
      ...shelf([[14.0, 20.0], [22.0, 20.0]], THIN),
      ...shelf([[19.0, 18.0], [27.0, 18.0]], THIN),
      ...shelf([[24.0, 16.0], [31.0, 16.0]], THIN),
      ...shelf([[51.0, 23.0], [69.0, 23.0]], HOME), // right terraces
      ...shelf([[43.0, 18.2], [56.0, 18.2]], THIN),
      ...crag(9.0, 5.6, 0.9), ...crag(26.0, 5.8, 0.8), ...crag(45.0, 6.6, 1.0), ...crag(58.0, 6.6, 0.9),
    ],
    streams: [{ x: 13.6, y: 22.0, dir: 1 }, { x: 54.0, y: 23.0, dir: -1 }],
    spots: [
      // left: the steps roll down; the bottom paddy climbs back up or drops to the cellar; the cellar
      // climbs out behind the home or hops the crack
      { kind: 'pad', team: 0, range: [28.0, 28.6], dir: -1, to: { x: 13.0, y: 22.0 }, apex: 26.6, ...on(16.0) },
      { kind: 'pad', team: 0, range: [29.8, 30.4], dir: 1, to: { x: 32.2, y: 11.0 }, apex: 20.0, ...on(16.0) },
      { kind: 'pad', team: 0, range: [2.6, 3.2], dir: -1, to: { x: 11.0, y: 22.0 }, apex: 31.0, ...on(11.0) },
      { kind: 'pad', team: -1, range: [32.8, 33.4], dir: 1, to: { x: 40.0, y: 12.5 }, apex: 14.6, ...on(11.0) },
      {
        kind: 'burrow', team: 0, range: [19.0, 30.4], sign: 31.6, ...below(11.0),
        label: { name: '논 밑 움', desc: '위 논이 지붕이 되어 높이 쏜 공격을 막아 줘요. 오른쪽으로 트여 있어 낮게 쏠 수 있어요' },
      },
      // right: down the terraces, back up, and across
      { kind: 'pad', team: 1, range: [52.6, 53.2], dir: -1, to: { x: 46.0, y: 18.2 }, apex: 25.0, ...on(23.0) },
      { kind: 'pad', team: 1, range: [44.6, 45.2], dir: -1, to: { x: 39.5, y: 12.5 }, apex: 19.8, ...on(18.2) },
      { kind: 'pad', team: 1, range: [38.4, 39.0], dir: 1, to: { x: 58.0, y: 23.0 }, apex: 27.0, ...on(12.5) },
      { kind: 'pad', team: -1, range: [37.0, 37.6], dir: -1, to: { x: 32.2, y: 11.0 }, apex: 15.0, ...on(12.5) },
      {
        kind: 'burrow', team: 1, range: [51.6, 55.6], sign: 50.4, ...below(18.2),
        label: { name: '논둑 밑', desc: '위 논이 지붕이 되어 높이 쏜 공격을 막아 줘요. 낮게 쏜 건 들어와요' },
      },
    ],
    features: {},
  }),

  // 왕버섯 숲 (spring) — the giant mushrooms. Between the two homes grows a grove of giant mushrooms,
  // low ones near each home and taller ones toward the middle, and over the gap in the middle the
  // king mushroom, the highest perch on the map with nothing under it but its own stalk and the
  // clouds. The caps are thin: a nut beside you drops you to the cap or the ground below. Dew
  // springs on the tall caps run down the smaller caps and off the island. The two sides grow the
  // same heights (when one side stood 1 m higher it won two games in three); each starts at home,
  // on its low cap or on its tall cap.
  shrooms: () => ({
    top: [[2.0, 10.4], [2.8, 12.0], [30.2, 12.0], [31.0, 10.4], [41.0, 10.4], [41.8, 12.0], [69.2, 12.0], [70.0, 10.4]],
    flat: [[2.8, 30.2], [41.8, 69.2]],
    islands: [
      { a: 2.0, b: 31.0, under: [[2.0, 10.6], [3.6, 8.2], [9, 6.6], [16, 6.0], [24, 6.4], [29, 7.6], [31.0, 9.8]] },
      { a: 41.0, b: 70.0, under: [[41.0, 10.3], [43, 8.6], [48, 7.0], [56, 6.6], [63, 7.0], [68.4, 8.4], [70.0, 10.3]] },
    ],
    starts: [
      [{ x: 11.0, y: 12.0 }, { x: 23.0, y: 14.1 }, { x: 28.6, y: 20.0 }],
      [{ x: 61.0, y: 12.0 }, { x: 49.0, y: 14.1 }, { x: 43.4, y: 20.0 }],
    ],
    forts: [{ back: 4.4, facing: 1 }, { back: 67.6, facing: -1 }],
    ops: [
      ...shelf([[21.0, 14.1], [26.0, 14.1]], THIN), // left: a low cap you can roll off toward home,
      ...shelf([[26.5, 20.0], [32.0, 20.0]], THIN), // and a tall one beside it
      ...shelf([[46.0, 14.1], [51.0, 14.1]], THIN), // right: the same, mirrored
      ...shelf([[40.0, 20.0], [45.5, 20.0]], THIN),
      ...shelf([[32.0, 22.5], [40.0, 22.5]], THIN), // the king mushroom,
      ...Array.from({ length: 40 }, (_, k) => ({ type: 'add', x: 36.0, y: 9.5 + k * 0.3, rx: 0.55, ry: 0.55 })), // its stalk
      { type: 'add', x: 36.0, y: 8.8, rx: 1.6, ry: 1.1 }, // and the root it grows from
      ...crag(9.0, 6.4, 1.0), ...crag(22.0, 6.4, 0.9), ...crag(50.0, 6.8, 0.9), ...crag(62.0, 7.0, 1.0),
    ],
    // the smaller mushrooms' stalks, drawn behind (carts drive past them)
    backs: [
      { x0: 22.9, x1: 24.1, y0: 12.0, y1: 12.9, color: 'rgba(244,232,206,0.95)' },
      { x0: 28.6, x1: 29.8, y0: 12.0, y1: 18.8, color: 'rgba(244,232,206,0.95)' },
      { x0: 47.9, x1: 49.1, y0: 12.0, y1: 12.9, color: 'rgba(244,232,206,0.95)' },
      { x0: 42.2, x1: 43.4, y0: 12.0, y1: 18.8, color: 'rgba(244,232,206,0.95)' },
    ],
    paints: [
      { kind: 'cap', x: 23.5, y: 13.45, rx: 3.4, ry: 1.25 }, { kind: 'cap', x: 29.25, y: 19.35, rx: 3.6, ry: 1.25 },
      { kind: 'cap', x: 48.5, y: 13.45, rx: 3.4, ry: 1.25 }, { kind: 'cap', x: 42.75, y: 19.35, rx: 3.6, ry: 1.25 },
      { kind: 'cap', x: 36.0, y: 21.85, rx: 4.9, ry: 1.25 }, { kind: 'stalk', x: 36.0, y: 15.0, rx: 0.9, ry: 6.1 },
    ],
    streams: [{ x: 27.4, y: 20.0, dir: -1 }, { x: 44.6, y: 20.0, dir: 1 }],
    spots: [
      // ground → low cap → tall cap → the king, driving toward the middle; the king's ends drop you
      // home; rolling off a low cap the other way takes you home too
      { kind: 'pad', team: 0, range: [17.0, 17.6], dir: 1, to: { x: 22.0, y: 14.1 }, apex: 17.5, ...on(12.0) },
      { kind: 'pad', team: 1, range: [54.4, 55.0], dir: -1, to: { x: 50.0, y: 14.1 }, apex: 17.5, ...on(12.0) },
      { kind: 'pad', team: 0, range: [24.2, 24.8], dir: 1, to: { x: 28.6, y: 20.0 }, apex: 24.5, ...on(14.1) },
      { kind: 'pad', team: 1, range: [47.2, 47.8], dir: -1, to: { x: 43.4, y: 20.0 }, apex: 24.5, ...on(14.1) },
      { kind: 'pad', team: 0, range: [29.6, 30.2], dir: 1, to: { x: 34.0, y: 22.5 }, apex: 25.8, ...on(20.0) },
      { kind: 'pad', team: 1, range: [41.8, 42.4], dir: -1, to: { x: 38.0, y: 22.5 }, apex: 25.8, ...on(20.0) },
      // the nook between a low cap and the island's edge: hop back up onto the cap
      { kind: 'pad', team: 0, range: [29.0, 29.6], dir: -1, to: { x: 23.0, y: 14.1 }, apex: 17.1, ...on(12.0) },
      { kind: 'pad', team: 1, range: [42.4, 43.0], dir: 1, to: { x: 49.0, y: 14.1 }, apex: 17.1, ...on(12.0) },
      { kind: 'pad', team: -1, range: [32.8, 33.4], dir: -1, to: { x: 16.0, y: 12.0 }, apex: 24.0, ...on(22.5) },
      { kind: 'pad', team: -1, range: [38.6, 39.2], dir: 1, to: { x: 56.0, y: 12.0 }, apex: 24.0, ...on(22.5) },
      {
        kind: 'high', team: -1, range: [33.0, 39.0], sign: null, signs: [33.4, 38.6], ...on(22.5),
        label: { name: '왕버섯 꼭대기', desc: '조준선이 두 배로 길어져요. 갓 밑은 구름이라 깨지면 끝이에요' },
      },
    ],
    features: {},
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

  // 층층 구름섬 (summer) — the shelves. Three floors of floating rock on each side, the homes on the
  // top floor, mushroom pads between the floors and one low crossing between the two bottom floors
  // under everything (drawn from a player's sketch). Lobs between the homes are always open; the
  // floors below are where you go to hide, to flank or to drop someone a floor (a fall of a floor
  // hurts, it does not knock out). Left home: a short top shelf 2.5 m lower, with a roofed ledge
  // right under it and the middle floor a hop away. Right home: a long high shelf whose front edge
  // stops flat shots, with a nut tree on it; under it an S-shaped middle floor (roofed) and below
  // that the basement.
  tiers: () => ({
    top: [[1.6, 7.4], [2.4, 9.0], [30.0, 9.0], [31.0, 7.6], [39.0, 9.0], [40.0, 10.5], [65.0, 10.5], [66.0, 9.0]],
    flat: [[2.4, 30.0], [40.0, 65.0]],
    islands: [
      { a: 1.6, b: 31.0, under: [[1.6, 7.6], [3.4, 6.0], [10, 4.6], [16, 4.0], [22, 4.8], [28, 6.2], [31.0, 7.4]] },
      { a: 39.0, b: 66.0, under: [[39.0, 9.0], [41, 7.6], [48, 6.6], [56, 6.4], [62, 7.0], [66.0, 8.8]] },
    ],
    // each side starts on one of its three floors (drawn per match); the home stays on top
    starts: [
      [{ x: 13.0, y: 20.8 }, { x: 25.0, y: 16.0 }, { x: 12.0, y: 9.0 }],
      [{ x: 60.0, y: 23.4 }, { x: 48.5, y: 18.0 }, { x: 55.0, y: 10.5 }],
    ],
    forts: [{ back: 6.9, facing: 1 }, { back: 67.0, facing: -1 }],
    ops: [
      ...shelf([[6.5, 20.8], [20.0, 20.8]], HOME), // left top (home)
      ...shelf([[14.0, 16.0], [30.0, 16.0]], THIN), // left middle
      ...shelf([[41.0, 23.4], [67.5, 23.4]], HOME), // right top (home)
      ...shelf([[35.0, 19.6], [39.5, 19.6], [44.5, 18.0], [56.0, 18.0]], THIN), // right middle, the S
      ...crag(8.0, 4.4), ...crag(20.0, 4.6, 0.9), ...crag(47.0, 6.6, 1.0), ...crag(60.0, 6.8, 0.8),
    ],
    // a spring on each top floor: down onto the middle floor, along it, and on down
    streams: [{ x: 16.0, y: 20.8, dir: 1 }, { x: 44.6, y: 23.4, dir: -1 }],
    spots: [
      // left: top ↔ middle, middle → basement, basement → top, and the low crossing
      { kind: 'pad', team: 0, range: [17.6, 18.2], dir: 1, to: { x: 22.5, y: 16.0 }, apex: 23.0, ...on(20.8) },
      { kind: 'pad', team: 0, range: [28.0, 28.6], dir: 1, to: { x: 16.5, y: 20.8 }, apex: 25.0, ...on(16.0) },
      { kind: 'pad', team: 0, range: [15.0, 15.6], dir: -1, to: { x: 7.5, y: 9.0 }, apex: 16.8, ...on(16.0) },
      { kind: 'pad', team: 0, range: [3.0, 3.6], dir: -1, to: { x: 11.0, y: 20.8 }, apex: 28.5, ...on(9.0) },
      { kind: 'pad', team: -1, range: [28.4, 29.0], dir: 1, to: { x: 45.0, y: 10.5 }, apex: 12.4, ...on(9.0) },
      {
        kind: 'burrow', team: 0, range: [14.6, 19.6], sign: 21.0, ...below(16.0),
        label: { name: '처마 밑', desc: '바로 위 선반이 지붕이 되어 높이 쏜 공격을 막아 줘요. 낮게 쏜 건 들어와요' },
      },
      // right: top ↔ middle, middle ↔ basement, and the crossing back
      { kind: 'pad', team: 1, range: [43.4, 44.0], dir: -1, to: { x: 37.6, y: 19.6 }, apex: 25.5, ...on(23.4) },
      { kind: 'pad', team: 1, range: [36.2, 36.8], dir: -1, to: { x: 42.6, y: 23.4 }, apex: 27.0, ...on(19.6) },
      { kind: 'pad', team: 1, range: [52.4, 53.0], dir: 1, to: { x: 60.5, y: 10.5 }, apex: 20.0, ...on(18.0) },
      { kind: 'pad', team: 1, range: [62.4, 63.0], dir: 1, to: { x: 51.0, y: 18.0 }, apex: 20.0, ...on(10.5) },
      { kind: 'pad', team: -1, range: [40.0, 40.6], dir: -1, to: { x: 23.0, y: 9.0 }, apex: 12.4, ...on(10.5) },
      {
        kind: 'burrow', team: 1, range: [44.5, 52.0], sign: 54.4, ...below(18.0),
        label: { name: '선반 밑', desc: '위 선반이 지붕이 되어 높이 쏜 공격을 막아 줘요. 낮게 쏜 건 들어와요' },
      },
      { kind: 'tree', team: 1, range: [44.8, 47.2], sign: 48.0, ...on(23.4), label: { name: '선반 위 명당', desc: '내 차례가 시작될 때마다 특수 견과 +1. 맨 위층이라 다 보여요' } },
    ],
    features: { trees: [tree(46.0, 'oak', { h: 4.6, canopyR: 1.9 })] },
  }),

  // 삼층 다리 (summer) — the three-deck bridge. Between two rock towers (the homes on top) run three
  // long decks, one above the other: two top halves with a gap in the middle, a middle deck and a
  // thick bottom deck. Carts on the same deck look straight down a corridor at each other; lobs
  // reach the decks below only through the gap and the ends. The top and middle decks are thin, so
  // a nut beside a cart drops it a deck. A spring on each top half runs to the gap, down the decks
  // and off the bottom deck's far end. Left home: the tower 1 m higher. Each side starts on its
  // tower, its top half or the middle deck under it.
  decks: () => ({
    top: [[4.4, 22.9], [5.2, 24.5], [13.2, 24.5], [13.4, 24.1], [58.6, 23.1], [58.8, 23.5], [66.8, 23.5], [67.6, 21.9]],
    flat: [[5.2, 13.2], [58.8, 66.8]],
    islands: [
      { a: 4.4, b: 13.4, calm: [12.4, 13.4], under: [[4.4, 22.5], [5.0, 14.0], [6.2, 7.0], [8.6, 4.4], [11.6, 4.4], [13.0, 5.6], [13.4, 6.4]] },
      { a: 58.6, b: 67.6, calm: [58.6, 59.6], under: [[58.6, 6.4], [59.0, 5.6], [61.6, 4.4], [64.6, 4.6], [66.8, 10.0], [67.6, 21.5]] },
    ],
    starts: [
      [{ x: 10.4, y: 24.5 }, { x: 24.0, y: 19.5 }, { x: 25.0, y: 14.5 }],
      [{ x: 61.6, y: 23.5 }, { x: 48.0, y: 19.5 }, { x: 47.0, y: 14.5 }],
    ],
    forts: [{ back: 4.8, facing: 1 }, { back: 67.2, facing: -1 }],
    ops: [
      ...shelf([[17.0, 19.5], [31.0, 19.5]], THIN), // top deck, left half
      ...shelf([[41.0, 19.5], [55.0, 19.5]], THIN), // top deck, right half
      ...shelf([[19.0, 14.5], [53.0, 14.5]], THIN), // middle deck
      ...shelf([[14.8, 9.5], [57.2, 9.5]], 2.4, [24.0, 36.0, 48.0]), // bottom deck
      ...crag(9.0, 5.2, 1.0), ...crag(63.0, 5.2, 1.0),
    ],
    streams: [{ x: 18.0, y: 19.5, dir: 1 }, { x: 54.0, y: 19.5, dir: -1 }],
    spots: [
      // towers onto the top halves; the halves down through the gap; the middle deck's ends down;
      // the bottom deck's ends back up the towers
      { kind: 'pad', team: 0, range: [12.0, 12.6], dir: 1, to: { x: 20.5, y: 19.5 }, apex: 26.0, ...on(24.5) },
      { kind: 'pad', team: 1, range: [59.4, 60.0], dir: -1, to: { x: 51.5, y: 19.5 }, apex: 25.5, ...on(23.5) },
      { kind: 'pad', team: 0, range: [28.6, 29.2], dir: 1, to: { x: 34.0, y: 14.5 }, apex: 22.5, ...on(19.5) },
      { kind: 'pad', team: 1, range: [42.8, 43.4], dir: -1, to: { x: 38.0, y: 14.5 }, apex: 22.5, ...on(19.5) },
      { kind: 'pad', team: -1, range: [19.6, 20.2], dir: -1, to: { x: 16.6, y: 9.5 }, apex: 15.8, ...on(14.5) },
      { kind: 'pad', team: -1, range: [51.8, 52.4], dir: 1, to: { x: 55.4, y: 9.5 }, apex: 15.8, ...on(14.5) },
      { kind: 'pad', team: 0, range: [15.6, 16.2], dir: -1, to: { x: 12.2, y: 24.5 }, apex: 29.0, ...on(9.5) },
      { kind: 'pad', team: 1, range: [55.8, 56.4], dir: 1, to: { x: 60.0, y: 23.5 }, apex: 28.0, ...on(9.5) },
      {
        kind: 'burrow', team: -1, range: [19.6, 30.4], sign: null, ...below(14.5),
        label: { name: '다리 2층', desc: '위 다리가 지붕이 되어 높이 쏜 공격을 막아 줘요. 같은 층에서 곧장 쏜 건 들어와요' },
      },
      {
        kind: 'burrow', team: -1, range: [41.6, 52.4], sign: null, ...below(14.5),
        label: { name: '다리 2층', desc: '위 다리가 지붕이 되어 높이 쏜 공격을 막아 줘요. 같은 층에서 곧장 쏜 건 들어와요' },
      },
      {
        kind: 'burrow', team: -1, range: [19.6, 52.4], sign: null, ...below(9.5),
        label: { name: '다리 1층', desc: '가운데 다리가 지붕이에요. 같은 층에서 곧장 쏜 건 들어와요' },
      },
    ],
    features: {},
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

  // 단풍 벼랑 선반 (autumn) — the cliff ledges. Two rock pillars face each other over a bottomless
  // gorge, homes on top, thin ledges clinging to each cliff face like balconies, a thick one at the
  // bottom. Nobody crosses: it is a duel from ledge to ledge, and a nut that breaks your ledge drops
  // you onto the one below. A spring on each pillar spills over the cliff and down every ledge.
  // Left home: the higher pillar (1.5 m up) with three ledges, the middle one roofed by the top one.
  // Right home: the lower, wider pillar with two ledges, the bottom one roofed. Each side starts on
  // its pillar or one of its ledges; pads step down the ledges and one climbs back to the top.
  cliffs: () => ({
    top: [[4.8, 22.4], [5.6, 24.0], [13.8, 24.0], [14.0, 23.6], [56.0, 22.1], [56.2, 22.5], [66.4, 22.5], [67.4, 20.9]],
    flat: [[5.6, 13.8], [56.2, 66.4]],
    islands: [
      { a: 4.8, b: 14.0, calm: [13.0, 14.0], under: [[4.8, 22.0], [5.4, 15.0], [6.6, 8.0], [9.0, 4.6], [12.0, 4.4], [13.6, 5.4], [14.0, 6.0]] },
      { a: 56.0, b: 67.4, calm: [56.0, 57.0], under: [[56.0, 5.8], [57.4, 4.8], [61.0, 4.4], [64.6, 6.6], [66.6, 12.0], [67.4, 20.5]] },
    ],
    starts: [
      [{ x: 11.2, y: 24.0 }, { x: 17.6, y: 19.0 }, { x: 23.4, y: 14.5 }],
      [{ x: 60.0, y: 22.5 }, { x: 51.4, y: 16.4 }, { x: 46.0, y: 11.5 }],
    ],
    forts: [{ back: 5.6, facing: 1 }, { back: 66.4, facing: -1 }],
    ops: [
      ...shelf([[13.6, 19.0], [21.0, 19.0]], THIN), // left ledges, top to bottom
      ...shelf([[13.6, 14.5], [26.0, 14.5]], THIN),
      ...shelf([[13.6, 9.0], [30.0, 9.0]], 3.0, [22.0]),
      ...shelf([[48.0, 16.4], [56.4, 16.4]], THIN), // right ledges
      ...shelf([[43.0, 11.5], [56.4, 11.5]], 3.0, [49.0]),
      ...crag(8.0, 5.4, 1.1), ...crag(61.0, 5.2, 1.1),
    ],
    streams: [{ x: 12.8, y: 24.0, dir: 1 }, { x: 58.6, y: 22.5, dir: -1 }],
    spots: [
      // left: pillar → ledge → ledge → bottom ledge, and the bottom ledge back up to the pillar
      { kind: 'pad', team: 0, range: [12.0, 12.6], dir: 1, to: { x: 18.4, y: 19.0 }, apex: 25.5, ...on(24.0) },
      { kind: 'pad', team: 0, range: [19.2, 19.8], dir: 1, to: { x: 24.0, y: 14.5 }, apex: 20.5, ...on(19.0) },
      { kind: 'pad', team: 0, range: [24.4, 25.0], dir: 1, to: { x: 28.2, y: 9.0 }, apex: 17.2, ...on(14.5) },
      { kind: 'pad', team: 0, range: [28.6, 29.2], dir: -1, to: { x: 11.0, y: 24.0 }, apex: 28.0, ...on(9.0) },
      {
        kind: 'burrow', team: 0, range: [14.6, 20.4], sign: 22.4, ...below(14.5),
        label: { name: '벼랑 굴', desc: '위 선반이 지붕이 되어 높이 쏜 공격을 막아 줘요. 낮게 쏜 건 들어와요' },
      },
      // right: pillar → ledge → bottom ledge, and back up
      { kind: 'pad', team: 1, range: [57.6, 58.2], dir: -1, to: { x: 51.0, y: 16.4 }, apex: 25.0, ...on(22.5) },
      { kind: 'pad', team: 1, range: [49.0, 49.6], dir: -1, to: { x: 45.4, y: 11.5 }, apex: 19.0, ...on(16.4) },
      { kind: 'pad', team: 1, range: [43.8, 44.4], dir: 1, to: { x: 61.0, y: 22.5 }, apex: 27.0, ...on(11.5) },
      {
        kind: 'burrow', team: 1, range: [49.4, 55.6], sign: 47.4, ...below(11.5),
        label: { name: '선반 굴', desc: '위 선반이 지붕이 되어 높이 쏜 공격을 막아 줘요. 낮게 쏜 건 들어와요' },
      },
    ],
    features: {},
  }),

  // 낙엽 우물 (autumn) — the leaf well. A deep well sunk into one wide island, the homes on its two
  // rims, thin ledges clinging to the well's walls one under another and a nut tree at the bottom.
  // Everything slopes inward and down: a broken ledge drops you deeper (it hurts, nothing more),
  // and the bottom is where the prize is, in full view of both rims. A spring on each rim spills
  // down that side's ledges and pools at the bottom. Left home: the lower rim with two ledges, the
  // lower one roofed by the upper and the well floor roofed by both. Right home: 1 m higher, two
  // ledges. Each side starts on its rim or one of its ledges.
  well: () => ({
    top: [[2.0, 18.4], [2.8, 20.0], [19.8, 20.0], [20.6, 7.0], [51.0, 7.0], [51.8, 21.0], [69.2, 21.0], [70.0, 19.4]],
    flat: [[2.8, 19.8], [20.6, 51.0], [51.8, 69.2]],
    islands: [
      { a: 2.0, b: 70.0, under: [[2.0, 18.6], [3.6, 14.0], [8, 9.0], [14, 6.0], [20, 4.0], [28, 2.6], [36, 2.4], [44, 2.6], [52, 4.0], [58, 6.0], [64, 9.0], [68.4, 14.0], [70.0, 19.0]] },
    ],
    starts: [
      [{ x: 12.0, y: 20.0 }, { x: 23.0, y: 15.5 }, { x: 23.0, y: 11.0 }],
      [{ x: 61.0, y: 21.0 }, { x: 49.5, y: 17.0 }, { x: 48.0, y: 12.5 }],
    ],
    forts: [{ back: 5.4, facing: 1 }, { back: 67.6, facing: -1 }],
    ops: [
      ...shelf([[20.2, 15.5], [25.0, 15.5]], THIN), // left ledges, each shorter than the one below
      ...shelf([[20.2, 11.0], [29.0, 11.0]], THIN),
      ...shelf([[47.0, 17.0], [51.4, 17.0]], THIN), // right ledges
      ...shelf([[43.0, 12.5], [51.4, 12.5]], THIN),
      ...crag(14.0, 4.8, 1.0), ...crag(36.0, 3.0, 1.2), ...crag(58.0, 4.8, 1.0),
    ],
    streams: [{ x: 18.4, y: 20.0, dir: 1 }, { x: 53.2, y: 21.0, dir: -1 }],
    spots: [
      // rims down onto the top ledges, ledge to ledge, down to the floor, and the floor back up to the
      // rims (those climb past the ledge tips, so they sit out in the middle of the floor)
      { kind: 'pad', team: 0, range: [17.2, 17.8], dir: 1, to: { x: 22.6, y: 15.5 }, apex: 22.5, ...on(20.0) },
      { kind: 'pad', team: 1, range: [54.2, 54.8], dir: -1, to: { x: 49.0, y: 17.0 }, apex: 23.5, ...on(21.0) },
      { kind: 'pad', team: 0, range: [23.4, 24.0], dir: 1, to: { x: 26.6, y: 11.0 }, apex: 19.5, ...on(15.5) },
      { kind: 'pad', team: 0, range: [27.4, 28.0], dir: 1, to: { x: 32.6, y: 7.0 }, apex: 12.4, ...on(11.0) },
      { kind: 'pad', team: 1, range: [47.6, 48.2], dir: -1, to: { x: 45.0, y: 12.5 }, apex: 20.5, ...on(17.0) },
      { kind: 'pad', team: 1, range: [43.6, 44.2], dir: -1, to: { x: 38.6, y: 7.0 }, apex: 14.6, ...on(12.5) },
      { kind: 'pad', team: 0, range: [31.6, 32.2], dir: 1, to: { x: 17.0, y: 20.0 }, apex: 26.0, ...on(7.0) }, // fires driving out of the nook
      { kind: 'pad', team: 1, range: [39.8, 40.4], dir: 1, to: { x: 56.0, y: 21.0 }, apex: 27.0, ...on(7.0) },
      { kind: 'tree', team: -1, range: [34.8, 37.2], sign: null, ...on(7.0), label: { name: '우물 바닥 명당', desc: '내 차례가 시작될 때마다 특수 견과 +1. 맨 바닥이라 양쪽 가장자리에서 다 보여요' } },
      {
        kind: 'burrow', team: 0, range: [20.8, 24.4], sign: null, ...below(11.0),
        label: { name: '우물 굴', desc: '위 선반이 지붕이 되어 높이 쏜 공격을 막아 줘요. 낮게 쏜 건 들어와요' },
      },
      {
        kind: 'burrow', team: 0, range: [21.2, 28.4], sign: null, ...below(7.0),
        label: { name: '우물 밑 굴', desc: '선반 둘이 지붕이에요. 우물 바닥에서 곧장 쏜 건 들어와요' },
      },
      {
        kind: 'burrow', team: 1, range: [47.6, 50.8], sign: null, ...below(12.5),
        label: { name: '우물 굴', desc: '위 선반이 지붕이 되어 높이 쏜 공격을 막아 줘요. 낮게 쏜 건 들어와요' },
      },
    ],
    features: { trees: [tree(36.0, 'ginkgo', { h: 4.6, canopyR: 1.9 })] },
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
  // The map is its own two floors (the plateau and the lowland, joined by that pad): a rock in the
  // sky here would sit right in the plateau's lane down to the lowland.
  pine: () => ({
    top: [[2.2, 15.8], [3.4, 17.6], [24.6, 17.6], [25.4, 17.4], [27.2, 11.8], [27.8, 11.6], [68.4, 11.6], [69.6, 10.0]],
    flat: [[3.4, 24.6], [27.8, 68.4]],
    islands: [{
      a: 2.3, b: 69.7,
      under: [[2.3, 16.0], [3.6, 14.2], [8, 13.2], [14, 12.8], [19, 13.0], [22.5, 14.0], [24.8, 14.8], [26.2, 10.0], [29, 8.0], [34, 7.4], [42, 7.2], [50, 7.4], [58, 7.6], [65, 8.0], [69.7, 9.8]],
    }],
    bases: [10.2, 61.2],
    forts: [{ back: 4.4, facing: 1 }, { back: 67.8, facing: -1 }],
    ops: [...crag(8.0, 12.4), ...crag(18.0, 12.2, 0.9), ...crag(40.0, 6.4, 1.2), ...crag(55.0, 6.8, 1.0)],
    spots: [
      { kind: 'high', team: 0, range: [21.6, 24.4], sign: 20.8, label: { name: '벼랑 끝', desc: '조준선이 두 배로 길어져요. 벼랑 끝이라 땅이 얇아요' } },
      { kind: 'tree', team: 1, range: [30.4, 33.2], sign: 34.0, label: { name: '절벽 밑 소나무', desc: '내 차례가 시작될 때마다 특수 견과 +1. 벼랑 위에서 다 내려다봐요' } },
      { kind: 'pad', team: 1, range: [28.4, 29.2], dir: -1, to: { x: 16.0, y: 17.6 }, apex: 22.4 },
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

  // 얼음 누각 (winter) — the ice pavilion. A three-storey open pavilion of thin ice floats in the
  // middle between the two home islands: a top deck (the lookout everybody wants), a wide middle
  // floor open at both ends, and a small bottom floor under its middle. The higher you stand, the
  // more floors there are under you to catch a fall; under each open end of the middle floor hangs
  // a thick block of ice, and the bottom floor's ends hop sideways onto them. A spring on the top
  // deck runs off both ends, down every floor and away. Left home: 1 m higher; the pavilion
  // itself is the same from both sides. Each side starts at home, on its end of the middle floor
  // or on its ice block.
  pavilion: () => ({
    top: [[2.0, 11.6], [2.8, 13.2], [20.4, 13.2], [21.0, 11.8], [51.0, 10.8], [51.6, 12.2], [69.2, 12.2], [70.0, 10.6]],
    flat: [[2.8, 20.4], [51.6, 69.2]],
    islands: [
      { a: 2.0, b: 21.0, under: [[2.0, 11.8], [3.6, 8.6], [8, 7.0], [14, 6.6], [18, 7.6], [21.0, 10.4]] },
      { a: 51.0, b: 70.0, under: [[51.0, 10.8], [53, 9.4], [58, 8.0], [64, 8.0], [68, 9.6], [70.0, 10.8]] },
    ],
    starts: [
      [{ x: 12.0, y: 13.2 }, { x: 28.2, y: 17.0 }, { x: 27.6, y: 12.5 }],
      [{ x: 61.0, y: 12.2 }, { x: 44.0, y: 17.0 }, { x: 44.6, y: 12.5 }],
    ],
    forts: [{ back: 5.4, facing: 1 }, { back: 67.6, facing: -1 }],
    ops: [
      ...shelf([[30.0, 22.0], [42.0, 22.0]], THIN), // the pavilion: top deck,
      ...shelf([[26.0, 17.0], [46.0, 17.0]], THIN), // the wide middle floor,
      ...shelf([[33.0, 12.0], [39.0, 12.0]], THIN), // the small bottom floor,
      ...shelf([[24.6, 12.5], [30.4, 12.5]], 2.6, [27.6]), // and the ice blocks under the open ends
      ...shelf([[41.6, 12.5], [47.4, 12.5]], 2.6, [44.4]),
      ...crag(9.0, 6.6, 1.0), ...crag(16.0, 6.8, 0.8), ...crag(57.0, 7.6, 1.0), ...crag(64.0, 7.6, 0.8),
    ],
    streams: [{ x: 35.6, y: 22.0, dir: -1 }, { x: 36.6, y: 22.0, dir: 1 }],
    spots: [
      // from home onto your end of the middle floor, and from there up onto the deck
      { kind: 'pad', team: 0, range: [17.8, 18.4], dir: 1, to: { x: 28.0, y: 17.0 }, apex: 21.0, ...on(13.2) },
      { kind: 'pad', team: 1, range: [53.6, 54.2], dir: -1, to: { x: 44.0, y: 17.0 }, apex: 21.2, ...on(12.2) },
      { kind: 'pad', team: 0, range: [27.0, 27.6], dir: -1, to: { x: 33.0, y: 22.0 }, apex: 27.0, ...on(17.0) },
      { kind: 'pad', team: 1, range: [44.4, 45.0], dir: 1, to: { x: 39.0, y: 22.0 }, apex: 27.0, ...on(17.0) },
      // the deck's ends drop you home
      { kind: 'pad', team: -1, range: [30.8, 31.4], dir: -1, to: { x: 16.0, y: 13.2 }, apex: 24.0, ...on(22.0) },
      { kind: 'pad', team: -1, range: [40.6, 41.2], dir: 1, to: { x: 56.0, y: 12.2 }, apex: 24.0, ...on(22.0) },
      // the bottom floor hops sideways onto the ice blocks, and the ice blocks go home
      { kind: 'pad', team: -1, range: [33.6, 34.2], dir: -1, to: { x: 28.0, y: 12.5 }, apex: 14.2, ...on(12.0) },
      { kind: 'pad', team: -1, range: [37.8, 38.4], dir: 1, to: { x: 44.4, y: 12.5 }, apex: 14.2, ...on(12.0) },
      { kind: 'pad', team: 0, range: [25.0, 25.6], dir: -1, to: { x: 16.0, y: 13.2 }, apex: 16.4, ...on(12.5) },
      { kind: 'pad', team: 1, range: [46.4, 47.0], dir: 1, to: { x: 56.0, y: 12.2 }, apex: 16.0, ...on(12.5) },
      {
        kind: 'high', team: -1, range: [32.0, 40.0], sign: null, signs: [31.6, 40.4], ...on(22.0),
        label: { name: '누각 꼭대기', desc: '조준선이 두 배로 길어져요. 아래층이 둘이라 깨져도 받쳐 줘요' },
      },
      {
        kind: 'burrow', team: -1, range: [30.6, 41.4], sign: null, ...below(17.0),
        label: { name: '누각 2층', desc: '꼭대기 층이 지붕이 되어 높이 쏜 공격을 막아 줘요. 낮게 쏜 건 들어와요' },
      },
      {
        kind: 'burrow', team: -1, range: [33.4, 38.6], sign: null, ...below(12.0),
        label: { name: '누각 1층', desc: '위층이 지붕이에요. 여기가 깨지면 구름이니 조심해요' },
      },
    ],
    features: {},
  }),

  // 빙하 틈새 (winter) — the crevasse. Two glacier plateaus with a bottomless crack between them,
  // the homes on top, and two thin ice bridges across the crack: an upper one broken in the middle
  // and a lower one right across, roofed by the upper halves. Down in the crack you are out of
  // reach of most lobs, but there is nothing under the lower bridge: break it and it is the clouds.
  // A spring on each plateau pours into the crack, off the upper bridge and pools on the lower one.
  // Left home: 1 m lower. Each side starts on its plateau or its half of the upper bridge.
  crevasse: () => ({
    top: [[2.0, 18.4], [2.8, 20.0], [25.8, 20.0], [26.0, 19.6], [46.0, 20.6], [46.2, 21.0], [69.2, 21.0], [70.0, 19.4]],
    flat: [[2.8, 25.8], [46.2, 69.2]],
    islands: [
      { a: 2.0, b: 26.0, calm: [25.0, 26.0], under: [[2.0, 18.6], [3.6, 14.0], [8, 9.0], [14, 6.0], [20, 4.6], [24, 4.4], [26.0, 5.0]] },
      { a: 46.0, b: 70.0, calm: [46.0, 47.0], under: [[46.0, 5.0], [48, 4.4], [52, 4.6], [58, 6.0], [64, 9.0], [68.4, 14.0], [70.0, 19.4]] },
    ],
    starts: [
      [{ x: 12.0, y: 20.0 }, { x: 30.0, y: 16.0 }],
      [{ x: 61.0, y: 21.0 }, { x: 42.0, y: 16.0 }],
    ],
    forts: [{ back: 5.4, facing: 1 }, { back: 67.6, facing: -1 }],
    ops: [
      ...shelf([[25.8, 16.0], [32.5, 16.0]], THIN), // the upper bridge, broken in the middle
      ...shelf([[39.5, 16.0], [46.2, 16.0]], THIN),
      ...shelf([[25.8, 11.5], [46.2, 11.5]], THIN), // the lower bridge, right across
      ...crag(10.0, 6.0, 1.0), ...crag(18.0, 4.6, 0.9), ...crag(54.0, 4.6, 0.9), ...crag(62.0, 6.4, 1.0),
    ],
    streams: [{ x: 22.0, y: 20.0, dir: 1 }, { x: 50.0, y: 21.0, dir: -1 }],
    spots: [
      // plateaus down onto the upper bridge, and back up
      { kind: 'pad', team: 0, range: [23.6, 24.2], dir: 1, to: { x: 30.0, y: 16.0 }, apex: 22.0, ...on(20.0) },
      { kind: 'pad', team: 1, range: [47.8, 48.4], dir: -1, to: { x: 42.0, y: 16.0 }, apex: 23.0, ...on(21.0) },
      { kind: 'pad', team: 0, range: [28.6, 29.2], dir: -1, to: { x: 21.5, y: 20.0 }, apex: 25.0, ...on(16.0) },
      { kind: 'pad', team: 1, range: [42.8, 43.4], dir: 1, to: { x: 50.5, y: 21.0 }, apex: 26.0, ...on(16.0) },
      // the upper bridge down through its break onto the lower bridge; back up from the lower
      // bridge, driving toward the middle (so the roofed ends stay a drive away)
      { kind: 'pad', team: 0, range: [30.8, 31.4], dir: 1, to: { x: 36.0, y: 11.5 }, apex: 19.5, ...on(16.0) },
      { kind: 'pad', team: 1, range: [40.6, 41.2], dir: -1, to: { x: 36.0, y: 11.5 }, apex: 19.5, ...on(16.0) },
      { kind: 'pad', team: 0, range: [35.0, 35.6], dir: 1, to: { x: 30.0, y: 16.0 }, apex: 21.0, ...on(11.5) },
      { kind: 'pad', team: 1, range: [36.6, 37.2], dir: -1, to: { x: 42.0, y: 16.0 }, apex: 21.0, ...on(11.5) },
      {
        kind: 'burrow', team: 0, range: [26.6, 31.9], sign: null, ...below(11.5),
        label: { name: '틈새 굴', desc: '위 다리가 지붕이 되어 높이 쏜 공격을 막아 줘요. 발밑 다리가 깨지면 끝이에요' },
      },
      {
        kind: 'burrow', team: 1, range: [40.1, 45.4], sign: null, ...below(11.5),
        label: { name: '틈새 굴', desc: '위 다리가 지붕이 되어 높이 쏜 공격을 막아 줘요. 발밑 다리가 깨지면 끝이에요' },
      },
    ],
    features: {},
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
