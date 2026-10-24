import { beforeEach, describe, expect, it } from 'vitest';
import {
  addXp, DEFAULT_META, finishRun, loadMeta, SAVE_KEY, sanitizeMeta, saveMeta,
} from '../../src/game/save';
import type { MetaProgress } from '../../src/game/types';

const base = (): MetaProgress => ({ ...DEFAULT_META, perks: [] });

describe('sanitizeMeta', () => {
  it('мусор → дефолт', () => {
    expect(sanitizeMeta(null)).toEqual(base());
    expect(sanitizeMeta(42)).toEqual(base());
    expect(sanitizeMeta('str')).toEqual(base());
  });

  it('отсекает невалидные значения и перки вне цепочки', () => {
    const raw = { xp: -5, perks: ['sur2', 'sur1', 'bogus', 123, 'sur1'], bestWave: 2.7 };
    const m = sanitizeMeta(raw);
    expect(m.xp).toBe(0);
    expect(m.perks).toEqual(['sur1']);
    expect(m.bestWave).toBe(2);
  });

  it('валидная цепочка сохраняется целиком', () => {
    const raw = { xp: 1000, perks: ['gun1', 'gun2', 'mob1'], bestScore: 500, totalKills: 40, runs: 3 };
    const m = sanitizeMeta(raw);
    expect(m.perks).toEqual(['gun1', 'gun2', 'mob1']);
    expect(m.xp).toBe(1000);
    expect(m.runs).toBe(3);
  });
});

describe('localStorage round-trip', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('без сохранения → дефолт', () => {
    expect(loadMeta()).toEqual(base());
  });

  it('saveMeta → loadMeta без потерь', () => {
    const m: MetaProgress = { xp: 500, perks: ['sur1'], bestWave: 7, bestScore: 3000, totalKills: 120, runs: 4 };
    saveMeta(m);
    expect(loadMeta()).toEqual(m);
  });

  it('битый JSON → дефолт', () => {
    localStorage.setItem(SAVE_KEY, '{oops');
    expect(loadMeta()).toEqual(base());
  });
});

describe('addXp', () => {
  it('переход через уровень', () => {
    const r = addXp(base(), 120);
    expect(r.levelsGained).toBe(1);
    expect(r.meta.xp).toBe(120);
  });

  it('несколько уровней за раз', () => {
    const r = addXp(base(), 10000);
    expect(r.levelsGained).toBeGreaterThan(2);
  });

  it('без xp уровень не растёт, отрицательный amount игнорируется', () => {
    expect(addXp(base(), 0).levelsGained).toBe(0);
    expect(addXp(base(), -50).meta.xp).toBe(0);
  });

  it('не мутирует исходный объект', () => {
    const m = base();
    const r = addXp(m, 200);
    expect(m.xp).toBe(0);
    expect(r.meta).not.toBe(m);
  });
});

describe('finishRun', () => {
  it('обновляет рекорды и счётчики', () => {
    const m = finishRun(base(), 5, 2000, 80);
    expect(m).toEqual({ xp: 0, perks: [], bestWave: 5, bestScore: 2000, totalKills: 80, runs: 1 });
    const m2 = finishRun(m, 3, 5000, 20);
    expect(m2.bestWave).toBe(5);
    expect(m2.bestScore).toBe(5000);
    expect(m2.totalKills).toBe(100);
    expect(m2.runs).toBe(2);
  });
});
