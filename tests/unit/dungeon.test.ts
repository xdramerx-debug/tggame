import { describe, expect, it } from 'vitest';
import { DUNGEON_CONFIG, DungeonGenerator, isFullyConnected } from '@/game/world/DungeonGenerator';
import { TileKind, isWalkable, roomAt, tileAt, tileCenter } from '@/game/world/dungeonTypes';
import type { Dungeon, RoomTypeId } from '@/game/world/dungeonTypes';

const KNOWN_TYPES: readonly RoomTypeId[] = [
  'entrance',
  'combat',
  'treasure',
  'campfire',
  'altar',
  'exit',
  'boss',
];

function fingerprint(dungeon: Dungeon): string {
  return [
    dungeon.width,
    dungeon.height,
    Array.from(dungeon.tiles).join(''),
    Array.from(dungeon.roomIds).join(','),
    dungeon.rooms.map((room) => `${room.id}:${room.type}:${room.x},${room.y},${room.w},${room.h}`).join('|'),
    dungeon.doors.map((door) => `${door.x},${door.z},${door.along},${door.width},${door.roomId}`).join('|'),
    `${dungeon.entrance.x},${dungeon.entrance.z}`,
    `${dungeon.exit.x},${dungeon.exit.z}`,
  ].join('#');
}

