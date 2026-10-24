import { describe, expect, it } from 'vitest';
import { INTERMISSION_S, MAX_ZOMBIES_ALIVE, waveComposition, waveSpawnSpan } from '../../src/game/waves';

describe('waveComposition', () => {
  it('волна 1 — только ходячие, без баффов', () => {
    const c = waveComposition(1);
    expect(c.walkers).toBe(5);
    expect(c.runners).toBe(0);
    expect(c.brutes).toBe(0);
    expect(c.total).toBe(5);
    expect(c.hpMult).toBeCloseTo(1);
    expect(c.speedMult).toBeCloseTo(1);
    expect(c.spawnEvery).toBeCloseTo(1.52);
  });

  it('бегуны появляются с волны 3, громилы — с волны 4', () => {
    // runners = floor((N-1)*0.9): на волне 2 ещё 0, на волне 3 уже 1
    expect(waveComposition(2).runners).toBe(0);
    expect(waveComposition(3).runners).toBeGreaterThan(0);
    // brutes = floor((N-2)/2): на волне 3 ещё 0, на волне 4 уже 1
    expect(waveComposition(3).brutes).toBe(0);
    expect(waveComposition(4).brutes).toBeGreaterThan(0);
  });

  it('состав монотонно растёт', () => {
    let prev = waveComposition(1).total;
    for (let w = 2; w <= 15; w++) {
      const c = waveComposition(w).total;
      expect(c).toBeGreaterThan(prev);
      prev = c;
    }
  });

  it('hpMult растёт линейно, speedMult упирается в потолок 1.35', () => {
    expect(waveComposition(5).hpMult).toBeCloseTo(1.36);
    expect(waveComposition(30).speedMult).toBeCloseTo(1.35);
    expect(waveComposition(100).speedMult).toBeLessThanOrEqual(1.35);
  });

  it('spawnEvery не падает ниже 0.45 c', () => {
    expect(waveComposition(50).spawnEvery).toBeCloseTo(0.45);
  });

  it('total совпадает с суммой видов', () => {
    for (const w of [1, 4, 9, 20]) {
      const c = waveComposition(w);
      expect(c.total).toBe(c.walkers + c.runners + c.brutes);
    }
  });

  it('волна ≤ 0 нормализуется к 1', () => {
    expect(waveComposition(0).total).toBe(waveComposition(1).total);
    expect(waveComposition(-3).total).toBe(waveComposition(1).total);
  });

  it('константы темпа положительны, spawn-span растёт', () => {
    expect(MAX_ZOMBIES_ALIVE).toBeGreaterThan(0);
    expect(INTERMISSION_S).toBeGreaterThan(0);
    expect(waveSpawnSpan(10)).toBeGreaterThan(waveSpawnSpan(1));
  });
});
