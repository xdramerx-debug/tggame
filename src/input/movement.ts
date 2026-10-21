import type { Vec2 } from './types';

/**
 * Converts analog stick input (camera space) into a world-space XZ direction.
 *
 * Pure math, shared by the player controller: strafing must follow the camera
 * yaw, not the model orientation, otherwise diagonal movement drifts.
 *
 * @param inputX −1 left … +1 right relative to the camera
 * @param inputY −1 backwards … +1 forwards relative to the camera
 * @param yaw camera yaw in radians (0 = looking down −Z)
 * @returns unit-length world direction on the XZ plane
 */
export function cameraRelativeMove(inputX: number, inputY: number, yaw: number): Vec2 {
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  // forward = (-sin(yaw), -cos(yaw)), right = (cos(yaw), -sin(yaw))
  const x = inputX * cos - inputY * sin;
  const z = inputX * -sin - inputY * cos;
  const length = Math.hypot(x, z);
  if (length < 1e-6) return { x: 0, y: 0 };
  return { x: x / length, y: z / length };
}

/** Scales a stick vector so diagonal input never exceeds unit length. */
export function clampStick(x: number, y: number): { x: number; y: number; magnitude: number } {
  const length = Math.hypot(x, y);
  if (length <= 1) return { x, y, magnitude: length };
  return { x: x / length, y: y / length, magnitude: 1 };
}

/**
 * Angle (radians) of a world-space XZ direction, using the game's forward = −Z
 * convention so a Three.js object can be rotated with `rotation.y = angle`.
 */
export function directionToYaw(direction: Vec2): number {
  return Math.atan2(-direction.x, -direction.y);
}

/** Shortest signed angular difference from `from` to `to`, in (−π, π]. */
export function shortestAngleDelta(from: number, to: number): number {
  const twoPi = Math.PI * 2;
  let delta = (to - from) % twoPi;
  if (delta > Math.PI) delta -= twoPi;
  if (delta <= -Math.PI) delta += twoPi;
  return delta;
}
