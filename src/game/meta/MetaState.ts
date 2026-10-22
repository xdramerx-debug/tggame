import data from '@/data/progression.json';
import type { StatBonuses } from '@/game/player/PlayerStats';
import { NO_BONUSES } from '@/game/player/PlayerStats';
import type { ItemStats } from '@/game/loot/itemTable';

export interface MetaUpgrade {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly icon: string;
  readonly maxLevel: number;
  readonly baseCost: number;
  readonly costStep: number;
  readonly stats?: ItemStats;
  /** Extra rations at the start of every run. */
  readonly startingRations?: number;
}

export interface MetaRewards {
  /** Base pay for finishing a run, so a first-floor death is never worthless. */
  readonly perRun: number;
  readonly perKill: number;
  readonly perFloor: number;
  readonly perBoss: number;
  readonly perChest: number;
}

interface ProgressionFile {
  readonly currency: { readonly name: string; readonly icon: string };
  readonly rewards: MetaRewards;
  readonly upgrades: readonly MetaUpgrade[];
}

export const PROGRESSION = data as unknown as ProgressionFile;
export const META_UPGRADES = PROGRESSION.upgrades;
export const META_REWARDS = PROGRESSION.rewards;
export const META_CURRENCY = PROGRESSION.currency;

/** What a finished run pays out; mirrors `RunSummary` without importing it. */
export interface RunOutcome {
  readonly kills: number;
  readonly floor: number;
  readonly chestsOpened: number;
  readonly cause: 'combat' | 'starvation' | 'victory';
  /** Run length, copied into `stats` (the payout itself does not use it). */
  readonly seconds?: number;
}

/** Persisted shape. Versioned so a future schema change can migrate it. */
export interface MetaSnapshot {
  readonly version: 1;
  readonly embers: number;
  readonly levels: Readonly<Record<string, number>>;
}

export const META_STORAGE_VERSION = 1;

/** One row of the altar UI. */
export interface UpgradeView {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly icon: string;
  readonly level: number;
  readonly maxLevel: number;
  readonly cost: number | null;
  readonly maxed: boolean;
  readonly affordable: boolean;
}

/**
 * Meta-progression: permanent upgrades bought with embers earned by dying.
 *
 * The roguelite loop needs a reason to lose: every run pays embers, and embers
 * buy small permanent stat bumps. The class is deliberately pure — no Dexie, no
 * React — so the economy is unit-testable and the storage layer can change
 * (IndexedDB today, Telegram CloudStorage later) without touching the rules.
 */
export class MetaState {
  private embersValue = 0;
  private levelsValue: Record<string, number> = {};

  constructor(snapshot?: MetaSnapshot | null) {
    if (snapshot) this.restore(snapshot);
  }

  get embers(): number {
    return this.embersValue;
  }

  /** Embers earned by an outcome, without granting them. */
  static rewardFor(outcome: RunOutcome): number {
    const base =
      META_REWARDS.perRun +
      outcome.kills * META_REWARDS.perKill +
      Math.max(0, outcome.floor - 1) * META_REWARDS.perFloor +
      outcome.chestsOpened * META_REWARDS.perChest;
    return base + (outcome.cause === 'victory' ? META_REWARDS.perBoss : 0);
  }

  /** Embers for this outcome, granted once. */
  grantRun(outcome: RunOutcome): number {
    const reward = MetaState.rewardFor(outcome);
    this.embersValue += reward;
    return reward;
  }

  addEmbers(amount: number): void {
    this.embersValue = Math.max(0, this.embersValue + Math.trunc(amount));
  }

  levelOf(id: string): number {
    return this.levelsValue[id] ?? 0;
  }

  /** Cost of the next level, or null when the upgrade is maxed / unknown. */
  costOf(id: string): number | null {
    const upgrade = META_UPGRADES.find((candidate) => candidate.id === id);
    if (!upgrade) return null;
    const level = this.levelOf(id);
    if (level >= upgrade.maxLevel) return null;
    return upgrade.baseCost + upgrade.costStep * level;
  }

