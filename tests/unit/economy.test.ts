import { describe, expect, it } from 'vitest';
import {
  AMMO_REFILL, ARMOR_ADD, effectiveWeapon, killMoney, killScore, killXp,
  PRICES, START_MONEY, TUNING_COSTS, TUNING_MAX, tuningCost,
} from '../../src/game/economy';

describe('economy basics', () => {
  it('стартовые деньги и цены положительны', () => {
    expect(START_MONEY).toBe(800);
    expect(PRICES.armor).toBe(650);
    expect(PRICES.grenade).toBe(300);
    expect(PRICES.medkit).toBe(250);
    expect(PRICES.ammo).toBe(150);
    expect(ARMOR_ADD).toBe(50);
    expect(AMMO_REFILL).toBe(120);
  });

  it('награды за убийства соответствуют таблице врагов', () => {
    expect(killMoney('grunt')).toBe(120);
    expect(killXp('titan')).toBe(200);
    expect(killScore('sniper')).toBe(300);
    expect(killMoney('spitter')).toBeGreaterThan(killMoney('rifleman'));
  });
});

describe('tuningCost', () => {
  it('тиры 0..2 стоят денег и деталей, выше — null', () => {
    expect(tuningCost(0)).toEqual({ money: 300, parts: 2 });
    expect(tuningCost(1)).toEqual({ money: 700, parts: 4 });
    expect(tuningCost(2)).toEqual({ money: 1400, parts: 7 });
    expect(tuningCost(TUNING_MAX)).toBeNull();
    expect(tuningCost(-1)).toBeNull();
    expect(TUNING_COSTS.length).toBe(TUNING_MAX);
  });

  it('стоимость растёт по тирам', () => {
    for (let t = 1; t < TUNING_MAX; t++) {
      const a = tuningCost(t - 1);
      const b = tuningCost(t);
      expect(b?.money ?? 0).toBeGreaterThan(a?.money ?? 0);
      expect(b?.parts ?? 0).toBeGreaterThan(a?.parts ?? 0);
    }
  });
});

describe('effectiveWeapon', () => {
  it('тир 0 = базовые характеристики', () => {
    const w = effectiveWeapon('pistol', 0);
    expect(w.dmg).toBe(26);
    expect(w.mag).toBe(12);
    expect(w.spreadRad).toBeCloseTo(0.012);
    expect(w.reloadTime).toBeCloseTo(1.2);
    expect(w.tier).toBe(0);
  });

  it('тир 3: +24% урона, +36% магазина, −36% разброса, −12% перезарядки', () => {
    const w = effectiveWeapon('rifle', 3);
    expect(w.tier).toBe(3);
    expect(w.dmg).toBeCloseTo(38.4);
    expect(w.mag).toBe(41);
    expect(w.spreadRad).toBeCloseTo(0.015 * 0.64);
    expect(w.reloadTime).toBeCloseTo(2.05 * 0.88);
  });

  it('тир clamp-ится в 0..3', () => {
    expect(effectiveWeapon('smg', 99).tier).toBe(3);
    expect(effectiveWeapon('smg', -5).tier).toBe(0);
    expect(effectiveWeapon('shotgun', 1.9).tier).toBe(1);
  });

  it('разброс не падает ниже 50% базы', () => {
    const base = effectiveWeapon('sniper', 0).spreadRad;
    expect(effectiveWeapon('sniper', 3).spreadRad).toBeCloseTo(base * 0.64);
  });
});
