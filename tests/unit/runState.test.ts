import { beforeEach, describe, expect, it } from 'vitest';
import { RunState } from '@/game/loot/RunState';
import { resetItemUids } from '@/game/loot/Inventory';
import { rollChestLoot } from '@/game/loot/LootTable';
import { INVENTORY_CAPACITY } from '@/game/loot/itemTable';

describe('RunState', () => {
  beforeEach(() => {
    resetItemUids();
  });

  it('starts with no gold, xp or items', () => {
    const run = new RunState();
    const snapshot = run.snapshot();
    expect(snapshot.gold).toBe(0);
    expect(snapshot.xp).toBe(0);
    expect(snapshot.bag).toHaveLength(0);
    expect(snapshot.equipped.weapon).toBeNull();
    expect(snapshot.capacity).toBe(INVENTORY_CAPACITY);
  });

  it('grants a loot roll into gold and the bag', () => {
    const run = new RunState();
    const gain = run.grant({ gold: 12, items: [{ defId: 'ironSword', rarity: 'rare' }], rations: 0 });
    expect(gain.gold).toBe(12);
    expect(gain.items).toHaveLength(1);
    expect(gain.items[0]?.label).toBe('Железный меч');
    expect(gain.items[0]?.rarityLabel).toBe('Редкое');
    expect(gain.items[0]?.statsText).toContain('урона');
    expect(run.gold).toBe(12);
    expect(run.inventory.size).toBe(1);
  });

  it('reports overflow instead of silently dropping items', () => {
    const run = new RunState();
    const items = Array.from({ length: INVENTORY_CAPACITY + 2 }, () => ({
      defId: 'rustedBlade',
      rarity: 'common' as const,
    }));
    const gain = run.grant({ gold: 0, items, rations: 0 });
    expect(gain.items).toHaveLength(INVENTORY_CAPACITY);
    expect(gain.dropped).toBe(2);
  });

  it('ignores empty rolls and unknown item ids', () => {
    const run = new RunState();
    expect(run.grant({ gold: 0, items: [], rations: 0 })).toEqual({ gold: 0, items: [], dropped: 0, rations: 0 });
    const gain = run.grant({ gold: 3, items: [{ defId: 'missing', rarity: 'common' }], rations: 0 });
    expect(gain.gold).toBe(3);
    expect(gain.dropped).toBe(1);
    expect(run.gold).toBe(3);
  });

  it('accumulates xp and spends gold', () => {
    const run = new RunState();
    run.addXp(12);
    run.addXp(22);
    expect(run.xp).toBe(34);

    run.addGold(10);
    expect(run.spendGold(11)).toBe(false);
    expect(run.spendGold(10)).toBe(true);
    expect(run.gold).toBe(0);
    // Negative inputs never mint currency.
    run.addGold(-5);
    run.addXp(-5);
    expect(run.gold).toBe(0);
    expect(run.xp).toBe(34);
  });

  it('exposes equipped items with their bonuses in totals', () => {
    const run = new RunState();
    run.grant({ gold: 0, items: [{ defId: 'ironSword', rarity: 'common' }], rations: 0 });
    const item = run.inventory.bag[0];
    expect(item).toBeDefined();
    if (!item) return;
    run.inventory.equip(item.uid);

    const snapshot = run.snapshot();
    expect(snapshot.equipped.weapon?.defId).toBe('ironSword');
    expect(snapshot.bag).toHaveLength(0);
    expect(snapshot.totals.damage).toBeGreaterThan(0);
  });

  it('turns a chest roll into loot through the same path as the scene', () => {
    const run = new RunState();
    const gain = run.lootChest(2, Math.random);
    expect(gain.gold).toBeGreaterThan(0);
    expect(gain.items.length).toBeGreaterThan(0);
    expect(run.inventory.size).toBe(gain.items.length);
    expect(rollChestLoot(2, Math.random).items.length).toBeGreaterThan(0);
  });

  it('carries food rations separately from items', () => {
    const run = new RunState();
    expect(run.rations).toBe(1);
    run.addRations(2);
    expect(run.rations).toBe(3);
    expect(run.consumeRation()).toBe(true);
    expect(run.rations).toBe(2);
    expect(run.snapshot().rations).toBe(2);

    run.addRations(-99);
    expect(run.rations).toBe(0);
    expect(run.consumeRation()).toBe(false);
  });

  it('grants rations from a chest roll', () => {
    const run = new RunState();
    const gain = run.lootChest(1, Math.random);
    expect(gain.rations).toBeGreaterThanOrEqual(1);
    expect(run.rations).toBe(1 + gain.rations);
  });

  it('resets a run for a fresh start', () => {
    const run = new RunState();
    run.addGold(50);
    run.addXp(20);
    run.grant({ gold: 0, items: [{ defId: 'ironSword', rarity: 'common' }], rations: 0 });
    run.reset();
    expect(run.gold).toBe(0);
    expect(run.xp).toBe(0);
    expect(run.inventory.size).toBe(0);
    // Food is restored to the starting ration.
    expect(run.rations).toBe(1);
  });
});
