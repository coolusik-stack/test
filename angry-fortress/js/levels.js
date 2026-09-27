// Map themes (look + landscape layout) and fort blueprints.

export const THEMES = {
  meadow: {
    id: 'meadow',
    name: '도토리 숲',
    desc: '참나무 언덕과 하늘섬',
    layout: { mid: 'hill', baseMin: 9, baseMax: 11.5, midMin: 13, midMax: 16, rough: 1.1, island: true },
    sky: ['#58b7f5', '#9fdcff', '#e6f8ff'],
    sun: { x: 0.8, y: 0.2, color: '#fff6c9', glow: 'rgba(255,245,200,0.55)' },
    cloud: 'rgba(255,255,255,0.95)',
    cloudShade: 'rgba(196,226,248,0.9)',
    far: ['#9fd0a8', '#7cbf8a'],
    near: '#5aa86a',
    decor: 'tree',
    ambient: 'leaf',
    leaf: ['rgba(120,200,80,0.7)', 'rgba(240,170,60,0.7)'],
    sea: { top: 'rgba(64,170,235,0.78)', bottom: 'rgba(22,92,170,0.95)', foam: '#e8f8ff', lava: false },
    ground: {
      dirt: '#9a6334', dirtLight: '#bd8249', dirtDark: '#6a3f1f',
      pebble: '#d0ab80', pebble2: '#b18a62', pebbleDark: '#4f2f16',
      outline: '#3d2310', grass: '#6fcb3c', grassDark: '#3d9a24', grassLight: '#c3f47a',
      deep: 'rgba(38,16,4,0.5)', bevel: 'rgba(40,18,4,0.22)', scorch: 'rgba(45,24,10,0.8)',
      cave: 'rgba(52,26,10,0.9)',
      flowers: ['#ff6fa3', '#ffffff', '#ffd24d', '#b38cff'],
    },
  },
  desert: {
    id: 'desert',
    name: '단풍 협곡',
    desc: '쌍둥이 봉우리와 바위 아치',
    layout: { mid: 'twin', baseMin: 8.5, baseMax: 12, midMin: 14, midMax: 17, rough: 0.8, arch: true },
    sky: ['#f59d52', '#ffcf8a', '#fff0d2'],
    sun: { x: 0.25, y: 0.24, color: '#fff3d0', glow: 'rgba(255,214,140,0.6)' },
    cloud: 'rgba(255,244,228,0.9)',
    cloudShade: 'rgba(255,212,170,0.85)',
    far: ['#e7a877', '#d0764a'],
    near: '#c47a4b',
    decor: 'maple',
    ambient: 'leaf',
    leaf: ['rgba(230,110,40,0.8)', 'rgba(245,170,50,0.8)', 'rgba(200,60,40,0.75)'],
    sea: { top: 'rgba(56,196,196,0.8)', bottom: 'rgba(18,110,130,0.95)', foam: '#e9fffb', lava: false },
    ground: {
      dirt: '#dc9b55', dirtLight: '#efbb77', dirtDark: '#b06a33',
      pebble: '#f1c68f', pebble2: '#c98a4f', pebbleDark: '#7d4219',
      outline: '#6e3a14', grass: '#f6d88c', grassDark: '#d9a75b', grassLight: '#fff3c7',
      deep: 'rgba(90,34,4,0.45)', bevel: 'rgba(110,50,10,0.2)', scorch: 'rgba(70,30,8,0.7)', cave: 'rgba(96,44,14,0.9)',
    },
  },
  snow: {
    id: 'snow',
    name: '눈꽃 봉우리',
    desc: '높은 설산과 얼음 동굴',
    layout: { mid: 'hill', baseMin: 10, baseMax: 13, midMin: 17, midMax: 20, rough: 1.3, caves: 2 },
    sky: ['#7aa7d9', '#b9d6f0', '#eef6ff'],
    sun: { x: 0.72, y: 0.18, color: '#ffffff', glow: 'rgba(235,245,255,0.6)' },
    cloud: 'rgba(255,255,255,0.95)',
    cloudShade: 'rgba(205,220,240,0.9)',
    far: ['#c8d9ee', '#a6bedc'],
    near: '#86a3c7',
    decor: 'pine',
    ambient: 'snow',
    sea: { top: 'rgba(80,140,200,0.8)', bottom: 'rgba(30,60,120,0.95)', foam: '#ffffff', lava: false },
    ground: {
      dirt: '#7c89a8', dirtLight: '#9ba9c7', dirtDark: '#57627f',
      pebble: '#c4d0e6', pebble2: '#9fb0cf', pebbleDark: '#3b4560',
      outline: '#2c3551', grass: '#ffffff', grassDark: '#cfe2f7', grassLight: '#ffffff',
      deep: 'rgba(20,24,60,0.45)', bevel: 'rgba(20,30,70,0.2)', scorch: 'rgba(30,30,50,0.7)', cave: 'rgba(28,36,66,0.92)',
    },
  },
  volcano: {
    id: 'volcano',
    name: '용암 섬',
    desc: '용암 바다 위의 밤송이 전쟁',
    layout: { mid: 'valley', baseMin: 11, baseMax: 13.5, midMin: 6.5, midMax: 8, rough: 1.0, caves: 1, spire: true },
    sky: ['#2b1d45', '#6b2f5a', '#e0664a'],
    sun: { x: 0.5, y: 0.16, color: '#ffd9b0', glow: 'rgba(255,120,60,0.35)', moon: true },
    cloud: 'rgba(120,70,110,0.75)',
    cloudShade: 'rgba(70,40,80,0.8)',
    far: ['#5a2f55', '#3e2344'],
    near: '#2c1a30',
    decor: 'rock',
    ambient: 'ember',
    sea: { top: 'rgba(255,120,30,0.95)', bottom: 'rgba(200,40,10,1)', foam: '#ffe070', lava: true },
    ground: {
      dirt: '#4b3a41', dirtLight: '#625058', dirtDark: '#2d2127',
      pebble: '#6d5a62', pebble2: '#e0672c', pebbleDark: '#1d1418',
      outline: '#140c10', grass: '#ff8a3a', grassDark: '#b83b1c', grassLight: '#ffd36b',
      deep: 'rgba(10,0,6,0.5)', bevel: 'rgba(0,0,0,0.25)', scorch: 'rgba(10,4,6,0.8)', cave: 'rgba(60,14,8,0.92)',
    },
  },
};

