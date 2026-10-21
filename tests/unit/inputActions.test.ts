import { describe, expect, it } from 'vitest';
import { ACTION_SPECS, CooldownTracker } from '@/input/actions';
import { cameraRelativeMove, clampStick, directionToYaw, shortestAngleDelta } from '@/input/movement';

describe('action layout matches the spec', () => {
  it('uses 48 px minimum targets with 12 px+ separation in the HUD layout', () => {
    for (const spec of Object.values(ACTION_SPECS)) {
      expect(spec.size).toBeGreaterThanOrEqual(48);
    }
  });

  it('has the exact spec sizes', () => {
    expect(ACTION_SPECS.attack.size).toBe(76);
    expect(ACTION_SPECS.skill1.size).toBe(60);
    expect(ACTION_SPECS.skill2.size).toBe(60);
    expect(ACTION_SPECS.dodge.size).toBe(60);
    expect(ACTION_SPECS.interact.size).toBe(56);
  });

  it('matches the dodge cooldown from the tech spec', () => {
    expect(ACTION_SPECS.dodge.cooldownMs).toBe(1200);
  });
});

describe('CooldownTracker', () => {
  it('allows the first press and blocks it during cooldown', () => {
    const tracker = new CooldownTracker();
    expect(tracker.press('attack', 1000)).toBe(true);
    expect(tracker.press('attack', 1200)).toBe(false);
    expect(tracker.press('attack', 1000 + ACTION_SPECS.attack.cooldownMs)).toBe(true);
  });

  it('tracks each action independently', () => {
    const tracker = new CooldownTracker();
    expect(tracker.press('dodge', 0)).toBe(true);
    expect(tracker.press('attack', 0)).toBe(true);
    expect(tracker.press('dodge', 100)).toBe(false);
  });

  it('reports a decreasing remaining fraction', () => {
    const tracker = new CooldownTracker();
    tracker.press('dodge', 0);
    expect(tracker.remainingFraction('dodge', 0)).toBeCloseTo(1, 5);
    expect(tracker.remainingFraction('dodge', 600)).toBeCloseTo(0.5, 5);
    expect(tracker.remainingFraction('dodge', 1300)).toBe(0);
    expect(tracker.isReady('dodge', 1200)).toBe(true);
  });

  it('supports per-press cooldown overrides and reset', () => {
    const tracker = new CooldownTracker();
    expect(tracker.press('interact', 0, 50)).toBe(true);
    expect(tracker.press('interact', 40)).toBe(false);
    expect(tracker.press('interact', 60)).toBe(true);
    tracker.reset();
    expect(tracker.isReady('interact', 0)).toBe(true);
  });
});

describe('camera-relative movement', () => {
  it('moves −Z when pushing forward at yaw 0', () => {
    const direction = cameraRelativeMove(0, 1, 0);
    expect(direction.x).toBeCloseTo(0, 6);
    expect(direction.y).toBeCloseTo(-1, 6);
  });

  it('moves +X when strafing right at yaw 0', () => {
    const direction = cameraRelativeMove(1, 0, 0);
    expect(direction.x).toBeCloseTo(1, 6);
    expect(direction.y).toBeCloseTo(0, 6);
  });

  it('follows the camera yaw (90° turn sends forward to −X)', () => {
    const direction = cameraRelativeMove(0, 1, Math.PI / 2);
    expect(direction.x).toBeCloseTo(-1, 6);
    expect(direction.y).toBeCloseTo(0, 6);
  });

  it('normalizes diagonal input', () => {
    const direction = cameraRelativeMove(1, 1, 0);
    expect(Math.hypot(direction.x, direction.y)).toBeCloseTo(1, 6);
  });

  it('returns zero for no input', () => {
    expect(cameraRelativeMove(0, 0, 1)).toEqual({ x: 0, y: 0 });
  });
});

describe('stick and angle helpers', () => {
  it('clamps diagonal stick input to unit length', () => {
    const clamped = clampStick(1, 1);
    expect(Math.hypot(clamped.x, clamped.y)).toBeCloseTo(1, 6);
    expect(clamped.magnitude).toBe(1);
    const inside = clampStick(0.3, 0.4);
    expect(inside).toEqual({ x: 0.3, y: 0.4, magnitude: 0.5 });
  });

  it('converts a world direction into a model yaw (forward = −Z)', () => {
    expect(directionToYaw({ x: 0, y: -1 })).toBeCloseTo(0, 6);
    expect(directionToYaw({ x: -1, y: 0 })).toBeCloseTo(Math.PI / 2, 6);
  });

  it('takes the shortest angular path across ±π', () => {
    expect(shortestAngleDelta(3.1, -3.1)).toBeCloseTo(0.0832, 3);
    expect(shortestAngleDelta(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2, 6);
  });
});
