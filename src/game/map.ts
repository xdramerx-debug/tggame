import { ARENA } from './types';

/**
 * Карта «Рубеж-9» — оригинальная арена в эстетике пыльной пустыни.
 * Чистые данные: их использует и 3D-мир, и миникарта, и коллизии.
 * Ось X — восток, ось Z — юг. Игрок стартует в южном лагере.
 */

export type MatKey = 'adobe' | 'crate' | 'metal' | 'sandbag' | 'stone';

export interface BoxObstacle {
  kind: 'box';
  x: number;
  z: number;
  /** half-extents */
  hw: number;
  hd: number;
  h: number;
  /** visual material key */
  mat: MatKey;
}

export interface CylObstacle {
  kind: 'cyl';
  x: number;
  z: number;
  r: number;
  h: number;
  mat: MatKey;
}

export type Obstacle = BoxObstacle | CylObstacle;

export interface GatePoint {
  x: number;
  z: number;
}

const H = ARENA.half;
const WH = ARENA.wallHeight;

/** Perimeter walls with three gate gaps (north, east, west). */
export const GATE_W = 7;

function perimeter(): BoxObstacle[] {
  const t = 1.5;
  const gw = GATE_W / 2;
  const half = (H - gw) / 2; // half-length of each wall piece
  const center = gw + half; // distance from origin to piece center
  const seg = (x: number, z: number, hw: number, hd: number): BoxObstacle =>
    ({ kind: 'box', x, z, hw, hd, h: WH + 1, mat: 'adobe' });
  return [
    seg(-center, -H, half, t / 2), // north wall, west of the gate
    seg(center, -H, half, t / 2), // north wall, east of the gate
    seg(0, H, H, t / 2), // south wall, solid (base camp side)
    seg(H, -center, t / 2, half), // east wall, north of the gate
    seg(H, center, t / 2, half), // east wall, south of the gate
    seg(-H, -center, t / 2, half), // west wall, north of the gate
    seg(-H, center, t / 2, half), // west wall, south of the gate
  ];
}

/** All static geometry: walls, corridors, buildings, mid platform, tower. */
export const MAP_BOXES: BoxObstacle[] = [
  ...perimeter(),

  // central raised platform (step-up friendly) with crate stacks on top
  { kind: 'box', x: 0, z: 0, hw: 5.5, hd: 5.5, h: 1.2, mat: 'stone' },
  { kind: 'box', x: -2, z: -1.5, hw: 0.7, hd: 0.7, h: 2.1, mat: 'crate' },
  { kind: 'box', x: 2.4, z: 1.8, hw: 0.7, hd: 0.7, h: 2.1, mat: 'crate' },

  // side corridors: long walls at x = ±18 with a mid opening
  { kind: 'box', x: -18, z: -17, hw: 0.8, hd: 12, h: 4.2, mat: 'adobe' },
  { kind: 'box', x: -18, z: 17, hw: 0.8, hd: 12, h: 4.2, mat: 'adobe' },
  { kind: 'box', x: 18, z: -17, hw: 0.8, hd: 12, h: 4.2, mat: 'adobe' },
  { kind: 'box', x: 18, z: 17, hw: 0.8, hd: 12, h: 4.2, mat: 'adobe' },

  // mid connectors — arch walls between corridors and center (z = ±14)
  { kind: 'box', x: -8, z: -14, hw: 3, hd: 0.7, h: 4.6, mat: 'adobe' },
  { kind: 'box', x: 8, z: -14, hw: 3, hd: 0.7, h: 4.6, mat: 'adobe' },
  { kind: 'box', x: -8, z: 14, hw: 3, hd: 0.7, h: 4.6, mat: 'adobe' },
  { kind: 'box', x: 8, z: 14, hw: 3, hd: 0.7, h: 4.6, mat: 'adobe' },

  // NW compound (hollow, door facing south-east)
  { kind: 'box', x: -28, z: -32.5, hw: 6, hd: 0.7, h: 4, mat: 'adobe' },
  { kind: 'box', x: -33.3, z: -28, hw: 0.7, hd: 4.5, h: 4, mat: 'adobe' },
  { kind: 'box', x: -22.7, z: -29.5, hw: 0.7, hd: 3, h: 4, mat: 'adobe' },
  { kind: 'box', x: -29.5, z: -23.5, hw: 4.5, hd: 0.7, h: 4, mat: 'adobe' },

  // SE compound (hollow, door facing north-west)
  { kind: 'box', x: 28, z: 32.5, hw: 6, hd: 0.7, h: 4, mat: 'adobe' },
  { kind: 'box', x: 33.3, z: 28, hw: 0.7, hd: 4.5, h: 4, mat: 'adobe' },
  { kind: 'box', x: 22.7, z: 29.5, hw: 0.7, hd: 3, h: 4, mat: 'adobe' },
  { kind: 'box', x: 29.5, z: 23.5, hw: 4.5, hd: 0.7, h: 4, mat: 'adobe' },

  // scattered cover: crates, sandbags, low walls
  { kind: 'box', x: -10, z: -24, hw: 0.8, hd: 0.8, h: 1.7, mat: 'crate' },
  { kind: 'box', x: -11.6, z: -23.2, hw: 0.8, hd: 0.8, h: 1.7, mat: 'crate' },
  { kind: 'box', x: 11, z: -25, hw: 0.8, hd: 0.8, h: 1.7, mat: 'crate' },
  { kind: 'box', x: 12.4, z: 24, hw: 0.8, hd: 0.8, h: 1.7, mat: 'crate' },
  { kind: 'box', x: -13, z: 25, hw: 0.8, hd: 0.8, h: 1.7, mat: 'crate' },
  { kind: 'box', x: -6, z: -33, hw: 2.4, hd: 0.7, h: 1.1, mat: 'sandbag' },
  { kind: 'box', x: 7, z: 33, hw: 2.4, hd: 0.7, h: 1.1, mat: 'sandbag' },
  { kind: 'box', x: -30, z: 8, hw: 0.7, hd: 3.5, h: 2.6, mat: 'adobe' },
  { kind: 'box', x: 30, z: -8, hw: 0.7, hd: 3.5, h: 2.6, mat: 'adobe' },
  { kind: 'box', x: -24, z: 30, hw: 3.5, hd: 0.7, h: 2.2, mat: 'stone' },
  { kind: 'box', x: 24, z: -30, hw: 3.5, hd: 0.7, h: 2.2, mat: 'stone' },

  // base camp structures (south): workbench table + radio mast footing
  { kind: 'box', x: -3.5, z: 33, hw: 1.4, hd: 0.8, h: 1.0, mat: 'crate' },
  { kind: 'box', x: 3.8, z: 33.4, hw: 0.5, hd: 0.5, h: 3.4, mat: 'metal' },
];

