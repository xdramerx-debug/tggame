import { describe, expect, it } from 'vitest';
import { createRng, pick, randInt, randRange, seedFromTime } from '../../src/game/rng';

describe('createRng (mulberry32)', () => {
  it('детерминирован: один сид → одна последовательность', () => {
    const a = createRng(123);
    const b = createRng(123);
    for (let i = 0; i < 50; i++) expect(a()).toBe(b());
  });

  it('разные сиды → разные последовательности', () => {
    expect(createRng(1)()).not.toBe(createRng(2)());
  });

  it('значения в [0, 1)', () => {
    const r = createRng(seedFromTime());
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('helpers', () => {
  it('randRange в границах', () => {
    const r = createRng(7);
    for (let i = 0; i < 300; i++) {
      const v = randRange(r, -3, 5);
      expect(v).toBeGreaterThanOrEqual(-3);
      expect(v).toBeLessThanOrEqual(5);
    }
  });

  it('randInt целые в границах, обе границы достижимы', () => {
    const r = createRng(11);
    const seen = new Set<number>();
    for (let i = 0; i < 500; i++) {
      const v = randInt(r, 1, 3);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(3);
      seen.add(v);
    }
    expect(seen.size).toBe(3);
  });

  it('pick возвращает элемент списка', () => {
    const r = createRng(9);
    const list = ['a', 'b', 'c'] as const;
    for (let i = 0; i < 100; i++) expect(list).toContain(pick(r, list));
  });
});
