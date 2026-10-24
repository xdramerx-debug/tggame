import { describe, expect, it } from 'vitest';
import {
  BANNER_S, EARLY_CALL_BONUS_PER_S, FIRST_SKIRMISH_S, INTERMISSION_S, MAX_ALIVE,
  waveComposition, waveMoneyBonus, waveXpBonus,
} from '../../src/game/waves';

describe('waveComposition', () => {
  it('волна 1 — только гренадиры-новички без баффов', () => {
    const c = waveComposition(1);
    expect(c.counts.grunt).toBe(4);
    expect(c.counts.rifleman).toBeUndefined();
    expect(c.total).toBe(4);
    expect(c.hpMult).toBeCloseTo(1);
    expect(c.dmgMult).toBeCloseTo(1);
    expect(c.spreadMult).toBeCloseTo(1);
    expect(c.spawnEvery).toBeCloseTo(1.73);
    expect(c.elite).toBe(false);
  });

  it('классы врагов открываются по волнам', () => {
    expect(waveComposition(2).counts.rifleman ?? 0).toBeGreaterThanOrEqual(0);
    expect(waveComposition(3).counts.rifleman).toBe(1);
    expect(waveComposition(4).counts.shotgunner).toBe(1);
    expect(waveComposition(6).counts.sniper).toBe(1);
  });

  it('каждая 5-я волна — элитная: титаны, плевун с 10-й', () => {
    expect(waveComposition(4).elite).toBe(false);
    const w5 = waveComposition(5);
    expect(w5.elite).toBe(true);
    expect(w5.counts.titan).toBe(1);
    expect(w5.counts.spitter).toBeUndefined();
    const w10 = waveComposition(10);
    expect(w10.counts.titan).toBe(2);
    expect(w10.counts.spitter).toBe(1);
  });

  it('total совпадает с суммой, состав не убывает и к 15-й волне заметно больше', () => {
    let prev = 0;
    for (let w = 1; w <= 15; w++) {
      const c = waveComposition(w);
      const sum = Object.values(c.counts).reduce((s, v) => s + v, 0);
      expect(c.total).toBe(sum);
      expect(c.total).toBeGreaterThanOrEqual(prev);
      prev = c.total;
    }
    expect(waveComposition(15).total).toBeGreaterThan(waveComposition(1).total * 3);
  });

  it('множители упираются в потолки', () => {
    expect(waveComposition(30).dmgMult).toBeCloseTo(2.2);
    expect(waveComposition(20).spreadMult).toBeCloseTo(0.6);
    expect(waveComposition(40).spawnEvery).toBeCloseTo(0.5);
  });

  it('hpMult растёт линейно', () => {
    expect(waveComposition(5).hpMult).toBeCloseTo(1.34);
  });

  it('константы темпа sane', () => {
    expect(MAX_ALIVE).toBe(10);
    expect(INTERMISSION_S).toBe(40);
    expect(FIRST_SKIRMISH_S).toBe(20);
    expect(BANNER_S).toBeGreaterThan(1);
    expect(EARLY_CALL_BONUS_PER_S).toBeGreaterThan(0);
  });

  it('бонусы за волну растут', () => {
    expect(waveMoneyBonus(1)).toBe(480);
    expect(waveMoneyBonus(5)).toBe(800);
    expect(waveXpBonus(1)).toBe(75);
    expect(waveXpBonus(5)).toBe(135);
    expect(waveMoneyBonus(0)).toBe(waveMoneyBonus(1));
  });
});
