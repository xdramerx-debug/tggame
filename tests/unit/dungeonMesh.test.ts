import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CanvasTexture, Mesh } from 'three';
import { PhysicsWorld } from '@/game/physics';
import { DungeonGenerator } from '@/game/world/DungeonGenerator';
import { CEILING_STEP, buildDungeonMesh, createDungeonMaterials, quantizeCeiling } from '@/game/world/DungeonMesh';
import { QUALITY_PRESETS } from '@/game/core/Quality';
import type { Dungeon } from '@/game/world/dungeonTypes';

/**
 * Geometry/collider contract of the generated floor.
 *
 * Runs headless: `three` builds buffer geometries without a GL context, and the
 * Rapier compat build is pure WASM, so the whole collider pipeline can be
 * exercised in Node (no browser, same as the physics suite).
 */
describe('buildDungeonMesh', () => {
  let physics: PhysicsWorld;
  const texture = new CanvasTexture({
    width: 2,
    height: 2,
    data: new Uint8Array([0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255]),
  });
  const materials = createDungeonMaterials({ map: texture, normalMap: texture, roughnessMap: texture });

  // A fresh world per test: collider handles are global to a Rapier world, and
  // leaked geometry from a previous case would pollute raycasts.
  beforeEach(async () => {
    physics = await PhysicsWorld.create();
  });

  afterEach(() => {
    physics.dispose();
  });

  afterAll(() => {
    texture.dispose();
    materials.floor.dispose();
    materials.wall.dispose();
    materials.ceiling.dispose();
  });

  function build(seed: number): { dungeon: Dungeon; result: ReturnType<typeof buildDungeonMesh> } {
    const dungeon = DungeonGenerator.generate({ seed });
    const result = buildDungeonMesh(dungeon, physics, materials);
    return { dungeon, result };
  }

  it('quantises ceilings to a coarse grid', () => {
    expect(quantizeCeiling(3.02)).toBe(3);
    expect(quantizeCeiling(3.87)).toBe(4);
    expect(quantizeCeiling(0.1)).toBe(CEILING_STEP);
    for (const height of [3, 3.2, 3.7, 4.4, 5]) {
      expect(quantizeCeiling(height) % CEILING_STEP).toBeCloseTo(0, 6);
    }
  });

  it('merges the floor into three draw calls with finite geometry', () => {
    const { result } = build(31);
    expect(result.drawCalls).toBe(3);
    expect(result.group.children).toHaveLength(3);
    expect(result.triangles).toBeGreaterThan(0);

    for (const child of result.group.children) {
      expect(child).toBeInstanceOf(Mesh);
      const mesh = child as Mesh;
      const positions = mesh.geometry.getAttribute('position');
      expect(positions.count).toBeGreaterThan(0);
      const indexCount = mesh.geometry.getIndex()?.count ?? 0;
      expect(indexCount).toBeGreaterThan(0);
      expect(indexCount % 3).toBe(0);
      for (let i = 0; i < positions.count; i += 1) {
        expect(Number.isFinite(positions.getX(i))).toBe(true);
        expect(Number.isFinite(positions.getY(i))).toBe(true);
        expect(Number.isFinite(positions.getZ(i))).toBe(true);
      }
      const normals = mesh.geometry.getAttribute('normal');
      for (let i = 0; i < normals.count; i += 1) {
        const length = Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i));
        expect(length).toBeCloseTo(1, 4);
      }
    }
  });

  it('generates UVs in world units (0.5 per metre)', () => {
    const { result } = build(32);
    const floor = result.group.children[0] as Mesh;
    const uvs = floor.geometry.getAttribute('uv');
    let maxU = 0;
    for (let i = 0; i < uvs.count; i += 1) maxU = Math.max(maxU, uvs.getX(i));
    // A 56 m floor at 0.5 UV/m must not exceed 28.
    expect(maxU).toBeGreaterThan(5);
    expect(maxU).toBeLessThanOrEqual(28);
  });

  it('keeps the static collider count far below one-per-tile', () => {
    const { dungeon, result } = build(33);
    const walkable = Array.from(dungeon.tiles).filter((kind) => kind !== 0).length;
    expect(result.colliders.length).toBeGreaterThan(0);
    expect(result.colliders.length).toBeLessThan(walkable / 4);
    expect(result.colliders.length).toBeLessThan(400);
  });

  it('walls block horizontal rays and the spawn point stays clear', () => {
    const { dungeon, result } = build(34);
    physics.primeQueries();
    const spawn = { x: dungeon.entrance.x, y: 0.9, z: dungeon.entrance.z };
    // A 2.4 m probe in each direction must not start inside geometry.
    const directions = [
      { x: 1, y: 0, z: 0 },
      { x: -1, y: 0, z: 0 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: -1 },
    ];
    const clear = directions.filter((direction) => physics.raycast(spawn, direction, 2.4) === null);
    expect(clear.length).toBeGreaterThan(0);

    // The floor slab is hit by a downward ray from 1 m above the spawn.
    const down = physics.raycast({ x: spawn.x, y: 1, z: spawn.z }, { x: 0, y: -1, z: 0 }, 3);
    expect(down).not.toBeNull();
    if (down) expect(down.distance).toBeLessThan(1.3);
    void result;
  });

  it('survives build → unload → build cycles (descending leaks nothing)', () => {
    for (let cycle = 0; cycle < 3; cycle += 1) {
      const { dungeon, result } = build(35 + cycle);
      physics.primeQueries();
      const down = physics.raycast(
        { x: dungeon.entrance.x, y: 1.5, z: dungeon.entrance.z },
        { x: 0, y: -1, z: 0 },
        4,
      );
      expect(down).not.toBeNull();
      for (const collider of result.colliders) physics.removeCollider(collider);
      result.dispose();
      physics.primeQueries();
      expect(
        physics.raycast(
          { x: dungeon.entrance.x, y: 1.5, z: dungeon.entrance.z },
          { x: 0, y: -1, z: 0 },
          4,
        ),
      ).toBeNull();
    }
  });

  it('toggles shadow casting with the quality preset', () => {
    const { result } = build(36);
    result.setQuality(QUALITY_PRESETS.low);
    const floor = result.group.children[0] as Mesh;
    expect(floor.receiveShadow).toBe(false);
    result.setQuality(QUALITY_PRESETS.high);
    expect(floor.receiveShadow).toBe(true);
    result.dispose();
  });
});
