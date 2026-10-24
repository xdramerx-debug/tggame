/** Shared game types and tuning constants — pure data, no engine imports. */

export type ZombieKind = 'walker' | 'runner' | 'brute';

export interface ZombieStats {
  hp: number;
  /** metres per second */
  speed: number;
  /** damage per strike */
  damage: number;
  /** body radius for separation & hit tests */
  radius: number;
  /** visual scale multiplier */
  scale: number;
  score: number;
  /** distance at which the zombie lunges */
  attackRange: number;
  attackCooldown: number;
}

export const ZOMBIE_STATS: Record<ZombieKind, ZombieStats> = {
  walker: { hp: 60, speed: 2.2, damage: 10, radius: 0.45, scale: 1, score: 100, attackRange: 1.7, attackCooldown: 1.3 },
  runner: { hp: 40, speed: 4.4, damage: 8, radius: 0.4, scale: 0.92, score: 150, attackRange: 1.6, attackCooldown: 1.1 },
  brute: { hp: 260, speed: 1.9, damage: 26, radius: 0.62, scale: 1.35, score: 400, attackRange: 2.1, attackCooldown: 1.6 },
};

export type PowerUpKind = 'health' | 'ammo' | 'rapid';

export type GamePhase = 'menu' | 'playing' | 'paused' | 'over';

export type WaveState = 'banner' | 'spawning' | 'clearing' | 'intermission';

export interface WaveComposition {
  walkers: number;
  runners: number;
  brutes: number;
  total: number;
  hpMult: number;
  speedMult: number;
  /** seconds between spawns */
  spawnEvery: number;
}

export interface GameSnapshot {
  phase: GamePhase;
  hp: number;
  maxHp: number;
  ammo: number;
  magSize: number;
  reloading: boolean;
  /** 0..1 progress of the current reload */
  reloadProgress: number;
  wave: number;
  waveState: WaveState;
  /** seconds until the next wave (intermission) */
  intermissionT: number;
  score: number;
  kills: number;
  combo: number;
  comboMult: number;
  /** 0..1, 1 = dash ready */
  dashReady: number;
  /** seconds of rapid-fire buff left */
  rapidT: number;
  zombiesLeft: number;
}

export const PLAYER = {
  maxHp: 100,
  speed: 6.4,
  dashSpeed: 15,
  dashTime: 0.22,
  dashCooldown: 2.6,
  radius: 0.45,
} as const;

export const WEAPON = {
  magSize: 30,
  damage: 26,
  headshotMult: 2,
  /** seconds between shots */
  fireInterval: 0.115,
  reloadTime: 1.35,
  range: 55,
  spreadRad: 0.016,
  /** aim assist: half-angle of the magnet cone */
  aimAssistRad: 0.22,
} as const;

export const ARENA = {
  half: 27,
  wallHeight: 4.2,
} as const;
