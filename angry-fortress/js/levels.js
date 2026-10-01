// Forest map themes (look + landscape layout), fort blueprints and neutral props.

const PAL = {
  // shared soil tones, tweaked per theme below
  soil: { dirt: '#7a4a26', dirtLight: '#96603a', dirtDark: '#4f2c14', root: '#3e2210', pebble: '#b59a7a', pebble2: '#8c7358', pebbleDark: '#2e1a0c', outline: '#2e1a0c' },
};

export const THEMES = {
  oak: {
    id: 'oak',
    name: '도토리 숲',
    desc: '거대 참나무가 선 두 층 하늘섬',
    layout: { mid: 'mesa', baseMin: 11, baseMax: 12.5, midMin: 19, midMax: 20, rough: 0.9, tunnel: true },
    sky: ['#5fb6ea', '#a8dcf5', '#e9f8e8'],
    sun: { x: 0.78, y: 0.16, color: '#fff7cf', glow: 'rgba(255,246,200,0.6)' },
    rays: 'rgba(255,250,215,0.10)',
    clouds: 5,
    cloud: 'rgba(255,255,255,0.95)',
    cloudShade: 'rgba(200,228,240,0.9)',
    far: '#9cc9a0', // distant forest line
    mid: ['#6fae76', '#86c38a'], // mid trees: body, highlight
    near: ['#94c49b', '#7d9272'], // big background trunks: canopy, trunk
    mist: 'rgba(235,250,235,0.35)',
    trees: ['oak', 'oak', 'chestnut'],
    bgTree: 'round',
    ambient: 'pollen',
    leaf: ['rgba(120,200,80,0.75)', 'rgba(170,215,90,0.7)'],
    sea: { top: 'rgba(70,170,200,0.78)', bottom: 'rgba(26,92,120,0.95)', foam: '#e8fbff', reed: '#5d8f3a' },
    abyss: { cloud: '#ffffff', shade: '#d6ebf7', deep: '#8fb9d8', water: 'rgba(225,245,255,0.85)' },
    ground: {
      ...PAL.soil,
      grass: '#67c23a', grassDark: '#3b8f27', grassLight: '#b9ee72',
      deep: 'rgba(30,12,2,0.5)', bevel: 'rgba(35,15,4,0.22)', scorch: 'rgba(40,20,8,0.8)', cave: 'rgba(40,20,8,0.92)',
      decor: ['fern', 'bush', 'clover', 'mushroom', 'flower'],
      flowers: ['#ff7aa8', '#ffffff', '#ffd24d', '#b38cff'],
      mushrooms: ['#e5452f', '#c98a4a'],
    },
  },
  maple: {
    id: 'maple',
    name: '단풍 협곡',
    desc: '끝없는 낭떠러지 위 통나무 다리',
    layout: { mid: 'gorge', baseMin: 11, baseMax: 13.5, midMin: 13, midMax: 14.5, rough: 0.8 },
    sky: ['#f39b5c', '#ffcf94', '#fff1d6'],
    sun: { x: 0.24, y: 0.22, color: '#fff3d0', glow: 'rgba(255,214,140,0.6)' },
    rays: 'rgba(255,225,170,0.12)',
    clouds: 4,
    cloud: 'rgba(255,244,228,0.9)',
    cloudShade: 'rgba(255,212,170,0.85)',
    far: '#e0a078',
    mid: ['#cf6d45', '#e8925a'],
    near: ['#dd9166', '#9a6a4c'],
    mist: 'rgba(255,230,200,0.35)',
    trees: ['maple', 'maple', 'oak'],
    bgTree: 'round',
    ambient: 'leaf',
    leaf: ['rgba(230,110,40,0.85)', 'rgba(245,170,50,0.85)', 'rgba(205,60,40,0.8)'],
    sea: { top: 'rgba(70,175,190,0.8)', bottom: 'rgba(24,100,120,0.95)', foam: '#eafffb', reed: '#8a7a3a' },
    abyss: { cloud: '#fff4e6', shade: '#ffd3ad', deep: '#d98a6a', water: 'rgba(235,250,250,0.85)' },
    ground: {
      ...PAL.soil,
      dirt: '#8a4f2a', dirtLight: '#a8683d', dirtDark: '#5a3016',
      grass: '#d9a03a', grassDark: '#a8661f', grassLight: '#ffd27a',
      deep: 'rgba(60,20,2,0.45)', bevel: 'rgba(80,30,5,0.2)', scorch: 'rgba(60,24,6,0.75)', cave: 'rgba(60,26,8,0.92)',
      decor: ['leaves', 'bush', 'mushroom', 'leaves'],
      leaves: ['#e0662a', '#f2a33a', '#c9432b', '#f6c44f'],
      mushrooms: ['#c98a4a', '#e5452f'],
    },
  },
  pine: {
    id: 'pine',
    name: '소나무 언덕',
    desc: '구름 위 긴 능선과 아슬아슬한 바위',
    layout: { mid: 'hill', baseMin: 12, baseMax: 14, midMin: 19, midMax: 20.5, rough: 1.0, ledges: 3.6 },
    sky: ['#86b4cf', '#c3dde6', '#eef6ef'],
    sun: { x: 0.7, y: 0.2, color: '#fffbe8', glow: 'rgba(255,250,230,0.5)' },
    rays: 'rgba(255,255,240,0.09)',
    clouds: 3,
    cloud: 'rgba(255,255,255,0.85)',
    cloudShade: 'rgba(210,225,232,0.85)',
    far: '#9fbcb8',
    mid: ['#5e8c7c', '#76a291'],
    near: ['#7ea396', '#6a5a4a'],
    mist: 'rgba(240,248,245,0.55)',
    trees: ['pine', 'pine', 'chestnut'],
    bgTree: 'pine',
    ambient: 'mist',
    leaf: ['rgba(90,140,90,0.7)'],
    sea: { top: 'rgba(90,160,180,0.8)', bottom: 'rgba(30,80,100,0.95)', foam: '#f2fbff', reed: '#6b7f3f' },
    abyss: { cloud: '#f7fafa', shade: '#d3e0e3', deep: '#8fa7b0', water: 'rgba(235,245,250,0.85)' },
    ground: {
      ...PAL.soil,
      dirt: '#6d4a33', dirtLight: '#86604a', dirtDark: '#452c1c',
      grass: '#5aa05a', grassDark: '#2f6e3c', grassLight: '#a6d98a',
      deep: 'rgba(20,14,6,0.5)', bevel: 'rgba(25,18,8,0.22)', scorch: 'rgba(30,20,10,0.8)', cave: 'rgba(30,20,12,0.92)',
      decor: ['fern', 'needles', 'mushroom', 'fern', 'clover'],
      mushrooms: ['#c98a4a', '#e8dcc0'],
    },
  },
  night: {
    id: 'night',
    name: '반딧불 밤숲',
    desc: '조각난 하늘섬과 통통 버섯',
    layout: { mid: 'valley', baseMin: 13, baseMax: 15, midMin: 10, midMax: 11, rough: 1.0, spire: true, islands: 8 },
    sky: ['#101a3c', '#233a6b', '#3e5f8a'],
    sun: { x: 0.62, y: 0.16, color: '#fff4d6', glow: 'rgba(200,220,255,0.28)', moon: true },
    rays: null,
    clouds: 3,
    cloud: 'rgba(120,140,190,0.55)',
    cloudShade: 'rgba(70,85,140,0.6)',
    far: '#2a3d5f',
    mid: ['#223452', '#2d4468'],
    near: ['#2a3f62', '#2c2a36'],
    mist: 'rgba(120,150,210,0.18)',
    night: true,
    trees: ['chestnut', 'oak', 'chestnut'],
    bgTree: 'round',
    ambient: 'firefly',
    leaf: ['rgba(120,170,140,0.5)'],
    sea: { top: 'rgba(60,100,160,0.8)', bottom: 'rgba(12,28,60,0.97)', foam: '#bfd6ff', reed: '#2f4a3a' },
    abyss: { cloud: '#8fa2d6', shade: '#5b6aa6', deep: '#141c3d', water: 'rgba(190,215,255,0.75)' },
    ground: {
      ...PAL.soil,
      dirt: '#4a3a3a', dirtLight: '#5e4a48', dirtDark: '#2c2124',
      grass: '#3f8a6a', grassDark: '#245a48', grassLight: '#7fd0a8',
      deep: 'rgba(5,4,12,0.55)', bevel: 'rgba(0,0,0,0.25)', scorch: 'rgba(10,8,14,0.8)', cave: 'rgba(12,10,18,0.94)',
      decor: ['fern', 'glowshroom', 'bush', 'glowshroom'],
      mushrooms: ['#7ff0e0', '#b9a2ff'],
    },
  },
};

