import type { Rect } from './bsp';

/** Tile kinds stored in the dungeon grid. */
export const TileKind = {
  Solid: 0,
  Room: 1,
  Corridor: 2,
} as const;

export type TileKindValue = (typeof TileKind)[keyof typeof TileKind];

export type RoomTypeId = 'entrance' | 'combat' | 'treasure' | 'campfire' | 'altar' | 'exit' | 'boss';

export interface RoomLightSpec {
  readonly color: string;
  readonly intensity: number;
  readonly distance: number;
  /** Candle-like flicker for campfires and torches. */
  readonly flicker: boolean;
}

export interface DungeonRoom extends Rect {
  readonly id: number;
  readonly ceiling: number;
  readonly type: RoomTypeId;
  readonly light: RoomLightSpec;
  /** Room centre in world metres (tile units are metres). */
  readonly center: { x: number; z: number };
  /** Monster spawn candidates in world metres, resolved at spawn time. */
  readonly spawnPoints: readonly { x: number; z: number }[];
}

export interface DungeonDoor {
  /** Door centre in world metres. */
  readonly x: number;
  readonly z: number;
  /** Axis the doorway extends along; the wall plane is perpendicular to it. */
  readonly along: 'x' | 'z';
  /** Opening width in metres (1 or 2). */
  readonly width: number;
  /** Room this door leads into. */
  readonly roomId: number;
}

export interface Dungeon {
  readonly seed: number;
  readonly floor: number;
  readonly width: number;
  readonly height: number;
  readonly tiles: Uint8Array;
  readonly roomIds: Int16Array;
  readonly ceiling: Float32Array;
  readonly rooms: readonly DungeonRoom[];
  readonly doors: readonly DungeonDoor[];
  /** Player spawn, world metres (feet position). */
  readonly entrance: { x: number; z: number };
  /** Stairs/exit marker, world metres. */
  readonly exit: { x: number; z: number };
}

export interface DungeonOptions {
  readonly seed?: number;
  /** 1-based floor index; affects room mix and boss presence. */
  readonly floor?: number;
  readonly width?: number;
  readonly height?: number;
  /** Requested room count (spec: 6–8 per floor). */
  readonly roomCount?: number;
}

export interface RoomTypeDefinition {
  readonly id: RoomTypeId;
  readonly weight: number;
  readonly label: string;
  readonly light: RoomLightSpec;
  readonly props: readonly string[];
}

/** Dungeon tile lookup helpers (pure, safe on out-of-bounds coordinates). */
export function tileAt(dungeon: Dungeon, x: number, z: number): TileKindValue {
  if (x < 0 || z < 0 || x >= dungeon.width || z >= dungeon.height) return TileKind.Solid;
  return (dungeon.tiles[z * dungeon.width + x] ?? TileKind.Solid) as TileKindValue;
}

export function isWalkable(dungeon: Dungeon, x: number, z: number): boolean {
  return tileAt(dungeon, x, z) !== TileKind.Solid;
}

export function roomAt(dungeon: Dungeon, x: number, z: number): DungeonRoom | null {
  if (x < 0 || z < 0 || x >= dungeon.width || z >= dungeon.height) return null;
  const id = dungeon.roomIds[z * dungeon.width + x] ?? -1;
  if (id < 0) return null;
  return dungeon.rooms.find((room) => room.id === id) ?? null;
}

/** Converts a tile coordinate into the world-space centre of that tile. */
export function tileCenter(x: number, z: number): { x: number; z: number } {
  return { x: x + 0.5, z: z + 0.5 };
}
