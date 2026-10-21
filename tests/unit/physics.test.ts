import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CharacterBody, PLAYER_CAPSULE, PhysicsWorld } from '@/game/physics';

/**
 * Integration tests against the real Rapier WASM build.
 *
 * These run in Node: `rapier3d-compat` ships the WASM as base64, so no browser
 * is required. They validate the contract the game relies on — ground snap,
 * wall sliding and the camera raycast — which unit math alone cannot cover.
 */
describe('PhysicsWorld + CharacterBody (WASM)', () => {
  let physics: PhysicsWorld;

  beforeAll(async () => {
    physics = await PhysicsWorld.create();
  });

  afterAll(() => {
    physics.dispose();
  });

  function simulate(body: CharacterBody, delta: { x: number; y: number; z: number }, steps: number): void {
    for (let i = 0; i < steps; i += 1) {
      body.moveBy(delta);
      physics.world.step();
    }
  }

  it('creates a world with 60 Hz timestep and gravity', () => {
    expect(physics.world.timestep).toBeCloseTo(1 / 60, 5);
    expect(physics.world.gravity.y).toBeLessThan(0);
  });

  it('lands on a static floor and reports grounded', () => {
    physics.addStaticBox({ x: 0, y: -0.25, z: 0 }, { x: 10, y: 0.25, z: 10 });
    const body = new CharacterBody(physics, {
      dimensions: PLAYER_CAPSULE,
      position: { x: 0, y: 2, z: 0 },
    });

    simulate(body, { x: 0, y: -0.05, z: 0 }, 80);
    expect(body.isGrounded).toBe(true);
    expect(body.feet.y).toBeCloseTo(0, 1);
    body.dispose();
  });

  it('does not walk through a wall and slides along it', () => {
    physics.addStaticBox({ x: 0, y: -0.25, z: 0 }, { x: 10, y: 0.25, z: 10 });
    // Wall at x = 3, half a metre thick.
    physics.addStaticBox({ x: 3, y: 2, z: 0 }, { x: 0.5, y: 2, z: 6 });
    const body = new CharacterBody(physics, {
      dimensions: PLAYER_CAPSULE,
      position: { x: 0, y: 0.1, z: 0 },
    });

    simulate(body, { x: 0.08, y: -0.02, z: 0 }, 120);
    // Capsule radius 0.35 → centre must stop before x = 2.5.
    expect(body.feet.x).toBeLessThan(2.6);
    expect(body.blocked).toBe(true);
    body.dispose();
  });

  it('raycasts against static geometry and honours the exclusion filter', () => {
    physics.addStaticBox({ x: 0, y: -0.25, z: 0 }, { x: 10, y: 0.25, z: 10 });
    physics.addStaticBox({ x: -6, y: 2, z: 4 }, { x: 0.5, y: 2, z: 0.5 });
    const body = new CharacterBody(physics, {
      dimensions: PLAYER_CAPSULE,
      position: { x: -4, y: 0.1, z: 4 },
    });
    // Ray casts use the query pipeline, which is refreshed by a world step.
    physics.primeQueries();
    const hit = physics.raycast({ x: -4, y: 1, z: 4 }, { x: -1, y: 0, z: 0 }, 10, body.capsule);
    expect(hit).not.toBeNull();
    expect(hit?.distance).toBeCloseTo(1.5, 1);

    const withoutExclusion = physics.raycast({ x: -4, y: 1, z: 4 }, { x: 0, y: -1, z: 0 }, 10);
    expect(withoutExclusion).not.toBeNull();
    body.dispose();
  });

  it('drives the fixed-step accumulator through PhysicsWorld.step', () => {
    const before = physics.stepCount;
    physics.step(1 / 60);
    expect(physics.stepCount).toBe(before + 1);
    // A huge stall is clamped and never runs more than 4 substeps.
    physics.step(5);
    expect(physics.stepCount).toBeLessThanOrEqual(before + 5);
    physics.resetAccumulator();
  });
});
