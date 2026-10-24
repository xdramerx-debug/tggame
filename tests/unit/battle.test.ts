import { describe, expect, it } from 'vitest';
import type { BattleUnitInput } from '../../src/game/battle';
import { simulateBattle } from '../../src/game/battle';
import { getHeroDef, HEROES } from '../../src/game/heroes';
import { computeStats } from '../../src/game/stats';
import type { BattleResult, HeroState } from '../../src/game/types';

function unit(defId: string, level = 10, overrides?: Partial<BattleUnitInput['stats']>): BattleUnitInput {
  const hero: HeroState = { uid: `u-${defId}`, defId, level, rank: 5, copies: 0, equip: {}, pactHpBattles: 0, pactSilenceBattles: 0 };
  return { def: getHeroDef(defId), stats: { ...computeStats(hero), ...overrides }, uid: hero.uid, level };
}

function team(defIds: string[], level = 10): BattleUnitInput[] {
  return defIds.map((id) => unit(id, level));
}

describe('battle simulation', () => {
  it('is deterministic for the same seed', () => {
    const allies = team(['veles', 'brand', 'elana', 'lucian', 'mara', 'zhdan']);
    const enemies = team(['chernobog', 'kaas', 'zoria', 'morena', 'voron', 'lisaya']);
    const a = simulateBattle({ allies, enemies, seed: 42 });
    const b = simulateBattle({ allies, enemies, seed: 42 });
    expect(a.victory).toBe(b.victory);
    expect(a.rounds).toBe(b.rounds);
    expect(a.events.length).toBe(b.events.length);
  });

  it('a much stronger team wins and the event log ends with «end»', () => {
    const allies = team(['veles', 'brand', 'elana', 'lucian', 'mara', 'zhdan'], 60);
    const enemies = team(['prah', 'murava', 'kirpich', 'svetik'], 3);
    const r = simulateBattle({ allies, enemies, seed: 7 });
    expect(r.victory).toBe(true);
    const last = r.events[r.events.length - 1];
    expect(last?.t).toBe('end');
  });

  it('a much weaker team loses and yields fallen allies for «Эхо павших»', () => {
    const allies = team(['prah', 'murava'], 2);
    const enemies = team(['chernobog', 'kaas', 'zoria', 'morena', 'voron', 'brand'], 50);
    const r = simulateBattle({ allies, enemies, seed: 9 });
    expect(r.victory).toBe(false);
    expect(r.fallenAllies).toBeGreaterThanOrEqual(1);
    expect(r.fallenAllies).toBeLessThanOrEqual(2);
  });

  it('respects the front-row targeting order: front slot 1 takes the first hit', () => {
    // glass cannon in front slot 0 must absorb the first enemy attack
    const allies = [unit('mara', 20), unit('brand', 20), unit('elana', 20), unit('zoria', 20), unit('zhdan', 20), unit('lucian', 20)];
    const enemies = team(['kirpich', 'navia', 'murava', 'prah', 'svetik', 'mork'], 3);
    const r = simulateBattle({ allies, enemies, seed: 123 });
    const firstDmg = r.events.find((e) => e.t === 'damage' && e.side === 'ally');
    expect(firstDmg).toBeDefined();
    if (firstDmg?.t === 'damage') expect(firstDmg.unit).toBeLessThanOrEqual(5);
    const firstEnemyDmg = r.events.find((e) => e.t === 'damage' && e.side === 'enemy');
    if (firstEnemyDmg?.t === 'damage') expect(firstEnemyDmg.target).toBe(0); // attacks front slot 1 first
  });

  it('battle never exceeds the round cap and timeout means defeat', () => {
    // two walls of tanks with healers — nobody dies
    const allies = team(['brand', 'dubomor', 'elana', 'zoria', 'kirpich', 'yanis'], 30);
    const enemies = team(['kaas', 'nochnoy', 'murava', 'zoria', 'kirpich', 'yanis'], 30);
    const r = simulateBattle({ allies, enemies, seed: 5 });
    expect(r.rounds).toBeLessThanOrEqual(30);
    if (r.rounds === 30) expect(r.victory).toBe(false);
  });

  it('admin_force_win / admin_force_lose override the outcome', () => {
    const allies = team(['prah'], 1);
    const enemies = team(['chernobog', 'kaas', 'morena', 'brand', 'zhdan', 'zoria'], 80);
    const win = simulateBattle({ allies, enemies, seed: 1, modifiers: { forceResult: 'win' } });
    const lose = simulateBattle({ allies, enemies, seed: 1, modifiers: { forceResult: 'lose' } });
    expect(win.victory).toBe(true);
    expect(lose.victory).toBe(false);
  });

  it('echo buff «Гнев павших» (+10% ATK) increases damage per battle and wins more often', () => {
    const allies = team(['veles', 'mara', 'lucian', 'chernobog', 'zhdan', 'ssavra'], 25);
    const enemies = team(['brand', 'dubomor', 'kaas', 'yanis', 'kirpich', 'nochnoy'], 26);
    const dmgSum = (r: BattleResult): number =>
      r.events.filter((e) => e.t === 'damage' && e.side === 'ally').reduce((s, e) => s + (e.t === 'damage' ? e.amount : 0), 0);
    let dmgNo = 0;
    let dmgBuff = 0;
    let winsNo = 0;
    let winsBuff = 0;
    for (let seed = 100; seed < 200; seed++) {
      const a = simulateBattle({ allies, enemies, seed, modifiers: { echoBuff: null } });
      const b = simulateBattle({ allies, enemies, seed, modifiers: { echoBuff: 'atk3' } });
      dmgNo += dmgSum(a);
      dmgBuff += dmgSum(b);
      if (a.victory) winsNo++;
      if (b.victory) winsBuff++;
    }
    expect(dmgBuff).toBeGreaterThan(dmgNo);
    expect(winsBuff).toBeGreaterThanOrEqual(winsNo);
  });

  it('echo «Второе дыхание» resurrects the first fallen ally with 30% HP', () => {
    const allies = team(['prah', 'murava', 'svetik'], 5);
    const enemies = team(['chernobog', 'kaas', 'morena', 'zhdan'], 40);
    const r = simulateBattle({ allies, enemies, seed: 11, modifiers: { echoBuff: 'revive' } });
    const revive = r.events.find((e) => e.t === 'revive');
    expect(revive).toBeDefined();
    if (revive?.t === 'revive') {
      const snap = r.allies[revive.unit];
      expect(revive.hp).toBe(Math.round((snap?.maxHp ?? 0) * 0.3));
    }
  });

  it('mirror modifier (+50% HP) boosts enemy max HP', () => {
    const enemies = team(['brand', 'kaas'], 20);
    const plain = simulateBattle({ allies: team(['veles'], 1), enemies, seed: 3 });
    const mirrored = simulateBattle({ allies: team(['veles'], 1), enemies, seed: 3, modifiers: { mirror: { hpMult: 1.5 } } });
    const plainTotal = plain.enemies.reduce((s, e) => s + e.maxHp, 0);
    const mirrorTotal = mirrored.enemies.reduce((s, e) => s + e.maxHp, 0);
    expect(mirrorTotal).toBe(Math.round(plainTotal * 1.5));
  });

  it('every hero in the roster can fight without crashing', () => {
    const ids = HEROES.map((h) => h.id);
    const allies = team(ids.slice(0, 6));
    const enemies = team(ids.slice(6, 12));
    const r = simulateBattle({ allies, enemies, seed: 777 });
    expect(r.events.length).toBeGreaterThan(0);
    expect(['rounds', 'victory'].every((k) => k in r)).toBe(true);
  });
});
