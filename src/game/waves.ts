import type { WaveComposition } from './types';

/** Wave director math (§balance): pure, unit-tested. */

export const MAX_ZOMBIES_ALIVE = 13;
export const INTERMISSION_S = 4.5;
export const BANNER_S = 1.6;

export function waveComposition(wave: number): WaveComposition {
  const w = Math.max(1, Math.floor(wave));
  const walkers = 4 + Math.floor(w * 1.4);
  const runners = w >= 2 ? Math.floor((w - 1) * 0.9) : 0;
  const brutes = w >= 3 ? Math.floor((w - 2) / 2) : 0;
  return {
    walkers,
    runners,
    brutes,
    total: walkers + runners + brutes,
    hpMult: 1 + (w - 1) * 0.09,
    speedMult: 1 + Math.min(0.35, (w - 1) * 0.02),
    spawnEvery: Math.max(0.45, 1.6 - w * 0.08),
  };
}

/** How long a wave can take to fully spawn, seconds (for pacing sanity checks). */
export function waveSpawnSpan(wave: number): number {
  const c = waveComposition(wave);
  return c.total * c.spawnEvery;
}