export const MAP_CYLS: CylObstacle[] = [
  // watchtower legs + mast (NE corner)
  { kind: 'cyl', x: 31, z: -31, r: 0.5, h: 6.5, mat: 'metal' },
  { kind: 'cyl', x: 34, z: -31, r: 0.5, h: 6.5, mat: 'metal' },
  { kind: 'cyl', x: 31, z: -34, r: 0.5, h: 6.5, mat: 'metal' },
  { kind: 'cyl', x: 34, z: -34, r: 0.5, h: 6.5, mat: 'metal' },
  // broken pillars
  { kind: 'cyl', x: -14, z: -6, r: 0.6, h: 3.2, mat: 'stone' },
  { kind: 'cyl', x: 14, z: 6, r: 0.6, h: 3.2, mat: 'stone' },
  { kind: 'cyl', x: 6, z: -20, r: 0.6, h: 2.6, mat: 'stone' },
  { kind: 'cyl', x: -6, z: 20, r: 0.6, h: 2.6, mat: 'stone' },
  // barrels
  { kind: 'cyl', x: -20.5, z: -2, r: 0.55, h: 1.1, mat: 'metal' },
  { kind: 'cyl', x: 20.5, z: 2, r: 0.55, h: 1.1, mat: 'metal' },
  { kind: 'cyl', x: 26, z: -18, r: 0.55, h: 1.1, mat: 'metal' },
  { kind: 'cyl', x: -26, z: 18, r: 0.55, h: 1.1, mat: 'metal' },
];

export const OBSTACLES: Obstacle[] = [...MAP_BOXES, ...MAP_CYLS];

/** Enemy spawn gates (north, east, west) + jitter applied by the engine. */
export const SPAWN_GATES: GatePoint[] = [
  { x: 0, z: -(H - 2.5) },
  { x: H - 2.5, z: -8 },
  { x: H - 2.5, z: 8 },
  { x: -(H - 2.5), z: -8 },
  { x: -(H - 2.5), z: 8 },
  { x: -12, z: -(H - 2.5) },
  { x: 12, z: -(H - 2.5) },
];

/** Pre-baked loot crate spots (engine picks a subset each intermission). */
export const CRATE_SPOTS: GatePoint[] = [
  { x: -28, z: -28 }, { x: 28, z: 28 }, { x: -33, z: 20 }, { x: 33, z: -20 },
  { x: 0, z: -26 }, { x: -22, z: 0 }, { x: 22, z: 0 }, { x: 0, z: 26 },
  { x: -12, z: 12 }, { x: 12, z: -12 }, { x: 31, z: -31.5 }, { x: -31, z: 31 },
  { x: 26, z: 12 }, { x: -26, z: -12 }, { x: 8, z: -33 }, { x: -8, z: 33 },
];

/** Player base camp (south) — spawn point and "safe" visual anchor. */
export const BASE_POS: GatePoint = { x: 0, z: 34 };
