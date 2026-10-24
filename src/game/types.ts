/** Shared types and balance constants — pure data, no engine imports. */

export type WeaponId = 'pistol' | 'smg' | 'rifle' | 'shotgun' | 'sniper';

export interface WeaponSpec {
  name: string;
  /** damage per bullet (per pellet for shotgun) */
  dmg: number;
  headMult: number;
  /** rounds per minute; hold-to-fire everywhere for comfort */
  rpm: number;
  mag: number;
  /** -1 = infinite reserve (pistol never bricks the run) */
  reserveMax: number;
  reloadTime: number;
  /** base hip spread, radians */
  spreadRad: number;
  range: number;
  pellets: number;
  price: number;
  unlockLevel: number;
  /** heavier weapons slow you down */
  moveMult: number;
  tint: number;
}

export const WEAPONS: Record<WeaponId, WeaponSpec> = {
  pistol: {
    name: 'Гадюка', dmg: 26, headMult: 2.2, rpm: 360, mag: 12, reserveMax: -1,
    reloadTime: 1.2, spreadRad: 0.012, range: 55, pellets: 1,
    price: 0, unlockLevel: 1, moveMult: 1, tint: 0x9aa3ad,
  },
  smg: {
    name: 'Скорпион', dmg: 19, headMult: 2.0, rpm: 820, mag: 32, reserveMax: 180,
    reloadTime: 1.7, spreadRad: 0.022, range: 42, pellets: 1,
    price: 1400, unlockLevel: 2, moveMult: 1, tint: 0x6f7681,
  },
  rifle: {
    name: 'Шторм-АР', dmg: 31, headMult: 2.4, rpm: 600, mag: 30, reserveMax: 150,
    reloadTime: 2.05, spreadRad: 0.015, range: 70, pellets: 1,
    price: 2700, unlockLevel: 3, moveMult: 0.94, tint: 0x545d68,
  },
  shotgun: {
    name: 'Обрез', dmg: 13, headMult: 1.8, rpm: 72, mag: 6, reserveMax: 48,
    reloadTime: 2.5, spreadRad: 0.055, range: 24, pellets: 8,
    price: 1900, unlockLevel: 4, moveMult: 0.95, tint: 0x7a5c3a,
  },
  sniper: {
    name: 'Мираж-СВД', dmg: 115, headMult: 3.0, rpm: 42, mag: 5, reserveMax: 30,
    reloadTime: 2.7, spreadRad: 0.0025, range: 120, pellets: 1,
    price: 4500, unlockLevel: 5, moveMult: 0.88, tint: 0x3f4a3a,
  },
};

export const WEAPON_ORDER: WeaponId[] = ['pistol', 'smg', 'rifle', 'shotgun', 'sniper'];

export type EnemyKind = 'grunt' | 'rifleman' | 'shotgunner' | 'sniper' | 'titan' | 'spitter';

export interface EnemySpec {
  hp: number;
  speed: number;
  /** damage per bullet (per pellet) */
  dmg: number;
  /** bullets per volley */
  volley: number;
  fireInterval: number;
  /** preferred engagement band, metres */
  rangeMin: number;
  rangeMax: number;
  /** aim spread, radians */
  spread: number;
  money: number;
  xp: number;
  score: number;
  scale: number;
  melee: boolean;
  /** mutant elite? */
  elite: boolean;
  skin: number;
  cloth: number;
  eye: number;
}

