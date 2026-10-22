import { describe, expect, it } from 'vitest';
import { EnemyDirector, planSpawns } from '@/game/world/EnemyDirector';
import type { Dungeon, DungeonRoom, RoomTypeId } from '@/game/world/dungeonTypes';

const LIGHT = { color: '#000000', intensity: 0, distance: 1, flicker: false } as const;

function room(id: number, type: RoomTypeId, centerX: number, spawnPoints: readonly { x: number; z: number }[]): DungeonRoom {
  return {
    id,
    type,
    x: centerX - 3,
    y: -3,
    w: 6,
    h: 6,
    ceiling: 3,
    light: LIGHT,
    center: { x: centerX, z: 0 },
    // Spawn points are world metres: offset the shared template into the room.
    spawnPoints: spawnPoints.map((point) => ({ x: point.x + centerX, z: point.z })),
  };
}

function dungeon(rooms: readonly DungeonRoom[]): Dungeon {
  return {
    seed: 7,
    floor: 1,
    width: 64,
    height: 64,
    tiles: new Uint8Array(64 * 64),
    roomIds: new Int16Array(64 * 64),
    ceiling: new Float32Array(64 * 64),
    rooms,
    doors: [],
    entrance: { x: 0, z: 0 },
    exit: { x: 1, z: 1 },
  };
}

const POINTS = [
  { x: -1, z: -1 },
  { x: 1, z: -1 },
  { x: -1, z: 1 },
  { x: 1, z: 1 },
];

describe('planSpawns', () => {
  it('only fills room types listed in the monster table', () => {
    const floor = dungeon([room(0, 'treasure', 0, POINTS), room(1, 'campfire', 20, POINTS)]);
    expect(planSpawns(floor, 1, 42)).toHaveLength(0);
  });

  it('places at most `perRoom` enemies and gives each a unique id', () => {
    const floor = dungeon([room(0, 'combat', 0, POINTS), room(1, 'combat', 40, POINTS)]);
    const spawns = planSpawns(floor, 1, 42);
    expect(spawns).toHaveLength(4); // 2 per room
    expect(new Set(spawns.map((spawn) => spawn.id)).size).toBe(spawns.length);
    expect(spawns.filter((spawn) => spawn.roomId === 0)).toHaveLength(2);
  });

  it('spawn points come from the room grid', () => {
    const floor = dungeon([room(0, 'combat', 0, POINTS)]);
    for (const spawn of planSpawns(floor, 1, 42)) {
      expect(POINTS.some((point) => point.x === spawn.x && point.z === spawn.z)).toBe(true);
    }
  });

  it('is deterministic for the same seed and floor', () => {
    const floor = dungeon([room(0, 'combat', 0, POINTS), room(1, 'combat', 40, POINTS)]);
    expect(planSpawns(floor, 1, 99)).toEqual(planSpawns(floor, 1, 99));
  });

  it('unlocks the revenant from the configured floor', () => {
    const floor = dungeon([
      room(0, 'combat', 0, POINTS),
      room(1, 'combat', 20, POINTS),
      room(2, 'combat', 40, POINTS),
    ]);
    const ids = new Set(planSpawns(floor, 1, 5).map((spawn) => spawn.definition.id));
    expect(ids.has('revenant')).toBe(false);
    const later = new Set(planSpawns(floor, 3, 5).map((spawn) => spawn.definition.id));
    expect(later.has('revenant')).toBe(true);
  });
});