export const THEME_ORDER = ['oak', 'maple', 'pine', 'night'];

// Fort blueprints. x is measured from the fort's back edge toward the enemy,
// y from the ground to the block centre. Units: meters.
const P = 0.26; // plank thickness
// Forts sit 3 m in front of the captain and stay under ~2.6 m, so lobs above ~35°
// clear your own wall while flat shots from the enemy get blocked.
export const FORTS = [
  {
    name: 'gate',
    blocks: [
      { m: 'wood', x: 0.13, y: 0.85, w: P, h: 1.7 },
      { m: 'wood', x: 1.87, y: 0.85, w: P, h: 1.7 },
      { m: 'wood', x: 1.0, y: 1.7 + P / 2, w: 2.3, h: P },
      { m: 'stone', x: 1.0, y: 0.36, w: 0.72, h: 0.72 },
      { m: 'leaf', x: 0.6, y: 1.7 + P + 0.3, w: 0.6, h: 0.6, swap: true },
      { m: 'leaf', x: 1.4, y: 1.7 + P + 0.3, w: 0.6, h: 0.6, swap: true },
    ],
  },
  {
    name: 'tower',
    blocks: [
      { m: 'stone', x: 0.45, y: 0.4, w: 0.8, h: 0.8 },
      { m: 'stone', x: 1.35, y: 0.4, w: 0.8, h: 0.8 },
      { m: 'wood', x: 0.9, y: 0.8 + P / 2, w: 2.0, h: P },
      { m: 'leaf', x: 0.2, y: 0.8 + P + 0.5, w: P, h: 1.0 },
      { m: 'leaf', x: 1.6, y: 0.8 + P + 0.5, w: P, h: 1.0 },
      { m: 'wood', x: 0.9, y: 0.8 + P + 1.0 + P / 2, w: 2.0, h: P },
    ],
  },
  {
    name: 'bunker',
    blocks: [
      { m: 'wood', x: 0.15, y: 0.7, w: P, h: 1.4 },
      { m: 'wood', x: 1.05, y: 0.7, w: P, h: 1.4 },
      { m: 'wood', x: 1.95, y: 0.7, w: P, h: 1.4 },
      { m: 'stone', x: 1.05, y: 1.4 + P / 2, w: 2.4, h: P },
      { m: 'hive', x: 0.6, y: 0.35, w: 0.7, h: 0.7 },
      { m: 'mushroom', x: 1.05, y: 1.4 + P + 0.3, w: 0.7, h: 0.6 },
    ],
  },
  {
    name: 'stack',
    blocks: [
      { m: 'wood', x: 0.4, y: 0.4, w: 0.8, h: 0.8 },
      { m: 'wood', x: 1.3, y: 0.4, w: 0.8, h: 0.8 },
      { m: 'stone', x: 0.85, y: 0.8 + 0.4, w: 0.8, h: 0.8 },
      { m: 'leaf', x: 0.85, y: 1.6 + 0.35, w: 0.7, h: 0.7, swap: true },
      { m: 'mushroom', x: 1.75, y: 0.3, w: 0.6, h: 0.6 },
    ],
  },
  {
    name: 'logwall',
    blocks: [
      { m: 'log', x: 1.1, y: 0.28, w: 2.2, h: 0.56 },
      { m: 'log', x: 1.1, y: 0.84, w: 2.0, h: 0.56 },
      { m: 'wood', x: 0.35, y: 1.12 + 0.5, w: P, h: 1.0 },
      { m: 'wood', x: 1.85, y: 1.12 + 0.5, w: P, h: 1.0 },
      { m: 'leaf', x: 1.1, y: 2.12 + P / 2, w: 2.0, h: P },
    ],
  },
  {
    name: 'hut',
    blocks: [
      { m: 'leaf', x: 0.2, y: 0.6, w: 0.4, h: 1.2 },
      { m: 'leaf', x: 1.6, y: 0.6, w: 0.4, h: 1.2 },
      { m: 'wood', x: 0.9, y: 1.2 + P / 2, w: 2.0, h: P },
      { m: 'stone', x: 0.9, y: 0.35, s: 'circle', r: 0.35 },
      { m: 'hive', x: 0.9, y: 1.2 + P + 0.33, w: 0.66, h: 0.66 },
    ],
  },
];