export const THEME_ORDER = ['meadow', 'desert', 'snow', 'volcano'];

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
      { m: 'ice', x: 0.6, y: 1.7 + P + 0.3, w: 0.6, h: 0.6 },
      { m: 'ice', x: 1.4, y: 1.7 + P + 0.3, w: 0.6, h: 0.6 },
    ],
  },
  {
    name: 'tower',
    blocks: [
      { m: 'stone', x: 0.45, y: 0.4, w: 0.8, h: 0.8 },
      { m: 'stone', x: 1.35, y: 0.4, w: 0.8, h: 0.8 },
      { m: 'wood', x: 0.9, y: 0.8 + P / 2, w: 2.0, h: P },
      { m: 'ice', x: 0.2, y: 0.8 + P + 0.5, w: P, h: 1.0 },
      { m: 'ice', x: 1.6, y: 0.8 + P + 0.5, w: P, h: 1.0 },
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
      { m: 'ice', x: 0.85, y: 1.6 + 0.35, w: 0.7, h: 0.7 },
      { m: 'mushroom', x: 1.75, y: 0.3, w: 0.6, h: 0.6 },
    ],
  },
];

// Neutral props for the middle of the map.
export const PROPS = [
  {
    name: 'hive-pile',
    blocks: [
      { m: 'hive', x: 0.4, y: 0.35, w: 0.7, h: 0.7 },
      { m: 'wood', x: 0.4, y: 0.7 + P / 2, w: 1.4, h: P },
      { m: 'ice', x: 0.4, y: 0.7 + P + 0.3, w: 0.6, h: 0.6 },
    ],
  },
  {
    name: 'pillars',
    blocks: [
      { m: 'stone', x: 0.2, y: 0.9, w: 0.34, h: 1.8 },
      { m: 'stone', x: 1.6, y: 0.9, w: 0.34, h: 1.8 },
      { m: 'wood', x: 0.9, y: 1.8 + P / 2, w: 2.0, h: P },
      { m: 'hive', x: 0.9, y: 1.8 + P + 0.33, w: 0.66, h: 0.66 },
    ],
  },
  {
    name: 'boulders',
    blocks: [
      { m: 'stone', x: 0.4, y: 0.45, s: 'circle', r: 0.45 },
      { m: 'mushroom', x: 1.35, y: 0.35, w: 0.7, h: 0.7 },
    ],
  },
];
