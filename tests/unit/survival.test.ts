import { describe, expect, it } from 'vitest';
import { SURVIVAL_CONFIG, Survival } from '@/game/survival/Survival';

const STEP = 1 / 60;

/** Runs the clock until satiety drops below `threshold`, at most 30 minutes. */
function starveUntil(target: 'hungry' | 'starving'): Survival {
  const survival = new Survival();
  const limit = Math.round(30 * 60 / STEP);
  for (let i = 0; i < limit; i += 1) {
    if (survival.tier === target) return survival;
    survival.tick(STEP, false);
  }
  throw new Error(`never reached ${target}`);
}

describe('Survival', () => {
  it('starts full enough to explore for a few minutes', () => {
    const survival = new Survival();
    expect(survival.satiety).toBe(SURVIVAL_CONFIG.satiety.start);
    expect(survival.tier).toBe('fed');
    expect(survival.isStarving).toBe(false);
    expect(survival.elapsed).toBe(0);
  });

  it('drains over time and faster while moving', () => {
    const standing = new Survival();
    const running = new Survival();
    for (let i = 0; i < 60 * 10; i += 1) {
      standing.tick(STEP, false);
      running.tick(STEP, true);
    }
    expect(standing.satiety).toBeCloseTo(SURVIVAL_CONFIG.satiety.start - 10 * SURVIVAL_CONFIG.satiety.drainPerSecond, 1);
    expect(running.satiety).toBeLessThan(standing.satiety);
    expect(standing.elapsed).toBeCloseTo(10, 3);
  });

  it('reaches hungry and then starving without ever going negative', () => {
    const hungry = starveUntil('hungry');
    expect(hungry.tier).toBe('hungry');
    expect(hungry.satiety).toBeLessThanOrEqual(SURVIVAL_CONFIG.satiety.hungryBelow);

    const starving = starveUntil('starving');
    expect(starving.tier).toBe('starving');
    for (let i = 0; i < 60 * 60; i += 1) starving.tick(STEP, true);
    expect(starving.satiety).toBe(0);
  });

  it('scales stamina regen and damage per tier', () => {
    expect(new Survival().modifiers).toEqual({ regen: 1, damage: 1 });

    const hungry = starveUntil('hungry');
    expect(hungry.modifiers.regen).toBe(SURVIVAL_CONFIG.modifiers.hungryRegen);
    expect(hungry.modifiers.damage).toBe(SURVIVAL_CONFIG.modifiers.hungryDamage);

    const starving = starveUntil('starving');
    expect(starving.modifiers.regen).toBe(SURVIVAL_CONFIG.modifiers.starvingRegen);
    expect(starving.modifiers.damage).toBe(SURVIVAL_CONFIG.modifiers.starvingDamage);
  });

  it('only drains health while starving', () => {
    const fed = new Survival();
    expect(fed.tick(1, false)).toBe(0);

    const starving = starveUntil('starving');
    const drained = starving.tick(1, false);
    expect(drained).toBeCloseTo(SURVIVAL_CONFIG.satiety.starvingHpDrain, 5);
  });

  it('eating restores satiety and stops the damage', () => {
    const starving = starveUntil('starving');
    const restored = starving.eat();
    expect(restored).toBeGreaterThan(0);
    expect(starving.tier).not.toBe('starving');
    expect(starving.tick(1, false)).toBe(0);
  });

  it('never overfeeds past the maximum', () => {
    const survival = new Survival();
    expect(survival.addSatiety(1000)).toBeCloseTo(survival.maxSatiety - SURVIVAL_CONFIG.satiety.start, 5);
    expect(survival.satiety).toBe(survival.maxSatiety);
    expect(survival.eat()).toBe(0);
  });

  it('resets for a new run', () => {
    const survival = starveUntil('starving');
    survival.reset();
    expect(survival.satiety).toBe(SURVIVAL_CONFIG.satiety.start);
    expect(survival.elapsed).toBe(0);
    expect(survival.tier).toBe('fed');
  });

  it('keeps the tuning sane (a run is minutes, not seconds)', () => {
    const secondsToStarve =
      SURVIVAL_CONFIG.satiety.start / (SURVIVAL_CONFIG.satiety.drainPerSecond + SURVIVAL_CONFIG.satiety.drainWhileMoving);
    expect(secondsToStarve).toBeGreaterThan(60);
    expect(secondsToStarve).toBeLessThan(600);
    expect(SURVIVAL_CONFIG.rations.restore).toBeGreaterThan(0);
    expect(SURVIVAL_CONFIG.campfire.safeRadius).toBeGreaterThan(SURVIVAL_CONFIG.campfire.range);
  });
});
