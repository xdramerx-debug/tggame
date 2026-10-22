import { describe, expect, it } from 'vitest';
import { PLAYER_ARC, targetsInArc } from '@/game/combat/meleeArc';
import type { ArcTarget } from '@/game/combat/meleeArc';

function target(id: number, x: number, z: number, radius = 0.35): ArcTarget {
  return { id, x, z, radius };
}

describe('targetsInArc', () => {
  // yaw 0 looks down −Z, so a target at (0, -2) is straight ahead.
  it('hits a target straight ahead and ignores one behind', () => {
    const hits = targetsInArc({ x: 0, z: 0 }, 0, [target(1, 0, -2), target(2, 0, 2)], PLAYER_ARC);
    expect(hits.map((hit) => hit.id)).toEqual([1]);
  });

  it('respects the reach including the target radius', () => {
    const far = targetsInArc({ x: 0, z: 0 }, 0, [target(1, 0, -3.2, 0.35)], { range: 2.6, halfAngle: 0.9 });
    expect(far).toHaveLength(0);
    const edge = targetsInArc({ x: 0, z: 0 }, 0, [target(1, 0, -2.8, 0.35)], { range: 2.6, halfAngle: 0.9 });
    expect(edge).toHaveLength(1);
  });

  it('follows the attacker yaw', () => {
    // yaw = -90° looks down +X.
    const right = targetsInArc({ x: 0, z: 0 }, -Math.PI / 2, [target(1, 2, 0)], { range: 2.6, halfAngle: 0.3 });
    expect(right).toHaveLength(1);
    const wrongWay = targetsInArc({ x: 0, z: 0 }, -Math.PI / 2, [target(1, -2, 0)], { range: 2.6, halfAngle: 0.3 });
    expect(wrongWay).toHaveLength(0);
  });

  it('widens the cone by the angular size of the target', () => {
    // 60° off centre, outside a 50° half-angle cone, but a big body reaches in.
    const angle = (60 * Math.PI) / 180;
    const x = Math.sin(angle) * 2;
    const z = -Math.cos(angle) * 2;
    expect(targetsInArc({ x: 0, z: 0 }, 0, [target(1, x, z, 0.1)], PLAYER_ARC)).toHaveLength(0);
    expect(targetsInArc({ x: 0, z: 0 }, 0, [target(1, x, z, 0.8)], PLAYER_ARC)).toHaveLength(1);
  });

  it('hits overlapping targets and keeps input order', () => {
    const hits = targetsInArc(
      { x: 0, z: 0 },
      0,
      [target(3, -0.4, -1.2), target(4, 0.4, -1.4)],
      PLAYER_ARC,
    );
    expect(hits.map((hit) => hit.id)).toEqual([3, 4]);
  });

  it('handles a target standing exactly on the attacker', () => {
    expect(targetsInArc({ x: 1, z: 1 }, 1.2, [target(1, 1, 1)], PLAYER_ARC)).toHaveLength(1);
  });
});
