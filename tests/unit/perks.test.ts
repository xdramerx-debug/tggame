import { describe, expect, it } from 'vitest';
import {
  BRANCH_NAMES, canTakePerk, levelFromXp, PERK_BY_ID, PERK_DEFS,
  perkEffects, perkPointsAvailable, xpForLevel,
} from '../../src/game/perks';
import type { PerkId } from '../../src/game/types';

describe('XP curve', () => {
  it('xpForLevel растёт', () => {
    expect(xpForLevel(1)).toBe(120);
    expect(xpForLevel(2)).toBe(327);
    expect(xpForLevel(10)).toBeGreaterThan(xpForLevel(9));
  });

  it('levelFromXp: границы уровней точны', () => {
    expect(levelFromXp(0)).toEqual({ level: 1, into: 0, need: 120 });
    expect(levelFromXp(119)).toEqual({ level: 1, into: 119, need: 120 });
    expect(levelFromXp(120)).toEqual({ level: 2, into: 0, need: 327 });
    expect(levelFromXp(447)).toEqual({ level: 3, into: 0, need: xpForLevel(3) });
  });

  it('levelFromXp монотонен, into < need', () => {
    let prev = 0;
    for (let xp = 0; xp <= 20000; xp += 137) {
      const r = levelFromXp(xp);
      expect(r.level).toBeGreaterThanOrEqual(prev);
      expect(r.into).toBeLessThan(r.need);
      prev = r.level;
    }
  });

  it('отрицательный xp = уровень 1', () => {
    expect(levelFromXp(-50).level).toBe(1);
  });
});

describe('perk tree', () => {
  it('12 перков, 3 ветки по 4 тира', () => {
    expect(PERK_DEFS.length).toBe(12);
    for (const branch of ['sur', 'gun', 'mob'] as const) {
      const perks = PERK_DEFS.filter((p) => p.branch === branch);
      expect(perks.length).toBe(4);
      expect(perks.map((p) => p.tier)).toEqual([1, 2, 3, 4]);
      expect(BRANCH_NAMES[branch].length).toBeGreaterThan(0);
    }
  });

  it('requires ссылается на предыдущий тир своей ветки', () => {
    for (const p of PERK_DEFS) {
      if (p.tier === 1) {
        expect(p.requires).toBeNull();
      } else {
        const req = p.requires ? PERK_BY_ID[p.requires] : null;
        expect(req).not.toBeNull();
        expect(req?.branch).toBe(p.branch);
        expect(req?.tier).toBe(p.tier - 1);
      }
    }
  });

  it('canTakePerk уважает цепочку и дубликаты', () => {
    expect(canTakePerk([], 'sur1')).toBe(true);
    expect(canTakePerk([], 'sur2')).toBe(false);
    expect(canTakePerk(['sur1'], 'sur2')).toBe(true);
    expect(canTakePerk(['sur1'], 'sur1')).toBe(false);
    expect(canTakePerk(['gun1'], 'sur2')).toBe(false);
    expect(canTakePerk([], 'mob4')).toBe(false);
  });

  it('perkPointsAvailable = level-1 − потраченные', () => {
    expect(perkPointsAvailable({ xp: 0, perks: [] })).toBe(0);
    expect(perkPointsAvailable({ xp: 120, perks: [] })).toBe(1);
    expect(perkPointsAvailable({ xp: 120, perks: ['sur1'] })).toBe(0);
    expect(perkPointsAvailable({ xp: 100000, perks: [] })).toBeGreaterThan(5);
  });
});

describe('perkEffects', () => {
  it('без перков — базовые значения', () => {
    const fx = perkEffects([]);
    expect(fx.maxHpBonus).toBe(0);
    expect(fx.dmgMult).toBe(1);
    expect(fx.armorAbsorb).toBe(0.5);
    expect(fx.critChance).toBe(0);
    expect(fx.dashCd).toBe(0);
    expect(fx.startMedkit).toBe(false);
    expect(fx.grenadeBonus).toBe(0);
  });

  it('полное дерево даёт все бонусы', () => {
    const all = PERK_DEFS.map((p) => p.id);
    const fx = perkEffects(all);
    expect(fx.maxHpBonus).toBe(20);
    expect(fx.regenPerSec).toBe(0.8);
    expect(fx.armorAbsorb).toBe(0.65);
    expect(fx.armorBonus).toBe(25);
    expect(fx.medkitMult).toBe(1.6);
    expect(fx.startMedkit).toBe(true);
    expect(fx.dmgMult).toBe(1.1);
    expect(fx.reloadMult).toBe(0.85);
    expect(fx.headBonus).toBe(0.5);
    expect(fx.critChance).toBe(0.12);
    expect(fx.critMult).toBe(1.6);
    expect(fx.speedMult).toBe(1.08);
    expect(fx.crouchMult).toBe(1.5);
    expect(fx.dashCd).toBe(5);
    expect(fx.switchMult).toBe(0.6);
    expect(fx.grenadeBonus).toBe(1);
  });

  it('невалидные id игнорируются', () => {
    const fx = perkEffects(['bogus' as PerkId, 'sur1']);
    expect(fx.maxHpBonus).toBe(20);
    expect(fx.dmgMult).toBe(1);
  });
});
