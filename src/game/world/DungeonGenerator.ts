import type { RoomLightSpec, RoomTypeDefinition, RoomTypeId } from './dungeonTypes';
import type { DungeonOptions } from './dungeonTypes';
import roomData from '@/data/rooms.json';
import {
  carveRoom,
  collectLeaves,
  createRng,
  minimumSpanningEdges,
  pick,
  rectCenter,
  selectRooms,
  splitBsp,
} from './bsp';
import type { Rect, Room, Rng } from './bsp';
import { TileKind } from './dungeonTypes';
import type { Dungeon, DungeonDoor, DungeonRoom } from './dungeonTypes';

const ROOM_PADDING = 2;
const MIN_ROOM = 5;
const MAX_ROOM = 11;
const PILLAR_CHANCE = 0.35;
const SPAWN_MARGIN = 1.5;

export interface DungeonConfig {
  readonly roomTypes: readonly RoomTypeDefinition[];
  readonly corridorLight: RoomLightSpec;
  readonly roomHeight: { readonly min: number; readonly max: number; readonly corridor: number };
  readonly corridorWidth: number;
}

/**
 * Room table loaded from JSON (single source of content truth).
 * The cast only narrows the JSON's inferred `string` ids to `RoomTypeId`;
 * tests assert that every id in the file is a known type.
 */
export const DUNGEON_CONFIG = roomData as unknown as DungeonConfig;

/** Cold rune light marking the stairs down (also the stage-9 exit gate). */
const EXIT_LIGHT: RoomLightSpec = { color: '#4a7c8c', intensity: 5, distance: 9, flicker: false };

/**
 * Procedural dungeon: BSP space partition → rooms → MST corridors → doors.
 *
 * Fully deterministic for a given seed and floor, which is what save/restore
 * relies on: a run only stores its seed, not the geometry.
 */
export class DungeonGenerator {
  /**
   * @param options seed/floor/size/room-count overrides
   * @returns a validated dungeon (all rooms reachable from the entrance)
   */
  static generate(options: DungeonOptions = {}): Dungeon {
    const seed = options.seed ?? 1337;
    const floor = options.floor ?? 1;
    const width = options.width ?? 56;
    const height = options.height ?? 56;
    const targetRooms = options.roomCount ?? 7;

    // A few deterministic attempts: BSP can occasionally produce too few rooms.
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const rng = createRng(seed + floor * 7919 + attempt * 104729);
      const dungeon = attemptGeneration(rng, {
        seed,
        floor,
        width,
        height,
        roomCount: targetRooms,
      });
      if (dungeon) return dungeon;
    }
    // Guaranteed fallback: a simple 3×3 room layout, never seen in practice.
    return buildFallbackDungeon(width, height, floor, seed);
  }
}

interface AttemptOptions {
  readonly seed: number;
  readonly floor: number;
  readonly width: number;
  readonly height: number;
  readonly roomCount: number;
}

function attemptGeneration(rng: Rng, options: AttemptOptions): Dungeon | null {
  const { width, height, roomCount, floor } = options;
  const grid: Rect = { x: 2, y: 2, w: width - 4, h: height - 4 };

  const tree = splitBsp(grid, { minLeaf: 13, maxDepth: 5, irregularity: 0.2 }, rng);
  const leaves = collectLeaves(tree);
  if (leaves.length < roomCount) return null;

  const candidates: Room[] = [];
  for (const leaf of leaves) {
    const room = carveRoom(
      leaf,
      rng,
      {
        padding: ROOM_PADDING,
        minSize: MIN_ROOM,
        maxSize: MAX_ROOM,
        minCeiling: DUNGEON_CONFIG.roomHeight.min,
        maxCeiling: DUNGEON_CONFIG.roomHeight.max,
      },
      candidates.length,
    );
    if (room) candidates.push(room);
  }
  if (candidates.length < roomCount) return null;

  const selected = selectRooms(candidates, roomCount, { x: grid.x + grid.w / 2, y: grid.y + grid.h / 2 });
  // Re-index after selection so ids match the rooms array.
  const rooms: Room[] = selected.map((room, index) => ({ ...room, id: index }));

  const tiles = new Uint8Array(width * height);
  const roomIds = new Int16Array(width * height).fill(-1);
  const ceiling = new Float32Array(width * height);
  const corridorCeiling = DUNGEON_CONFIG.roomHeight.corridor;

  for (const room of rooms) {
    for (let z = room.y; z < room.y + room.h; z += 1) {
      for (let x = room.x; x < room.x + room.w; x += 1) {
        if (x < 0 || z < 0 || x >= width || z >= height) continue;
        const index = z * width + x;
        tiles[index] = TileKind.Room;
        roomIds[index] = room.id;
        ceiling[index] = room.ceiling;
      }
    }
  }

  const edges = minimumSpanningEdges(rooms, 1, rng);
  for (const edge of edges) {
    const a = rooms[edge.a];
    const b = rooms[edge.b];
    if (!a || !b) continue;
    carveCorridor(tiles, roomIds, ceiling, width, height, a, b, rng, corridorCeiling);
  }

  // Connectivity gate: every room tile must be reachable from the entrance.
  const entranceRoom = rooms.reduce((best, room) => {
    const distance = Math.hypot(roomCenter(room).x - width / 2, roomCenter(room).z - height / 2);
    return distance < best.distance ? { room, distance } : best;
  }, { room: rooms[0] as Room, distance: Number.POSITIVE_INFINITY }).room;
  if (!entranceRoom) return null;
  if (!isFullyConnected(tiles, width, height, roomCenter(entranceRoom))) return null;

  const dungeonRooms = assignRoomTypes(rooms, entranceRoom, rng, floor);
  const doors = findDoors(tiles, roomIds, width, height, dungeonRooms);

  const entrance = roomCenter(entranceRoom);
  const exitRoom = findExitRoom(dungeonRooms, entrance);
  // The farthest room becomes the stairwell: typed `exit` so lighting and the
  // stage-9 encounter table can find it without a second distance pass.
  const finalRooms = dungeonRooms.map((room) =>
    room.id === exitRoom.id
      ? { ...room, type: 'exit' as const, light: EXIT_LIGHT }
      : room,
  );

  return {
    seed: options.seed,
    floor,
    width,
    height,
    tiles,
    roomIds,
    ceiling,
    rooms: finalRooms,
    doors,
    entrance: { x: entrance.x, z: entrance.z },
    exit: { x: exitRoom.center.x, z: exitRoom.center.z },
  };
}

