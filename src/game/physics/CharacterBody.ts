import type RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from './PhysicsWorld';
import type { CapsuleDimensions } from './capsule';
import { capsuleCentreOffset } from './capsule';

export interface CharacterBodyOptions {
  readonly dimensions: CapsuleDimensions;
  /** Feet position in world space. */
  readonly position: { x: number; y: number; z: number };
  /** Movement speed used to evaluate how far one step may push the capsule. */
  readonly maxSpeed?: number;
}

export interface CharacterMoveResult {
  readonly movedDistance: number;
  readonly blocked: boolean;
  readonly grounded: boolean;
}

/**
 * Kinematic capsule driven by Rapier's character controller.
 *
 * The controller slides along walls, climbs small steps and snaps to the ground,
 * which is exactly the behaviour a third-person dungeon crawler needs. The body
 * is position-based kinematic: it is teleported every fixed step, so it never
 * fights the solver and never jitters.
 */
export class CharacterBody {
  private readonly rapier: typeof RAPIER;
  private readonly world: PhysicsWorld;
  private readonly controller: RAPIER.KinematicCharacterController;
  private readonly body: RAPIER.RigidBody;
  private readonly collider: RAPIER.Collider;
  private readonly dimensions: CapsuleDimensions;
  private grounded = false;
  private lastMoveDistance = 0;
  private lastBlocked = false;

  constructor(world: PhysicsWorld, options: CharacterBodyOptions) {
    this.world = world;
    this.rapier = world.rapier;
    this.dimensions = options.dimensions;

    const { RigidBodyDesc, ColliderDesc } = this.rapier;
    const centerY = options.position.y + capsuleCentreOffset(options.dimensions);
    this.body = world.world.createRigidBody(
      RigidBodyDesc.kinematicPositionBased().setTranslation(options.position.x, centerY, options.position.z),
    );
    this.collider = world.world.createCollider(
      ColliderDesc.capsule(options.dimensions.halfHeight, options.dimensions.radius).setFriction(0.6),
      this.body,
    );

    this.controller = world.world.createCharacterController(0.02);
    this.controller.enableAutostep(0.35, 0.2, true);
    this.controller.enableSnapToGround(0.3);
    this.controller.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    this.controller.setMinSlopeSlideAngle((40 * Math.PI) / 180);
    // Dynamic props (loot, breakables) must react to a walking player.
    this.controller.setApplyImpulsesToDynamicBodies(true);
    this.controller.setCharacterMass(70);
  }

  /** Rapier collider, used to exclude the player from its own raycasts. */
  get capsule(): RAPIER.Collider {
    return this.collider;
  }

  get isGrounded(): boolean {
    return this.grounded;
  }

  get blocked(): boolean {
    return this.lastBlocked;
  }

  /** Capsule centre (physics space). */
  get centre(): { x: number; y: number; z: number } {
    const translation = this.body.translation();
    return { x: translation.x, y: translation.y, z: translation.z };
  }

  /** Feet position (render space). */
  get feet(): { x: number; y: number; z: number } {
    const translation = this.body.translation();
    return {
      x: translation.x,
      y: translation.y - capsuleCentreOffset(this.dimensions),
      z: translation.z,
    };
  }

  /**
   * Moves the capsule by a world-space displacement for one fixed step.
   * @param delta desired translation in metres for this step
   */
  moveBy(delta: { x: number; y: number; z: number }): CharacterMoveResult {
    this.controller.computeColliderMovement(this.collider, delta);
    const corrected = this.controller.computedMovement();
    const centre = this.body.translation();
    this.body.setNextKinematicTranslation({
      x: centre.x + corrected.x,
      y: centre.y + corrected.y,
      z: centre.z + corrected.z,
    });
    this.grounded = this.controller.computedGrounded();
    this.lastMoveDistance = Math.hypot(corrected.x, corrected.z);
    const wanted = Math.hypot(delta.x, delta.z);
    this.lastBlocked = wanted > 0.0001 && this.lastMoveDistance < wanted * 0.5;
    return {
      movedDistance: this.lastMoveDistance,
      blocked: this.lastBlocked,
      grounded: this.grounded,
    };
  }

  /** Hard teleport (spawn, respawn, debug). */
  teleport(feetPosition: { x: number; y: number; z: number }): void {
    this.body.setTranslation(
      {
        x: feetPosition.x,
        y: feetPosition.y + capsuleCentreOffset(this.dimensions),
        z: feetPosition.z,
      },
      true,
    );
    this.body.setNextKinematicTranslation({
      x: feetPosition.x,
      y: feetPosition.y + capsuleCentreOffset(this.dimensions),
      z: feetPosition.z,
    });
    this.lastMoveDistance = 0;
    this.lastBlocked = false;
  }

  dispose(): void {
    this.world.world.removeCharacterController(this.controller);
    this.world.world.removeCollider(this.collider, true);
    this.world.world.removeRigidBody(this.body);
  }
}
