import {
  BoxGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import type { BufferGeometry as BufferGeometryType } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PropAsset } from './types';

/**
 * Static dungeon furniture.
 *
 * Every prop is merged per material so it costs one draw call when instanced
 * (`InstancedMesh` in the scene) no matter how many boxes the shape is made of.
 * Origins sit on the floor at y = 0, so placement code can drop them straight onto
 * a room centre.
 */

type Material = MeshStandardMaterial;

interface Part {
  readonly geometry: BufferGeometryType;
  readonly material: string;
}

function materials(): Record<string, Material> {
  return {
    wood: new MeshStandardMaterial({ color: 0x5a4128, roughness: 0.9, metalness: 0.03 }),
    iron: new MeshStandardMaterial({ color: 0x3b4048, roughness: 0.5, metalness: 0.85 }),
    gold: new MeshStandardMaterial({ color: 0xc9a227, roughness: 0.32, metalness: 0.9 }),
    stone: new MeshStandardMaterial({ color: 0x6b7280, roughness: 0.95, metalness: 0.02 }),
    ember: new MeshStandardMaterial({
      color: 0xff9a4a,
      emissive: 0xff7a2a,
      emissiveIntensity: 2.6,
      roughness: 0.5,
    }),
    rune: new MeshStandardMaterial({
      color: 0x4a7c8c,
      emissive: 0x4a7c8c,
      emissiveIntensity: 2.4,
      roughness: 0.35,
      metalness: 0.3,
    }),
  };
}

function box(
  size: readonly [number, number, number],
  position: readonly [number, number, number],
  material: string,
  rotation?: readonly [number, number, number],
): Part {
  const geometry = new BoxGeometry(size[0], size[1], size[2]);
  if (rotation) {
    geometry.rotateX(rotation[0]);
    geometry.rotateY(rotation[1]);
    geometry.rotateZ(rotation[2]);
  }
  geometry.translate(position[0], position[1], position[2]);
  return { geometry, material };
}

function cylinder(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  position: readonly [number, number, number],
  material: string,
  segments = 10,
  rotation?: readonly [number, number, number],
): Part {
  const geometry = new CylinderGeometry(radiusTop, radiusBottom, height, segments);
  if (rotation) {
    geometry.rotateX(rotation[0]);
    geometry.rotateY(rotation[1]);
    geometry.rotateZ(rotation[2]);
  }
  geometry.translate(position[0], position[1], position[2]);
  return { geometry, material };
}

/** Merges parts per material into one mesh each. */
function assemble(name: string, parts: readonly Part[]): PropAsset {
  const palette = materials();
  const group = new Group();
  group.name = name;
  const byMaterial = new Map<string, BufferGeometryType[]>();
  for (const part of parts) {
    const list = byMaterial.get(part.material) ?? [];
    // Mixing indexed and non-indexed geometry breaks the merge, so normalise here.
    const normalised = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry;
    if (normalised !== part.geometry) part.geometry.dispose();
    list.push(normalised);
    byMaterial.set(part.material, list);
  }

  let triangles = 0;
  for (const [materialName, geometries] of byMaterial) {
    const merged = mergeGeometries(geometries, false);
    if (!merged) throw new Error(`${name}: failed to merge "${materialName}" geometry`);
    for (const geometry of geometries) geometry.dispose();
    const material = palette[materialName];
    if (!material) throw new Error(`${name}: unknown material "${materialName}"`);
    const mesh = new Mesh(merged, material);
    mesh.name = `${name}_${materialName}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    triangles += (merged.getIndex()?.count ?? merged.getAttribute('position').count) / 3;
  }
  return { group, metrics: { triangles } };
}

/** Iron-bound treasure chest, lid slightly ajar so the gold reads. */
export function buildChest(): PropAsset {
  return assemble('chest', [
    box([0.78, 0.42, 0.52], [0, 0.21, 0], 'wood'),
    box([0.8, 0.06, 0.54], [0, 0.1, 0], 'iron'),
    box([0.8, 0.05, 0.54], [0, 0.36, 0], 'iron'),
    box([0.08, 0.08, 0.56], [-0.28, 0.41, 0], 'iron'),
    box([0.08, 0.08, 0.56], [0.28, 0.41, 0], 'iron'),
    box([0.78, 0.16, 0.52], [0, 0.5, -0.04], 'wood', [-0.26, 0, 0]),
    box([0.14, 0.12, 0.06], [0, 0.36, 0.28], 'gold'),
    box([0.1, 0.02, 0.02], [0, 0.38, 0.31], 'gold'),
  ]);
}

/** Sacrificial altar: stepped stone base, rune ring, floating shard. */
export function buildAltar(): PropAsset {
  const shard = new IcosahedronGeometry(0.16, 0);
  shard.scale(0.8, 1.6, 0.8);
  shard.translate(0, 1.12, 0);
  const ring = new TorusGeometry(0.34, 0.025, 6, 20);
  ring.rotateX(Math.PI / 2);
  ring.translate(0, 0.94, 0);
  return assemble('altar', [
    box([0.9, 0.2, 0.9], [0, 0.1, 0], 'stone'),
    box([0.7, 0.5, 0.7], [0, 0.45, 0], 'stone'),
    box([0.86, 0.1, 0.86], [0, 0.75, 0], 'stone'),
    { geometry: ring, material: 'rune' },
    { geometry: shard, material: 'rune' },
  ]);
}

/** Brazier: iron bowl on a tripod, embers inside. */
export function buildBrazier(): PropAsset {
  return assemble('brazier', [
    cylinder(0.26, 0.16, 0.24, [0, 1.02, 0], 'iron', 12),
    cylinder(0.04, 0.04, 0.9, [0, 0.55, 0], 'iron', 6),
    cylinder(0.24, 0.3, 0.06, [0, 0.08, 0], 'iron', 10),
    {
      geometry: new SphereGeometry(0.2, 10, 6).scale(1, 0.6, 1).translate(0, 1.14, 0),
      material: 'ember',
    },
  ]);
}

/** Wall torch: iron bracket plus flame cone. */
export function buildTorch(): PropAsset {
  return assemble('torch', [
    box([0.06, 0.09, 0.28], [0, 0, 0.12], 'iron'),
    cylinder(0.035, 0.03, 0.42, [0, 0.16, 0.26], 'wood', 6),
    {
      geometry: new CylinderGeometry(0.02, 0.09, 0.26, 7).translate(0, 0.46, 0.26),
      material: 'ember',
    },
  ]);
}

/** Load-bearing dungeon pillar: fluted shaft with a base and capital. */
export function buildPillar(): PropAsset {
  return assemble('pillar', [
    box([0.72, 0.18, 0.72], [0, 0.09, 0], 'stone'),
    cylinder(0.26, 0.3, 3.2, [0, 1.78, 0], 'stone', 12),
    box([0.68, 0.3, 0.68], [0, 3.5, 0], 'stone'),
    cylinder(0.34, 0.34, 0.08, [0, 3.62, 0], 'stone', 12),
  ]);
}

/** Contract of the props exported by the pipeline (consumed by build-assets). */
export const PROP_MODELS: readonly {
  readonly id: string;
  readonly name: string;
  readonly build: () => PropAsset;
  readonly clips: readonly string[];
}[] = [
  { id: 'chest', name: 'chest', build: buildChest, clips: [] },
  { id: 'altar', name: 'altar', build: buildAltar, clips: [] },
  { id: 'brazier', name: 'brazier', build: buildBrazier, clips: [] },
  { id: 'torch', name: 'torch', build: buildTorch, clips: [] },
  { id: 'pillar', name: 'pillar', build: buildPillar, clips: [] },
];
