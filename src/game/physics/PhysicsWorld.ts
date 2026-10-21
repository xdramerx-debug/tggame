import type RAPIER from '@dimforge/rapier3d-compat';
import type { Collider } from '@dimforge/rapier3d-compat';
import { FixedStepAccumulator } from './FixedStep';

export type RapierModule = typeof RAPIER;

/** Callback executed once per fixed simulation step. */
export type FixedStepCallback = (stepSeconds: number) => void;

export interface RaycastHit {
  readonly distance: number;
  readonly collider: Collider;
}

/** Buffers returned by Rapier's debug renderer (line list with vertex colours). */
export interface DebugLines {
  readonly vertices: Float32Array;
  readonly colors: Float32Array;
}

/**
 * Thin, strict wrapper around a Rapier world.
 *
 * Responsibilities:
 * - lazy WASM initialisation (kept out of the main bundle chunk);
 * - fixed-step simulation with an accumulator and a hard substep cap;
 * - static collider helpers used by the dungeon generator later;
 * - raycasts for the camera boom and (stage 6) melee sweeps.
 */
export class PhysicsWorld {
  readonly world: RAPIER.World;
  readonly rapier: RapierModule;
  private readonly accumulator = new FixedStepAccumulator({ stepSeconds: 1 / 60, maxSteps: 4 });
  private fixedCallback: FixedStepCallback | null = null;
  private steps = 0;

  private constructor(rapier: RapierModule) {
    this.rapier = rapier;
    this.world = new rapier.World({ x: 0, y: -18, z: 0 });
    this.world.timestep = this.accumulator.stepSeconds;
    // Mobile budget: two solver iterations are enough for capsule vs. static boxes.
    this.world.numSolverIterations = 4;
  }

  /**
   * Loads the WASM module and creates the world.
   * The import is dynamic so the ~1 MB physics chunk is fetched in parallel with
   * the first scene build instead of blocking the initial bundle parse.
   */
  static async create(): Promise<PhysicsWorld> {
    const module = await import('@dimforge/rapier3d-compat');
    await module.init();
    // The dynamic module namespace matches the compat default export shape.
    return new PhysicsWorld(module);
  }

  /** Number of fixed steps executed since creation (diagnostics). */
  get stepCount(): number {
    return this.steps;
  }

  /** Registers the per-step simulation callback (character movement). */
  onFixedStep(callback: FixedStepCallback | null): void {
    this.fixedCallback = callback;
  }

  /**
   * Advances the simulation for a frame delta.
   * @returns number of fixed steps executed
   */
  step(dtSeconds: number): number {
    const count = this.accumulator.advance(dtSeconds);
    for (let i = 0; i < count; i += 1) {
      this.fixedCallback?.(this.accumulator.stepSeconds);
      this.world.step();
      this.steps += 1;
    }
    return count;
  }

  resetAccumulator(): void {
    this.accumulator.reset();
  }

  /**
   * Runs a zero-cost simulation step so freshly added static colliders are
   * inserted into the query pipeline. Without this the camera boom would pass
   * through walls on the very first frame of a floor.
   */
  primeQueries(): void {
    this.world.step();
  }

  // ------------------------------------------------------------- colliders

  /**
   * Static box collider centred at `position` (metres) with a Y rotation.
   * Used for walls, floors, ceilings and props.
   */
  addStaticBox(
    position: { x: number; y: number; z: number },
    halfExtents: { x: number; y: number; z: number },
    rotationY = 0,
    friction = 0.8,
  ): RAPIER.Collider {
    const { ColliderDesc, RigidBodyDesc } = this.rapier;
    const halfAngle = rotationY / 2;
    const body = this.world.createRigidBody(
      RigidBodyDesc.fixed()
        .setTranslation(position.x, position.y, position.z)
        .setRotation({ x: 0, y: Math.sin(halfAngle), z: 0, w: Math.cos(halfAngle) }),
    );
    const collider = this.world.createCollider(
      ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z).setFriction(friction),
      body,
    );
    return collider;
  }

  /** Static vertical cylinder (pillars, tree trunks). */
  addStaticCylinder(
    position: { x: number; y: number; z: number },
    halfHeight: number,
    radius: number,
    friction = 0.8,
  ): RAPIER.Collider {
    const { ColliderDesc, RigidBodyDesc } = this.rapier;
    const body = this.world.createRigidBody(
      RigidBodyDesc.fixed().setTranslation(position.x, position.y, position.z),
    );
    return this.world.createCollider(ColliderDesc.cylinder(halfHeight, radius).setFriction(friction), body);
  }

  /** Removes a collider together with its owning rigid body. */
  removeCollider(collider: RAPIER.Collider): void {
    const body = collider.parent();
    this.world.removeCollider(collider, true);
    if (body) this.world.removeRigidBody(body);
  }

  // ---------------------------------------------------------------- queries

  /**
   * Closest ray hit, ignoring the given collider (usually the player capsule).
   * @returns hit distance and collider, or null
   */
  raycast(
    origin: { x: number; y: number; z: number },
    direction: { x: number; y: number; z: number },
    maxDistance: number,
    exclude?: RAPIER.Collider,
  ): RaycastHit | null {
    const { Ray } = this.rapier;
    const ray = new Ray(origin, direction);
    const hit = this.world.castRay(ray, maxDistance, true, undefined, undefined, exclude);
    if (!hit) return null;
    return { distance: hit.timeOfImpact, collider: hit.collider };
  }

  /** Debug line buffers for collider visualisation (dev only). */
  debugLines(): DebugLines {
    const buffers = this.world.debugRender();
    return { vertices: buffers.vertices, colors: buffers.colors };
  }

  /** Frees WASM memory. The instance must not be used afterwards. */
  dispose(): void {
    this.fixedCallback = null;
    this.world.free();
  }
}
