import { INVENTORY_CAPACITY, ITEM_DEFINITIONS, RARITY_BY_ID } from './itemTable';
import type { ItemDefinition, ItemSlotId, ItemStats, RarityId } from './itemTable';

/** One rolled instance of an item: definition + rarity + scaled stats. */
export interface ItemInstance {
  /** Unique per run; used as the React key and the inventory handle. */
  readonly uid: number;
  readonly defId: string;
  readonly rarity: RarityId;
  /** Stats after the rarity multiplier, rounded to integers where sensible. */
  readonly stats: ItemStats;
}

let nextUid = 1;

/** Test hook: keeps uids deterministic between suites. */
export function resetItemUids(): void {
  nextUid = 1;
}

/**
 * Applies the rarity multiplier to the definition's stats.
 *
 * Written field by field rather than by iterating keys: it keeps the result
 * structurally typed, and it makes the per-field rounding explicit (crit values
 * are fractions, so they keep three decimals instead of collapsing to integers).
 */
export function scaleStats(stats: ItemStats, rarity: RarityId): ItemStats {
  const power = RARITY_BY_ID[rarity].power;
  const whole = (value: number | undefined): number => (value ? Math.round(value * power) : 0);
  const fraction = (value: number | undefined): number => (value ? round(value * power, 3) : 0);
  return {
    damage: whole(stats.damage),
    armor: whole(stats.armor),
    maxHp: whole(stats.maxHp),
    stamina: whole(stats.stamina),
    critChance: fraction(stats.critChance),
    critMultiplier: fraction(stats.critMultiplier),
  };
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Total stats of a set of equipped items (null slots are skipped). */
export function sumStats(instances: readonly (ItemInstance | null)[]): Required<ItemStats> {
  const total = {
    damage: 0,
    armor: 0,
    maxHp: 0,
    stamina: 0,
    critChance: 0,
    critMultiplier: 0,
  };
  for (const instance of instances) {
    if (!instance) continue;
    total.damage += instance.stats.damage ?? 0;
    total.armor += instance.stats.armor ?? 0;
    total.maxHp += instance.stats.maxHp ?? 0;
    total.stamina += instance.stats.stamina ?? 0;
    total.critChance += instance.stats.critChance ?? 0;
    total.critMultiplier += instance.stats.critMultiplier ?? 0;
  }
  return total;
}

export type EquippedSlots = Record<ItemSlotId, ItemInstance | null>;
export type SlotMap = { readonly [K in ItemSlotId]: ItemInstance | null };

export interface EquipResult {
  readonly ok: boolean;
  /** Item that went back to the bag because the slot was occupied. */
  readonly replaced: ItemInstance | null;
  readonly reason?: 'missing' | 'slot-taken';
}

/**
 * The run's inventory: a bag with a hard capacity plus three equipment slots.
 *
 * Deliberately small and side-effect free except for its own arrays: the scene
 * owns one instance, the HUD reads a snapshot, and combat never touches it
 * directly. Equipment is applied to `PlayerStats` by the scene after every
 * change, so there is exactly one place where stats are derived.
 */
export class Inventory {
  readonly capacity: number;
  private bagValue: ItemInstance[] = [];
  private equippedValue: SlotMap = { weapon: null, armor: null, charm: null };

  constructor(capacity: number = INVENTORY_CAPACITY) {
    this.capacity = capacity;
  }

  get bag(): readonly ItemInstance[] {
    return this.bagValue;
  }

  get equipped(): SlotMap {
    return this.equippedValue;
  }

  get isFull(): boolean {
    return this.bagValue.length >= this.capacity;
  }

  get size(): number {
    return this.bagValue.length;
  }

  /** All items currently owned (bag + equipped), for save/restore. */
  get all(): readonly ItemInstance[] {
    return [
      ...this.bagValue,
      ...Object.values(this.equippedValue).filter((item): item is ItemInstance => item !== null),
    ];
  }

  /** Creates an instance from a definition id; returns null for unknown ids. */
  create(defId: string, rarity: RarityId): ItemInstance | null {
    const definition = ITEM_DEFINITIONS.find((item) => item.id === defId);
    if (!definition) return null;
    const instance: ItemInstance = {
      uid: nextUid++,
      defId,
      rarity,
      stats: scaleStats(definition.stats, rarity),
    };
    return instance;
  }

  /** Adds a rolled item to the bag. Returns null when the bag is full. */
  add(item: ItemInstance): ItemInstance | null {
    if (this.isFull) return null;
    this.bagValue = [...this.bagValue, item];
    return item;
  }

  remove(uid: number): ItemInstance | null {
    const found = this.bagValue.find((item) => item.uid === uid);
    if (!found) return null;
    this.bagValue = this.bagValue.filter((item) => item.uid !== uid);
    return found;
  }

  find(uid: number): ItemInstance | null {
    return (
      this.bagValue.find((item) => item.uid === uid) ??
      Object.values(this.equippedValue).find((item) => item?.uid === uid) ??
      null
    );
  }

  /** Moves a bag item into its slot, sending the previous item back to the bag. */
  equip(uid: number): EquipResult {
    const item = this.bagValue.find((candidate) => candidate.uid === uid);
    if (!item) return { ok: false, replaced: null, reason: 'missing' };
    const definition = ITEM_DEFINITIONS.find((candidate) => candidate.id === item.defId);
    if (!definition) return { ok: false, replaced: null, reason: 'missing' };

    const previous = this.equippedValue[definition.slot];
    this.bagValue = this.bagValue.filter((candidate) => candidate.uid !== uid);
    if (previous) this.bagValue = [...this.bagValue, previous];
    this.equippedValue = { ...this.equippedValue, [definition.slot]: item };
    return { ok: true, replaced: previous };
  }

  /** Takes an item out of its slot and puts it back into the bag. */
  unequip(slot: ItemSlotId): ItemInstance | null {
    const current = this.equippedValue[slot];
    if (!current) return null;
    if (this.isFull) return null;
    this.bagValue = [...this.bagValue, current];
    this.equippedValue = { ...this.equippedValue, [slot]: null };
    return current;
  }

  /** Aggregated bonuses of everything currently equipped. */
  totals(): Required<ItemStats> {
    return sumStats(Object.values(this.equippedValue));
  }

  /** Definition of an item instance, for labels and slots. */
  definitionOf(item: ItemInstance): ItemDefinition | null {
    return ITEM_DEFINITIONS.find((definition) => definition.id === item.defId) ?? null;
  }

  clear(): void {
    this.bagValue = [];
    this.equippedValue = { weapon: null, armor: null, charm: null };
  }
}
