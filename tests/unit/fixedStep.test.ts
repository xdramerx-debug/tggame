import { describe, expect, it } from 'vitest';
import { FixedStepAccumulator } from '@/game/physics/FixedStep';
import {
  PLAYER_CAPSULE,
  bodyCenterToFeet,
  capsuleCentreOffset,
  capsuleHeight,
  feetToBodyCenter,
} from '@/game/physics/capsule';

describe('FixedStepAccumulator', () => {
  it('runs one step per 1/60 s of accumulated time', () => {
    const accumulator = new FixedStepAccumulator();
    expect(accumulator.advance(1 / 60)).toBe(1);
    expect(accumulator.advance(1 / 120)).toBe(0);
    expect(accumulator.advance(1 / 120)).toBe(1);
  });

  it('supports 60 Hz and 120 Hz display refresh without drift', () => {
    const accumulator = new FixedStepAccumulator();
    let steps = 0;
    for (let i = 0; i < 600; i += 1) steps += accumulator.advance(1 / 120);
    // 5 seconds of 120 Hz frames = 5 s of simulation = 300 fixed steps.
    expect(steps).toBeGreaterThanOrEqual(299);
    expect(steps).toBeLessThanOrEqual(300);
  });

  it('caps substeps per frame and reports dropped time', () => {
    const accumulator = new FixedStepAccumulator({ maxSteps: 4 });
    const steps = accumulator.advance(1);
    expect(steps).toBe(4);
    expect(accumulator.droppedTime).toBeGreaterThan(0);
  });

  it('ignores invalid deltas and exposes interpolation alpha', () => {
    const accumulator = new FixedStepAccumulator();
    expect(accumulator.advance(0)).toBe(0);
    expect(accumulator.advance(-1)).toBe(0);
    expect(accumulator.advance(Number.NaN)).toBe(0);
    accumulator.advance(1 / 120);
    expect(accumulator.alpha).toBeCloseTo(0.5, 5);
  });

  it('resets on demand (pause/resume must not catch up)', () => {
    const accumulator = new FixedStepAccumulator();
    accumulator.advance(1 / 120);
    accumulator.reset();
    expect(accumulator.alpha).toBe(0);
    expect(accumulator.droppedTime).toBe(0);
  });
});

describe('capsule geometry', () => {
  it('player capsule is 1.8 m tall with a 0.9 m centre offset', () => {
    expect(capsuleHeight(PLAYER_CAPSULE)).toBeCloseTo(1.8, 5);
    expect(capsuleCentreOffset(PLAYER_CAPSULE)).toBeCloseTo(0.9, 5);
  });

  it('round-trips feet ↔ body centre', () => {
    const feet = { x: 1, y: 0, z: -2 };
    const center = feetToBodyCenter(feet, PLAYER_CAPSULE);
    expect(center.y).toBeCloseTo(0.9, 5);
    expect(bodyCenterToFeet(center, PLAYER_CAPSULE)).toEqual(feet);
  });
});
