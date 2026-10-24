import { describe, expect, it } from 'vitest';
import { createRng, pick, randRange, seedFromTime } from '../../src/game/rng';

describe('createRng (mulberry32)', () => {
  it('детерминирован: один сид → одна последовательность', () => {
    const a = createRng(123);
    const b = createRng(123);
    for (let i = 0; i < 50; i++) expect(a()).toBe(b());
  });

  it('разные сиды → разные последовательности', () => {
    const a = createRng(1);
    const b = createRng(2);
    expect(a()).not.toBe(b());
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

describe('randRange / pick', () => {
  it('randRange держится в границах', () => {
    const r = createRng(7);
    for (let i = 0; i < 500; i++) {
      const v = randRange(r, -3, 5);
      expect(v).toBeGreaterThanOrEqual(-3);
      expect(v).toBeLessThanOrEqual(5);
    }
  });

  it('pick возвращает элемент списка', () => {
    const r = createRng(9);
    const list = ['a', 'b', 'c'] as const;
    for (let i = 0; i < 100; i++) expect(list).toContain(pick(r, list));
  });
});
