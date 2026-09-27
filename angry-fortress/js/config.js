// Gameplay tuning in one place.

export const GRAV = 12; // m/s²
export const VMAX = 27; // launch speed at full pull, m/s
export const WIND_ACC = 0.32; // m/s² per wind unit
export const MAX_PULL = 1.8; // visual pouch travel at full power, m
export const CART_R = 0.75;
// Second collision circle for the captain riding on the cart (matches the drawn body/helmet).
export const HEAD = { y: 0.75, r: 0.55 };
export const HP_MAX = 100;
export const STAMINA = 100;
export const STAMINA_PER_M = 12;
export const MOVE_SPEED = 2.4;

export const MAT = {
  wood: { density: 0.7, friction: 0.7, restitution: 0.05, hp: 45, resist: 1.0 }, // twig planks
  stone: { density: 2.2, friction: 0.85, restitution: 0.02, hp: 120, resist: 0.4 }, // river pebbles
  leaf: { density: 0.35, friction: 0.8, restitution: 0.1, hp: 20, resist: 1.8 }, // flimsy leaf bundles
  hive: { density: 0.7, friction: 0.7, restitution: 0.05, hp: 14, resist: 1.0 }, // beehive: bursts into a bee swarm
  mushroom: { density: 0.5, friction: 0.6, restitution: 0.85, hp: 70, resist: 0.5 }, // bouncy
  crate: { density: 0.6, friction: 0.7, restitution: 0.05, hp: 24, resist: 1.3 }, // nut basket: bonus nut when broken
  log: { density: 1.1, friction: 0.9, restitution: 0.05, hp: 110, resist: 0.6 }, // heavy, rolls downhill
  trunk: { density: 0.9, friction: 0.9, restitution: 0.02, hp: 220, resist: 0.5 }, // a felled tree
};

// Nut ammo. mul = damage multiplier against block materials (missing = 1). hit = direct-hit
// multiplier against captains. dent = small crater when slamming into the ground.
export const AMMO = {
  acorn: { r: 0.38, density: 4.2, ammo: Infinity, mul: { wood: 1.3, stone: 1.1, leaf: 1.1 }, hit: 1.0, dent: 0.75 },
  pinenut: { r: 0.34, density: 3.4, ammo: 3, mul: { wood: 2.6, stone: 0.7, leaf: 1.3, log: 1.6 }, hit: 0.95, dent: 0.65, ability: 'dash' },
  peanut: { r: 0.34, density: 3.2, ammo: 3, mul: { wood: 0.8, stone: 0.5, leaf: 3, mushroom: 0.8 }, hit: 0.7, dent: 0.5, ability: 'split' },
  burr: { r: 0.4, density: 4.0, ammo: 2, mul: { stone: 1.2 }, hit: 0.3, ability: 'boom', blast: { r: 2.6, dmg: 38, crater: 2.2, push: 26 } },
  walnut: { r: 0.4, density: 5.2, ammo: 2, mul: { wood: 1.2, stone: 1.3, log: 1.3 }, hit: 0.75, dent: 0.6, ability: 'pound', blast: { r: 2.0, dmg: 30, crater: 1.8, push: 18 } },
};

// Peanut kernels after the shell splits.
export const KERNEL = { r: 0.22, density: 3.6, mul: { wood: 0.9, stone: 0.5, leaf: 3.2, mushroom: 0.8 }, hit: 0.6, blast: { r: 1.1, dmg: 9, crater: 0.9, push: 5 } };
// Nuts shaken loose from a tree canopy: small, but they hurt whoever is standing below.
export const FALLNUT = { r: 0.2, density: 4, mul: {}, hit: 2.2 };

// Forest obstacles.
export const TREE = { hp: 170, slow: 0.8, maxDrop: 3 };
export const WEB_HOLD = 0.75; // seconds a web holds a nut before it drops
export const SUPPLY = ['pinenut', 'peanut', 'burr', 'walnut']; // bonus nuts a basket can hold
// Walnut ground-pound: speed it slams down at after the tap.
export const POUND_SPEED = 24;
// Broken beehive: a bee swarm stings everything nearby (no big crater).
export const HIVE_BLAST = { r: 2.4, dmg: 24, crater: 0.5, push: 12 };

// Direct nut-on-captain hits: damage = (impulse - 1.5) * HIT_K * nut.hit, capped per nut.
export const HIT_K = 0.95;
export const HIT_CAP = 30;

// Sudden death: after this many turns the sea rises each turn so matches always end.
export const FLOOD_TURN = 18;
export const FLOOD_STEP = 0.55;

export const WIND_LEVELS = { off: 0, normal: 5, strong: 9 };

export const TEAM = [
  { name: '참나무단', captain: '토리', color: '#f0572f', dark: '#b8321a' },
  { name: '솔숲단', captain: '솔이', color: '#2f9be8', dark: '#1a6db0' },
];
