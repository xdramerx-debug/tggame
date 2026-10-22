import { describe, expect, it } from 'vitest';
import { playerAttackProfile, rollDamage } from '@/game/combat/damage';

/** Deterministic roll source: yields the given numbers in order, then 0.5. */
function sequence(...values: number[]): () => number {
  let index = 0;
  return () => {
    const value = values[index] ?? 0.5;
    index += 1;
    return value;
  };
}

describe('rollDamage', () => {
  it('crits when the first roll is under the crit chance', () => {
    const result = rollDamage(playerAttackProfile(20, 0.25, 2), sequence(0.1, 0.5));
    expect(result.critical).toBe(true);
    // variance at 0.5 is exactly 1.0
    expect(result.raw).toBeCloseTo(40, 5);
  });

  it('does not crit at exactly the crit chance (strictly less than)', () => {
    const result = rollDamage(playerAttackProfile(20, 0.25, 2), sequence(0.25, 0.5));
    expect(result.critical).toBe(false);
    expect(result.raw).toBeCloseTo(20, 5);
  });

  it('jitters non-crit damage by ±10 %', () => {
    const low = rollDamage(playerAttackProfile(100, 0, 1.8), sequence(0.5, 0));
    const high = rollDamage(playerAttackProfile(100, 0, 1.8), sequence(0.5, 0.999999));
    expect(low.raw).toBeGreaterThanOrEqual(90);
    expect(low.raw).toBeLessThanOrEqual(91);
    expect(high.raw).toBeGreaterThanOrEqual(109);
    expect(high.raw).toBeLessThanOrEqual(110);
    expect(low.variance).toBeCloseTo(0.9, 5);
  });

  it('applies variance before the crit multiplier', () => {
    const result = rollDamage(playerAttackProfile(10, 1, 3), sequence(0, 0));
    expect(result.critical).toBe(true);
    expect(result.raw).toBeCloseTo(10 * 0.9 * 3, 5);
  });

  it('defaults the crit multiplier to 1.8', () => {
    expect(playerAttackProfile(10, 0.1).critMultiplier).toBe(1.8);
  });
});
