import { describe, expect, it } from 'vitest';
import { COMBO_MAX_MULT, COMBO_WINDOW_S, comboMult, killScore, waveBonus } from '../../src/game/scoring';

describe('comboMult', () => {
  it('без комбо — ×1', () => {
    expect(comboMult(0)).toBe(1);
    expect(comboMult(-5)).toBe(1);
  });

  it('растёт на +0.1 за убийство', () => {
    expect(comboMult(1)).toBeCloseTo(1.1);
    expect(comboMult(5)).toBeCloseTo(1.5);
    expect(comboMult(10)).toBeCloseTo(2);
  });

  it('потолок ×3', () => {
    expect(comboMult(20)).toBe(COMBO_MAX_MULT);
    expect(comboMult(1000)).toBe(COMBO_MAX_MULT);
  });
});

describe('killScore', () => {
  it('базовые очки видов', () => {
    expect(killScore('walker', 0)).toBe(100);
    expect(killScore('runner', 0)).toBe(150);
    expect(killScore('brute', 0)).toBe(400);
  });

  it('комбо умножает и округляет', () => {
    expect(killScore('walker', 10)).toBe(200);
    expect(killScore('runner', 5)).toBe(225);
    expect(killScore('brute', 20)).toBe(1200);
  });
});

describe('waveBonus', () => {
  it('250 за волну, минимум за первую', () => {
    expect(waveBonus(1)).toBe(250);
    expect(waveBonus(7)).toBe(1750);
    expect(waveBonus(0)).toBe(250);
  });

  it('окно комбо положительное', () => {
    expect(COMBO_WINDOW_S).toBeGreaterThan(0);
  });
});
