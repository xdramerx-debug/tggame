import data from '@/data/levels.json';
import type { StatBonuses } from './PlayerStats';
import { NO_BONUSES } from './PlayerStats';

export interface LevelConfig {
  /** XP needed for the first level-up. */
  readonly baseXp: number;
  /** Multiplier applied to the requirement of every next level. */
  readonly growth: number;
  readonly maxLevel: number;
  readonly perLevel: StatBonuses;
}

export const LEVEL_CONFIG = data as unknown as LevelConfig;

export interface LevelUpResult {
  /** True when at least one level was gained by this call. */
  readonly leveledUp: boolean;
  readonly level: number;
  /** Levels gained in one call (a boss can jump two at once). */
  readonly gained: number;
  /** XP still needed for the next level, or 0 at the cap. */
  readonly toNext: number;
}

/**
 * In-run experience track.
 *
 * Deliberately separate from `RunState` (which only stores the raw XP counter
 * for the summary): the curve and the per-level bonuses are rules, and rules are
 * the part that needs tests. XP is per-run and dies with it — permanent growth
 * is what embers and the altar are for, so the two progression axes never
 * compete for the same reward.
 */
export class LevelTrack {
  private levelValue = 1;
  private xpValue = 0;
  private readonly config: LevelConfig;

  constructor(config: LevelConfig = LEVEL_CONFIG) {
    this.config = config;
  }

  get level(): number {
    return this.levelValue;
  }

  /** XP accumulated inside the current level. */
  get xpInLevel(): number {
    return this.xpValue;
  }

  /** Bonuses granted by each level after the first. */
  get perLevel(): StatBonuses {
    return this.config.perLevel;
  }

  get maxLevel(): number {
    return this.config.maxLevel;
  }

  get isMaxed(): boolean {
    return this.levelValue >= this.config.maxLevel;
  }

  /** XP required to go from `level` to `level + 1`. */
  requirementFor(level: number): number {
    if (level >= this.config.maxLevel) return 0;
    return Math.max(1, Math.round(this.config.baseXp * this.config.growth ** (level - 1)));
  }

  get requirement(): number {
    return this.requirementFor(this.levelValue);
  }

  /** 0…1 progress inside the current level (0 at the cap). */
  get ratio(): number {
    const requirement = this.requirement;
    return requirement === 0 ? 0 : Math.min(1, this.xpValue / requirement);
  }

  /** XP left until the next level, or 0 at the cap. */
  get toNext(): number {
    const requirement = this.requirement;
    return requirement === 0 ? 0 : Math.max(0, requirement - this.xpValue);
  }

  addXp(amount: number): LevelUpResult {
    // A NaN here would poison the whole run silently: reject it at the door.
    const gainedXp = Number.isFinite(amount) ? Math.max(0, Math.trunc(amount)) : 0;
    if (this.isMaxed) return { leveledUp: false, level: this.levelValue, gained: 0, toNext: 0 };
    this.xpValue += gainedXp;
    let gained = 0;
    while (!this.isMaxed && this.xpValue >= this.requirementFor(this.levelValue)) {
      this.xpValue -= this.requirementFor(this.levelValue);
      this.levelValue += 1;
      gained += 1;
    }
    if (this.isMaxed) this.xpValue = 0;
    return { leveledUp: gained > 0, level: this.levelValue, gained, toNext: this.toNext };
  }

  /** Permanent-for-the-run bonuses earned so far (level 1 grants nothing). */
  bonuses(): StatBonuses {
    const steps = this.levelValue - 1;
    if (steps <= 0) return NO_BONUSES;
    const per = this.config.perLevel;
    return {
      damage: per.damage * steps,
      armor: per.armor * steps,
      maxHp: per.maxHp * steps,
      stamina: per.stamina * steps,
      critChance: per.critChance * steps,
      critMultiplier: per.critMultiplier * steps,
    };
  }

  reset(): void {
    this.levelValue = 1;
    this.xpValue = 0;
  }
}
