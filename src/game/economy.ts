import { ENEMIES, WEAPONS, type EnemyKind, type WeaponId, type WeaponSpec } from './types';

/** Money, prices and weapon tuning — pure, unit-tested. */

export const START_MONEY = 800;

export const PRICES = {
  armor: 650,
  grenade: 300,
  medkit: 250,
  ammo: 150,
} as const;

export const ARMOR_ADD = 50;
export const AMMO_REFILL = 120;

export const TUNING_MAX = 3;
/** cost to upgrade from tier `t` to `t+1` (index = current tier) */
export const TUNING_COSTS: { money: number; parts: number }[] = [
  { money: 300, parts: 2 },
  { money: 700, parts: 4 },
  { money: 1400, parts: 7 },
];

export function killMoney(kind: EnemyKind): number {
  return ENEMIES[kind].money;
}

export function killXp(kind: EnemyKind): number {
  return ENEMIES[kind].xp;
}

export function killScore(kind: EnemyKind): number {
  return ENEMIES[kind].score;
}

/** null when the weapon is already at max tier. */
export function tuningCost(currentTier: number): { money: number; parts: number } | null {
  if (currentTier < 0 || currentTier >= TUNING_MAX) return null;
  return TUNING_COSTS[currentTier] ?? null;
}

export interface EffectiveWeapon extends WeaponSpec {
  tier: number;
}

/** Weapon stats after the tuning tier (0..3): +8% dmg, −12% spread, +12% mag, −4% reload. */
export function effectiveWeapon(id: WeaponId, tier: number): EffectiveWeapon {
  const s = WEAPONS[id];
  const t = Math.max(0, Math.min(TUNING_MAX, Math.floor(tier)));
  return {
    ...s,
    tier: t,
    dmg: Math.round(s.dmg * (1 + 0.08 * t) * 10) / 10,
    spreadRad: s.spreadRad * Math.max(0.5, 1 - 0.12 * t),
    mag: Math.round(s.mag * (1 + 0.12 * t)),
    reloadTime: s.reloadTime * (1 - 0.04 * t),
  };
}
