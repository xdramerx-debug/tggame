/** Outcome of applying damage to a health pool. */
export interface DamageResult {
  /** Damage actually subtracted (after armour and i-frames). */
  readonly applied: number;
  /** Raw damage before mitigation, for feedback and tests. */
  readonly raw: number;
  /** True when the hit killed the owner. */
  readonly killed: boolean;
  /** True when i-frames swallowed the hit entirely. */
  readonly blocked: boolean;
  readonly critical: boolean;
}

export const NO_DAMAGE: DamageResult = {
  applied: 0,
  raw: 0,
  killed: false,
  blocked: true,
  critical: false,
};

/**
 * Mutable health pool with armour mitigation and invulnerability frames.
 *
 * Used by the player and every enemy, so combat rules live in one place: armour
 * uses a diminishing-returns curve (`armor / (armor + 50)`), i-frames drop a hit
 * entirely (dash i-frames must feel absolute on touch controls), and a pool can
 * never overflow its maximum.
 */
export class Health {
  readonly max: number;
  private current: number;
  private armorValue: number;
  private iFrameRemaining = 0;

  constructor(max: number, armor = 0) {
    if (max <= 0) throw new Error('Health maximum must be positive');
    this.max = max;
    this.current = max;
    this.armorValue = Math.max(0, armor);
  }

  get hp(): number {
    return this.current;
  }

  get armor(): number {
    return this.armorValue;
  }

  get ratio(): number {
    return this.current / this.max;
  }

  get isDead(): boolean {
    return this.current <= 0;
  }

  get invulnerable(): boolean {
    return this.iFrameRemaining > 0;
  }

  setArmor(armor: number): void {
    this.armorValue = Math.max(0, armor);
  }

  /** Grants invulnerability; never shortens a longer window. */
  grantIFrames(seconds: number): void {
    this.iFrameRemaining = Math.max(this.iFrameRemaining, seconds);
  }

  /**
   * Mitigated damage for a raw amount (pure, exposed for UI previews and tests).
   * Armour can never reduce a hit below 20 % of its raw value.
   */
  mitigated(raw: number): number {
    if (raw <= 0) return 0;
    const reduction = this.armorValue / (this.armorValue + 50);
    return Math.max(raw * 0.2, raw * (1 - reduction));
  }

  /**
   * Applies a hit.
   * @param raw damage before mitigation
   * @param critical whether the attacker rolled a crit (kept for feedback)
   */
  damage(raw: number, critical = false): DamageResult {
    if (this.isDead) return { ...NO_DAMAGE, raw, blocked: true, critical };
    if (this.iFrameRemaining > 0) return { ...NO_DAMAGE, raw, blocked: true, critical };
    if (raw <= 0) return { ...NO_DAMAGE, raw, blocked: false, critical };

    const applied = Math.min(this.current, this.mitigated(raw));
    this.current = Math.max(0, this.current - applied);
    return { applied, raw, killed: this.current === 0, blocked: false, critical };
  }

  /** Direct damage that ignores armour and i-frames (hazards, debug). */
  damageDirect(amount: number): DamageResult {
    if (this.isDead || amount <= 0) return { ...NO_DAMAGE, raw: amount, blocked: this.isDead };
    const applied = Math.min(this.current, amount);
    this.current = Math.max(0, this.current - applied);
    return { applied, raw: amount, killed: this.current === 0, blocked: false, critical: false };
  }

  heal(amount: number): number {
    if (amount <= 0 || this.isDead) return 0;
    const healed = Math.min(this.max - this.current, amount);
    this.current += healed;
    return healed;
  }

  /** Restores the pool fully (respawn, new floor, campfire rest). */
  reset(): void {
    this.current = this.max;
    this.iFrameRemaining = 0;
  }

  /** Fixed-step tick for i-frames; called from the owner's simulation. */
  tick(dt: number): void {
    if (this.iFrameRemaining > 0) this.iFrameRemaining = Math.max(0, this.iFrameRemaining - dt);
  }
}
