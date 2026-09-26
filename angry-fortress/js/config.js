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
  wood: { density: 0.7, friction: 0.7, restitution: 0.05, hp: 45, resist: 1.0 },
  stone: { density: 2.2, friction: 0.85, restitution: 0.02, hp: 120, resist: 0.4 },
  ice: { density: 0.8, friction: 0.15, restitution: 0.05, hp: 22, resist: 1.8 },
  tnt: { density: 0.7, friction: 0.7, restitution: 0.05, hp: 14, resist: 1.0 },
};

// Ammo birds. mul = damage multiplier against block materials. hit = direct-hit multiplier
// against captains. dent = small crater when slamming into the ground.
export const BIRDS = {
  red: { r: 0.38, density: 4.2, ammo: Infinity, mul: { wood: 1.3, stone: 1.1, ice: 1.1, tnt: 1 }, hit: 1.0, dent: 0.75 },
  yellow: { r: 0.34, density: 3.4, ammo: 3, mul: { wood: 2.6, stone: 0.7, ice: 1.3, tnt: 1 }, hit: 0.95, dent: 0.65, ability: 'dash' },
  blue: { r: 0.3, density: 3.2, ammo: 3, mul: { wood: 0.8, stone: 0.5, ice: 3, tnt: 1 }, hit: 0.7, dent: 0.5, ability: 'split' },
  black: { r: 0.4, density: 4.0, ammo: 2, mul: { wood: 1, stone: 1.2, ice: 1, tnt: 1 }, hit: 0.3, ability: 'boom', blast: { r: 2.6, dmg: 38, crater: 2.2, push: 26 } },
  white: { r: 0.4, density: 3.0, ammo: 2, mul: { wood: 1, stone: 1, ice: 1, tnt: 1 }, hit: 0.75, dent: 0.5, ability: 'egg' },
};

export const MINI = { r: 0.22, density: 3.6, mul: { wood: 0.9, stone: 0.5, ice: 3.2, tnt: 1 }, hit: 0.6, blast: { r: 1.1, dmg: 9, crater: 0.9, push: 5 } };
export const EGG = { r: 0.27, density: 5, blast: { r: 2.0, dmg: 30, crater: 1.8, push: 18 } };
export const TNT_BLAST = { r: 2.3, dmg: 26, crater: 1.5, push: 22 };

// Direct bird-on-captain hits: damage = (impulse - 1.5) * HIT_K * bird.hit, capped per bird.
export const HIT_K = 0.95;
export const HIT_CAP = 30;

// Sudden death: after this many turns the sea rises each turn so matches always end.
export const FLOOD_TURN = 18;
export const FLOOD_STEP = 0.55;

export const WIND_LEVELS = { off: 0, normal: 5, strong: 9 };

export const TEAM = [
  { name: '빨강 부대', color: '#f0572f', dark: '#b8321a' },
  { name: '파랑 부대', color: '#2f9be8', dark: '#1a6db0' },
];
