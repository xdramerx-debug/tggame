import { Health } from '@/game/combat/Health';
import type { DamageResult } from '@/game/combat/Health';
import { playerAttackProfile, rollDamage } from '@/game/combat/damage';
import type { AttackProfile, DamageRoll, Roll } from '@/game/combat/damage';

/** Base numbers of a fresh run (stage 8 extends this with hunger and meta). */
export const PLAYER_BASE = {
  maxHp: 100,
  maxStamina: 100,
  armor: 6,
  attackDamage: 22,
  critChance: 0.14,
  critMultiplier: 1.8,
  /** Stamina costs, spent before the action is allowed. */
  attackStamina: 10,
  dodgeStamina: 20,
  /** Stamina per second while not acting. */
  staminaRegen: 22,
  /** Delay before regeneration resumes after spending stamina, seconds. */
  staminaDelay: 0.6,
  /** Invulnerability granted after taking a hit. */
  hitIFrames: 0.45,
} as const;

/**
 * Player vitals and action budget.
 *
 * Kept separate from `PlayerController` (which only knows how to move a capsule)
 * so the HUD, combat and later survival systems read the same numbers, and so
 * stamina can gate actions without teaching the controller about stamina.
 */
export class PlayerStats {
  readonly health: Health;
  readonly attack: AttackProfile;
  private staminaValue: number;
  private staminaLockout = 0;

  constructor() {
    this.health = new Health(PLAYER_BASE.maxHp, PLAYER_BASE.armor);
    this.staminaValue = PLAYER_BASE.maxStamina;
    this.attack = playerAttackProfile(
      PLAYER_BASE.attackDamage,
      PLAYER_BASE.critChance,
      PLAYER_BASE.critMultiplier,
    );
  }

  get hp(): number {
    return this.health.hp;
  }

  get maxHp(): number {
    return this.health.max;
  }

  get hpRatio(): number {
    return this.health.ratio;
  }

  get stamina(): number {
    return this.staminaValue;
  }

  get maxStamina(): number {
    return PLAYER_BASE.maxStamina;
  }

  get staminaRatio(): number {
    return this.staminaValue / PLAYER_BASE.maxStamina;
  }

  get isDead(): boolean {
    return this.health.isDead;
  }

  get invulnerable(): boolean {
    return this.health.invulnerable;
  }

  /** @returns true when the stamina was available and has been spent */
  spendStamina(cost: number): boolean {
    if (this.staminaValue < cost) return false;
    this.staminaValue -= cost;
    this.staminaLockout = PLAYER_BASE.staminaDelay;
    return true;
  }

  /** Rolls a player attack (crit + variance); mitigation happens in `Health`. */
  rollAttack(roll: Roll = Math.random): DamageRoll {
    return rollDamage(this.attack, roll);
  }

  /** Applies incoming damage with the post-hit i-frame window. */
  takeDamage(raw: number, critical = false): DamageResult {
    const result = this.health.damage(raw, critical);
    if (result.applied > 0) this.health.grantIFrames(PLAYER_BASE.hitIFrames);
    return result;
  }

  heal(amount: number): number {
    return this.health.heal(amount);
  }

  /** Fixed-step regeneration and i-frame bookkeeping. */
  tick(dt: number): void {
    this.health.tick(dt);
    this.staminaLockout = Math.max(0, this.staminaLockout - dt);
    if (this.staminaLockout === 0 && this.staminaValue < PLAYER_BASE.maxStamina) {
      this.staminaValue = Math.min(PLAYER_BASE.maxStamina, this.staminaValue + PLAYER_BASE.staminaRegen * dt);
    }
  }

  /** Full restore for respawn / new floor. */
  reset(): void {
    this.health.reset();
    this.staminaValue = PLAYER_BASE.maxStamina;
    this.staminaLockout = 0;
  }
}