/** Breadth-first reachability over walkable tiles from the entrance. */
function reachableTiles(dungeon: Dungeon): Set<number> {
  const startX = Math.floor(dungeon.entrance.x);
  const startZ = Math.floor(dungeon.entrance.z);
  const start = startZ * dungeon.width + startX;
  const seen = new Set<number>([start]);
  const queue = [start];
  while (queue.length > 0) {
    const index = queue.pop();
    if (index === undefined) break;
    const x = index % dungeon.width;
    const z = Math.floor(index / dungeon.width);
    const neighbours: [number, number][] = [
      [x + 1, z],
      [x - 1, z],
      [x, z + 1],
      [x, z - 1],
    ];
    for (const [nx, nz] of neighbours) {
      if (nx < 0 || nz < 0 || nx >= dungeon.width || nz >= dungeon.height) continue;
      const next = nz * dungeon.width + nx;
      if (seen.has(next)) continue;
      if ((dungeon.tiles[next] ?? TileKind.Solid) === TileKind.Solid) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return seen;
}

describe('rooms.json content table', () => {
  it('uses only known room type ids with positive weights', () => {
    expect(DUNGEON_CONFIG.roomTypes.length).toBeGreaterThanOrEqual(4);
    for (const definition of DUNGEON_CONFIG.roomTypes) {
      expect(KNOWN_TYPES).toContain(definition.id);
      // The boss arena is placed explicitly on the deepest floor, so its weight
      // is 0; every other room type must be rollable.
      if (definition.id === 'boss') expect(definition.weight).toBe(0);
      else expect(definition.weight).toBeGreaterThan(0);
      expect(definition.props.length).toBeGreaterThan(0);
      expect(definition.light.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(definition.light.intensity).toBeGreaterThan(0);
      expect(definition.light.distance).toBeGreaterThan(0);
    }
  });

  it('declares sane ceiling heights and corridor width', () => {
    const { roomHeight, corridorWidth } = DUNGEON_CONFIG;
    expect(roomHeight.min).toBeGreaterThanOrEqual(2.5);
    expect(roomHeight.max).toBeLessThanOrEqual(6);
    expect(roomHeight.max).toBeGreaterThan(roomHeight.min);
    expect(roomHeight.corridor).toBeLessThanOrEqual(roomHeight.min);
    expect(corridorWidth).toBeGreaterThanOrEqual(2);
    expect(Number.isInteger(corridorWidth)).toBe(true);
  });
});

describe('DungeonGenerator determinism', () => {
  it('produces an identical floor for the same seed and floor', () => {
    const a = DungeonGenerator.generate({ seed: 4242, floor: 1 });
    const b = DungeonGenerator.generate({ seed: 4242, floor: 1 });
    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  it('produces different floors for different seeds', () => {
    const a = DungeonGenerator.generate({ seed: 1, floor: 1 });
    const b = DungeonGenerator.generate({ seed: 2, floor: 1 });
    expect(fingerprint(a)).not.toBe(fingerprint(b));
  });

  it('produces different floors per floor index (deeper = new layout)', () => {
    const first = DungeonGenerator.generate({ seed: 909, floor: 1 });
    const second = DungeonGenerator.generate({ seed: 909, floor: 2 });
    const third = DungeonGenerator.generate({ seed: 909, floor: 3 });
    const prints = new Set([fingerprint(first), fingerprint(second), fingerprint(third)]);
    expect(prints.size).toBe(3);
  });

  it('defaults to the documented 56×56 floor with 7 rooms', () => {
    const dungeon = DungeonGenerator.generate({ seed: 1337 });
    expect(dungeon.width).toBe(56);
    expect(dungeon.height).toBe(56);
    expect(dungeon.rooms).toHaveLength(7);
    expect(dungeon.floor).toBe(1);
    expect(dungeon.seed).toBe(1337);
  });
});

describe('DungeonGenerator structure (500 seeds)', () => {
  const dungeons: Dungeon[] = [];
  for (let seed = 1; seed <= 500; seed += 1) {
    dungeons.push(DungeonGenerator.generate({ seed, floor: 1 }));
  }

  it('always builds 5–11 rooms and at least one door', () => {
    for (const dungeon of dungeons) {
      expect(dungeon.rooms.length).toBeGreaterThanOrEqual(5);
      expect(dungeon.rooms.length).toBeLessThanOrEqual(11);
      expect(dungeon.doors.length).toBeGreaterThan(0);
    }
  });

  it('is fully connected: every room tile is reachable from the entrance', () => {
    for (const dungeon of dungeons) {
      expect(isFullyConnected(dungeon.tiles, dungeon.width, dungeon.height, dungeon.entrance)).toBe(true);
    }
  });

  it('reaches every room rectangle from the spawn point', () => {
    for (const dungeon of dungeons) {
      const reachable = reachableTiles(dungeon);
      for (const room of dungeon.rooms) {
        let touched = false;
        for (let z = room.y; z < room.y + room.h && !touched; z += 1) {
          for (let x = room.x; x < room.x + room.w && !touched; x += 1) {
            if (reachable.has(z * dungeon.width + x)) touched = true;
          }
        }
        expect(touched).toBe(true);
      }
    }
  });

  it('keeps the spawn and exit inside walkable tiles', () => {
    for (const dungeon of dungeons) {
      expect(isWalkable(dungeon, Math.floor(dungeon.entrance.x), Math.floor(dungeon.entrance.z))).toBe(true);
      expect(isWalkable(dungeon, Math.floor(dungeon.exit.x), Math.floor(dungeon.exit.z))).toBe(true);
    }
  });

  it('places exactly one entrance and one exit room, and they differ', () => {
    for (const dungeon of dungeons) {
      const entrances = dungeon.rooms.filter((room) => room.type === 'entrance');
      const exits = dungeon.rooms.filter((room) => room.type === 'exit');
      expect(entrances).toHaveLength(1);
      expect(exits).toHaveLength(1);
      const entrance = entrances[0];
      const exit = exits[0];
      if (!entrance || !exit) throw new Error('missing entrance/exit');
      expect(entrance.id).not.toBe(exit.id);
      expect(dungeon.entrance.x).toBeCloseTo(entrance.center.x, 6);
      expect(dungeon.entrance.z).toBeCloseTo(entrance.center.z, 6);
      expect(dungeon.exit.x).toBeCloseTo(exit.center.x, 6);
      expect(dungeon.exit.z).toBeCloseTo(exit.center.z, 6);
    }
  });

  it('uses only valid room types and room geometry inside the grid', () => {
    for (const dungeon of dungeons) {
      for (const room of dungeon.rooms) {
        expect(KNOWN_TYPES).toContain(room.type);
        expect(room.w).toBeGreaterThanOrEqual(5);
        expect(room.h).toBeGreaterThanOrEqual(5);
        expect(room.x).toBeGreaterThanOrEqual(0);
        expect(room.y).toBeGreaterThanOrEqual(0);
        expect(room.x + room.w).toBeLessThanOrEqual(dungeon.width);
        expect(room.y + room.h).toBeLessThanOrEqual(dungeon.height);
        expect(room.ceiling).toBeGreaterThanOrEqual(DUNGEON_CONFIG.roomHeight.min);
        expect(room.ceiling).toBeLessThanOrEqual(DUNGEON_CONFIG.roomHeight.max);
        expect(room.spawnPoints.length).toBeGreaterThan(0);
      }
    }
  });

  it('never overlaps two rooms', () => {
    for (const dungeon of dungeons) {
      for (let i = 0; i < dungeon.rooms.length; i += 1) {
        const a = dungeon.rooms[i];
        if (!a) continue;
        for (let j = i + 1; j < dungeon.rooms.length; j += 1) {
          const b = dungeon.rooms[j];
          if (!b) continue;
          const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
          const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
          expect(overlapX > 0 && overlapY > 0).toBe(false);
        }
      }
    }
  });

  it('labels every room tile with its own room id', () => {
    for (const dungeon of dungeons.slice(0, 100)) {
      for (const room of dungeon.rooms) {
        const ids = new Set<number>();
        for (let z = room.y; z < room.y + room.h; z += 1) {
          for (let x = room.x; x < room.x + room.w; x += 1) {
            ids.add(dungeon.roomIds[z * dungeon.width + x] ?? -1);
          }
        }
        expect([...ids]).toEqual([room.id]);
      }
    }
  });

  it('never spawns the boss before floor 3', () => {
    // The boss is not in rooms.json yet (stage 9 adds the encounter), so the
    // type must not leak into the first two floors.
    for (const dungeon of dungeons) {
      expect(dungeon.rooms.some((room) => room.type === 'boss')).toBe(false);
    }
    for (let seed = 1; seed <= 40; seed += 1) {
      const deeper = DungeonGenerator.generate({ seed, floor: 2 });
      expect(deeper.rooms.some((room) => room.type === 'boss')).toBe(false);
    }
  });

  it('keeps ceilings at room height inside rooms and at corridor height in corridors', () => {
    for (const dungeon of dungeons) {
      for (let z = 0; z < dungeon.height; z += 1) {
        for (let x = 0; x < dungeon.width; x += 1) {
          const index = z * dungeon.width + x;
          const kind = dungeon.tiles[index] ?? TileKind.Solid;
          const height = dungeon.ceiling[index] ?? 0;
          if (kind === TileKind.Solid) continue;
          if (kind === TileKind.Corridor) {
            expect(height).toBeCloseTo(DUNGEON_CONFIG.roomHeight.corridor, 5);
          } else {
            expect(height).toBeGreaterThanOrEqual(DUNGEON_CONFIG.roomHeight.min - 0.001);
            expect(height).toBeLessThanOrEqual(DUNGEON_CONFIG.roomHeight.max + 0.001);
          }
        }
      }
    }
  });
});

describe('doorways', () => {
  const dungeons: Dungeon[] = [];
  for (let seed = 1; seed <= 120; seed += 1) {
    dungeons.push(DungeonGenerator.generate({ seed, floor: 2 }));
  }

  it('opens between a room tile and a corridor tile only', () => {
    for (const dungeon of dungeons) {
      for (const door of dungeon.doors) {
        const x = Math.floor(door.x);
        const z = Math.floor(door.z);
        // The door sits on a grid line: the two neighbouring tiles straddle it.
        const tiles: number[] = [];
        if (door.along === 'x') {
          tiles.push(
            dungeon.tiles[(z - 1) * dungeon.width + x] ?? TileKind.Solid,
            dungeon.tiles[z * dungeon.width + x] ?? TileKind.Solid,
          );
        } else {
          tiles.push(
            dungeon.tiles[z * dungeon.width + (x - 1)] ?? TileKind.Solid,
            dungeon.tiles[z * dungeon.width + x] ?? TileKind.Solid,
          );
        }
        const kinds = new Set(tiles);
        expect(kinds.has(TileKind.Room)).toBe(true);
        expect(kinds.has(TileKind.Corridor)).toBe(true);
        expect(kinds.has(TileKind.Solid)).toBe(false);
      }
    }
  });

  it('keeps openings between 1 and 4 metres and inside the grid', () => {
    for (const dungeon of dungeons) {
      for (const door of dungeon.doors) {
        expect(door.width).toBeGreaterThanOrEqual(1);
        expect(door.width).toBeLessThanOrEqual(4);
        expect(Number.isInteger(door.width)).toBe(true);
        expect(door.along === 'x' || door.along === 'z').toBe(true);
        expect(door.roomId).toBeGreaterThanOrEqual(0);
        expect(dungeon.rooms.some((room) => room.id === door.roomId)).toBe(true);
        expect(door.x).toBeGreaterThanOrEqual(0);
        expect(door.z).toBeGreaterThanOrEqual(0);
        expect(door.x).toBeLessThanOrEqual(dungeon.width);
        expect(door.z).toBeLessThanOrEqual(dungeon.height);
      }
    }
  });

  it('does not duplicate doors on the same doorway', () => {
    for (const dungeon of dungeons) {
      const keys = dungeon.doors.map((door) => `${door.along}:${door.x}:${door.z}:${door.roomId}`);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe('tile helpers', () => {
  it('treats out-of-bounds coordinates as solid', () => {
    const dungeon = DungeonGenerator.generate({ seed: 11 });
    expect(tileAt(dungeon, -1, 0)).toBe(TileKind.Solid);
    expect(tileAt(dungeon, 0, -1)).toBe(TileKind.Solid);
    expect(tileAt(dungeon, dungeon.width, 0)).toBe(TileKind.Solid);
    expect(tileAt(dungeon, 0, dungeon.height)).toBe(TileKind.Solid);
    expect(roomAt(dungeon, -5, -5)).toBeNull();
  });

  it('maps a room centre tile back to the room, and corridors to null', () => {
    const dungeon = DungeonGenerator.generate({ seed: 12 });
    for (const room of dungeon.rooms) {
      const center = tileCenter(room.x + Math.floor(room.w / 2), room.y + Math.floor(room.h / 2));
      expect(roomAt(dungeon, Math.floor(center.x), Math.floor(center.z))?.id).toBe(room.id);
    }
    const corridor = Array.from(dungeon.tiles).findIndex((kind) => kind === TileKind.Corridor);
    expect(corridor).toBeGreaterThanOrEqual(0);
    expect(roomAt(dungeon, corridor % dungeon.width, Math.floor(corridor / dungeon.width))).toBeNull();
  });
});
