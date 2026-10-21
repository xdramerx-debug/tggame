/** Dimensions of the player/monster capsule, metres. */
export interface CapsuleDimensions {
  /** Half-height of the cylindrical section (total height = 2·halfHeight + 2·radius). */
  readonly halfHeight: number;
  readonly radius: number;
}

export const PLAYER_CAPSULE: CapsuleDimensions = { halfHeight: 0.55, radius: 0.35 };

export const MONSTER_CAPSULE: CapsuleDimensions = { halfHeight: 0.4, radius: 0.3 };

/** Total standing height of a capsule. */
export function capsuleHeight(dimensions: CapsuleDimensions): number {
  return dimensions.halfHeight * 2 + dimensions.radius * 2;
}

/**
 * Y offset from the *feet* (mesh origin) to the capsule centre.
 * Three.js models use the feet as pivot, Rapier positions bodies by their centre.
 */
export function capsuleCentreOffset(dimensions: CapsuleDimensions): number {
  return dimensions.halfHeight + dimensions.radius;
}

/** Converts a world position of the feet into the physics body translation. */
export function feetToBodyCenter(
  feet: { x: number; y: number; z: number },
  dimensions: CapsuleDimensions,
): { x: number; y: number; z: number } {
  return { x: feet.x, y: feet.y + capsuleCentreOffset(dimensions), z: feet.z };
}

/** Converts a physics body translation back into the feet position for rendering. */
export function bodyCenterToFeet(
  center: { x: number; y: number; z: number },
  dimensions: CapsuleDimensions,
): { x: number; y: number; z: number } {
  return { x: center.x, y: center.y - capsuleCentreOffset(dimensions), z: center.z };
}
