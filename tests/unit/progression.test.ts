import { describe, expect, it } from 'vitest';
import { computeAuras } from '../../src/game/auras';
import { RANK_ORDER, SOUL_CAP } from '../../src/game/constants';
import { DIARY, diaryAuras } from '../../src/game/diary';
import { itemScore, rollForge } from '../../src/game/forge';
import { getHeroDef, HEROES } from '../../src/game/heroes';
import { computeOffline } from '../../src/game/offline';
import { buildStage, buildTowerFloor, stageToUnits } from '../../src/game/stages';
import { computeStats, levelUpCost, maxLevelForRank, powerOf, teamPower } from '../../src/game/stats';
import type { GameState, HeroState } from '../../src/game/types';
import { createInitialGameState } from '../../src/state/initialState';
import { migrate } from '../../src/state/save';

function hero(defId: string, level = 1, rank: HeroState['rank'] = 5): HeroState {
  return { uid: `u-${defId}-${level}`, defId, level, rank, copies: 0, equip: {}, pactHpBattles: 0, pactSilenceBattles: 0 };
}

describe('stats & auras', () => {
  it('level growth increases HP and ATK monotonically', () => {
    const a = computeStats(hero('veles', 1));
    const b = computeStats(hero('veles', 10));
    const c = computeStats(hero('veles', 50));
    expect(b.hp).toBeGreaterThan(a.hp);
    expect(c.atk).toBeGreaterThan(b.atk);
  });

  it('rank multiplier boosts stats and rank ladder is ordered', () => {
    const base = computeStats(hero('brand', 10, 5));
    const r10 = computeStats(hero('brand', 10, 10));
    const e5 = computeStats(hero('brand', 10, 'E5'));
    expect(r10.hp).toBeGreaterThan(base.hp);
    expect(e5.hp).toBeGreaterThan(r10.hp);
    expect(RANK_ORDER[0]).toBe(5);
    expect(RANK_ORDER[RANK_ORDER.length - 1]).toBe('T5');
  });

  it('level cap depends on rank', () => {
    expect(maxLevelForRank('5')).toBe(20);
    expect(maxLevelForRank('6')).toBe(30);
    expect(maxLevelForRank('E5')).toBe(100);
    expect(maxLevelForRank('T5')).toBe(100);
  });

  it('level-up cost grows with level', () => {
    const c1 = levelUpCost(1);
    const c10 = levelUpCost(10);
    const c50 = levelUpCost(50);
    expect(c10.gold).toBeGreaterThan(c1.gold);
    expect(c50.gold).toBeGreaterThan(c10.gold * 5);
  });

  it('mono-faction aura gives +20% HP and a profile bonus', () => {
    const defs = ['brand', 'zhdan', 'milava', 'kirpich'].map(getHeroDef); // 4 Fortress (not full team)
    expect(computeAuras(defs).find((a) => a.id.startsWith('mono'))).toBeUndefined();
    const six = ['brand', 'zhdan', 'milava', 'kirpich', 'brand', 'zhdan'].map((id) => getHeroDef(id));
    const auras = computeAuras(six);
    const mono = auras.find((a) => a.id === 'mono-fortress');
    expect(mono).toBeDefined();
    expect(mono?.mods.hp).toBeCloseTo(0.2);
    expect(mono?.mods.def).toBeCloseTo(0.25);
  });

  it('«Разрушение» aura needs 2 Shadow + 2 Dark + 2 Abyss', () => {
    const defs = ['veles', 'mara', 'morena', 'chernobog', 'kaas', 'ssavra'].map(getHeroDef);
    const ruin = computeAuras(defs).find((a) => a.id === 'ruin');
    expect(ruin).toBeDefined();
    expect(ruin?.mods.atk).toBeCloseTo(0.13);
    expect(ruin?.mods.hp).toBeCloseTo(0.11);
  });

  it('rainbow aura requires all six factions', () => {
    const defs = ['veles', 'kaas', 'elana', 'brand', 'lucian', 'morena'].map(getHeroDef);
    const rainbow = computeAuras(defs).find((a) => a.id === 'rainbow');
    expect(rainbow).toBeDefined();
  });

  it('role synergies: 2 tanks → +HP, 2 healers → +heal', () => {
    const defs = ['brand', 'kaas', 'elana', 'zoria', 'veles', 'mara'].map(getHeroDef);
    const auras = computeAuras(defs);
    expect(auras.find((a) => a.id === 'role-tank')?.mods.hp).toBeCloseTo(0.1);
    expect(auras.find((a) => a.id === 'role-healer')?.mods.healPower).toBeCloseTo(0.25);
  });

  it('team power is the sum of hero powers', () => {
    const heroes = ['veles', 'brand', 'elana'].map((id) => hero(id, 10));
    const sum = heroes.reduce((s, h) => s + powerOf(computeStats(h)), 0);
    expect(teamPower(heroes)).toBe(sum);
  });
});

