import { Inventory } from './Inventory';
import { RARITY_BY_ID, itemById } from './itemTable';
import type { ItemSlotId } from './itemTable';
import { rollChestLoot, rollMonsterDrop } from './LootTable';
import type { LootRoll, Roll } from './LootTable';

/** One inventory row as the React panel sees it (plain, serialisable). */
export interface InventoryRow {
  readonly uid: number;
  readonly defId: string;
  readonly label: string;
  readonly icon: string;
  readonly slot: ItemSlotId;
  readonly rarity: string;
  readonly rarityLabel: string;
  readonly color: string;
  readonly statsText: string;
  readonly stats: {
    readonly damage: number;
    readonly armor: number;
    readonly maxHp: number;
    readonly stamina: number;
    readonly critChance: number;
  };
}

export interface InventorySnapshot {
  readonly gold: number;
  readonly xp: number;
  readonly bag: readonly InventoryRow[];
  readonly equipped: { readonly [K in ItemSlotId]: InventoryRow | null };
  readonly capacity: number;
  readonly totals: {
    readonly damage: number;
    readonly armor: number;
    readonly maxHp: number;
    readonly stamina: number;
    readonly critChance: number;
  };
}

export interface LootGain {
  readonly gold: number;
  readonly items: readonly InventoryRow[];
  /** Items that did not fit into the bag. */
  readonly dropped: number;
}

const EMPTY_GAIN: LootGain = { gold: 0, items: [], dropped: 0 };

/**
 * Everything that belongs to the current run rather than to the avatar:
 * gold, experience and the inventory.
 *
 * Owned by the scene; the React HUD only ever reads `snapshot()`. Keeping it a
 * plain class (no three.js, no Rapier, no Zustand) makes the economy testable
 * and keeps the door open for serialising a run into Dexie on stage 12.
 */
export class RunState {
  readonly inventory = new Inventory();
  private goldValue = 0;
  private xpValue = 0;

  get gold(): number {
    return this.goldValue;
  }

  get xp(): number {
    return this.xpValue;
  }

  addGold(amount: number): void {
    this.goldValue = Math.max(0, this.goldValue + Math.max(0, Math.trunc(amount)));
  }

  addXp(amount: number): void {
    this.xpValue = Math.max(0, this.xpValue + Math.max(0, Math.trunc(amount)));
  }

  spendGold(amount: number): boolean {
    if (amount > this.goldValue) return false;
    this.goldValue -= amount;
    return true;
  }

  /** Adds a rolled drop to the run; overflow is reported, never thrown away silently. */
  grant(roll: LootRoll): LootGain {
    if (roll.gold <= 0 && roll.items.length === 0) return EMPTY_GAIN;
    this.addGold(roll.gold);
    const rows: InventoryRow[] = [];
    let dropped = 0;
    for (const item of roll.items) {
      const instance = this.inventory.create(item.defId, item.rarity);
      if (!instance || !this.inventory.add(instance)) {
        dropped += 1;
        continue;
      }
      const row = toRow(instance);
      if (row) rows.push(row);
    }
    return { gold: roll.gold, items: rows, dropped };
  }

  /** Rolls and grants a monster drop. */
  lootMonster(floor: number, roll: Roll): LootGain {
    return this.grant(rollMonsterDrop(floor, roll));
  }

  /** Rolls and grants a chest. */
  lootChest(floor: number, roll: Roll): LootGain {
    return this.grant(rollChestLoot(floor, roll));
  }

  snapshot(): InventorySnapshot {
    const totals = this.inventory.totals();
    const equipped = this.inventory.equipped;
    return {
      gold: this.goldValue,
      xp: this.xpValue,
      bag: this.inventory.bag.map((item) => toRow(item)).filter((row): row is InventoryRow => row !== null),
      equipped: {
        weapon: equipped.weapon ? toRow(equipped.weapon) : null,
        armor: equipped.armor ? toRow(equipped.armor) : null,
        charm: equipped.charm ? toRow(equipped.charm) : null,
      },
      capacity: this.inventory.capacity,
      totals: {
        damage: totals.damage,
        armor: totals.armor,
        maxHp: totals.maxHp,
        stamina: totals.stamina,
        critChance: totals.critChance,
      },
    };
  }

  reset(): void {
    this.inventory.clear();
    this.goldValue = 0;
    this.xpValue = 0;
  }
}

function toRow(instance: {
  readonly uid: number;
  readonly defId: string;
  readonly rarity: string;
  readonly stats: {
    readonly damage?: number;
    readonly armor?: number;
    readonly maxHp?: number;
    readonly stamina?: number;
    readonly critChance?: number;
    readonly critMultiplier?: number;
  };
}): InventoryRow | null {
  const definition = itemById(instance.defId);
  if (!definition) return null;
  const rarity = RARITY_BY_ID[instance.rarity as keyof typeof RARITY_BY_ID];
  return {
    uid: instance.uid,
    defId: instance.defId,
    label: definition.label,
    icon: definition.icon,
    slot: definition.slot,
    rarity: instance.rarity,
    rarityLabel: rarity?.label ?? '',
    color: rarity?.color ?? '#9aa3ae',
    statsText: describe(instance.stats),
    stats: {
      damage: instance.stats.damage ?? 0,
      armor: instance.stats.armor ?? 0,
      maxHp: instance.stats.maxHp ?? 0,
      stamina: instance.stats.stamina ?? 0,
      critChance: instance.stats.critChance ?? 0,
    },
  };
}

/** Compact stat line ("+9 урона · +3 % крита") for cards and toasts. */
function describe(stats: {
  readonly damage?: number;
  readonly armor?: number;
  readonly maxHp?: number;
  readonly stamina?: number;
  readonly critChance?: number;
  readonly critMultiplier?: number;
}): string {
  const parts: string[] = [];
  if (stats.damage) parts.push(`+${stats.damage} урона`);
  if (stats.armor) parts.push(`+${stats.armor} брони`);
  if (stats.maxHp) parts.push(`+${stats.maxHp} HP`);
  if (stats.stamina) parts.push(`+${stats.stamina} стамины`);
  if (stats.critChance) parts.push(`+${Math.round(stats.critChance * 100)} % крита`);
  if (stats.critMultiplier) parts.push(`+${stats.critMultiplier} к криту`);
  return parts.join(' · ');
}
