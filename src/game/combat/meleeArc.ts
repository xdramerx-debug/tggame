/** Anything that can be hit by a melee swing. */
export interface ArcTarget {
  readonly id: number;
  readonly x: number;
  readonly z: number;
  /** Horizontal body radius, metres. */
  readonly radius: number;
}

export interface ArcOptions {
  /** Reach from the attacker's centre, metres. */
  readonly range: number;
  /** Half of the swing cone, radians (90° total → `Math.PI / 4`). */
  readonly halfAngle: number;
}

/**
 * Targets inside a cone in front of the attacker.
 *
 * Forward follows the game convention used by `directionToYaw`: yaw 0 looks down
 * −Z, so `forward = (−sin(yaw), −cos(yaw))`. The target radius widens the cone
 * slightly, because a capsule whose edge is inside the arc should be hit even if
 * its centre is a few centimetres outside — on touch screens players aim with
 * the stick, not with a mouse.
 */
export function targetsInArc(
  origin: { x: number; z: number },
  yaw: number,
  targets: readonly ArcTarget[],
  options: ArcOptions,
): ArcTarget[] {
  const forwardX = -Math.sin(yaw);
  const forwardZ = -Math.cos(yaw);
  const hits: ArcTarget[] = [];

  for (const target of targets) {
    const dx = target.x - origin.x;
    const dz = target.z - origin.z;
    const distance = Math.hypot(dx, dz);
    if (distance > options.range + target.radius) continue;
    if (distance < 1e-4) {
      hits.push(target);
      continue;
    }
    const dot = (dx / distance) * forwardX + (dz / distance) * forwardZ;
    // Widen the arc by the angular size of the target at that distance.
    const angularSlack = Math.atan2(target.radius, Math.max(distance, 0.001));
    if (dot >= Math.cos(Math.min(Math.PI, options.halfAngle + angularSlack))) hits.push(target);
  }

  return hits;
}

/** Default swing: 2.6 m reach, 100° total cone. */
export const PLAYER_ARC: ArcOptions = { range: 2.6, halfAngle: (50 * Math.PI) / 180 };
