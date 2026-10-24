import { describe, expect, it } from 'vitest';
import { createRng } from '../../src/game/rng';
import {
  crateAmount, crateCount, CRATE_LABEL, CRATE_TABLE, CRATE_TOTAL_WEIGHT, rollCrate,
} from '../../src/game/loot';

const constRng = (v: number) => () => v;

describe('rollCrate', () => {
  it('границы таблицы весов', () => {
    expect(rollCrate(constRng(0))).toBe('money');
    expect(rollCrate(constRng(0.29))).toBe('money');
    expect(rollCrate(constRng(0.31))).toBe('parts');
    expect(rollCrate(constRng(0.999))).toBe('xp');
  });

  it('сумма весов = 100', () => {
    const sum = CRATE_TABLE.reduce((s, [, w]) => s + w, 0);
    expect(sum).toBe(CRATE_TOTAL_WEIGHT);
    expect(CRATE_TOTAL_WEIGHT).toBe(100);
  });

  it('на 20 000 бросков распределение ≈ весам (±3 п.п.)', () => {
    const rng = createRng(777);
    const counts: Record<string, number> = {};
    const n = 20000;
    for (let i = 0; i < n; i++) {
      const k = rollCrate(rng);
      counts[k] = (counts[k] ?? 0) + 1;
    }
    for (const [kind, weight] of CRATE_TABLE) {
      const frac = ((counts[kind] ?? 0) / n) * 100;
      expect(Math.abs(frac - weight)).toBeLessThan(3);
    }
  });
});

describe('crateAmount', () => {
  it('деньги растут с волной, детали 1..3', () => {
    const r = createRng(5);
    for (let i = 0; i < 200; i++) {
      const m1 = crateAmount('money', constRng(0.5), 1);
      expect(m1).toBe(120);
      expect(crateAmount('money', constRng(0.5), 6)).toBeGreaterThan(m1);
      const p = crateAmount('parts', r, 3);
      expect(p).toBeGreaterThanOrEqual(1);
      expect(p).toBeLessThanOrEqual(3);
    }
  });

  it('фиксированные количества', () => {
    expect(crateAmount('ammo', constRng(0.1), 2)).toBe(90);
    expect(crateAmount('armor', constRng(0.1), 2)).toBe(30);
    expect(crateAmount('medkit', constRng(0.1), 2)).toBe(1);
    expect(crateAmount('grenade', constRng(0.1), 2)).toBe(2);
    expect(crateAmount('grenade', constRng(0.5), 2)).toBe(1);
    const xp = crateAmount('xp', constRng(0.5), 2);
    expect(xp).toBe(65);
  });
});

describe('crateCount / labels', () => {
  it('ящиков больше на поздних волнах, потолок 12', () => {
    expect(crateCount(1)).toBe(6);
    expect(crateCount(4)).toBe(8);
    expect(crateCount(12)).toBe(12);
    expect(crateCount(40)).toBe(12);
  });

  it('метки есть для всех видов', () => {
    for (const [kind] of CRATE_TABLE) {
      expect(CRATE_LABEL[kind].length).toBeGreaterThan(0);
    }
  });
});
