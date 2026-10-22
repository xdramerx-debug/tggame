import data from '@/data/monsters.json';
import type { RoomTypeId } from '@/game/world/dungeonTypes';
import type { BossPhase } from '@/game/ai/BossPhase';
import type { CharacterId } from '@/game/assets/manifest';

/** One enemy archetype from `src/data/monsters.json`. */
export interface MonsterDefinition {
  readonly id: string;
  readonly label: string;
  readonly model: CharacterId;
  readonly maxHp: number;
  readonly armor: number;
  readonly damage: number;
  readonly speed: number;
  readonly aggroRange: number;
  readonly leashRange: number;
  readonly attackRange: number;
  readonly windup: number;
  readonly recover: number;
  readonly attackCooldown: number;
  readonly staggerTime: number;
  readonly knockback: number;
  readonly xp: number;
  /** First floor on which the monster may appear. */
  readonly minFloor: number;
  /** Room types that may spawn this monster. */
  readonly rooms: readonly RoomTypeId[];
  /** Enrage steps (bosses only), from the first threshold to the last. */
  readonly phases?: readonly BossPhase[];
  /** True when the HUD shows a boss bar for this monster. */
  readonly boss?: boolean;
}

export interface SpawnRules {
  readonly perRoom: number;
  readonly maxActive: number;
  readonly activateRange: number;
  readonly deactivateRange: number;
  /** Extra minions allowed in a boss room (0…n). */
  readonly bossRoomAdds: number;
}

interface MonsterFile {
  readonly monsters: readonly MonsterDefinition[];
  readonly spawn: SpawnRules;
}

/**
 * Content table for enemies (single source of truth, like `rooms.json`).
 * The cast narrows the JSON's string ids; tests assert every id is a known
 * character model and every referenced room type exists.
 */
export const MONSTER_TABLE = data as unknown as MonsterFile;

export const SPAWN_RULES = MONSTER_TABLE.spawn;

/** Monsters that may appear on a given floor (content-driven, no id checks). */
export function monstersForFloor(floor: number): MonsterDefinition[] {
  return MONSTER_TABLE.monsters.filter((monster) => floor >= monster.minFloor);
}

/** The boss of a floor, if that floor has one. */
export function bossForFloor(floor: number): MonsterDefinition | null {
  return (
    MONSTER_TABLE.monsters.find(
      (monster) => monster.boss === true && monster.minFloor <= floor && monster.rooms.includes('boss'),
    ) ?? null
  );
}

export function monsterById(id: string): MonsterDefinition | null {
  return MONSTER_TABLE.monsters.find((monster) => monster.id === id) ?? null;
}

/** Weighted pick of a monster suitable for a room; deterministic via the rng. */
export function pickMonsterForRoom(
  roomType: RoomTypeId,
  floor: number,
  rng: () => number,
): MonsterDefinition | null {
  // Bosses are placed explicitly by the spawn plan, never by a random pick.
  const candidates = monstersForFloor(floor).filter(
    (monster) => monster.boss !== true && monster.rooms.includes(roomType),
  );
  if (candidates.length === 0) return null;
  const index = Math.min(candidates.length - 1, Math.floor(rng() * candidates.length));
  return candidates[index] ?? null;
}
