import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PhysicsWorld } from '@/game/physics';
import { DungeonScene } from '@/game/scenes/DungeonScene';

/**
 * Whole-floor smoke test: generator + mesh + colliders + doors + props + lights
 * + player, driven without WebGL.
 *
 * The only browser dependency of the scene is the 2D canvas used to paint the
 * procedural stone textures, so a minimal canvas stub is enough to exercise the
 * real construction path in Node. Rendering itself is covered by Playwright.
 */
function installCanvasStub(): () => void {
  const previous = (globalThis as { document?: unknown }).document;
  const fakeDocument = {
    createElement(tag: string): unknown {
      if (tag !== 'canvas') throw new Error(`unexpected element ${tag}`);
      return {
        width: 1,
        height: 1,
        getContext: (): unknown => ({
          createImageData: (width: number, height: number) => ({
            width,
            height,
            data: new Uint8ClampedArray(width * height * 4),
          }),
          putImageData: (): void => undefined,
        }),
      };
    },
  };
  (globalThis as { document?: unknown }).document = fakeDocument;
  return () => {
    (globalThis as { document?: unknown }).document = previous;
  };
}

describe('DungeonScene (headless)', () => {
  let physics: PhysicsWorld;
  let restoreDocument: () => void;

  beforeAll(() => {
    restoreDocument = installCanvasStub();
  });

  afterAll(() => {
    restoreDocument();
  });

  beforeEach(async () => {
    physics = await PhysicsWorld.create();
  });

  afterEach(() => {
    physics.dispose();
  });

  it('builds a playable floor with a bounded light budget', () => {
    const scene = new DungeonScene({ physics, seed: 4242 });
    const snapshot = scene.getDebugSnapshot();
    expect(snapshot.floor).toBe(1);
    expect(snapshot.rooms).toBe(7);
    expect(snapshot.doors).toBeGreaterThan(0);
    expect(snapshot.activeLights).toBeGreaterThan(0);
    expect(snapshot.activeLights).toBeLessThanOrEqual(4);
    expect(snapshot.roomId).not.toBeNull();
    expect(snapshot.canInteract).toBe(false);
    expect(scene.stats.triangles).toBeGreaterThan(100);
    // Contact is resolved by the controller, not by construction.
    for (let i = 0; i < 10; i += 1) physics.step(1 / 60);
    expect(scene.getDebugSnapshot().grounded).toBe(true);
    scene.dispose();
    expect(scene.root.children.length).toBe(0);
  });

  it('simulates the player through the fixed step and keeps them grounded', () => {
    const scene = new DungeonScene({ physics, seed: 99 });
    const start = scene.getDebugSnapshot().hero;
    const forward = { x: 0, z: -1 };
    scene.setMoveInput({ x: forward.x, z: forward.z, magnitude: 1 });
    for (let i = 0; i < 90; i += 1) {
      physics.step(1 / 60);
      scene.update(1 / 60, i / 60);
    }
    const moved = scene.getDebugSnapshot();
    const distance = Math.hypot(moved.hero.x - start.x, moved.hero.z - start.z);
    expect(distance).toBeGreaterThan(0.5);
    expect(moved.grounded).toBe(true);
    expect(Math.abs(moved.hero.y)).toBeLessThan(0.2);
    scene.dispose();
  });

  it('offers the stairs interaction only inside its range', () => {
    const scene = new DungeonScene({ physics, seed: 808 });
    expect(scene.getInteractionHint()).toBeNull();

    const exit = scene.exitPosition;
    scene.teleportTo({ x: exit.x + 5, z: exit.z });
    expect(scene.getInteractionHint()).toBeNull();

    scene.teleportTo({ x: exit.x + 1, z: exit.z });
    const hint = scene.getInteractionHint();
    expect(hint?.available).toBe(true);
    expect(hint?.label).toBe('Спуститься ниже');
    expect(scene.getDebugSnapshot().canInteract).toBe(true);

    scene.triggerAction('interact');
    expect(scene.floorNumber).toBe(2);
    scene.dispose();
  });

  it('counts attacks and dashes triggered by the HUD', () => {
    const scene = new DungeonScene({ physics, seed: 7 });
    scene.triggerAction('attack');
    scene.triggerAction('dodge');
    const duringDash = scene.getDebugSnapshot();
    expect(duringDash.attacks).toBe(1);
    expect(duringDash.dodging).toBe(true);
    // Skills are inert until stage 7 — pressing them must not throw.
    scene.triggerAction('skill1');
    scene.triggerAction('skill2');
    scene.dispose();
  });

  it('descends to a new floor and rebuilds geometry, doors and lights', () => {
    const floors: number[] = [];
    const scene = new DungeonScene({
      physics,
      seed: 555,
      onFloorChange: (floor) => floors.push(floor),
    });
    const first = scene.stats;
    scene.descend();
    const second = scene.stats;
    expect(floors).toEqual([2]);
    expect(second.floor).toBe(2);
    expect(second.rooms).toBeGreaterThanOrEqual(5);
    expect(second.doors).toBeGreaterThan(0);
    expect(second.activeLights).toBeLessThanOrEqual(4);
    // The player is teleported to the new entrance, inside a room.
    expect(scene.getDebugSnapshot().roomId).not.toBeNull();
    // The old floor must not survive: collider count stays in the same order.
    expect(physics.world.colliders.len()).toBeLessThan(500);
    expect(first.triangles).toBeGreaterThan(0);
    scene.dispose();
    // Everything the scene created (walls, doors, props, floor slab, capsule) is gone.
    expect(physics.world.colliders.len()).toBe(0);
  });

  it('wraps back to floor 1 after the last floor and reports it', () => {
    const messages: string[] = [];
    const scene = new DungeonScene({
      physics,
      seed: 3,
      maxFloors: 2,
      onNotify: (message) => messages.push(message),
    });
    scene.descend();
    expect(scene.floorNumber).toBe(2);
    scene.descend();
    expect(scene.floorNumber).toBe(1);
    expect(messages).toEqual(['Этаж 2', 'Этаж 1']);
    scene.dispose();
  });
});
