import { describe, expect, it } from 'vitest';
import { NO_BONUSES, PLAYER_BASE, PlayerStats } from '@/game/player/PlayerStats';
import type { StatBonuses } from '@/game/player/PlayerStats';

const STEP = 1 / 60;

describe('PlayerStats', () => {
  it('starts full', () => {
    const stats = new PlayerStats();
    expect(stats.hp).toBe(PLAYER_BASE.maxHp);
    expect(stats.stamina).toBe(PLAYER_BASE.maxStamina);
    expect(stats.isDead).toBe(false);
  });

  it('refuses an action that costs more stamina than available', () => {
    const stats = new PlayerStats();
    expect(stats.spendStamina(PLAYER_BASE.attackStamina)).toBe(true);
    expect(stats.spendStamina(PLAYER_BASE.maxStamina)).toBe(false);
    expect(stats.stamina).toBe(PLAYER_BASE.maxStamina - PLAYER_BASE.attackStamina);
  });

  it('regenerates stamina only after the delay', () => {
    const stats = new PlayerStats();
    stats.spendStamina(40);
    const spent = stats.stamina;
    stats.tick(0.3);
    expect(stats.stamina).toBeCloseTo(spent, 5);

    for (let i = 0; i < 60; i += 1) stats.tick(STEP);
    expect(stats.stamina).toBeGreaterThan(spent);
    expect(stats.stamina).toBeLessThanOrEqual(PLAYER_BASE.maxStamina);
  });

  it('caps regeneration at the maximum', () => {
    const stats = new PlayerStats();
    for (let i = 0; i < 2000; i += 1) stats.tick(STEP);
    expect(stats.stamina).toBe(PLAYER_BASE.maxStamina);
  });

  it('grants post-hit i-frames so two enemies cannot chain-hit', () => {
    const stats = new PlayerStats();
    const first = stats.takeDamage(20);
    expect(first.applied).toBeGreaterThan(0);
    const second = stats.takeDamage(20);
    expect(second.blocked).toBe(true);
    expect(second.applied).toBe(0);

    for (let i = 0; i < 60; i += 1) stats.tick(STEP);
    expect(stats.takeDamage(20).applied).toBeGreaterThan(0);
  });

  it('mitigates with the player armour value', () => {
    const stats = new PlayerStats();
    const result = stats.takeDamage(30);
    const expected = 30 * (1 - PLAYER_BASE.armor / (PLAYER_BASE.armor + 50));
    expect(result.applied).toBeCloseTo(expected, 5);
  });

  it('dies at zero hp and reset restores everything', () => {
    const stats = new PlayerStats();
    for (let i = 0; i < 20; i += 1) {
      stats.takeDamage(100);
      for (let s = 0; s < 40; s += 1) stats.tick(STEP);
    }
    expect(stats.isDead).toBe(true);
    expect(stats.hp).toBe(0);

    stats.reset();
    expect(stats.hp).toBe(PLAYER_BASE.maxHp);
    expect(stats.stamina).toBe(PLAYER_BASE.maxStamina);
    expect(stats.isDead).toBe(false);
    expect(stats.invulnerable).toBe(false);
  });

  it('rolls attacks through the shared damage profile', () => {
    const stats = new PlayerStats();
    const guaranteedCrit = stats.rollAttack(() => 0);
    expect(guaranteedCrit.critical).toBe(true);
    expect(guaranteedCrit.raw).toBeGreaterThan(PLAYER_BASE.attackDamage);

    const plain = stats.rollAttack(() => 0.99);
    expect(plain.critical).toBe(false);
    expect(plain.raw).toBeGreaterThan(PLAYER_BASE.attackDamage);
  });

  it('folds equipment into damage, armour, hp, stamina and crit', () => {
    const stats = new PlayerStats();
    const bonuses: StatBonuses = {
      damage: 15,
      armor: 10,
      maxHp: 25,
      stamina: 20,
      critChance: 0.06,
      critMultiplier: 0.2,
    };
    stats.applyBonuses(bonuses);

    expect(stats.attack.damage).toBe(PLAYER_BASE.attackDamage + 15);
    expect(stats.attack.critChance).toBeCloseTo(PLAYER_BASE.critChance + 0.06, 5);
    expect(stats.attack.critMultiplier).toBeCloseTo(PLAYER_BASE.critMultiplier + 0.2, 5);
    expect(stats.maxHp).toBe(PLAYER_BASE.maxHp + 25);
    expect(stats.hp).toBe(PLAYER_BASE.maxHp + 25);
    expect(stats.armor).toBe(PLAYER_BASE.armor + 10);
    expect(stats.maxStamina).toBe(PLAYER_BASE.maxStamina + 20);
  });

  it('clamps stamina and current hp when equipment is removed', () => {
    const stats = new PlayerStats();
    stats.applyBonuses({ ...NO_BONUSES, maxHp: 40, stamina: 30 });
    // Spend everything, then take damage, then strip the gear.
    for (let i = 0; i < 20; i += 1) stats.spendStamina(10);
    stats.takeDamage(200);
    stats.applyBonuses(NO_BONUSES);

    expect(stats.maxHp).toBe(PLAYER_BASE.maxHp);
    expect(stats.hp).toBeLessThanOrEqual(PLAYER_BASE.maxHp);
    expect(stats.stamina).toBeLessThanOrEqual(PLAYER_BASE.maxStamina);
  });

  it('caps crit chance at 100 % when gear stacks', () => {
    const stats = new PlayerStats();
    stats.applyBonuses({ ...NO_BONUSES, critChance: 5 });
    expect(stats.attack.critChance).toBe(1);
  });

  it('heals without exceeding the maximum', () => {
    const stats = new PlayerStats();
    stats.takeDamage(100);
    for (let s = 0; s < 40; s += 1) stats.tick(STEP);
    expect(stats.hp).toBeLessThan(PLAYER_BASE.maxHp);
    stats.heal(500);
    expect(stats.hp).toBe(PLAYER_BASE.maxHp);
  });
});
