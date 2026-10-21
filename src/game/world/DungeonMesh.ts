import {
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
} from 'three';
import type { Texture } from 'three';
import type { QualityPreset } from '@/types/engine';
import type { Collider } from '@dimforge/rapier3d-compat';
import { TileKind } from './dungeonTypes';
import type { Dungeon, DungeonRoom } from './dungeonTypes';
import { greedyRectangles } from './gridRects';
import type { PhysicsWorld } from '@/game/physics';

/** Accumulates triangles with position/normal/uv for one merged mesh. */
class MeshData {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly uvs: number[] = [];
  private readonly indices: number[] = [];

  get triangleCount(): number {
    return this.indices.length / 3;
  }

  /**
   * Adds a quad from four corners given in counter-clockwise order as seen from
   * the front face (the side the normal points to).
   *
   * UVs are derived from world coordinates (not from the quad's local frame), so
   * the stone texture tiles continuously across neighbouring tiles and rooms
   * instead of restarting on every 1 m square.
   *
   * @param uvScale UV units per metre of world space
   */
  private pushQuad(
    corners: readonly [number, number, number][],
    normal: readonly [number, number, number],
    uvScale = 0.5,
  ): void {
    const base = this.positions.length / 3;
    const absX = Math.abs(normal[0]);
    const absY = Math.abs(normal[1]);
    const absZ = Math.abs(normal[2]);

    for (const corner of corners) {
      this.positions.push(corner[0], corner[1], corner[2]);
      this.normals.push(normal[0], normal[1], normal[2]);
      // Project onto the plane of the face: floors use (x,z), X-walls (z,y),
      // Z-walls (x,y). This keeps texel density identical on every surface.
      const u = absY >= absX && absY >= absZ ? corner[0] : absX >= absZ ? corner[2] : corner[0];
      const v = absY >= absX && absY >= absZ ? corner[2] : corner[1];
      this.uvs.push(u * uvScale, v * uvScale);
    }
    this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** Floor or ceiling quad. `up = false` builds a downward-facing ceiling. */
  horizontal(x0: number, z0: number, x1: number, z1: number, y: number, up: boolean): void {
    if (up) {
      this.pushQuad(
        [
          [x0, y, z1],
          [x1, y, z1],
          [x1, y, z0],
          [x0, y, z0],
        ],
        [0, 1, 0],
      );
    } else {
      this.pushQuad(
        [
          [x0, y, z0],
          [x1, y, z0],
          [x1, y, z1],
          [x0, y, z1],
        ],
        [0, -1, 0],
      );
    }
  }

  /**
   * Vertical quad on an axis-aligned plane.
   * @param axis 'x' → plane x = plane, quad spans z; 'z' → plane z = plane, spans x
   * @param sign direction of the visible normal
   */
  vertical(axis: 'x' | 'z', plane: number, u0: number, u1: number, y0: number, y1: number, sign: 1 | -1): void {
    if (axis === 'x') {
      const corners: [number, number, number][] =
        sign === 1
          ? [
              [plane, y0, u1],
              [plane, y0, u0],
              [plane, y1, u0],
              [plane, y1, u1],
            ]
          : [
              [plane, y0, u0],
              [plane, y0, u1],
              [plane, y1, u1],
              [plane, y1, u0],
            ];
      this.pushQuad(corners, [sign, 0, 0]);
      return;
    }
    const corners: [number, number, number][] =
      sign === 1
        ? [
            [u0, y0, plane],
            [u1, y0, plane],
            [u1, y1, plane],
            [u0, y1, plane],
          ]
        : [
            [u1, y0, plane],
            [u0, y0, plane],
            [u0, y1, plane],
            [u1, y1, plane],
          ];
    this.pushQuad(corners, [0, 0, sign]);
  }

  toGeometry(): BufferGeometry {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(this.positions), 3));
    geometry.setAttribute('normal', new BufferAttribute(new Float32Array(this.normals), 3));
    geometry.setAttribute('uv', new BufferAttribute(new Float32Array(this.uvs), 2));
    geometry.setIndex(this.indices);
    geometry.computeBoundingSphere();
    return geometry;
  }
}

export interface DungeonMaterials {
  readonly floor: MeshStandardMaterial;
  readonly wall: MeshStandardMaterial;
  readonly ceiling: MeshStandardMaterial;
}