function roomCenter(room: Rect): { x: number; z: number } {
  const center = rectCenter(room);
  return { x: center.x, z: center.y };
}

/**
 * Carves an L-shaped corridor (2 tiles wide) between two rooms.
 * Both segments stay inside the grid; each end penetrates the room by one tile
 * so the doorway detection finds a solid room/corridor boundary.
 */
function carveCorridor(
  tiles: Uint8Array,
  roomIds: Int16Array,
  ceilingData: Float32Array,
  width: number,
  height: number,
  a: Room,
  b: Room,
  rng: Rng,
  corridorCeiling: number,
): void {
  const ca = roomCenter(a);
  const cb = roomCenter(b);
  const corridorWidth = DUNGEON_CONFIG.corridorWidth;

  const horizontalFirst = rng() < 0.5;
  const carveH = (z: number, x0: number, x1: number): void => {
    const start = Math.min(x0, x1);
    const end = Math.max(x0, x1);
    for (let x = start; x <= end; x += 1) {
      for (let w = 0; w < corridorWidth; w += 1) {
        carveTile(tiles, roomIds, ceilingData, width, height, x, z + w, corridorCeiling);
      }
    }
  };
  const carveV = (x: number, z0: number, z1: number): void => {
    const start = Math.min(z0, z1);
    const end = Math.max(z0, z1);
    for (let z = start; z <= end; z += 1) {
      for (let w = 0; w < corridorWidth; w += 1) {
        carveTile(tiles, roomIds, ceilingData, width, height, x + w, z, corridorCeiling);
      }
    }
  };

  // Integer corridor coordinates kept inside the grid with a 2-tile margin.
  const x0 = clampTile(Math.round(ca.x), width);
  const z0 = clampTile(Math.round(ca.z), height);
  const x1 = clampTile(Math.round(cb.x), width);
  const z1 = clampTile(Math.round(cb.z), height);

  if (horizontalFirst) {
    carveH(z0, x0, x1);
    carveV(x1, z0, z1);
  } else {
    carveV(x0, z0, z1);
    carveH(z1, x0, x1);
  }
}

function clampTile(value: number, size: number): number {
  return Math.max(1, Math.min(size - DUNGEON_CONFIG.corridorWidth - 1, value));
}

function carveTile(
  tiles: Uint8Array,
  roomIds: Int16Array,
  ceilingData: Float32Array,
  width: number,
  height: number,
  x: number,
  z: number,
  corridorCeiling: number,
): void {
  if (x <= 0 || z <= 0 || x >= width - 1 || z >= height - 1) return;
  const index = z * width + x;
  if (tiles[index] !== TileKind.Solid) return; // rooms win over corridors
  tiles[index] = TileKind.Corridor;
  roomIds[index] = -1;
  ceilingData[index] = corridorCeiling;
}

