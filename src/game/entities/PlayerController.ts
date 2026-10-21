import type { MoveCommand } from '@/types/scene';
import { CharacterBody, PLAYER_CAPSULE, capsuleCentreOffset } from '@/game/physics';
import type { PhysicsWorld } from '@/game/physics';
import { ACTION_SPECS } from '@/input/actions';
import { directionToYaw, shortestAngleDelta } from '@/input/movement';

export const PLAYER_TUNING = {
  walkSpeed: 3.4,
  dashSpeed: 11,
  dashDuration: 0.18,
  gravity: -18,
  /** Seconds of invulnerability granted by the dash (spec: 0.4 s). */
  iFrames: 0.4,
} as const;

export interface PlayerControllerOptions {
  readonly physics: PhysicsWorld;
  /** Spawn position of the feet. */
  readonly spawn: { x: number; z: number };
}

/**
 * Player locomotion and action state.
 *
 * Owns the Rapier capsule and runs at a fixed 60 Hz. Rendering code reads
 * `feet`, `facing`, `isDodging` and never writes physics state directly, which
 * keeps the scene free of controller bookkeeping and makes stage-5 model swaps
 * independent from movement code.
 */
export class PlayerController {
  readonly body: CharacterBody;
  facing = Math.PI;

  private move: MoveCommand = { x: 0, z: 0, magnitude: 0 };
  private lastDirection = { x: 0, z: -1 };
  private verticalVelocity = 0;
  private dashRemaining = 0;
  private dashCooldown = 0;
  private iFrameRemaining = 0;
  private dashDirection = { x: 0, z: -1 };
  private attackRemaining = 0;
  private attackCount = 0;

  constructor(options: PlayerControllerOptions) {
    this.body = new CharacterBody(options.physics, {
      dimensions: PLAYER_CAPSULE,
      position: { x: options.spawn.x, y: 0.08, z: options.spawn.z },
    });
  }

  get feet(): { x: number; y: number; z: number } {
    return this.body.feet;
  }

  get isGrounded(): boolean {
    return this.body.isGrounded;
  }

  get isDodging(): boolean {
    return this.dashRemaining > 0;
  }

  get isAttacking(): boolean {
    return this.attackRemaining > 0;
  }

  get attackProgress(): number {
    return this.attackRemaining > 0 ? 1 - this.attackRemaining / 0.28 : 0;
  }

  get isInvulnerable(): boolean {
    return this.iFrameRemaining > 0;
  }

  get attacks(): number {
    return this.attackCount;
  }

  get speedMagnitude(): number {
    return this.dashRemaining > 0 ? 1 : this.move.magnitude;
  }

  /** Camera-resolved movement command from the input layer. */
  setMoveInput(command: MoveCommand): void {
    this.move = command;
    if (command.magnitude > 0) this.lastDirection = { x: command.x, z: command.z };
  }

  /** @returns true when the attack started (always, until combat cancels it) */
  startAttack(): boolean {
    this.attackCount += 1;
    this.attackRemaining = 0.28;
    return true;
  }

  /**
   * Dash with a spec cooldown of 1.2 s.
   * @returns true when the dash actually started
   */
  startDash(): boolean {
    if (this.dashRemaining > 0 || this.dashCooldown > 0) return false;
    this.dashCooldown = ACTION_SPECS.dodge.cooldownMs / 1000;
    this.dashDirection = this.move.magnitude > 0.01 ? { x: this.move.x, z: this.move.z } : this.lastDirection;
    this.dashRemaining = PLAYER_TUNING.dashDuration;
    this.iFrameRemaining = PLAYER_TUNING.iFrames;
    return true;
  }

  /** Fixed-step simulation; called from the scene's `fixedUpdate`. */
  fixedUpdate(step: number): void {
    this.dashCooldown = Math.max(0, this.dashCooldown - step);
    this.iFrameRemaining = Math.max(0, this.iFrameRemaining - step);
    this.attackRemaining = Math.max(0, this.attackRemaining - step);

    let vx = 0;
    let vz = 0;
    if (this.dashRemaining > 0) {
      vx = this.dashDirection.x * PLAYER_TUNING.dashSpeed;
      vz = this.dashDirection.z * PLAYER_TUNING.dashSpeed;
      this.dashRemaining = Math.max(0, this.dashRemaining - step);
    } else if (this.move.magnitude > 0.01) {
      const speed = PLAYER_TUNING.walkSpeed * this.move.magnitude;
      vx = this.move.x * speed;
      vz = this.move.z * speed;
    }

    if (this.body.isGrounded && this.verticalVelocity <= 0) {
      this.verticalVelocity = 0;
    } else {
      this.verticalVelocity += PLAYER_TUNING.gravity * step;
    }

    this.body.moveBy({ x: vx * step, y: this.verticalVelocity * step, z: vz * step });

    if (Math.abs(vx) > 0.01 || Math.abs(vz) > 0.01) {
      const targetYaw = directionToYaw({ x: vx, y: vz });
      this.facing += shortestAngleDelta(this.facing, targetYaw) * Math.min(1, step * 14);
    }
  }

  /** Teleport (spawn, floor transition). */
  teleport(position: { x: number; z: number }): void {
    this.body.teleport({ x: position.x, y: 0.15, z: position.z });
    this.verticalVelocity = 0;
    this.dashRemaining = 0;
  }

  dispose(): void {
    this.body.dispose();
  }

  /** Debug numbers shared by every scene. */
  debug() {
    const feet = this.body.feet;
    return {
      hero: { x: feet.x, y: feet.y, z: feet.z },
      attacks: this.attackCount,
      dodging: this.dashRemaining > 0,
      grounded: this.body.isGrounded,
    };
  }
}

/** Centre of the player capsule, for camera focus and audio positioning. */
export function playerEye(feet: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  return { x: feet.x, y: feet.y + capsuleCentreOffset(PLAYER_CAPSULE) + 0.35, z: feet.z };
}