export interface DungeonMeshResult {
  readonly group: Group;
  readonly materials: DungeonMaterials;
  readonly wallColliders: Collider[];
  readonly ceilingColliders: Collider[];
  /** Wall + ceiling + floor colliders; remove these when unloading the floor. */
  readonly colliders: readonly Collider[];
  readonly triangles: number;
  /** Merged meshes only; doors/props add their own draw calls on top. */
  readonly drawCalls: number;
  setQuality(preset: QualityPreset): void;
  dispose(): void;
}

/** Ceiling heights are quantised to this grid so collider layers stay few. */
export const CEILING_STEP = 0.5;

export function quantizeCeiling(height: number): number {
  return Math.max(CEILING_STEP, Math.round(height / CEILING_STEP) * CEILING_STEP);
}

const OPPOSITE_INDEX: Record<'x' | 'z', number> = { x: 0, z: 1 };

/**
 * Converts a dungeon grid into render geometry and physics colliders.
 *
 * Rendering: three merged meshes (floor, walls, ceiling) → 3 draw calls for the
 * whole floor regardless of its size.
 * Physics: greedy rectangle merge of the wall shell and of one ceiling layer per
 * height, so a 56×56 floor costs a few dozen static boxes instead of thousands.
 */
export function buildDungeonMesh(
  dungeon: Dungeon,
  physics: PhysicsWorld,
  materials: DungeonMaterials,
): DungeonMeshResult {
  const floorData = new MeshData();
  const wallData = new MeshData();
  const ceilingData = new MeshData();
  const { width, height, ceiling } = dungeon;

  const directions: { dx: number; dz: number }[] = [
    { dx: 1, dz: 0 },
    { dx: -1, dz: 0 },
    { dx: 0, dz: 1 },
    { dx: 0, dz: -1 },
  ];

  const wallMask = new Array<boolean>(width * height).fill(false);
  /** One boolean mask per quantised ceiling height, for exact colliders. */
  const ceilingLayers = new Map<number, boolean[]>();

  for (let z = 0; z < height; z += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = z * width + x;
      const kind = dungeon.tiles[index] ?? TileKind.Solid;
      if (kind === TileKind.Solid) continue;

      const h = ceiling[index] ?? 3;
      floorData.horizontal(x, z, x + 1, z + 1, 0, true);
      ceilingData.horizontal(x, z, x + 1, z + 1, h, false);

      const layerKey = quantizeCeiling(h);
      const layer = ceilingLayers.get(layerKey) ?? new Array<boolean>(width * height).fill(false);
      layer[index] = true;
      ceilingLayers.set(layerKey, layer);

      for (const { dx, dz } of directions) {
        const nx = x + dx;
        const nz = z + dz;
        const outside = nx < 0 || nz < 0 || nx >= width || nz >= height;
        const neighbourKind = outside ? TileKind.Solid : (dungeon.tiles[nz * width + nx] ?? TileKind.Solid);
        const axis: 'x' | 'z' = dx !== 0 ? 'x' : 'z';
        const sign: 1 | -1 = dx !== 0 ? (dx > 0 ? -1 : 1) : dz > 0 ? -1 : 1;
        const plane = dx !== 0 ? (dx > 0 ? x + 1 : x) : dz > 0 ? z + 1 : z;
        const u0 = dx !== 0 ? z : x;
        const u1 = u0 + 1;

        if (neighbourKind === TileKind.Solid) {
          wallData.vertical(axis, plane, u0, u1, 0, h, sign);
          if (!outside) wallMask[nz * width + nx] = true;
          continue;
        }

        // Walkable neighbour with a lower ceiling → expose the upper wall band
        // above it (visible from the lower side, so the normal points there).
        const neighbourHeight = ceiling[nz * width + nx] ?? 3;
        if (neighbourHeight < h - 0.05) {
          const towardNeighbour: 1 | -1 = sign === 1 ? -1 : 1;
          wallData.vertical(axis, plane, u0, u1, neighbourHeight, h, towardNeighbour);
        }
        void OPPOSITE_INDEX;
      }
    }
  }

  const group = new Group();
  group.name = 'dungeon';

  const floorMesh = new Mesh(floorData.toGeometry(), materials.floor);
  floorMesh.receiveShadow = true;
  floorMesh.name = 'dungeon-floor';
  group.add(floorMesh);

  const wallMesh = new Mesh(wallData.toGeometry(), materials.wall);
  wallMesh.castShadow = true;
  wallMesh.receiveShadow = true;
  wallMesh.name = 'dungeon-walls';
  group.add(wallMesh);

  const ceilingMesh = new Mesh(ceilingData.toGeometry(), materials.ceiling);
  ceilingMesh.name = 'dungeon-ceiling';
  group.add(ceilingMesh);

  // --- physics ---------------------------------------------------------
  const wallColliders: Collider[] = [];
  const wallTop = 6;
  for (const rect of greedyRectangles(wallMask, width, height)) {
    wallColliders.push(
      physics.addStaticBox(
        { x: rect.x + rect.w / 2, y: wallTop / 2, z: rect.z + rect.h / 2 },
        { x: rect.w / 2, y: wallTop / 2, z: rect.h / 2 },
      ),
    );
  }

  const ceilingColliders: Collider[] = [];
  for (const [layerHeight, mask] of ceilingLayers) {
    for (const rect of greedyRectangles(mask, width, height)) {
      ceilingColliders.push(
        physics.addStaticBox(
          { x: rect.x + rect.w / 2, y: layerHeight + 0.1, z: rect.z + rect.h / 2 },
          { x: rect.w / 2, y: 0.1, z: rect.h / 2 },
        ),
      );
    }
  }

  // One floor slab under the whole dungeon: cheap and prevents falling out.
  const floorCollider = physics.addStaticBox(
    { x: width / 2, y: -0.5, z: height / 2 },
    { x: width / 2, y: 0.5, z: height / 2 },
    0,
    0.9,
  );

  const triangles = floorData.triangleCount + wallData.triangleCount + ceilingData.triangleCount;

  return {
    group,
    materials,
    wallColliders,
    ceilingColliders,
    colliders: [...wallColliders, ...ceilingColliders, floorCollider],
    triangles,
    drawCalls: 3,
    setQuality(preset: QualityPreset): void {
      const shadows = preset.shadowMapSize > 0;
      wallMesh.castShadow = shadows;
      floorMesh.receiveShadow = shadows;
      wallMesh.receiveShadow = shadows;
    },
    dispose(): void {
      floorMesh.geometry.dispose();
      wallMesh.geometry.dispose();
      ceilingMesh.geometry.dispose();
    },
  };
}

