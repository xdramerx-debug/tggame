import data from '@/data/survival.json';

export type HungerTier = 'fed' | 'hungry' | 'starving';

export interface Modifiers {
  /** Multiplier applied to stamina regeneration. */
  readonly regen: number;
  /** Multiplier applied to the player's outgoing damage. */
  readonly damage: number;
}

interface SurvivalFile {
  readonly satiety: {
    readonly max: number;
    readonly start: number;
    readonly drainPerSecond: number;
    readonly drainWhileMoving: number;
    readonly hungryBelow: number;
    readonly starvingBelow: number;
    readonly starvingHpDrain: number;
  };
  readonly modifiers: {
    readonly hungryRegen: number;
    readonly starvingRegen: number;
    readonly hungryDamage: number;
    readonly starvingDamage: number;
  };
  readonly rations: {
    readonly restore: number;
    readonly monsterChance: number;
    readonly chestMin: number;
    readonly chestMax: number;
    readonly startCount: number;
  };
  readonly campfire: {
    readonly range: number;
    readonly healFraction: number;
    readonly satiety: number;
    readonly safeRadius: number;
    readonly stamina: number;
  };
}

/**
 * Survival tuning, deliberately kept in JSON next to the other content tables:
 * a four-minute run and a two-minute run are a balance decision, not a code one.
 */
export const SURVIVAL_CONFIG = data as unknown as SurvivalFile;

/**
 * Hunger, in the roguelite sense: a slow clock that punishes idling in a
 * cleared room and pushes the player towards the next campfire.
 *
 * The model is intentionally blunt and readable:
 * - satiety drains every second, faster while the player is moving;
 * - below `hungryBelow` stamina regenerates and damage output both drop;
 * - below `starvingBelow` the player also loses health, which is the only way
 *   to die outside of combat — and the death screen says so.
 *
 * Pure numbers, fixed-step driven, no three.js: fully unit-testable.
 */
export class Survival {
  private satietyValue: number;
  private elapsedValue = 0;

  constructor() {
    this.satietyValue = clamp(SURVIVAL_CONFIG.satiety.start, 0, SURVIVAL_CONFIG.satiety.max);
  }

  get satiety(): number {
    return this.satietyValue;
  }

  get maxSatiety(): number {
    return SURVIVAL_CONFIG.satiety.max;
  }

  get ratio(): number {
    return this.satietyValue / SURVIVAL_CONFIG.satiety.max;
  }

  /** Seconds of run time elapsed (drives the death summary). */
  get elapsed(): number {
    return this.elapsedValue;
  }

  get tier(): HungerTier {
    if (this.satietyValue <= SURVIVAL_CONFIG.satiety.starvingBelow) return 'starving';
    if (this.satietyValue <= SURVIVAL_CONFIG.satiety.hungryBelow) return 'hungry';
    return 'fed';
  }

  /** Stamina regen and damage multipliers for the current hunger tier. */
  get modifiers(): Modifiers {
    switch (this.tier) {
      case 'starving':
        return {
          regen: SURVIVAL_CONFIG.modifiers.starvingRegen,
          damage: SURVIVAL_CONFIG.modifiers.starvingDamage,
        };
      case 'hungry':
        return {
          regen: SURVIVAL_CONFIG.modifiers.hungryRegen,
          damage: SURVIVAL_CONFIG.modifiers.hungryDamage,
        };
      default:
        return { regen: 1, damage: 1 };
    }
  }

  /** True while starvation is actively eating health. */
  get isStarving(): boolean {
    return this.tier === 'starving';
  }

  /**
   * Advances hunger.
   * @returns health lost to starvation this tick (0 when fed)
   */
  tick(dt: number, moving: boolean): number {
    this.elapsedValue += dt;
    const { drainPerSecond, drainWhileMoving, starvingHpDrain } = SURVIVAL_CONFIG.satiety;
    const drain = (drainPerSecond + (moving ? drainWhileMoving : 0)) * dt;
    this.satietyValue = Math.max(0, this.satietyValue - drain);
    if (!this.isStarving) return 0;
    return starvingHpDrain * dt;
  }

  /** Eats a ration; returns how much satiety was actually restored. */
  eat(): number {
    return this.addSatiety(SURVIVAL_CONFIG.rations.restore);
  }

  /** Burns satiety (skipped meals, hazards, tests); never below zero. */
  burn(amount: number): number {
    const before = this.satietyValue;
    this.satietyValue = clamp(this.satietyValue - Math.max(0, amount), 0, this.maxSatiety);
    return before - this.satietyValue;
  }

  addSatiety(amount: number): number {
    const before = this.satietyValue;
    this.satietyValue = clamp(this.satietyValue + Math.max(0, amount), 0, this.maxSatiety);
    return this.satietyValue - before;
  }

  reset(): void {
    this.satietyValue = clamp(SURVIVAL_CONFIG.satiety.start, 0, this.maxSatiety);
    this.elapsedValue = 0;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
