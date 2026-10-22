import { createRng } from './bsp';
import { distanceToRoom } from './DungeonMesh';
import { pickMonsterForRoom, SPAWN_RULES } from '@/game/combat/monsterTable';
import type { MonsterDefinition, SpawnRules } from '@/game/combat/monsterTable';
import type { Dungeon, DungeonRoom } from './dungeonTypes';

export interface PlannedSpawn {
  readonly id: number;
  readonly roomId: number;
  readonly definition: MonsterDefinition;
  readonly x: number;
  readonly z: number;
}

interface ActiveEnemy {
  readonly id: number;
  readonly x: number;
  readonly z: number;
  readonly dead: boolean;
}

export interface DirectorDecision {
  /** Spawns to create this tick (already respecting `maxActive`). */
  readonly spawn: readonly PlannedSpawn[];
  /** Active enemy ids that should be removed (player too far away). */
  readonly despawn: readonly number[];
}

export interface EnemyDirectorOptions {
  readonly dungeon: Dungeon;
  readonly floor: number;
  readonly seed: number;
  readonly rules?: SpawnRules;
}

const NO_DECISION: DirectorDecision = { spawn: [], despawn: [] };

/** Enemies never materialise closer than this to the player's feet. */
const MIN_SPAWN_DISTANCE = 4;

/**
 * Decides *when* enemies exist, never how they behave.
 *
 * The floor's monster population is generated up front (deterministically, from
 * the dungeon seed) so the same floor always holds the same enemies, but bodies
 * are only created when the player comes near a room and removed when they walk
 * away. That keeps at most `maxActive` capsules and skinned models alive — the
 * dominant cost on mobile — while a cleared room stays cleared until the floor is
 * regenerated.
 *
 * Pure logic, no three.js and no Rapier: this is the part worth unit-testing.
 */
export class EnemyDirector {
  readonly planned: readonly PlannedSpawn[];
  private readonly dungeon: Dungeon;
  private readonly rules: SpawnRules;
  private readonly spawned = new Set<number>();
  private readonly cleared = new Set<number>();

  constructor(options: EnemyDirectorOptions) {
    this.dungeon = options.dungeon;
    this.rules = options.rules ?? SPAWN_RULES;
    this.planned = planSpawns(options.dungeon, options.floor, options.seed, this.rules);
  }

  get plannedCount(): number {
    return this.planned.length;
  }

  /** Marks a planned spawn as permanently killed (a cleared room stays empty). */
  markKilled(id: number): void {
    this.cleared.add(id);
    this.spawned.delete(id);
  }

  /**
   * Forgets which spawns are instantiated, keeping permanent kills.
   * Used on respawn: the player wakes up at the entrance and the floor may
   * repopulate around them, while cleared rooms stay cleared.
   */
  reset(): void {
    this.spawned.clear();
  }

  /** Planned spawns that are neither alive nor cleared (for save/restore). */
  get remaining(): readonly PlannedSpawn[] {
    return this.planned.filter((spawn) => !this.cleared.has(spawn.id));
  }

  /**
   * Compares the current world state with the plan.
   * @param active enemies currently instantiated
   */
  reconcile(active: readonly ActiveEnemy[], player: { x: number; z: number }): DirectorDecision {
    const alive = active.filter((enemy) => !enemy.dead);
    const despawn: number[] = [];

    for (const enemy of active) {
      if (enemy.dead) continue; // corpses fade out on their own
      if (this.distanceToPlayer(enemy, player) > this.rules.deactivateRange) {
        despawn.push(enemy.id);
        this.spawned.delete(enemy.id);
      }
    }

    const aliveAfterDespawn = alive.filter((enemy) => !despawn.includes(enemy.id)).length;
    let budget = Math.max(0, this.rules.maxActive - aliveAfterDespawn);
    const spawn: PlannedSpawn[] = [];

    if (budget > 0) {
      // Nearest unspawned rooms first: the player is walking into them anyway.
      const candidates = this.planned
        .filter((spawnPoint) => !this.spawned.has(spawnPoint.id) && !this.cleared.has(spawnPoint.id))
        .map((spawnPoint) => ({
          spawnPoint,
          distance: this.spawnDistance(spawnPoint, player),
        }))
        .filter((entry) => entry.distance <= this.rules.activateRange)
        // ...and never pop into existence in the player's face.
        .filter((entry) => this.distanceToPlayer(entry.spawnPoint, player) >= MIN_SPAWN_DISTANCE)
        .sort((a, b) => a.distance - b.distance);

      for (const entry of candidates) {
        if (budget <= 0) break;
        this.spawned.add(entry.spawnPoint.id);
        spawn.push(entry.spawnPoint);
        budget -= 1;
      }
    }

    if (spawn.length === 0 && despawn.length === 0) return NO_DECISION;
    return { spawn, despawn };
  }

  private distanceToPlayer(point: { x: number; z: number }, player: { x: number; z: number }): number {
    return Math.hypot(point.x - player.x, point.z - player.z);
  }

  /** Distance from the player to the spawn's room edge (0 when inside). */
  private spawnDistance(spawn: PlannedSpawn, player: { x: number; z: number }): number {
    const room = this.dungeon.rooms.find((candidate) => candidate.id === spawn.roomId);
    if (!room) return this.distanceToPlayer(spawn, player);
    return distanceToRoom(room, player);
  }
}

/**
 * Builds the static plan of a floor.
 *
 * Room types that monsters may occupy come from the JSON table; positions come
 * from `room.spawnPoints` (a grid inset from the walls), so enemies never start
 * inside a pillar or a doorway.
 */
export function planSpawns(
  dungeon: Dungeon,
  floor: number,
  seed: number,
  rules: SpawnRules = SPAWN_RULES,
): PlannedSpawn[] {
  const rng = createRng((seed ^ 0x2f6b1d) + floor * 104729);
  const spawns: PlannedSpawn[] = [];
  let id = 0;

  for (const room of dungeon.rooms) {
    const definition = pickMonsterForRoom(room.type, floor, rng);
    if (!definition) continue;
    const points = pickSpawnPoints(room, rules.perRoom, rng);
    for (const point of points) {
      spawns.push({ id, roomId: room.id, definition, x: point.x, z: point.z });
      id += 1;
    }
  }
  return spawns;
}

/** Spreads `count` spawns over the room's interior grid, deterministically. */
function pickSpawnPoints(
  room: DungeonRoom,
  count: number,
  rng: () => number,
): { x: number; z: number }[] {
  const points = [...room.spawnPoints];
  if (points.length === 0) return [];
  // Shuffle (Fisher–Yates with the seeded rng), then take the first `count`.
  for (let i = points.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const a = points[i];
    const b = points[j];
    if (!a || !b) continue;
    points[i] = b;
    points[j] = a;
  }
  return points.slice(0, Math.min(count, points.length));
}