/**
 * Creates the three shared dungeon materials.
 * UVs are generated in world units by the mesh builder, so one 512² stone texture
 * covers the whole floor without per-room material variants.
 */
export function createDungeonMaterials(textures: {
  readonly map: Texture;
  readonly normalMap: Texture;
  readonly roughnessMap: Texture;
}): DungeonMaterials {
  textures.map.wrapS = RepeatWrapping;
  textures.map.wrapT = RepeatWrapping;
  textures.normalMap.wrapS = RepeatWrapping;
  textures.normalMap.wrapT = RepeatWrapping;
  textures.roughnessMap.wrapS = RepeatWrapping;
  textures.roughnessMap.wrapT = RepeatWrapping;

  return {
    floor: new MeshStandardMaterial({
      map: textures.map,
      normalMap: textures.normalMap,
      roughnessMap: textures.roughnessMap,
      roughness: 1,
      metalness: 0.04,
      color: 0x9fa6b0,
    }),
    wall: new MeshStandardMaterial({
      map: textures.map,
      normalMap: textures.normalMap,
      roughnessMap: textures.roughnessMap,
      roughness: 0.96,
      metalness: 0.04,
      color: 0x7f8894,
    }),
    ceiling: new MeshStandardMaterial({
      map: textures.map,
      normalMap: textures.normalMap,
      roughness: 1,
      metalness: 0,
      color: 0x4a515c,
    }),
  };
}

/** Pillar placeholder shared by every room (replaced by a GLB in stage 5). */
export function createPillarMesh(material: MeshStandardMaterial): Mesh {
  const geometry = new CylinderGeometry(0.28, 0.34, 3.6, 6);
  const mesh = new Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Distance from a point to a room rectangle (0 when inside). */
export function distanceToRoom(room: DungeonRoom, point: { x: number; z: number }): number {
  const dx = Math.max(room.x - point.x, 0, point.x - (room.x + room.w));
  const dz = Math.max(room.y - point.z, 0, point.z - (room.y + room.h));
  return Math.hypot(dx, dz);
}
