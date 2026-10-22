import { beforeEach, describe, expect, it } from 'vitest';
import { Inventory, resetItemUids, scaleStats, sumStats } from '@/game/loot/Inventory';
import { ITEM_DEFINITIONS } from '@/game/loot/itemTable';

function make(capacity = 12): Inventory {
  return new Inventory(capacity);
}

function add(inventory: Inventory, defId: string, rarity: 'common' | 'rare' | 'epic' = 'common') {
  const item = inventory.create(defId, rarity);
  if (!item) throw new Error(`unknown item ${defId}`);
  inventory.add(item);
  return item;
}

describe('scaleStats', () => {
  it('is the identity for common items', () => {
    expect(scaleStats({ damage: 11 }, 'common')).toMatchObject({ damage: 11 });
  });

  it('multiplies by rarity power and keeps fractions for crit', () => {
    const rare = scaleStats({ damage: 10, critChance: 0.03, critMultiplier: 0.2 }, 'rare');
    expect(rare.damage).toBe(15);
    expect(rare.critChance).toBeCloseTo(0.044, 3);
    expect(rare.critMultiplier).toBeCloseTo(0.29, 3);
  });

  it('keeps every field defined so consumers never deal with undefined', () => {
    const stats = scaleStats({ armor: 3 }, 'epic');
    expect(stats).toEqual({
      damage: 0,
      armor: 6,
      maxHp: 0,
      stamina: 0,
      critChance: 0,
      critMultiplier: 0,
    });
  });
});

describe('Inventory', () => {
  beforeEach(() => {
    resetItemUids();
  });

  it('starts empty with three empty slots', () => {
    const inventory = make();
    expect(inventory.size).toBe(0);
    expect(inventory.equipped).toEqual({ weapon: null, armor: null, charm: null });
    expect(inventory.totals().damage).toBe(0);
  });

  it('creates instances with unique uids', () => {
    const inventory = make();
    const a = add(inventory, 'ironSword');
    const b = add(inventory, 'ironSword');
    expect(a.uid).not.toBe(b.uid);
  });

  it('rejects unknown definitions', () => {
    expect(make().create('not-an-item', 'common')).toBeNull();
  });

  it('respects capacity', () => {
    const inventory = make(2);
    add(inventory, 'rustedBlade');
    add(inventory, 'leatherVest');
    expect(inventory.isFull).toBe(true);
    const extra = inventory.create('boneCharm', 'common');
    expect(extra).not.toBeNull();
    if (!extra) return;
    expect(inventory.add(extra)).toBeNull();
    expect(inventory.size).toBe(2);
  });

  it('equips into the right slot and returns the replaced item to the bag', () => {
    const inventory = make();
    const first = add(inventory, 'rustedBlade');
    const second = add(inventory, 'ironSword');

    const equipped = inventory.equip(first.uid);
    expect(equipped.ok).toBe(true);
    expect(equipped.replaced).toBeNull();
    expect(inventory.equipped.weapon?.uid).toBe(first.uid);
    expect(inventory.size).toBe(1);

    const swapped = inventory.equip(second.uid);
    expect(swapped.ok).toBe(true);
    expect(swapped.replaced?.uid).toBe(first.uid);
    expect(inventory.equipped.weapon?.uid).toBe(second.uid);
    expect(inventory.bag.map((item) => item.uid)).toContain(first.uid);
  });

  it('reports a missing item instead of throwing', () => {
    const result = make().equip(999);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('missing');
  });

  it('unequips back into the bag and refuses when the bag is full', () => {
    const inventory = make(1);
    const sword = add(inventory, 'rustedBlade');
    inventory.equip(sword.uid);
    expect(inventory.size).toBe(0);
    add(inventory, 'ironSword');
    expect(inventory.unequip('weapon')).toBeNull();

    const roomy = make(2);
    const blade = add(roomy, 'rustedBlade');
    roomy.equip(blade.uid);
    expect(roomy.unequip('weapon')?.uid).toBe(blade.uid);
    expect(roomy.equipped.weapon).toBeNull();
  });

  it('sums the bonuses of everything equipped', () => {
    const inventory = make();
    const weapon = add(inventory, 'ironSword'); // +11 damage
    const armor = add(inventory, 'chainHauberk'); // +7 armor, +10 hp
    const charm = add(inventory, 'boneCharm'); // +15 stamina
    inventory.equip(weapon.uid);
    inventory.equip(armor.uid);
    inventory.equip(charm.uid);

    const totals = inventory.totals();
    expect(totals.damage).toBe(11);
    expect(totals.armor).toBe(7);
    expect(totals.maxHp).toBe(10);
    expect(totals.stamina).toBe(15);

    inventory.unequip('weapon');
    expect(inventory.totals().damage).toBe(0);
  });

  it('lists bag plus equipped items', () => {
    const inventory = make();
    const weapon = add(inventory, 'rustedBlade');
    add(inventory, 'leatherVest');
    inventory.equip(weapon.uid);
    expect(inventory.all).toHaveLength(2);
    expect(inventory.find(weapon.uid)?.defId).toBe('rustedBlade');
  });

  it('clears for a new run', () => {
    const inventory = make();
    const item = add(inventory, 'ironSword');
    inventory.equip(item.uid);
    inventory.clear();
    expect(inventory.size).toBe(0);
    expect(inventory.equipped.weapon).toBeNull();
  });

  it('sumStats skips empty slots', () => {
    expect(sumStats([null, null])).toMatchObject({ damage: 0, armor: 0 });
  });

  it('every definition can be equipped without a missing slot', () => {
    const inventory = make(99);
    for (const definition of ITEM_DEFINITIONS) {
      const item = add(inventory, definition.id);
      expect(inventory.equip(item.uid).ok).toBe(true);
    }
    expect(inventory.size).toBe(ITEM_DEFINITIONS.length - 3);
  });
});
