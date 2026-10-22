import { LOOT_CONFIG, RARITIES, itemsForFloor } from './itemTable';
import type { LootConfig, RarityId } from './itemTable';
import { SURVIVAL_CONFIG } from '@/game/survival/Survival';

/** Random source in [0,1); injected so loot stays deterministic in tests. */
export type Roll = () => number;

/** Result of a loot roll, before it is granted to the run. */
export interface LootRoll {
  readonly gold: number;
  readonly items: readonly { readonly defId: string; readonly rarity: RarityId }[];
  /** Food rations: the survival clock is why gold alone is not a reward. */
  readonly rations: number;
}

/** Weighted rarity roll; returns the rarity id and never throws on bad data. */
export function rollRarity(roll: Roll): RarityId {
  const total = RARITIES.reduce((sum, rarity) => sum + rarity.weight, 0);
  let ticket = roll() * total;
  for (const rarity of RARITIES) {
    ticket -= rarity.weight;
    if (ticket < 0) return rarity.id;
  }
  return RARITIES[RARITIES.length - 1]?.id ?? 'common';
}

/**
 * Rolls a floor-appropriate item.
 *
 * The pool grows with depth (`minFloor`), and the pick is uniform inside the
 * pool — deeper floors do not just scale numbers, they unlock better bases, so
 * a floor-3 chest can hand out a scythe while floor 1 can only produce rust.
 */
export function rollItem(floor: number, roll: Roll): { defId: string; rarity: RarityId } | null {
  const pool = itemsForFloor(floor);
  if (pool.length === 0) return null;
  const definition = pool[Math.min(pool.length - 1, Math.floor(roll() * pool.length))];
  if (!definition) return null;
  return { defId: definition.id, rarity: rollRarity(roll) };
}

/** Chests always carry food: they are the reliable way to keep the clock up. */
function rollRations(roll: Roll): number {
  const { chestMin, chestMax } = SURVIVAL_CONFIG.rations;
  return Math.min(chestMax, chestMin + Math.floor(roll() * (chestMax - chestMin + 1)));
}

function rollGold(range: LootConfig['monsterGold'], floor: number, roll: Roll): number {
  const min = range.min + range.perFloor * Math.max(0, floor - 1);
  const max = range.max + range.perFloor * Math.max(0, floor - 1);
  // `roll()` is [0,1), but clamp anyway: a stuck rng must not mint gold.
  return Math.min(max, min + Math.floor(roll() * (max - min + 1)));
}

/** Gold and (rarely) an item from a killed monster. */
export function rollMonsterDrop(floor: number, roll: Roll): LootRoll {
  const gold = rollGold(LOOT_CONFIG.monsterGold, floor, roll);
  const rations = roll() < SURVIVAL_CONFIG.rations.monsterChance ? 1 : 0;
  if (roll() >= LOOT_CONFIG.monsterItemChance) return { gold, items: [], rations };
  const item = rollItem(floor, roll);
  return { gold, items: item ? [item] : [], rations };
}

/** A chest always pays gold and one or two items. */
export function rollChestLoot(floor: number, roll: Roll): LootRoll {
  const gold = rollGold(LOOT_CONFIG.chestGold, floor, roll);
  const { min, max } = LOOT_CONFIG.chestItems;
  const count = Math.min(max, min + Math.floor(roll() * (max - min + 1)));
  const items: { defId: string; rarity: RarityId }[] = [];
  for (let i = 0; i < count; i += 1) {
    const item = rollItem(floor, roll);
    if (item) items.push(item);
  }
  return { gold, items, rations: rollRations(roll) };
}
