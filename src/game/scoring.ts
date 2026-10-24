import { ZOMBIE_STATS, type ZombieKind } from './types';

/** Score & combo math — pure, unit-tested. */

export const COMBO_WINDOW_S = 4;
export const COMBO_MAX_MULT = 3;

/** Multiplier grows +0.1 per chained kill, capped at ×3. */
export function comboMult(combo: number): number {
  return Math.min(COMBO_MAX_MULT, 1 + Math.max(0, combo) * 0.1);
}

export function killScore(kind: ZombieKind, combo: number): number {
  return Math.round(ZOMBIE_STATS[kind].score * comboMult(combo));
}

export function waveBonus(wave: number): number {
  return 250 * Math.max(1, wave);
}
