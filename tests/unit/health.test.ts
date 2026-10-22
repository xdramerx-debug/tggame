import { describe, expect, it } from 'vitest';
import { Health } from '@/game/combat/Health';

describe('Health', () => {
  it('starts full and never exceeds the maximum on heal', () => {
    const health = new Health(50, 0);
    expect(health.hp).toBe(50);
    expect(health.heal(30)).toBe(0);
    health.damage(20);
    expect(health.hp).toBe(30);
    expect(health.heal(100)).toBe(20);
    expect(health.hp).toBe(50);
  });

  it('applies diminishing-returns armour with a 20 % floor', () => {
    // armor 50 → half of the raw damage gets through.
    const armored = new Health(100, 50);
    expect(armored.damage(40).applied).toBeCloseTo(20, 5);

    // A huge armour value is clamped by the 20 % minimum damage rule.
    const tank = new Health(100, 100000);
    expect(tank.damage(40).applied).toBeCloseTo(8, 5);
  });

  it('exposes mitigation without mutating the pool', () => {
    const health = new Health(100, 25);
    const preview = health.mitigated(30);
    expect(preview).toBeCloseTo(30 * (1 - 25 / 75), 5);
    expect(health.hp).toBe(100);
    expect(health.mitigated(0)).toBe(0);
    expect(health.mitigated(-5)).toBe(0);
  });

  it('clamps the applied damage to the remaining health', () => {
    const health = new Health(30, 0);
    const result = health.damage(100);
    expect(result.applied).toBe(30);
    expect(result.raw).toBe(100);
  });

  it('drops a hit entirely while invulnerable', () => {
    const health = new Health(100, 0);
    health.grantIFrames(0.3);
    const blocked = health.damage(20);
    expect(blocked.applied).toBe(0);
    expect(blocked.blocked).toBe(true);
    expect(health.hp).toBe(100);

    health.tick(0.31);
    expect(health.invulnerable).toBe(false);
    expect(health.damage(20).applied).toBeGreaterThan(0);
  });

  it('never drops below zero and reports the killing hit', () => {
    const health = new Health(10, 0);
    const result = health.damage(25);
    expect(result.killed).toBe(true);
    expect(health.hp).toBe(0);
    expect(health.isDead).toBe(true);
    expect(health.damage(5).applied).toBe(0);
  });

  it('ignores direct damage on a dead pool but keeps the flag', () => {
    const health = new Health(5, 0);
    health.damageDirect(99);
    const after = health.damageDirect(99);
    expect(after.killed).toBe(false);
    expect(health.hp).toBe(0);
  });

  it('reset restores hp and clears i-frames', () => {
    const health = new Health(40, 0);
    health.damage(40);
    health.grantIFrames(1);
    health.reset();
    expect(health.hp).toBe(40);
    expect(health.invulnerable).toBe(false);
  });

  it('rejects a non-positive maximum', () => {
    expect(() => new Health(0)).toThrow();
  });
});
