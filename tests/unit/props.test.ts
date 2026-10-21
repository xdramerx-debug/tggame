import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InstancedMesh } from 'three';
import { PhysicsWorld } from '@/game/physics';
import { DungeonGenerator } from '@/game/world/DungeonGenerator';
import { buildProps } from '@/game/world/Props';
import { RoomLights } from '@/game/world/RoomLights';
import { distanceToRoom } from '@/game/world/DungeonMesh';

describe('dungeon props', () => {
  let physics: PhysicsWorld;

  beforeEach(async () => {
    physics = await PhysicsWorld.create();
  });

  afterEach(() => {
    physics.dispose();
  });

  it('is deterministic for the same seed', () => {
    const dungeon = DungeonGenerator.generate({ seed: 77 });
    const a = buildProps(dungeon, physics, dungeon.seed);
    const b = buildProps(dungeon, physics, dungeon.seed);
    expect(a.group.children.length).toBe(b.group.children.length);
    expect(a.anchors).toEqual(b.anchors);
    a.dispose();
    b.dispose();
  });

  it('instances repeated furniture instead of adding one mesh per item', () => {
    const dungeon = DungeonGenerator.generate({ seed: 88 });
    const props = buildProps(dungeon, physics, dungeon.seed);
    const instanced = props.group.children.filter((child) => child instanceof InstancedMesh);
    expect(instanced.length).toBeGreaterThan(0);
    // Every generated room gets torches; two instance sets (flames + brackets).
    expect(props.group.children.length).toBeLessThan(30);
    props.dispose();
  });

  it('never creates lights of its own (the scene owns the light budget)', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const dungeon = DungeonGenerator.generate({ seed });
      const props = buildProps(dungeon, physics, dungeon.seed);
      let lights = 0;
      props.group.traverse((object) => {
        if (object.type === 'PointLight' || object.type === 'SpotLight') lights += 1;
      });
      expect(lights).toBe(0);
      props.dispose();
    }
  });

  it('creates pillar colliders only inside walkable rooms', () => {
    const dungeon = DungeonGenerator.generate({ seed: 99 });
    const props = buildProps(dungeon, physics, dungeon.seed);
    expect(physics.world.colliders.len()).toBeGreaterThanOrEqual(props.colliders.length);
    for (const collider of props.colliders) {
      const translation = collider.translation();
      const room = dungeon.rooms.find(
        (candidate) => distanceToRoom(candidate, { x: translation.x, z: translation.z }) === 0,
      );
      expect(room).toBeDefined();
    }
    for (const collider of props.colliders) physics.removeCollider(collider);
    props.dispose();
  });

  it('anchors altars and campfires at room centres', () => {
    const dungeon = DungeonGenerator.generate({ seed: 5 });
    const props = buildProps(dungeon, physics, dungeon.seed);
    for (const anchor of props.anchors) {
      const room = dungeon.rooms.find((candidate) => candidate.id === anchor.roomId);
      expect(room).toBeDefined();
      if (!room) continue;
      expect(anchor.x).toBeCloseTo(room.center.x, 6);
      expect(anchor.z).toBeCloseTo(room.center.z, 6);
      expect(['altar', 'campfire']).toContain(anchor.type);
    }
    props.dispose();
  });
});

describe('RoomLights', () => {
  it('never exceeds the light budget (torch + nearest rooms)', () => {
    const dungeon = DungeonGenerator.generate({ seed: 21 });
    const lights = new RoomLights(dungeon, 4);
    // One light object per room plus the player torch.
    expect(lights.objects).toHaveLength(dungeon.rooms.length + 1);

    for (const room of dungeon.rooms) {
      lights.update(0.2, { x: room.center.x, z: room.center.z }, 1);
      expect(lights.activeCount).toBeLessThanOrEqual(4);
      expect(lights.litRoomIds.length).toBeLessThanOrEqual(3);
    }
    lights.dispose();
  });

  it('lights the room the player is standing in', () => {
    const dungeon = DungeonGenerator.generate({ seed: 22 });
    const lights = new RoomLights(dungeon, 4);
    for (const room of dungeon.rooms) {
      lights.update(0.2, { x: room.center.x, z: room.center.z }, 0.5);
      expect(lights.litRoomIds).toContain(room.id);
    }
    lights.dispose();
  });

  it('drops the budget and re-selects when quality changes', () => {
    const dungeon = DungeonGenerator.generate({ seed: 23 });
    const lights = new RoomLights(dungeon, 4);
    const room = dungeon.rooms[0];
    if (!room) throw new Error('no rooms');
    lights.update(0.2, { x: room.center.x, z: room.center.z }, 0.5);
    expect(lights.activeCount).toBeLessThanOrEqual(4);
    lights.setBudget(1);
    lights.update(0.2, { x: room.center.x, z: room.center.z }, 0.6);
    // Only the player torch remains on low tier.
    expect(lights.activeCount).toBe(1);
    lights.dispose();
  });

  it('keeps the player torch visible at all times', () => {
    const dungeon = DungeonGenerator.generate({ seed: 24 });
    const lights = new RoomLights(dungeon, 2);
    lights.update(0.2, { x: -50, z: -50 }, 0.3);
    const torch = lights.objects[0];
    expect(torch?.visible).toBe(true);
    lights.dispose();
  });
});