  get isMaxed(): boolean {
    return META_UPGRADES.every((upgrade) => this.levelOf(upgrade.id) >= upgrade.maxLevel);
  }

  /**
   * Buys one level.
   * @returns false when the upgrade is unknown, maxed, or unaffordable
   */
  purchase(id: string): boolean {
    const cost = this.costOf(id);
    if (cost === null || this.embersValue < cost) return false;
    this.embersValue -= cost;
    this.levelsValue = { ...this.levelsValue, [id]: this.levelOf(id) + 1 };
    return true;
  }

  /** Permanent stat bonuses of everything bought so far. */
  bonuses(): StatBonuses {
    const total = { ...NO_BONUSES } as { -readonly [K in keyof StatBonuses]: number };
    for (const upgrade of META_UPGRADES) {
      const level = this.levelOf(upgrade.id);
      if (level <= 0 || !upgrade.stats) continue;
      total.damage += (upgrade.stats.damage ?? 0) * level;
      total.armor += (upgrade.stats.armor ?? 0) * level;
      total.maxHp += (upgrade.stats.maxHp ?? 0) * level;
      total.stamina += (upgrade.stats.stamina ?? 0) * level;
      total.critChance += (upgrade.stats.critChance ?? 0) * level;
      total.critMultiplier += (upgrade.stats.critMultiplier ?? 0) * level;
    }
    return total;
  }

  /** Extra rations granted at the start of every run. */
  startingRations(): number {
    return META_UPGRADES.reduce((sum, upgrade) => {
      const level = this.levelOf(upgrade.id);
      return level > 0 && upgrade.startingRations ? sum + upgrade.startingRations * level : sum;
    }, 0);
  }

  /** Rows for the altar screen. */
  upgradeViews(): UpgradeView[] {
    return META_UPGRADES.map((upgrade) => {
      const level = this.levelOf(upgrade.id);
      const cost = this.costOf(upgrade.id);
      return {
        id: upgrade.id,
        label: upgrade.label,
        description: upgrade.description,
        icon: upgrade.icon,
        level,
        maxLevel: upgrade.maxLevel,
        cost,
        maxed: level >= upgrade.maxLevel,
        affordable: cost !== null && this.embersValue >= cost,
      };
    });
  }

  snapshot(): MetaSnapshot {
    return { version: META_STORAGE_VERSION, embers: this.embersValue, levels: { ...this.levelsValue } };
  }

  /** Loads a stored snapshot, ignoring anything malformed. */
  restore(snapshot: MetaSnapshot | null | undefined): void {
    if (!snapshot || snapshot.version !== META_STORAGE_VERSION) return;
    this.embersValue = Number.isFinite(snapshot.embers) ? Math.max(0, Math.trunc(snapshot.embers)) : 0;
    const levels: Record<string, number> = {};
    for (const upgrade of META_UPGRADES) {
      const raw = snapshot.levels?.[upgrade.id];
      if (typeof raw !== 'number' || !Number.isFinite(raw)) continue;
      levels[upgrade.id] = Math.min(upgrade.maxLevel, Math.max(0, Math.trunc(raw)));
    }
    this.levelsValue = levels;
  }

  reset(): void {
    this.embersValue = 0;
    this.levelsValue = {};
  }
}

/** Adds two bonus blocks (gear + meta); both are plain optional stat maps. */
export function addBonuses(a: StatBonuses, b: StatBonuses): StatBonuses {
  return {
    damage: a.damage + b.damage,
    armor: a.armor + b.armor,
    maxHp: a.maxHp + b.maxHp,
    stamina: a.stamina + b.stamina,
    critChance: a.critChance + b.critChance,
    critMultiplier: a.critMultiplier + b.critMultiplier,
  };
}
