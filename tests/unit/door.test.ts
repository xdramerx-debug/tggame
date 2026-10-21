import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PhysicsWorld } from '@/game/physics';
import { createDoorAssets, Doorway } from '@/game/world/Door';
import type { DoorAssets } from '@/game/world/Door';
import type { DungeonDoor } from '@/game/world/dungeonTypes';

const DOOR: DungeonDoor = { x: 20, z: 12, along: 'x', width: 2, roomId: 3 };

/**
 * Doorway is pure presentation + one static collider, so it can be driven
 * headless: no renderer, no canvas, same WASM physics as the game.
 */
describe('Doorway', () => {
  let physics: PhysicsWorld;
  let assets: DoorAssets;

  beforeEach(async () => {
    physics = await PhysicsWorld.create();
    assets = createDoorAssets(2);
  });

  afterEach(() => {
    physics.dispose();
    assets.dispose();
  });

  function tick(doorway: Doorway, player: { x: number; z: number }, seconds: number): void {
    const step = 1 / 60;
    for (let elapsed = 0; elapsed < seconds; elapsed += step) doorway.update(step, player);
  }

  it('starts closed and blocks with a static collider', () => {
    const doorway = new Doorway(DOOR, physics, assets);
    expect(doorway.openness).toBe(0);
    expect(doorway.isOpen).toBe(false);
    // Closed door with the player far away keeps its collider enabled.
    tick(doorway, { x: 0, z: 0 }, 0.2);
    expect(doorway.openness).toBe(0);
    expect(doorway.blocksMovement).toBe(true);
    doorway.dispose();
  });

  it('swings open when the player approaches and closes behind them', () => {
    const doorway = new Doorway(DOOR, physics, assets);
    tick(doorway, { x: DOOR.x, z: DOOR.z + 2 }, 0.6);
    expect(doorway.openness).toBeGreaterThan(0.9);
    expect(doorway.isOpen).toBe(true);
    expect(doorway.blocksMovement).toBe(false);

    tick(doorway, { x: DOOR.x, z: DOOR.z + 9 }, 1.2);
    expect(doorway.openness).toBeLessThan(0.05);
    expect(doorway.isOpen).toBe(false);
    expect(doorway.blocksMovement).toBe(true);
    doorway.dispose();
  });

  it('uses hysteresis so it does not flap between 3.2 m and 4.4 m', () => {
    const doorway = new Doorway(DOOR, physics, assets);
    tick(doorway, { x: DOOR.x, z: DOOR.z + 3 }, 0.6);
    expect(doorway.openness).toBeGreaterThan(0.9);
    // 3.8 m is farther than the open trigger but nearer than the close trigger.
    tick(doorway, { x: DOOR.x, z: DOOR.z + 3.8 }, 0.6);
    expect(doorway.openness).toBeGreaterThan(0.9);
    doorway.dispose();
  });

  it('never traps the player inside the opening', () => {
    const doorway = new Doorway(DOOR, physics, assets);
    // Standing in the doorway: the panel must not block the capsule even if the
    // swing has not finished yet.
    tick(doorway, { x: DOOR.x + 0.2, z: DOOR.z + 0.2 }, 0.05);
    expect(doorway.openness).toBeLessThan(0.5);
    expect(doorway.blocksMovement).toBe(false);
    doorway.dispose();
  });

  it('removes its collider on dispose (floor unload)', () => {
    const before = physics.world.colliders.len();
    const doorway = new Doorway(DOOR, physics, assets);
    expect(physics.world.colliders.len()).toBe(before + 1);
    doorway.dispose();
    expect(physics.world.colliders.len()).toBe(before);
  });

  it('builds one panel for a 1 m opening and two for a 2 m opening', () => {
    const single = new Doorway({ ...DOOR, width: 1 }, physics, assets);
    const double = new Doorway({ ...DOOR, width: 2 }, physics, assets);
    // Each panel hangs from its own pivot group; jambs and lintel are meshes.
    const pivotCount = (doorway: Doorway): number =>
      doorway.group.children.filter((child) => child.type === 'Group').length;
    expect(pivotCount(single)).toBe(1);
    expect(pivotCount(double)).toBe(2);
    single.dispose();
    double.dispose();
  });
});
