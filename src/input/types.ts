/**
 * Shared 2D vector used by the input layer (screen space, y grows downwards).
 * Kept structural so it can be passed to Three.js helpers without copying.
 */
export interface Vec2 {
  x: number;
  y: number;
}

/** Normalized analog stick output, camera space: y=+1 is "forward" (away from camera). */
export interface MoveInput {
  /** −1 (left) … +1 (right) relative to the camera. */
  x: number;
  /** −1 (backwards) … +1 (forwards) relative to the camera. */
  y: number;
  /** 0…1 analog magnitude after the dead zone. */
  magnitude: number;
}

export const ZERO_MOVE: MoveInput = { x: 0, y: 0, magnitude: 0 };

/** Gameplay actions a touch can produce. */
export type InputAction = 'attack' | 'skill1' | 'skill2' | 'dodge' | 'interact';

/** Snapshot of what the scene can offer right now (drives the interact button). */
export interface InteractionHint {
  readonly available: boolean;
  readonly label: string;
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