/** Flood fill from the entrance; returns true when all room tiles are reachable. */
export function isFullyConnected(
  tiles: Uint8Array,
  width: number,
  height: number,
  start: { x: number; z: number },
): boolean {
  const visited = new Uint8Array(tiles.length);
  const startX = Math.floor(start.x);
  const startZ = Math.floor(start.z);
  const startIndex = startZ * width + startX;
  if (tiles[startIndex] === TileKind.Solid) return false;

  const queue: number[] = [startIndex];
  visited[startIndex] = 1;
  let roomTiles = 0;
  let reachedRoomTiles = 0;
  for (let i = 0; i < tiles.length; i += 1) if (tiles[i] === TileKind.Room) roomTiles += 1;

  while (queue.length > 0) {
    const index = queue.pop();
    if (index === undefined) break;
    if (tiles[index] === TileKind.Room) reachedRoomTiles += 1;
    const x = index % width;
    const z = Math.floor(index / width);
    const neighbours: [number, number][] = [
      [x + 1, z],
      [x - 1, z],
      [x, z + 1],
      [x, z - 1],
    ];
    for (const [nx, nz] of neighbours) {
      if (nx < 0 || nz < 0 || nx >= width || nz >= height) continue;
      const nextIndex = nz * width + nx;
      if (visited[nextIndex] === 1) continue;
      if (tiles[nextIndex] === TileKind.Solid) continue;
      visited[nextIndex] = 1;
      queue.push(nextIndex);
    }
  }
  return reachedRoomTiles === roomTiles && roomTiles > 0;
}

/** Assigns room types from the weighted JSON table, with floor-aware rules. */
function assignRoomTypes(rooms: readonly Room[], entranceRoom: Room, rng: Rng, floor: number): DungeonRoom[] {
  const weighted: RoomTypeDefinition[] = [];
  for (const definition of DUNGEON_CONFIG.roomTypes) {
    // Boss only on the third floor; altars become more common deeper down.
    if (definition.id === 'boss' && floor !== 3) continue;
    const repeat = Math.max(1, Math.round(definition.weight));
    for (let i = 0; i < repeat; i += 1) weighted.push(definition);
  }

  return rooms.map((room) => {
    const center = roomCenter(room);
    let type: RoomTypeId;
    let light: RoomLightSpec;
    if (room.id === entranceRoom.id) {
      type = 'entrance';
      light = { color: '#ffa54a', intensity: 5, distance: 9, flicker: true };
    } else {
      const definition = pick(rng, weighted);
      type = definition.id;
      light = definition.light;
    }
    return {
      ...room,
      type,
      light,
      center,
      spawnPoints: roomSpawnPoints(room),
    };
  });
}

/** Grid of interior points used by the spawner in stage 9. */
function roomSpawnPoints(room: Rect): { x: number; z: number }[] {
  const margin = SPAWN_MARGIN;
  const points: { x: number; z: number }[] = [];
  const cols = Math.max(1, Math.floor((room.w - margin * 2) / 2));
  const rows = Math.max(1, Math.floor((room.h - margin * 2) / 2));
  for (let i = 0; i < cols; i += 1) {
    for (let j = 0; j < rows; j += 1) {
      const x = room.x + margin + (i + 0.5) * ((room.w - margin * 2) / cols);
      const z = room.y + margin + (j + 0.5) * ((room.h - margin * 2) / rows);
      points.push({ x, z });
    }
  }
  return points;
}

/**
 * Finds doorway openings: boundaries between a room tile and a corridor tile.
 * Adjacent candidate tiles are merged into one opening (corridors are 2 m wide),
 * which yields exactly one door per corridor entrance.
 */