export const ENEMIES: Record<EnemyKind, EnemySpec> = {
  grunt: {
    hp: 55, speed: 3.1, dmg: 9, volley: 1, fireInterval: 0.95, rangeMin: 6, rangeMax: 20,
    spread: 0.09, money: 120, xp: 20, score: 100, scale: 1, melee: false, elite: false,
    skin: 0xb08a5e, cloth: 0x5d4a32, eye: 0xffdd55,
  },
  rifleman: {
    hp: 90, speed: 2.9, dmg: 6, volley: 3, fireInterval: 1.3, rangeMin: 12, rangeMax: 32,
    spread: 0.07, money: 180, xp: 30, score: 160, scale: 1, melee: false, elite: false,
    skin: 0xa87f56, cloth: 0x3f4a35, eye: 0xffdd55,
  },
  shotgunner: {
    hp: 120, speed: 2.7, dmg: 7, volley: 6, fireInterval: 1.7, rangeMin: 2, rangeMax: 9,
    spread: 0.12, money: 240, xp: 40, score: 240, scale: 1.08, melee: true, elite: false,
    skin: 0x9c744e, cloth: 0x4a3226, eye: 0xffaa33,
  },
  sniper: {
    hp: 65, speed: 2.3, dmg: 45, volley: 1, fireInterval: 3.2, rangeMin: 25, rangeMax: 60,
    spread: 0.02, money: 300, xp: 55, score: 300, scale: 1, melee: false, elite: false,
    skin: 0xb59468, cloth: 0x2f3a4a, eye: 0xff4444,
  },
  titan: {
    hp: 850, speed: 2.6, dmg: 42, volley: 1, fireInterval: 0, rangeMin: 0, rangeMax: 3,
    spread: 0, money: 900, xp: 200, score: 1200, scale: 1.9, melee: true, elite: true,
    skin: 0x6f7a4e, cloth: 0x3a3f2a, eye: 0xff2222,
  },
  spitter: {
    hp: 420, speed: 3.2, dmg: 24, volley: 1, fireInterval: 2.4, rangeMin: 8, rangeMax: 26,
    spread: 0.05, money: 650, xp: 140, score: 800, scale: 1.3, melee: false, elite: true,
    skin: 0x5f7a4a, cloth: 0x2e3a22, eye: 0x9ae63c,
  },
};

export const ENEMY_NAMES: Record<EnemyKind, string> = {
  grunt: 'Пехотинец',
  rifleman: 'Автоматчик',
  shotgunner: 'Штурмовик',
  sniper: 'Марксман',
  titan: 'Титан',
  spitter: 'Плевун',
};

export const PLAYER = {
  maxHp: 100,
  armorMax: 100,
  walk: 4.4,
  sprint: 6.2,
  crouch: 2.2,
  jumpVel: 5.2,
  /** max obstacle height the player steps onto automatically */
  stepUp: 1.3,
  eye: 1.68,
  crouchEye: 1.05,
  radius: 0.42,
} as const;

export const ARENA = {
  half: 40,
  wallHeight: 6,
} as const;

export const GEAR = {
  grenadeMax: 3,
  medkitMax: 3,
  medkitHeal: 50,
  grenadeDmg: 120,
  grenadeRadius: 5.5,
  /** armor absorbs this share of body damage while it holds */
  armorAbsorb: 0.5,
} as const;

export type LootKind = 'money' | 'parts' | 'ammo' | 'armor' | 'grenade' | 'medkit' | 'xp';

export type PerkId =
  | 'sur1' | 'sur2' | 'sur3' | 'sur4'
  | 'gun1' | 'gun2' | 'gun3' | 'gun4'
  | 'mob1' | 'mob2' | 'mob3' | 'mob4';

export type RunPhase = 'defense' | 'skirmish';
export type GamePhase = 'menu' | 'playing' | 'paused' | 'over';

export interface MetaProgress {
  xp: number;
  perks: PerkId[];
  bestWave: number;
  bestScore: number;
  totalKills: number;
  runs: number;
}

export interface MinimapDot {
  x: number;
  z: number;
  /** 'e' enemy · 'c' crate · 't' titan/elite */
  k: 'e' | 'c' | 't';
}

export interface GameSnapshot {
  phase: GamePhase;
  run: RunPhase;
  hp: number;
  maxHp: number;
  armor: number;
  armorMax: number;
  weapon: WeaponId;
  ammo: number;
  magSize: number;
  reserve: number;
  reloading: boolean;
  reloadProgress: number;
  grenades: number;
  medkits: number;
  money: number;
  parts: number;
  wave: number;
  intermissionT: number;
  enemiesLeft: number;
  score: number;
  kills: number;
  level: number;
  xpInto: number;
  xpNeed: number;
  perkPoints: number;
  shopOpen: boolean;
  dashReady: number;
  owned: WeaponId[];
  tuning: Record<WeaponId, number>;
  minimap: MinimapDot[];
  px: number;
  pz: number;
  pyaw: number;
}
