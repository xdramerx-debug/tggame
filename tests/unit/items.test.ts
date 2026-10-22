import { describe, expect, it } from 'vitest';
import {
  EQUIP_SLOTS,
  INVENTORY_CAPACITY,
  ITEM_DEFINITIONS,
  LOOT_CONFIG,
  RARITIES,
  RARITY_BY_ID,
  describeStats,
  itemById,
  itemsForFloor,
} from '@/game/loot/itemTable';
import { CHARACTERS } from '@/game/assets/manifest';

describe('item table', () => {
  it('has unique ids and a definition for every slot', () => {
    const ids = ITEM_DEFINITIONS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const slot of EQUIP_SLOTS) {
      expect(ITEM_DEFINITIONS.some((item) => item.slot === slot.id)).toBe(true);
    }
  });

  it('only references known slots and rarities', () => {
    const slots = new Set(EQUIP_SLOTS.map((slot) => slot.id));
    for (const item of ITEM_DEFINITIONS) {
      expect(slots.has(item.slot)).toBe(true);
      expect(item.icon.length).toBeGreaterThan(0);
      expect(item.label.length).toBeGreaterThan(0);
    }
    for (const rarity of RARITIES) {
      expect(rarity.weight).toBeGreaterThan(0);
      expect(rarity.power).toBeGreaterThanOrEqual(1);
      expect(rarity.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('gives every item at least one stat and a sane tier', () => {
    for (const item of ITEM_DEFINITIONS) {
      const values = Object.values(item.stats).filter((value) => typeof value === 'number' && value > 0);
      expect(values.length).toBeGreaterThan(0);
      expect(item.tier).toBeGreaterThanOrEqual(1);
      expect(item.minFloor).toBeGreaterThanOrEqual(1);
    }
  });

  it('does not reference render assets: icons are emoji, not model ids', () => {
    for (const item of ITEM_DEFINITIONS) {
      expect(Object.keys(CHARACTERS)).not.toContain(item.icon);
      expect(item.icon).not.toMatch(/\.(glb|png|ktx2)$/);
    }
  });

  it('unlocks deeper items only from their floor', () => {
    const floor1 = itemsForFloor(1).map((item) => item.id);
    const floor2 = itemsForFloor(2).map((item) => item.id);
    expect(floor2.length).toBeGreaterThan(floor1.length);
    for (const item of ITEM_DEFINITIONS.filter((definition) => definition.minFloor > 1)) {
      expect(floor1).not.toContain(item.id);
    }
  });

  it('exposes lookup and formatting helpers', () => {
    expect(itemById('rustedBlade')?.slot).toBe('weapon');
    expect(itemById('nope')).toBeNull();
    expect(describeStats({ damage: 6, critChance: 0.03 })).toBe('+6 урона, +3 % крита');
    expect(describeStats({})).toBe('');
  });

  it('keeps the loot configuration consistent', () => {
    expect(INVENTORY_CAPACITY).toBeGreaterThan(0);
    expect(LOOT_CONFIG.maxCarried).toBe(INVENTORY_CAPACITY);
    expect(LOOT_CONFIG.monsterItemChance).toBeGreaterThan(0);
    expect(LOOT_CONFIG.monsterItemChance).toBeLessThan(1);
    for (const range of [LOOT_CONFIG.monsterGold, LOOT_CONFIG.chestGold]) {
      expect(range.max).toBeGreaterThanOrEqual(range.min);
    }
    expect(LOOT_CONFIG.chestItems.max).toBeGreaterThanOrEqual(LOOT_CONFIG.chestItems.min);
    expect(RARITY_BY_ID.epic.power).toBeGreaterThan(RARITY_BY_ID.common.power);
  });
});
