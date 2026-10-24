import { describe, expect, it } from 'vitest';
import { simulateBattle } from '../../src/game/battle';
import { buildStage, stageToUnits } from '../../src/game/stages';
import { computeAuras } from '../../src/game/auras';
import { getHeroDef, HEROES } from '../../src/game/heroes';
import { computeStats } from '../../src/game/stats';
import { createInitialGameState } from '../../src/state/initialState';
import type { HeroState } from '../../src/game/types';
import type { BattleUnitInput } from '../../src/game/battle';

/**
 * Balance regression (§12: «баланс правим одним числом» — эти тесты фиксируют
 * кривую, чтобы любое изменение было осознанным).
 * Сценарии считают winrate на 100 сидах без экипировки: mid-game стены
 * намеренно требуют мета-систем (ранги/кузница/ауры).
 */

function roster(ids: string[], level: number, rank: HeroState['rank']): BattleUnitInput[] {
  const heroes: HeroState[] = ids.map((id, i) => ({
    uid: `h${i}`, defId: id, level, rank, copies: 0, equip: {},
    pactHpBattles: 0, pactSilenceBattles: 0,
  }));
  const auras = computeAuras(heroes.map((h) => getHeroDef(h.defId)));
  return heroes.map((h) => ({ def: getHeroDef(h.defId), stats: computeStats(h, { auras }) }));
}

function winRate(allies: BattleUnitInput[], stage: number, seeds = 100): number {
  const enemies = stageToUnits(buildStage(stage));
  let wins = 0;
  for (let seed = 900; seed < 900 + seeds; seed++) {
    if (simulateBattle({ allies, enemies, seed }).victory) wins++;
  }
  return wins / seeds;
}

const SIX = ['veles', 'mara', 'zhdan', 'ssavra', 'lucian', 'chernobog'];

