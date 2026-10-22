/** Offensive profile of a melee/ability attack. */
export interface AttackProfile {
  /** Base damage before crit and mitigation. */
  readonly damage: number;
  /** 0…1 chance of a critical hit. */
  readonly critChance: number;
  /** Damage multiplier on a crit. */
  readonly critMultiplier: number;
}

/** Random source in [0,1); injected so combat stays deterministic in tests. */
export type Roll = () => number;

export interface DamageRoll {
  readonly raw: number;
  readonly critical: boolean;
  /** Raw damage scaled by ±`variance` — keeps numbers from being identical. */
  readonly variance: number;
}

/**
 * Rolls an attack's raw damage.
 *
 * Crit is a single roll against `critChance`; non-crit damage is jittered by up
 * to ±10 % so repeated hits on the same target do not read as a flat number.
 * The result is still the *raw* value: `Health.damage()` applies armour.
 */
export function rollDamage(profile: AttackProfile, roll: Roll): DamageRoll {
  const crit = roll() < profile.critChance;
  const variance = 0.9 + roll() * 0.2;
  const base = profile.damage * variance;
  return {
    raw: crit ? base * profile.critMultiplier : base,
    critical: crit,
    variance,
  };
}

/** Player attack profile derived from stats; exported for the HUD and tests. */
export function playerAttackProfile(damage: number, critChance: number, critMultiplier = 1.8): AttackProfile {
  return { damage, critChance, critMultiplier };
}
