import type { EnemyKind } from './types';

/** Wave director math — pure, unit-tested. */

export const MAX_ALIVE = 10;
/** sortie (loot + shopping) window between waves */
export const INTERMISSION_S = 40;
/** opening freeze-time to gear up before wave 1 */
export const FIRST_SKIRMISH_S = 20;
export const BANNER_S = 2.2;
/** money per remaining second when calling the wave early */
export const EARLY_CALL_BONUS_PER_S = 6;

export interface WaveComposition {
  counts: Partial<Record<EnemyKind, number>>;
  total: number;
  hpMult: number;
  dmgMult: number;
  /** multiplier on enemy spread — lower means more accurate */
  spreadMult: number;
  spawnEvery: number;
  elite: boolean;
}

export function waveComposition(wave: number): WaveComposition {
  const n = Math.max(1, Math.floor(wave));
  const counts: Partial<Record<EnemyKind, number>> = {
    grunt: 3 + Math.floor(n * 1.1),
  };
  if (n >= 2) counts.rifleman = Math.floor((n - 1) * 0.8);
  if (n >= 3) counts.shotgunner = Math.floor((n - 2) * 0.55);
  if (n >= 4) counts.sniper = Math.floor((n - 3) * 0.4);
  if (n % 5 === 0) {
    counts.titan = Math.floor(n / 10) + 1;
    if (n >= 10) counts.spitter = Math.floor(n / 10);
  }
  let total = 0;
  for (const v of Object.values(counts)) total += v;
  return {
    counts,
    total,
    hpMult: 1 + (n - 1) * 0.085,
    dmgMult: Math.min(2.2, 1 + (n - 1) * 0.05),
    spreadMult: Math.max(0.6, 1 - (n - 1) * 0.03),
    spawnEvery: Math.max(0.5, 1.8 - n * 0.07),
    elite: n % 5 === 0,
  };
}

export function waveMoneyBonus(wave: number): number {
  return 400 + 80 * Math.max(1, wave);
}

export function waveXpBonus(wave: number): number {
  return 60 + 15 * Math.max(1, wave);
}