describe('campaign & tower', () => {
  it('every 10th stage is a boss with boosted stats', () => {
    const s9 = buildStage(9);
    const s10 = buildStage(10);
    expect(s9.boss).toBe(false);
    expect(s10.boss).toBe(true);
    expect(s10.enemies.some((e) => e.isBoss)).toBe(true);
  });

  it('difficulty grows with stage number', () => {
    const u1 = stageToUnits(buildStage(1)).reduce((s, u) => s + u.stats.hp, 0);
    const u20 = stageToUnits(buildStage(20)).reduce((s, u) => s + u.stats.hp, 0);
    const u80 = stageToUnits(buildStage(80)).reduce((s, u) => s + u.stats.hp, 0);
    expect(u20).toBeGreaterThan(u1);
    expect(u80).toBeGreaterThan(u20 * 5);
  });

  it('tower floors exist beyond campaign and carry first-clear rewards', () => {
    const f = buildTowerFloor(7);
    expect(f.name).toContain('Башня');
    expect(f.firstReward.gold).toBeGreaterThan(0);
  });

  it('stage building is deterministic for the same stage', () => {
    const a = buildStage(13);
    const b = buildStage(13);
    expect(a.enemies.map((e) => e.def.id)).toEqual(b.enemies.map((e) => e.def.id));
  });
});

describe('offline income', () => {
  it('returns nothing for short absences (<5 min)', () => {
    const state = createInitialGameState();
    state.lastSeen = Date.now() - 60_000;
    expect(computeOffline(state, Date.now())).toBeNull();
  });

  it('caps at 12 hours', () => {
    const state = createInitialGameState();
    state.campaign = { stage: 11, maxStage: 10 };
    const now = Date.now();
    state.lastSeen = now - 30 * 3600 * 1000;
    const off = computeOffline(state, now);
    expect(off).not.toBeNull();
    expect(off?.capped).toBe(true);
    expect(off?.nearCap).toBe(true);
    expect(off?.seconds).toBeLessThanOrEqual(12 * 3600);
  });

  it('splits gold/exp and grows with progress', () => {
    const s1 = createInitialGameState();
    s1.campaign = { stage: 2, maxStage: 1 };
    const s2 = createInitialGameState();
    s2.campaign = { stage: 31, maxStage: 30 };
    const now = Date.now();
    const a = computeOffline({ ...s1, lastSeen: now - 3600_000 }, now);
    const b = computeOffline({ ...s2, lastSeen: now - 3600_000 }, now);
    expect(a?.gold).toBeGreaterThan(0);
    expect(b?.gold).toBeGreaterThan((a?.gold ?? 0) * 3);
  });
});

describe('soul forge (14.2)', () => {
  it('rolls all four rarities over many crafts and legendaries carry a unique effect', () => {
    const seen = new Set<string>();
    let legendarySpecial = false;
    for (let i = 0; i < 3000; i++) {
      const item = rollForge('weapon', i * 31 + 7);
      seen.add(item.rarity);
      if (item.rarity === 'legendary') {
        expect(item.special).toBeDefined();
        legendarySpecial = true;
      }
    }
    expect(seen.size).toBe(4);
    expect(legendarySpecial).toBe(true);
  });

  it('higher rarity scores better', () => {
    let best: Record<string, number> = {};
    for (let i = 0; i < 2000; i++) {
      const item = rollForge('armor', i * 977 + 3);
      best = { ...best, [item.rarity]: Math.max(best[item.rarity] ?? 0, itemScore(item)) };
    }
    expect((best.rare ?? 0)).toBeGreaterThan(best.common ?? 0);
    expect((best.epic ?? 0)).toBeGreaterThan(best.rare ?? 0);
    expect((best.legendary ?? 0)).toBeGreaterThan(best.epic ?? 0);
  });
});

describe('diary (14.5)', () => {
  it('has 20–30 entries and the full collection grants the big bonus', () => {
    expect(DIARY.length).toBeGreaterThanOrEqual(20);
    expect(DIARY.length).toBeLessThanOrEqual(30);
    const partial = diaryAuras([DIARY[0]?.id ?? '']);
    const full = diaryAuras(DIARY.map((d) => d.id));
    expect(partial.length).toBe(1);
    expect(full.length).toBe(DIARY.length + 1); // каждая запись + бонус полной коллекции
    const bonus = full.find((a) => a.id === 'diary-full');
    expect(bonus?.mods.atk).toBeCloseTo(0.1);
  });
});

describe('save migration (§2)', () => {
  it('old v1 saves migrate forward instead of resetting', () => {
    const v1 = {
      saveVersion: 1,
      resources: { gold: 12345, heroExp: 100, crystals: 5, shards: 2, souls: 1, scrolls: 3, fodder: 0 },
      heroes: {},
      team: [null, null, null, null, null, null],
      campaign: { stage: 7, maxStage: 6 },
    } as unknown as Partial<GameState> & { saveVersion: number };
    const migrated = migrate(v1);
    expect(migrated.saveVersion).toBe(2);
    expect(migrated.resources.gold).toBe(12345);
    expect(migrated.campaign.stage).toBe(7);
    expect(migrated.labyrinth).toBeDefined();
    expect(migrated.diary).toEqual([]);
    expect(migrated.devFlags).toBeDefined();
  });

  it('broken team arrays are repaired', () => {
    const broken = { team: ['x'] } as unknown as Partial<GameState>;
    const migrated = migrate(broken);
    expect(migrated.team.length).toBe(6);
  });

  it('soul storage respects the cap of 20 in the rules constant', () => {
    expect(SOUL_CAP).toBe(20);
  });

  it('every hero definition is well-formed', () => {
    for (const h of HEROES) {
      expect(h.skill.chance).toBeGreaterThan(0);
      expect(h.skill.chance).toBeLessThan(1); // шанс — не 100% (§3)
      expect(h.base.hp).toBeGreaterThan(0);
      expect(getHeroDef(h.id).id).toBe(h.id);
    }
  });
});
