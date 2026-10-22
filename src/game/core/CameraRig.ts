import { MathUtils, Vector3 } from 'three';
import type { PerspectiveCamera } from 'three';

/** Orbit limits from the spec. */
export const CAMERA_LIMITS = {
  minPitchDeg: -15,
  maxPitchDeg: 45,
  minDistance: 2.5,
  maxDistance: 8,
  /** Vertical follow lag: 0.1 s time constant ≈ snappy but not glued. */
  followLagSec: 0.1,
  /** How fast the camera snaps back after a wall collision, 1/s. */
  collisionReturnRate: 3.5,
  /** Padding kept between camera and wall, metres. */
  collisionPadding: 0.25,
} as const;

/** Clamp pitch to the spec window (degrees → radians handled by callers). */
export function clampPitch(radians: number): number {
  return MathUtils.clamp(
    radians,
    MathUtils.degToRad(CAMERA_LIMITS.minPitchDeg),
    MathUtils.degToRad(CAMERA_LIMITS.maxPitchDeg),
  );
}

/** Clamp zoom distance in metres. */
export function clampDistance(meters: number): number {
  return MathUtils.clamp(meters, CAMERA_LIMITS.minDistance, CAMERA_LIMITS.maxDistance);
}

/**
 * Frame-rate independent exponential smoothing factor.
 * `smoothingTimeSec` is the time to cover ~63% of the remaining distance.
 */
export function damp(smoothingTimeSec: number, dt: number): number {
  if (smoothingTimeSec <= 0) return 1;
  return 1 - Math.exp(-dt / smoothingTimeSec);
}

/** Convert a pointer delta in pixels to yaw/pitch radians (spec: 0.25°/px). */
export function pointerDeltaToOrbit(
  dxPx: number,
  dyPx: number,
  degreesPerPx: number,
  invertY = false,
): { yaw: number; pitch: number } {
  const k = MathUtils.degToRad(degreesPerPx);
  return {
    yaw: -dxPx * k,
    pitch: (invertY ? 1 : -1) * dyPx * k,
  };
}

/** Result of a camera obstruction probe: distance available along the ray. */
export type ObstructionProbe = (origin: Vector3, direction: Vector3, maxDistance: number) => number;

export interface CameraRigOptions {
  readonly camera: PerspectiveCamera;
  /** Optional collision probe; return an available distance (clamped ≤ maxDistance). */
  readonly probe?: ObstructionProbe;
  readonly degreesPerPx?: number;
  readonly invertY?: boolean;
}

/**
 * Third-person orbit rig.
 *
 * - Owns yaw/pitch/distance and a smoothed follow target.
 * - Never lets the camera clip through geometry: shortens the boom instantly on
 *   obstruction and returns to the desired distance slowly.
 * - Does not read input itself; the input layer pushes deltas in (testable).
 */
export class CameraRig {
  readonly camera: PerspectiveCamera;
  private readonly probe: ObstructionProbe | undefined;
  private readonly smoothTarget = new Vector3();
  private readonly desiredTarget = new Vector3();
  private readonly boomDir = new Vector3();
  private readonly tmp = new Vector3();

  yaw = 0; // camera sits on +Z behind the hero, looking down -Z (forward = -Z)
  pitch = MathUtils.degToRad(12);
  distance = 5;
  degreesPerPx: number;
  invertY: boolean;
  private currentDistance = 5;
  private shakeStrength = 0;
  private shakePhase = 0;
  private initialized = false;

  constructor(options: CameraRigOptions) {
    this.camera = options.camera;
    this.probe = options.probe;
    this.degreesPerPx = options.degreesPerPx ?? 0.25;
    this.invertY = options.invertY ?? false;
  }

  /** Apply a raw pointer delta from the camera-swipe zone. */
  applyPointerDelta(dxPx: number, dyPx: number): void {
    const { yaw, pitch } = pointerDeltaToOrbit(dxPx, dyPx, this.degreesPerPx, this.invertY);
    this.yaw = wrapAngle(this.yaw + yaw);
    this.pitch = clampPitch(this.pitch + pitch);
  }