// Neutral props scattered over the middle of the map. `slope` = how much tilt they tolerate.
export const PROPS = [
  {
    name: 'hive-pile',
    weight: 2,
    blocks: [
      { m: 'hive', x: 0.4, y: 0.35, w: 0.7, h: 0.7 },
      { m: 'wood', x: 0.4, y: 0.7 + P / 2, w: 1.4, h: P },
      { m: 'leaf', x: 0.4, y: 0.7 + P + 0.3, s: 'circle', r: 0.3 },
    ],
  },
  {
    name: 'pillars',
    weight: 1,
    blocks: [
      { m: 'stone', x: 0.2, y: 0.9, w: 0.34, h: 1.8 },
      { m: 'stone', x: 1.6, y: 0.9, w: 0.34, h: 1.8 },
      { m: 'wood', x: 0.9, y: 1.8 + P / 2, w: 2.0, h: P },
      { m: 'hive', x: 0.9, y: 1.8 + P + 0.33, w: 0.66, h: 0.66 },
    ],
  },
  {
    name: 'boulders',
    weight: 1,
    blocks: [
      { m: 'stone', x: 0.4, y: 0.45, s: 'circle', r: 0.45 },
      { m: 'mushroom', x: 1.35, y: 0.35, w: 0.7, h: 0.7 },
    ],
  },
  {
    name: 'logs',
    weight: 2,
    blocks: [
      { m: 'log', x: 0.5, y: 0.5, s: 'circle', r: 0.5 },
      { m: 'log', x: 1.6, y: 0.45, s: 'circle', r: 0.45 },
    ],
  },
  {
    name: 'logpile',
    weight: 1,
    blocks: [
      { m: 'log', x: 1.1, y: 0.28, w: 2.2, h: 0.56 },
      { m: 'leaf', x: 0.6, y: 0.56 + 0.3, w: 0.6, h: 0.6 },
      { m: 'mushroom', x: 1.5, y: 0.56 + 0.3, w: 0.6, h: 0.6 },
    ],
  },
  {
    name: 'mushrooms',
    weight: 1,
    blocks: [
      { m: 'mushroom', x: 0.4, y: 0.45, w: 0.9, h: 0.9 },
      { m: 'mushroom', x: 1.3, y: 0.3, w: 0.6, h: 0.6 },
    ],
  },
];

// The nut supply basket: breaking it gives the shooter a bonus special nut.
export const CRATE = { name: 'crate', blocks: [{ m: 'crate', x: 0.38, y: 0.3, w: 0.76, h: 0.6 }] };
