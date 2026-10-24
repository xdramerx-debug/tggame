import type { PowerUpKind } from './types';

/** Power-up drops — pure, unit-tested. */

export const DROP_CHANCES: Record<PowerUpKind, number> = {
  health: 0.12,
  ammo: 0.1,
  rapid: 0.06,
};

export const TOTAL_DROP_CHANCE = DROP_CHANCES.health + DROP_CHANCES.ammo + DROP_CHANCES.rapid;

export const POWERUP_EFFECT = {
  health: { hp: 35 },
  ammo: { refillMag: true },
  rapid: { durationS: 10, fireIntervalMult: 0.55, damageMult: 1.15 },
} as const;

export const POWERUP_LABEL: Record<PowerUpKind, string> = {
  health: '❤️ Аптечка +35',
  ammo: '🧰 Магазин пополнен',
  rapid: '🔥 Шквальный огонь 10с',
};

/** Roll a drop with a seeded/random 0..1 source; null = nothing drops. */
export function rollDrop(r: () => number): PowerUpKind | null {
  const x = r();
  if (x < DROP_CHANCES.health) return 'health';
  if (x < DROP_CHANCES.health + DROP_CHANCES.ammo) return 'ammo';
  if (x < TOTAL_DROP_CHANCE) return 'rapid';
  return null;
}
