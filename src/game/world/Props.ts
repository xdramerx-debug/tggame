import type { BufferGeometry } from 'three';
import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from 'three';
import type { Dungeon } from './dungeonTypes';
import { DUNGEON_CONFIG, placePillars } from './DungeonGenerator';
import { createRng } from './bsp';
import type { PhysicsWorld } from '@/game/physics';
import type { Collider } from '@dimforge/rapier3d-compat';

interface Transform {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rotY?: number;
  readonly scale?: number;
}

export interface PropsResult {
  readonly group: Group;
  /** Positions of altars/campfires used by later systems (rest, save). */
  readonly anchors: { readonly type: string; readonly x: number; readonly z: number; readonly roomId: number }[];
  readonly drawCalls: number;
  /** Static colliders created for pillars; removed on floor unload. */
  readonly colliders: readonly Collider[];
  dispose(): void;
}

/**
 * Dungeon furniture generated from the room table.
 *
 * Repeated items (torches, bones, rubble, candles, chests, altars) are instanced,
 * so the whole floor adds ~10 draw calls regardless of room count. Only
 * Emissive flames + the room light budget (see `RoomLights`) carry the mood;
 * props never create lights of their own, so the point-light count stays a scene
 * decision rather than an emergent one.
 */
export function buildProps(dungeon: Dungeon, physics: PhysicsWorld, seed: number): PropsResult {
  const group = new Group();
  group.name = 'props';
  const rng = createRng(seed ^ 0x5bd1e995);
  const disposableGeometries: { dispose(): void }[] = [];
  const disposableMaterials: { dispose(): void }[] = [];
  const anchors: PropsResult['anchors'] = [];
  const colliders: Collider[] = [];

  const woodMaterial = new MeshStandardMaterial({ color: 0x5a4128, roughness: 0.85 });
  const stoneMaterial = new MeshStandardMaterial({ color: 0x6b7280, roughness: 0.95 });
  const boneMaterial = new MeshStandardMaterial({ color: 0xd8d2c2, roughness: 0.7 });
  const flameMaterial = new MeshStandardMaterial({
    color: 0xffb257,
    emissive: new Color(0xff8a3d),
    emissiveIntensity: 3.2,
    roughness: 0.4,
  });
  const goldMaterial = new MeshStandardMaterial({
    color: 0xc9a227,
    emissive: new Color(0x3a2c07),
    metalness: 0.75,
    roughness: 0.35,
  });
  const metalMaterial = new MeshStandardMaterial({ color: 0x40464f, metalness: 0.85, roughness: 0.4 });
  const arcaneMaterial = new MeshStandardMaterial({
    color: 0x4a7c8c,
    emissive: new Color(0x4a7c8c),
    emissiveIntensity: 2.4,
    roughness: 0.3,
    metalness: 0.5,
  });
  disposableMaterials.push(
    woodMaterial,
    stoneMaterial,
    boneMaterial,
    flameMaterial,
    goldMaterial,
    metalMaterial,
    arcaneMaterial,
  );

  const torches: Transform[] = [];
  const bones: Transform[] = [];
  const rubble: Transform[] = [];
  const candles: Transform[] = [];
  const chests: Transform[] = [];
  const altars: Transform[] = [];
  const campfires: Transform[] = [];

  const pillarGeometry = new CylinderGeometry(0.28, 0.34, 3.6, 6);
  disposableGeometries.push(pillarGeometry);
  const pillarMaterial = stoneMaterial;

  for (const room of dungeon.rooms) {
    const definition = DUNGEON_CONFIG.roomTypes.find((item) => item.id === room.type);
    const propList = definition?.props ?? ['torch'];
    const isBoss = room.type === 'boss';

    // Corner/edge torches: always useful for readability of the room.
    const wallTorchCount = Math.min(4, Math.max(2, Math.round(room.w / 4)));
    for (let i = 0; i < wallTorchCount; i += 1) {
      const t = (i + 0.5) / wallTorchCount;
      const alongX = i % 2 === 0;
      torches.push(
        alongX
          ? { x: room.x + 0.35, y: 2.1, z: room.y + 0.6 + t * (room.h - 1.2) }
          : { x: room.x + 0.6 + t * (room.w - 1.2), y: 2.1, z: room.y + 0.35 },
      );
    }

    for (const prop of propList) {
      switch (prop) {
        case 'torch': {
          torches.push({ x: room.center.x + (rng() - 0.5) * 2, y: 2.1, z: room.y + 0.35 });
          break;
        }
        case 'bones': {
          const count = 3 + Math.floor(rng() * 4);
          for (let i = 0; i < count; i += 1) {
            bones.push({
              x: room.x + 1 + rng() * (room.w - 2),
              y: 0.05,
              z: room.y + 1 + rng() * (room.h - 2),
              rotY: rng() * Math.PI,
            });
          }
          break;
        }
        case 'rubble': {
          const count = 4 + Math.floor(rng() * 5);
          for (let i = 0; i < count; i += 1) {
            rubble.push({
              x: room.x + 1 + rng() * (room.w - 2),
              y: 0.1,
              z: room.y + 1 + rng() * (room.h - 2),
              rotY: rng() * Math.PI,
              scale: 0.15 + rng() * 0.2,
            });
          }
          break;
        }
        case 'candles': {
          const count = 3 + Math.floor(rng() * 3);
          for (let i = 0; i < count; i += 1) {
            candles.push({
              x: room.center.x + (rng() - 0.5) * 1.6,
              y: 0.12,
              z: room.center.z + (rng() - 0.5) * 1.6,
            });
          }
          break;
        }
        case 'chest': {
          chests.push({ x: room.center.x + 1.6, y: 0, z: room.center.z + 1.4, rotY: rng() * Math.PI * 2 });
          break;
        }
        case 'altar': {
          altars.push({ x: room.center.x, y: 0, z: room.center.z });
          anchors.push({ type: 'altar', x: room.center.x, z: room.center.z, roomId: room.id });
          break;
        }
        case 'campfire': {
          campfires.push({ x: room.center.x, y: 0, z: room.center.z });
          anchors.push({ type: 'campfire', x: room.center.x, z: room.center.z, roomId: room.id });
          break;
        }
        default:
          break;
      }
    }

    if (isBoss) {
      // Braziers around the boss arena.
      for (const [dx, dz] of [
        [-3, -3],
        [3, -3],
        [-3, 3],
        [3, 3],
      ] as const) {
        campfires.push({ x: room.center.x + dx, y: 0, z: room.center.z + dz });
      }
    }

    // Pillars: collision + a little visual rhythm.
    const pillarSpots = placePillars(room, rng, Math.min(4, Math.floor(room.w / 4)));
    for (const spot of pillarSpots) {
      // Height is clamped by the room ceiling so pillars never poke through it.
      const height = Math.min(3.6, room.ceiling - 0.2);
      const mesh = new Mesh(pillarGeometry, pillarMaterial);
      mesh.position.set(spot.x, height / 2, spot.z);
      mesh.scale.y = height / 3.6;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
      colliders.push(
        physics.addStaticCylinder({ x: spot.x, y: height / 2, z: spot.z }, height / 2, 0.36),
      );
    }
  }

  // --- instanced props -------------------------------------------------
  const addInstanced = (
    geometry: BufferGeometry,
    material: MeshStandardMaterial,
    transforms: readonly Transform[],
    label: string,
  ): void => {
    if (transforms.length === 0) {
      geometry.dispose();
      return;
    }
    disposableGeometries.push(geometry);
    const mesh = new InstancedMesh(geometry, material, transforms.length);
    mesh.name = label;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const matrix = new Matrix4();
    const quaternion = new Quaternion();
    const position = new Vector3();
    const scaleVector = new Vector3();
    transforms.forEach((transform, index) => {
      position.set(transform.x, transform.y, transform.z);
      quaternion.setFromAxisAngle(new Vector3(0, 1, 0), transform.rotY ?? 0);
      const scale = transform.scale ?? 1;
      scaleVector.set(scale, scale, scale);
      matrix.compose(position, quaternion, scaleVector);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  };

  addInstanced(new ConeGeometry(0.09, 0.3, 5), flameMaterial, torches.map((t) => ({ ...t, y: t.y + 0.1 })), 'torch-flames');
  addInstanced(new BoxGeometry(0.1, 0.22, 0.12), metalMaterial, torches, 'torch-brackets');
  addInstanced(new BoxGeometry(0.5, 0.06, 0.07), boneMaterial, bones, 'bones');
  addInstanced(new DodecahedronGeometry(0.3, 0), stoneMaterial, rubble, 'rubble');
  addInstanced(new CylinderGeometry(0.03, 0.035, 0.24, 6), boneMaterial, candles, 'candles');
  addInstanced(new BoxGeometry(0.7, 0.45, 0.5), woodMaterial, chests, 'chests');
  addInstanced(new BoxGeometry(0.9, 0.7, 0.9), stoneMaterial, altars, 'altars');
  addInstanced(new CylinderGeometry(0.18, 0.22, 0.9, 6), stoneMaterial, campfires, 'campfire-stones');
  addInstanced(new ConeGeometry(0.22, 0.55, 5), flameMaterial, campfires.map((c) => ({ ...c, y: 0.5 })), 'campfire-flames');

  // Altar crystals glow: separate emissive instance set.
  if (altars.length > 0) {
    addInstanced(new BoxGeometry(0.28, 0.5, 0.28), arcaneMaterial, altars.map((a) => ({ ...a, y: 0.95 })), 'altar-crystals');
  }
  if (chests.length > 0) {
    addInstanced(new BoxGeometry(0.72, 0.06, 0.06), goldMaterial, chests.map((c) => ({ ...c, y: 0.34 })), 'chest-bands');
  }

  const drawCalls = group.children.length;

  return {
    group,
    anchors,
    drawCalls,
    colliders,
    dispose(): void {
      for (const geometry of disposableGeometries) geometry.dispose();
      for (const material of disposableMaterials) material.dispose();
      group.traverse((object) => {
        if (object instanceof InstancedMesh) object.dispose();
      });
      group.removeFromParent();
    },
  };
}
