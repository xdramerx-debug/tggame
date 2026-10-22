import { describe, expect, it } from 'vitest';
import { rollChestLoot, rollItem, rollMonsterDrop, rollRarity } from '@/game/loot/LootTable';
import { LOOT_CONFIG, itemsForFloor } from '@/game/loot/itemTable';
import { createRng } from '@/game/world/bsp';

/** Repeats a fixed value forever. */
const constant = (value: number) => () => value;

/** Yields the given values in order, then 0.5 (a neutral middle). */
function sequence(...values: number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index] ?? 0.5;
    index += 1;
    return value;
  };
}

describe('rollRarity', () => {
  it('maps the roll onto the weighted bands', () => {
    expect(rollRarity(constant(0))).toBe('common');
    // Weights: common 62, rare 28, epic 10 → 90/100 lands in epic.
    expect(rollRarity(constant(0.9))).toBe('epic');
    expect(rollRarity(constant(0.999))).toBe('epic');
    expect(rollRarity(constant(0.7))).toBe('rare');
  });

  it('is deterministic for a seeded generator', () => {
    const a = createRng(42);
    const b = createRng(42);
    const first = [rollRarity(a), rollRarity(a), rollRarity(a)];
    const second = [rollRarity(b), rollRarity(b), rollRarity(b)];
    expect(first).toEqual(second);
  });
});

describe('rollItem', () => {
  it('only offers items unlocked on the floor', () => {
    const allowed = new Set(itemsForFloor(1).map((item) => item.id));
    for (let i = 0; i < 200; i += 1) {
      const item = rollItem(1, Math.random);
      expect(item).not.toBeNull();
      if (!item) continue;
      expect(allowed.has(item.defId)).toBe(true);
    }
  });

  it('can reach late items on a deep floor', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 400; i += 1) {
      const item = rollItem(4, Math.random);
      if (item) seen.add(item.defId);
    }
    const late = itemsForFloor(4).filter((item) => item.minFloor === 3);
    expect(late.some((item) => seen.has(item.id))).toBe(true);
  });

  it('returns null for an empty pool', () => {
    // Floor 0 is below every item's minFloor.
    expect(rollItem(0, Math.random)).toBeNull();
  });
});

describe('monster drops', () => {
  it('always pays gold and only rarely an item', () => {
    const neverItem = sequence(0.5, LOOT_CONFIG.monsterItemChance + 0.01);
    const drop = rollMonsterDrop(1, neverItem);
    expect(drop.gold).toBeGreaterThanOrEqual(LOOT_CONFIG.monsterGold.min);
    expect(drop.items).toHaveLength(0);

    const alwaysItem = sequence(0.5, 0, 0, 0);
    const lucky = rollMonsterDrop(1, alwaysItem);
    expect(lucky.items).toHaveLength(1);
  });

  it('scales gold with depth', () => {
    const shallow = rollMonsterDrop(1, constant(1));
    const deep = rollMonsterDrop(3, constant(1));
    expect(deep.gold).toBeGreaterThan(shallow.gold);
  });
});

describe('chest loot', () => {
  it('always contains gold and one or two items', () => {
    for (let i = 0; i < 50; i += 1) {
      const chest = rollChestLoot(2, Math.random);
      expect(chest.gold).toBeGreaterThan(0);
      expect(chest.items.length).toBeGreaterThanOrEqual(LOOT_CONFIG.chestItems.min);
      expect(chest.items.length).toBeLessThanOrEqual(LOOT_CONFIG.chestItems.max);
      for (const item of chest.items) {
        expect(item.defId.length).toBeGreaterThan(0);
        expect(['common', 'rare', 'epic']).toContain(item.rarity);
      }
    }
  });

  it('always puts food in a chest and sometimes on a monster', () => {
    const chest = rollChestLoot(1, constant(0));
    expect(chest.rations).toBeGreaterThanOrEqual(1);

    // Roll 0 → ration granted; the gold roll comes first, so the second call is
    // the food gate. A roll above the chance yields none.
    const lucky = rollMonsterDrop(1, sequence(0.5, 0, 0.99));
    expect(lucky.rations).toBe(1);
    const unlucky = rollMonsterDrop(1, sequence(0.5, 0.99, 0.99));
    expect(unlucky.rations).toBe(0);
  });

  it('pays more than a single monster', () => {
    const chest = rollChestLoot(1, constant(0));
    const monster = rollMonsterDrop(1, constant(0));
    expect(chest.gold).toBeGreaterThan(monster.gold);
  });
});