describe('EnemyDirector', () => {
  it('spawns nothing while the player is far from every room', () => {
    const floor = dungeon([room(0, 'combat', 0, POINTS)]);
    const director = new EnemyDirector({ dungeon: floor, floor: 1, seed: 3 });
    const decision = director.reconcile([], { x: 200, z: 200 });
    expect(decision.spawn).toHaveLength(0);
    expect(decision.despawn).toHaveLength(0);
  });

  it('spawns nearby enemies and never exceeds maxActive', () => {
    const floor = dungeon([
      room(0, 'combat', 8, POINTS),
      room(1, 'combat', 14, POINTS),
      room(2, 'combat', 20, POINTS),
      room(3, 'combat', 26, POINTS),
    ]);
    const director = new EnemyDirector({ dungeon: floor, floor: 1, seed: 3 });
    const decision = director.reconcile([], { x: 0, z: 0 });
    expect(decision.spawn.length).toBeGreaterThan(0);
    expect(decision.spawn.length).toBeLessThanOrEqual(6);
  });

  it('does not re-spawn enemies that are already alive', () => {
    const floor = dungeon([room(0, 'combat', 8, POINTS)]);
    const director = new EnemyDirector({ dungeon: floor, floor: 1, seed: 3 });
    const first = director.reconcile([], { x: 0, z: 0 });
    const active = first.spawn.map((spawn) => ({ id: spawn.id, x: spawn.x, z: spawn.z, dead: false }));
    expect(director.reconcile(active, { x: 0, z: 0 }).spawn).toHaveLength(0);
  });

  it('despawns enemies the player left behind', () => {
    const floor = dungeon([room(0, 'combat', 8, POINTS)]);
    const director = new EnemyDirector({ dungeon: floor, floor: 1, seed: 3 });
    const first = director.reconcile([], { x: 0, z: 0 });
    const active = first.spawn.map((spawn) => ({ id: spawn.id, x: spawn.x, z: spawn.z, dead: false }));
    const far = director.reconcile(active, { x: 200, z: 200 });
    expect(far.despawn).toHaveLength(active.length);
  });

  it('never spawns an enemy right next to the player', () => {
    // The player stands in the room centre: all four points are ~1.4 m away.
    const inside = dungeon([room(0, 'combat', 0, POINTS)]);
    const nearby = new EnemyDirector({ dungeon: inside, floor: 1, seed: 3 });
    expect(nearby.reconcile([], { x: 0, z: 0 }).spawn).toHaveLength(0);

    // From a distance the same room spawns normally, still outside the bubble.
    const away = new EnemyDirector({ dungeon: inside, floor: 1, seed: 3 });
    const decision = away.reconcile([], { x: 12, z: 0 });
    expect(decision.spawn.length).toBeGreaterThan(0);
    for (const spawn of decision.spawn) {
      expect(Math.hypot(spawn.x - 12, spawn.z)).toBeGreaterThanOrEqual(4);
    }
  });

  it('keeps a killed enemy cleared forever', () => {
    const floor = dungeon([room(0, 'combat', 8, POINTS)]);
    const director = new EnemyDirector({ dungeon: floor, floor: 1, seed: 3 });
    const first = director.reconcile([], { x: 0, z: 0 });
    const killed = first.spawn[0];
    expect(killed).toBeDefined();
    if (!killed) return;
    director.markKilled(killed.id);
    const again = director.reconcile([], { x: 0, z: 0 });
    expect(again.spawn.some((spawn) => spawn.id === killed.id)).toBe(false);
    expect(director.remaining.some((spawn) => spawn.id === killed.id)).toBe(false);
  });

  it('reset forgets live spawns but keeps kills', () => {
    const floor = dungeon([room(0, 'combat', 8, POINTS)]);
    const director = new EnemyDirector({ dungeon: floor, floor: 1, seed: 3 });
    const first = director.reconcile([], { x: 0, z: 0 });
    const killed = first.spawn[0];
    expect(killed).toBeDefined();
    if (!killed) return;

    director.markKilled(killed.id);
    director.reset();
    const after = director.reconcile([], { x: 0, z: 0 });
    expect(after.spawn.length).toBe(first.spawn.length - 1);
    expect(after.spawn.some((spawn) => spawn.id === killed.id)).toBe(false);
  });

  it('freezes the plan at construction', () => {
    const floor = dungeon([room(0, 'combat', 8, POINTS)]);
    const director = new EnemyDirector({ dungeon: floor, floor: 1, seed: 3 });
    expect(director.plannedCount).toBe(2);
    expect(director.planned).toHaveLength(2);
  });
});