export function findDoors(
  tiles: Uint8Array,
  roomIds: Int16Array,
  width: number,
  height: number,
  rooms: readonly (Rect & { id: number })[],
): DungeonDoor[] {
  interface Candidate {
    readonly along: 'x' | 'z';
    readonly line: number;
    readonly start: number;
    readonly roomId: number;
  }
  const candidates: Candidate[] = [];

  for (let z = 0; z < height; z += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = z * width + x;
      if (tiles[index] !== TileKind.Room) continue;
      const roomId = roomIds[index] ?? -1;
      if (roomId < 0) continue;

      // Corridor to the east/west → opening along Z at a vertical wall.
      if (x + 1 < width && tiles[index + 1] === TileKind.Corridor) {
        candidates.push({ along: 'z', line: x + 1, start: z, roomId });
      }
      if (x - 1 >= 0 && tiles[index - 1] === TileKind.Corridor) {
        candidates.push({ along: 'z', line: x, start: z, roomId });
      }
      if (z + 1 < height && tiles[index + width] === TileKind.Corridor) {
        candidates.push({ along: 'x', line: z + 1, start: x, roomId });
      }
      if (z - 1 >= 0 && tiles[index - width] === TileKind.Corridor) {
        candidates.push({ along: 'x', line: z, start: x, roomId });
      }
    }
  }

  const groups = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const key = `${candidate.roomId}:${candidate.along}:${candidate.line}`;
    const list = groups.get(key) ?? [];
    list.push(candidate);
    groups.set(key, list);
  }

  const doors: DungeonDoor[] = [];
  for (const list of groups.values()) {
    list.sort((a, b) => a.start - b.start);
    let runStart = 0;
    for (let i = 1; i <= list.length; i += 1) {
      const current = list[i];
      const previous = list[i - 1];
      const continuous = current !== undefined && previous !== undefined && current.start === previous.start + 1;
      if (continuous) continue;
      const run = list.slice(runStart, i);
      const first = run[0];
      const last = run[run.length - 1];
      if (!first || !last) continue;
      const widthMeters = last.start - first.start + 1;
      const centerAlong = (first.start + last.start + 1) / 2;
      const roomId = first.roomId;
      const room = rooms.find((item) => item.id === roomId);
      // Skip openings wider than 4 m: those are room-to-room merges, not doors.
      if (widthMeters <= 4 && room) {
        doors.push(
          first.along === 'x'
            ? { x: centerAlong, z: first.line, along: 'x', width: widthMeters, roomId }
            : { x: first.line, z: centerAlong, along: 'z', width: widthMeters, roomId },
        );
      }
      runStart = i;
    }
  }
  return doors;
}

function findExitRoom(rooms: readonly DungeonRoom[], entrance: { x: number; z: number }): DungeonRoom {
  let best = rooms[0] as DungeonRoom;
  let bestDistance = -1;
  for (const room of rooms) {
    if (room.type === 'entrance') continue;
    const distance = Math.hypot(room.center.x - entrance.x, room.center.z - entrance.z);
    if (distance > bestDistance) {
      bestDistance = distance;
      best = room;
    }
  }
  return best;
}

/** Fallback for degenerate BSP results: three rooms in a row plus connectors. */
function buildFallbackDungeon(width: number, height: number, floor: number, seed: number): Dungeon {
  const rng = createRng(seed + 1);
  const tiles = new Uint8Array(width * height);
  const roomIds = new Int16Array(width * height).fill(-1);
  const ceilingData = new Float32Array(width * height);
  const rooms: DungeonRoom[] = [];
  const count = 3;
  for (let i = 0; i < count; i += 1) {
    const room: Room = {
      x: 8 + i * 14,
      y: 18,
      w: 9,
      h: 9,
      id: i,
      ceiling: 4,
    };
    for (let z = room.y; z < room.y + room.h; z += 1) {
      for (let x = room.x; x < room.x + room.w; x += 1) {
        const index = z * width + x;
        tiles[index] = TileKind.Room;
        roomIds[index] = i;
        ceilingData[index] = room.ceiling;
      }
    }
    rooms.push({
      ...room,
      type: i === 0 ? 'entrance' : i === count - 1 ? 'exit' : 'combat',
      light: { color: '#ffa54a', intensity: 5, distance: 9, flicker: true },
      center: roomCenter(room),
      spawnPoints: [{ x: room.x + 2, z: room.y + 2 }],
    });
    if (i > 0) {
      const previous = rooms[i - 1];
      if (!previous) continue;
      for (let x = previous.x + previous.w; x < room.x; x += 1) {
        for (let offset = 0; offset < 2; offset += 1) {
          const index = (room.y + 4 + offset) * width + x;
          tiles[index] = TileKind.Corridor;
          ceilingData[index] = 2.8;
        }
      }
    }
  }
  void rng;
  const doors = findDoors(tiles, roomIds, width, height, rooms);
  return {
    seed,
    floor,
    width,
    height,
    tiles,
    roomIds,
    ceiling: ceilingData,
    rooms,
    doors,
    entrance: { x: rooms[0]?.center.x ?? 10, z: rooms[0]?.center.z ?? 10 },
    exit: { x: rooms[2]?.center.x ?? 40, z: rooms[2]?.center.z ?? 10 },
  };
}

/** Random pillar positions inside rooms, kept away from doors and spawn. */
export function placePillars(room: DungeonRoom, rng: Rng, count: number): { x: number; z: number }[] {
  const points: { x: number; z: number }[] = [];
  let attempts = 0;
  while (points.length < count && attempts < count * 8) {
    attempts += 1;
    if (rng() > PILLAR_CHANCE + 0.5) continue;
    const x = room.x + 1.5 + rng() * (room.w - 3);
    const z = room.y + 1.5 + rng() * (room.h - 3);
    const tooClose = points.some((point) => Math.hypot(point.x - x, point.z - z) < 2.2);
    const nearCenter = Math.hypot(x - room.center.x, z - room.center.z) < 1.6;
    if (!tooClose && !nearCenter) points.push({ x, z });
  }
  return points;
}

