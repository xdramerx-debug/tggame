import data from '@/data/items.json';

export type ItemSlotId = 'weapon' | 'armor' | 'charm';
export type RarityId = 'common' | 'rare' | 'epic';

/** Stats an item can modify, all additive on top of the player's base numbers. */
export interface ItemStats {
  readonly damage?: number;
  readonly armor?: number;
  readonly maxHp?: number;
  readonly stamina?: number;
  readonly critChance?: number;
  /** Extra crit multiplier, added to the base 1.8. */
  readonly critMultiplier?: number;
}

export interface ItemDefinition {
  readonly id: string;
  readonly label: string;
  readonly slot: ItemSlotId;
  /** Emoji shown in the inventory grid (no external icon assets). */
  readonly icon: string;
  /** Rough power tier, used for sorting and for floor gating. */
  readonly tier: number;
  /** First floor on which the item may drop. */
  readonly minFloor: number;
  readonly stats: ItemStats;
}

export interface RarityDefinition {
  readonly id: RarityId;
  readonly label: string;
  readonly weight: number;
  /** Multiplier applied to every stat of the item. */
  readonly power: number;
  readonly color: string;
}

export interface SlotDefinition {
  readonly id: ItemSlotId;
  readonly label: string;
  readonly icon: string;
}

export interface GoldRange {
  readonly min: number;
  readonly max: number;
  /** Extra gold per floor above the first. */
  readonly perFloor: number;
}

export interface LootConfig {
  readonly monsterGold: GoldRange;
  readonly monsterItemChance: number;
  readonly chestGold: GoldRange;
  readonly chestItems: { readonly min: number; readonly max: number };
  readonly maxCarried: number;
}

interface ItemFile {
  readonly capacity: number;
  readonly rarities: readonly RarityDefinition[];
  readonly slots: readonly SlotDefinition[];
  readonly items: readonly ItemDefinition[];
  readonly loot: LootConfig;
}

/**
 * Item and loot content table (single source of truth, like `rooms.json` and
 * `monsters.json`). Balance lives in JSON; the code below only interprets it.
 */
export const ITEM_TABLE = data as unknown as ItemFile;

export const ITEM_DEFINITIONS = ITEM_TABLE.items;
export const RARITIES = ITEM_TABLE.rarities;
export const EQUIP_SLOTS = ITEM_TABLE.slots;
export const LOOT_CONFIG = ITEM_TABLE.loot;
export const INVENTORY_CAPACITY = ITEM_TABLE.capacity;

export const RARITY_BY_ID: Record<RarityId, RarityDefinition> = {
  common: pickRarity('common'),
  rare: pickRarity('rare'),
  epic: pickRarity('epic'),
};

function pickRarity(id: RarityId): RarityDefinition {
  const found = RARITIES.find((rarity) => rarity.id === id);
  if (!found) throw new Error(`unknown rarity ${id}`);
  return found;
}

export function itemById(id: string): ItemDefinition | null {
  return ITEM_DEFINITIONS.find((item) => item.id === id) ?? null;
}

/** Items that may drop on `floor`, sorted by tier (cheap early, better later). */
export function itemsForFloor(floor: number): ItemDefinition[] {
  return ITEM_DEFINITIONS.filter((item) => item.minFloor <= floor).sort((a, b) => a.tier - b.tier);
}

/** Human-readable "+6 урона, +2 брони" line for the inventory card. */
export function describeStats(stats: ItemStats): string {
  const parts: string[] = [];
  if (stats.damage) parts.push(`+${format(stats.damage)} урона`);
  if (stats.armor) parts.push(`+${format(stats.armor)} брони`);
  if (stats.maxHp) parts.push(`+${format(stats.maxHp)} HP`);
  if (stats.stamina) parts.push(`+${format(stats.stamina)} стамины`);
  if (stats.critChance) parts.push(`+${format(stats.critChance * 100)} % крита`);
  if (stats.critMultiplier) parts.push(`+${format(stats.critMultiplier)} к криту`);
  return parts.join(', ');
}

function format(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}