  /** Pinch zoom: `factor` > 1 zooms out, < 1 zooms in (multiplied per gesture). */
  applyZoomFactor(factor: number): void {
    if (!Number.isFinite(factor) || factor <= 0) return;
    this.distance = clampDistance(this.distance * factor);
  }

  setZoom(meters: number): void {
    this.distance = clampDistance(meters);
  }

  /** Move the follow target; the visual camera lags behind by `followLagSec`. */
  setTarget(position: Vector3, snap = false): void {
    this.desiredTarget.copy(position);
    if (snap || !this.initialized) {
      this.smoothTarget.copy(position);
      this.currentDistance = this.distance;
      this.initialized = true;
    }
  }

  /** World-space forward direction on the XZ plane (unit vector). */
  getForward(out = new Vector3()): Vector3 {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
  }

  /** World-space right direction on the XZ plane (unit vector). */
  getRight(out = new Vector3()): Vector3 {
    return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)).normalize();
  }

  /** Direction from camera to target, used for aim assist later. */
  getAimDirection(out = new Vector3()): Vector3 {
    return out.copy(this.smoothTarget).sub(this.camera.position).normalize();
  }

  /**
   * Adds camera shake (0…1). Damage feedback only: the offset decays in ~0.25 s
   * so it never fights the player's own camera control.
   */
  addShake(strength: number): void {
    this.shakeStrength = Math.min(1, this.shakeStrength + Math.max(0, strength));
  }

  update(dt: number): void {
    if (!this.initialized) return;
    const k = damp(CAMERA_LIMITS.followLagSec, dt);
    this.smoothTarget.lerp(this.desiredTarget, k);

    const cosPitch = Math.cos(this.pitch);
    this.boomDir
      .set(Math.sin(this.yaw) * cosPitch, Math.sin(this.pitch), Math.cos(this.yaw) * cosPitch)
      .normalize();

    let allowed = this.distance;
    if (this.probe) {
      const hit = this.probe(this.smoothTarget, this.boomDir, this.distance + CAMERA_LIMITS.collisionPadding);
      if (Number.isFinite(hit)) {
        allowed = Math.max(
          CAMERA_LIMITS.minDistance * 0.4,
          Math.min(this.distance, hit - CAMERA_LIMITS.collisionPadding),
        );
      }
    }

    if (allowed < this.currentDistance) {
      // Snap in immediately so we never show the inside of a wall.
      this.currentDistance = allowed;
    } else {
      this.currentDistance += (allowed - this.currentDistance) * damp(1 / CAMERA_LIMITS.collisionReturnRate, dt);
    }

    this.tmp.copy(this.smoothTarget).addScaledVector(this.boomDir, this.currentDistance);
    this.camera.position.copy(this.tmp);
    if (this.shakeStrength > 0.001) {
      // Deterministic-ish jitter from a fast sine sweep: no RNG allocation, and
      // it reads as impact rather than as camera instability.
      const t = this.shakePhase;
      const amplitude = this.shakeStrength * 0.16;
      this.camera.position.x += Math.sin(t * 91.7) * amplitude;
      this.camera.position.y += Math.sin(t * 137.3 + 1.7) * amplitude;
      this.camera.position.z += Math.cos(t * 113.1) * amplitude;
      this.shakePhase += dt;
      this.shakeStrength = Math.max(0, this.shakeStrength - dt * 4);
    }
    this.camera.lookAt(this.smoothTarget);
  }

  /** Immediately place the camera at the desired pose (used on scene entry). */
  snap(): void {
    this.smoothTarget.copy(this.desiredTarget);
    this.currentDistance = this.distance;
    this.update(0.0001);
  }
}

/** Wrap an angle into (-π, π]. */
export function wrapAngle(radians: number): number {
  const twoPi = Math.PI * 2;
  let value = radians % twoPi;
  if (value <= -Math.PI) value += twoPi;
  if (value > Math.PI) value -= twoPi;
  return value;
}
