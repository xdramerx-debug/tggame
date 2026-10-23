import { describe, expect, it } from 'vitest';
import {
  buildAllyUnits,
  castAstralMeteorStrike,
  getFactionMultiplier,
  simulateFullBattle,
  stepBattleTurn,
} from '@/game/combat';
import { performSummonBatch } from '@/game/gacha';
import {
  computeFactionAura,
  computeHeroStats,
  formatCompactNumber,
  getAscendShardCost,
  getHeroTemplate,
  getLevelUpCost,
  getRelicUpgradeCost,
  HERO_ROSTER,
} from '@/game/heroes';
import { buildStageDefinition, buildTowerFloor } from '@/game/stages';
import type { OwnedHero, RelicLevels } from '@/game/types';

const ZERO_RELICS: RelicLevels = { valor: 0, vitality: 0, precision: 0, wisdom: 0 };

describe('Hero Roster, Synergies & Progression Math', () => {
  it('defines 12 unique heroes with valid stats and skills', () => {
    expect(HERO_ROSTER.length).toBe(12);
    const ids = new Set(HERO_ROSTER.map((h) => h.id));
    expect(ids.size).toBe(12);

    for (const hero of HERO_ROSTER) {
      expect(getHeroTemplate(hero.id).name).toBe(hero.name);
      expect(hero.baseHp).toBeGreaterThan(500);
      expect(hero.baseAtk).toBeGreaterThan(80);
    }
    // Fallback check for unknown id
    expect(getHeroTemplate('non_existent_id').id).toBe('ignis');
  });

  it('scales hero power strictly upwards with levels, stars, equipment and relics', () => {
    const base: OwnedHero = {
      heroId: 'ignis',
      level: 1,
      stars: 1,
      shards: 0,
      equip: { weapon: 0, armor: 0, ring: 0, relic: 0 },
    };
    const s1 = computeHeroStats(base, ZERO_RELICS);
    const sLeveled = computeHeroStats({ ...base, level: 10 }, ZERO_RELICS);
    const sStarred = computeHeroStats({ ...base, level: 10, stars: 4 }, ZERO_RELICS);
    const sGeared = computeHeroStats(
      { ...base, level: 10, stars: 4, equip: { weapon: 4, armor: 4, ring: 3, relic: 3 } },
      { valor: 3, vitality: 3, precision: 2, wisdom: 2 },
    );

    expect(sLeveled.power).toBeGreaterThan(s1.power);
    expect(sStarred.power).toBeGreaterThan(sLeveled.power);
    expect(sGeared.power).toBeGreaterThan(sStarred.power);
    expect(getLevelUpCost(5).gold).toBeGreaterThan(getLevelUpCost(1).gold);
    expect(getAscendShardCost(3)).toBeGreaterThan(getAscendShardCost(1));
    expect(getRelicUpgradeCost(2)).toBeGreaterThan(getRelicUpgradeCost(0));
    expect(formatCompactNumber(15_400)).toBe('15.4K');
    expect(formatCompactNumber(2_500_000)).toBe('2.50M');
  });

  it('computes all faction auras accurately', () => {
    expect(computeFactionAura(['ignis', 'lyra', null, null, null]).active).toBe(false);
    expect(computeFactionAura(['ignis', 'draven', 'pyrrha', null, null]).id).toBe('resonance');
    expect(computeFactionAura(['ignis', 'lyra', 'glacia', 'orion', null]).id).toBe('prismatic');
    expect(computeFactionAura(['seraphina', 'noctis', 'ignis', 'glacia', 'sylva']).id).toBe(
      'astral_dominion',
    );
    expect(computeFactionAura(['ignis', 'draven', 'lyra', 'kai', 'glacia']).id).toBe('legion_unity');
  });
});

describe('Combat Engine & All Hero Ultimate Skills', () => {
  it('applies faction weakness multipliers correctly', () => {
    expect(getFactionMultiplier('flame', 'sylvan').weak).toBe(true);
    expect(getFactionMultiplier('sylvan', 'frost').weak).toBe(true);
    expect(getFactionMultiplier('frost', 'flame').weak).toBe(true);
    expect(getFactionMultiplier('astral', 'flame').weak).toBe(true);
    expect(getFactionMultiplier('flame', 'frost').weak).toBe(false);
  });

  it('executes every hero ultimate skill cleanly during simulated battles', () => {
    const allOwned: Record<string, OwnedHero> = {};
    for (const h of HERO_ROSTER) {
      allOwned[h.id] = {
        heroId: h.id,
        level: 12,
        stars: 3,
        shards: 0,
        equip: { weapon: 2, armor: 2, ring: 2, relic: 2 },
      };
    }

    // Batch 1 (first 5 heroes), Batch 2 (next 5 heroes), Batch 3 (remaining 2 + front)
    const batches = [
      HERO_ROSTER.slice(0, 5).map((h) => h.id),
      HERO_ROSTER.slice(5, 10).map((h) => h.id),
      [HERO_ROSTER[10]?.id ?? null, HERO_ROSTER[11]?.id ?? null, 'ignis', 'glacia', 'lyra'],
    ];

    for (const lineup of batches) {
      const allies = buildAllyUnits(lineup, allOwned, {
        valor: 2,
        vitality: 2,
        precision: 2,
        wisdom: 10,
      });
      // Boost energy to 100 so every hero casts their unique ultimate immediately
      for (const a of allies) {
        a.energy = 100;
      }
      const stage = buildStageDefinition(5);
      const sim = simulateFullBattle(allies, stage.enemies);
      expect(sim.steps.length).toBeGreaterThan(0);
      expect(sim.outcome).toBe('victory');
    }
  });

  it('supports manual ultimate forcing and Astral Meteor strike', () => {
    const owned: Record<string, OwnedHero> = {
      ignis: {
        heroId: 'ignis',
        level: 5,
        stars: 2,
        shards: 0,
        equip: { weapon: 1, armor: 1, ring: 0, relic: 0 },
      },
    };
    const allies = buildAllyUnits(['ignis', null, null, null, null], owned, ZERO_RELICS);
    if (allies[0]) allies[0].energy = 100;
    const enemies = buildStageDefinition(1).enemies;

    const step = stepBattleTurn(
      allies,
      enemies,
      { turnQueue: [] },
      { autoUlt: false, forceUltUid: allies[0]?.uid ?? null },
    );
    expect(step?.isUlt).toBe(true);

    const meteorImpacts = castAstralMeteorStrike(enemies, 2000);
    expect(meteorImpacts.length).toBeGreaterThan(0);
  });

  it('generates valid Tower of Eternity floors', () => {
    const f1 = buildTowerFloor(1);
    const f5 = buildTowerFloor(5);
    expect(f1.enemies.length).toBe(4);
    expect(f5.recommendedPower).toBeGreaterThan(f1.recommendedPower);
  });
});

describe('Gacha Summon Portal & Pity System', () => {
  it('guarantees at least one Epic+ hero in a 10x pull and triggers Legendary/Mythic pity at 30', () => {
    const lowRollRng = () => 0.99; // Always rolls lowest tier unless guaranteed
    const tenPull = performSummonBatch(10, {}, 0, lowRollRng);
    expect(tenPull.results.length).toBe(10);
    expect(tenPull.results.some((r) => r.rarity !== 'rare')).toBe(true);

    // Pity at 29 guarantees Legendary or Mythic on next pull
    const pityPull = performSummonBatch(1, tenPull.nextOwned, 29, lowRollRng);
    expect(['legendary', 'mythic']).toContain(pityPull.results[0]?.rarity);
    expect(pityPull.nextPity).toBe(0);
  });
});