describe('campaign balance curve', () => {
  it('stage 1 is winnable by the lone starter hero at level 1 (§13)', () => {
    const g = createInitialGameState();
    const starter = g.team.map((uid) => (uid ? g.heroes[uid] : undefined)).filter((h): h is HeroState => h !== undefined);
    const allies = starter.map((h) => ({ def: getHeroDef(h.defId), stats: computeStats(h, { auras: [] }) }));
    expect(winRate(allies, 1)).toBeGreaterThanOrEqual(0.8);
  });

  it('stage 2 softly ramps for a lone level-1 hero', () => {
    const g = createInitialGameState();
    const starter = g.team.map((uid) => (uid ? g.heroes[uid] : undefined)).filter((h): h is HeroState => h !== undefined);
    const allies = starter.map((h) => ({ def: getHeroDef(h.defId), stats: computeStats(h, { auras: [] }) }));
    const wr = winRate(allies, 2);
    expect(wr).toBeGreaterThan(0.2);
    expect(wr).toBeLessThan(0.95);
  });

  it('enemy count grows with stage: 1 at stage 1, up to 6', () => {
    expect(buildStage(1).enemies.length).toBe(1);
    expect(buildStage(2).enemies.length).toBe(1);
    expect(buildStage(3).enemies.length).toBe(2);
    expect(buildStage(15).enemies.length).toBe(6);
    expect(buildStage(99).enemies.length).toBe(6);
    expect(buildStage(100).enemies.length).toBe(4); // boss stage: elite quartet
  });

  it('recruiting via gacha carries stages 3–6 (roster gate)', () => {
    expect(winRate(roster(['veles', 'mara', 'zhdan'], 2, 5), 3)).toBeGreaterThanOrEqual(0.9);
    expect(winRate(roster(SIX.slice(0, 4), 3, 5), 4)).toBeGreaterThanOrEqual(0.9);
    expect(winRate(roster(SIX.slice(0, 5), 3, 5), 5)).toBeGreaterThanOrEqual(0.9);
    expect(winRate(roster(SIX, 4, 5), 6)).toBeGreaterThanOrEqual(0.9);
  });

  it('first boss (stage 10) is a wall breakable with +2…4 levels', () => {
    expect(winRate(roster(SIX, 6, 5), 10)).toBeLessThan(0.7); // on-pace level → coin flip, grind helps
    expect(winRate(roster(SIX, 8, 5), 10)).toBeGreaterThanOrEqual(0.7); // +2 levels breaks it
    expect(winRate(roster(SIX, 9, 5), 10)).toBeGreaterThanOrEqual(0.8);
  });

  it('stage 12+ gates on rank-ups (shards), beatable when on-pace', () => {
    expect(winRate(roster(SIX, 11, 5), 12)).toBeLessThan(0.5);
    expect(winRate(roster(SIX, 13, 6), 12)).toBeGreaterThanOrEqual(0.7);
  });

  it('stage 20 is beatable on-pace with rank 6 and levels ahead', () => {
    expect(winRate(roster(SIX, 20, 6), 20)).toBeGreaterThan(0.4);
    expect(winRate(roster(SIX, 22, 6), 20)).toBeGreaterThanOrEqual(0.7);
  });

  it('mid-game walls require meta investment (forge/ranks), not just levels', () => {
    // no equipment in sim → stage 30 must NOT be winnable on levels alone,
    // even massively overleveled at the rank's cap
    expect(winRate(roster(SIX, 34, 7), 30)).toBeLessThan(0.5);
    // the rank-up itself (shards/copies) is what breaks the wall
    expect(winRate(roster(SIX, 38, 8), 30)).toBeGreaterThan(0.4);
  });

  it('difficulty is monotonic: same team wins less often on later stages', () => {
    const team = roster(SIX, 12, 6);
    const w5 = winRate(team, 5, 60);
    const w15 = winRate(team, 15, 60);
    const w25 = winRate(team, 25, 60);
    expect(w5).toBeGreaterThanOrEqual(w15);
    expect(w15).toBeGreaterThanOrEqual(w25);
  });

  it('rewards grow with stage and bosses pay much more', () => {
    const s5 = buildStage(5);
    const s10 = buildStage(10);
    const s20 = buildStage(20);
    expect((s20.firstReward.gold ?? 0)).toBeGreaterThan(s10.firstReward.gold ?? 0);
    expect((s10.firstReward.gold ?? 0)).toBeGreaterThan(s5.firstReward.gold ?? 0);
    expect(s10.boss).toBe(true);
    expect((s10.firstReward.gold ?? 0)).toBeGreaterThan((s10.repeatReward.gold ?? 0) * 5);
  });
});

describe('battle snapshots', () => {
  it('final snapshots carry post-battle HP while maxHp stays full', () => {
    const enemies = stageToUnits(buildStage(1));
    const allies = roster(SIX, 10, 5);
    const r = simulateBattle({ allies, enemies, seed: 42 });
    for (const u of [...r.allies, ...r.enemies]) {
      expect(u.hp).toBeGreaterThanOrEqual(0);
      expect(u.hp).toBeLessThanOrEqual(u.maxHp);
    }
    // winners took some damage somewhere in a real fight
    const damaged = [...r.allies, ...r.enemies].some((u) => u.hp < u.maxHp);
    expect(damaged).toBe(true);
  });
});

describe('hero roster sanity', () => {
  it('all heroes are usable in battle (defs resolve, stats positive)', () => {
    for (const def of HEROES) {
      const h: HeroState = {
        uid: `t-${def.id}`, defId: def.id, level: 1, rank: 5, copies: 0, equip: {},
        pactHpBattles: 0, pactSilenceBattles: 0,
      };
      const stats = computeStats(h, { auras: [] });
      expect(stats.hp).toBeGreaterThan(0);
      expect(stats.atk).toBeGreaterThan(0);
      expect(stats.def).toBeGreaterThan(0);
    }
  });
});
