import data from '@/data/monsters.json';
import type { RoomTypeId } from '@/game/world/dungeonTypes';
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
  /** Room types that may spawn this monster. */
  readonly rooms: readonly RoomTypeId[];
}

export interface SpawnRules {
  readonly perRoom: number;
  readonly maxActive: number;
  readonly activateRange: number;
  readonly deactivateRange: number;
  /** Floor index from which the second archetype joins the spawn table. */
  readonly minFloorForRevenant: number;
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

/** Monsters that may appear on a given floor. */
export function monstersForFloor(floor: number): MonsterDefinition[] {
  return MONSTER_TABLE.monsters.filter((monster) => {
    if (monster.id === 'revenant') return floor >= SPAWN_RULES.minFloorForRevenant;
    return true;
  });
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
  const candidates = monstersForFloor(floor).filter((monster) => monster.rooms.includes(roomType));
  if (candidates.length === 0) return null;
  const index = Math.min(candidates.length - 1, Math.floor(rng() * candidates.length));
  return candidates[index] ?? null;
}
