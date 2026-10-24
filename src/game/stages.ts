import type { BattleUnitInput } from './battle';
import { createRng } from './rng';
import { computeStats } from './stats';
import { HEROES, getHeroDef } from './heroes';
import type { GameState, HeroDef, HeroState, Rank, RewardBundle } from './types';

function must<T>(v: T | undefined, msg: string): T {
  if (v === undefined) throw new Error(msg);
  return v;
}

/**
 * Campaign (§6): 100 linear stages, boss every 10th — bosses check composition,
 * not just power. Tower: endless mode with first-clear rewards.
 * Mirror Labyrinth (14.3): fights clones of the player's own team.
 */

export interface EnemyDef {
  def: HeroDef;
  level: number;
  rank: Rank;
  isBoss?: boolean;
  statMult?: number;
}

export interface StageDef {
  stage: number;
  name: string;
  boss: boolean;
  enemies: EnemyDef[];
  firstReward: RewardBundle;
  repeatReward: RewardBundle;
}

export const CAMPAIGN_STAGES = 100;

const CHAPTER_NAMES = [
  'Пробуждение долин', 'Шёпот теней', 'Гнилые топи', 'Каменный пояс',
  'Осада крепостей', 'Сияющие пустоши', 'Полночные земли', 'Разлом бездны',
  'Пепел богов', 'Врата Эха',
];

export function chapterOf(stage: number): { chapter: number; name: string } {
  const chapter = Math.min(10, Math.floor((stage - 1) / 10) + 1);
  return { chapter, name: CHAPTER_NAMES[chapter - 1] ?? 'Неизведанные земли' };
}

export const BOSS_NAMES = [
  'Гурр, Пожиратель Корней', 'Тенетворец Нокс', 'Глубинная Мать Ырр',
  'Осадный Колосс Брандор', 'Серафим Пепла', 'Ночной Жнец Морвель',
  'Хранитель Разлома', 'Бездонный Левиафан', 'Падший Владыка Эха', 'Вечный Страж Врат',
];

/** Difficulty curve: enemy stat budget grows ~12.5% per stage (matches player growth). */
function stageBudget(stage: number): { level: number; rank: Rank; mult: number } {
  const level = Math.min(100, 1 + Math.floor(stage * 0.7));
  const rankIdx = Math.min(15, Math.floor(stage / 12));
  const ranks: Rank[] = [5, 6, 7, 8, 9, 10, 'E1', 'E2', 'E3', 'E4', 'E5', 'T1', 'T2', 'T3', 'T4', 'T5'];
  const rank = ranks[rankIdx] ?? 5;
  // Linear stat budget on top of level/rank; early stages are deliberately
  // softer (single starter hero). Growth must stay beatable by meta investment
  // (auras/forge/stars/echo give roughly ×1.3–2.0 total), hence +2%/stage, not exponential.
  const mult = (1 + stage * 0.02) * (stage <= 2 ? 0.8 : 1);
  return { level, rank, mult };
}

function enemyHeroFor(e: EnemyDef): BattleUnitInput {
  const heroState: HeroState = {
    uid: `enemy-${e.def.id}-${e.level}`, defId: e.def.id, level: e.level, rank: e.rank,
    copies: 0, equip: {}, pactHpBattles: 0, pactSilenceBattles: 0,
  };
  const stats = computeStats(heroState);
  const m = (e.statMult ?? 1) * (e.isBoss ? 1 : 1);
  return {
    def: e.def,
    isBoss: e.isBoss,
    level: e.level,
    rank: String(e.rank),
    stats: {
      ...stats,
      hp: Math.round(stats.hp * m * (e.isBoss ? 2 : 1)),
      atk: Math.round(stats.atk * m * (e.isBoss ? 1.2 : 1)),
      def: Math.round(stats.def * m * (e.isBoss ? 1.2 : 1)),
    },
  };
}

export function buildStage(stage: number, seed = stage * 7919): StageDef {
  const rng = createRng(seed);
  const { level, rank, mult } = stageBudget(stage);
  const boss = stage % 10 === 0;
  const { chapter } = chapterOf(stage);
  // Early stages match a small roster: 1 enemy at stage 1–2, +1 every 3 stages (§13: first battle must be winnable)
  const count = boss ? 4 : Math.min(6, 1 + Math.floor(stage / 3));

  const enemies: EnemyDef[] = [];
  if (boss) {
    const bossDef = must(HEROES.filter((h) => h.rarity === 5)[(chapter - 1) % 8] ?? HEROES[0], 'no boss def');
    enemies.push({ def: bossDef, level: level + 2, rank, isBoss: true, statMult: mult });
  }
  while (enemies.length < count) {
    const pool = boss ? HEROES.filter((h) => h.rarity >= 4) : HEROES;
    const def = must(pool[rng.int(0, pool.length - 1)], 'no enemy def');
    enemies.push({ def, level: Math.max(1, level + rng.int(-2, 2)), rank, statMult: mult });
  }

  const goldBase = Math.round(500 * Math.pow(1.13, stage - 1));
  const expBase = Math.round(300 * Math.pow(1.12, stage - 1));
  return {
    stage,
    name: boss ? (BOSS_NAMES[chapter - 1] ?? 'Безымянный босс') : `${chapterOf(stage).name} · этап ${stage}`,
    boss,
    enemies,
    firstReward: boss
      ? { gold: goldBase * 10, heroExp: expBase * 8, shards: 20 + chapter * 10, crystals: 30 + chapter * 10, souls: 1 }
      : { gold: goldBase * 4, heroExp: expBase * 3, shards: 2 + Math.floor(stage / 5), souls: stage % 5 === 0 ? 1 : 0 },
    repeatReward: { gold: goldBase, heroExp: expBase },
  };
}

export function stageToUnits(stageDef: StageDef): BattleUnitInput[] {
  return stageDef.enemies.map(enemyHeroFor);
}

/* --------------------------------- Tower --------------------------------- */

export function buildTowerFloor(floor: number): StageDef {
  const s = buildStage(Math.min(CAMPAIGN_STAGES, 5 + Math.floor(floor * 1.6)), 1000 + floor * 104729);
  return {
    ...s,
    stage: floor,
    name: `Башня Эха · этаж ${floor}`,
    boss: floor % 5 === 0,
    firstReward: { gold: 2000 * floor, heroExp: 1200 * floor, shards: 5 + floor, crystals: floor % 5 === 0 ? 50 : 10, souls: floor % 3 === 0 ? 1 : 0 },
    repeatReward: { gold: 400 * floor, heroExp: 250 * floor },
  };
}

/* -------------------------- Mirror Labyrinth (14.3) -------------------------- */

export function mirrorUnits(state: GameState, floor: number): BattleUnitInput[] {
  // Copy of the player's own team, scaled a bit by floor
  const units: BattleUnitInput[] = [];
  for (const uid of state.team) {
    if (!uid) continue;
    const hero = state.heroes[uid];
    if (!hero) continue;
    const stats = computeStats(hero);
    const m = 1 + floor * 0.08;
    units.push({
      def: getHeroDef(hero.defId),
      level: hero.level,
      rank: String(hero.rank),
      stats: { ...stats, hp: Math.round(stats.hp * m), atk: Math.round(stats.atk * m), def: Math.round(stats.def * m) },
    });
  }
  if (units.length === 0) {
    const fallback = must(HEROES[0], 'roster is empty');
    units.push({ def: fallback, stats: computeStats({ uid: 'x', defId: fallback.id, level: 5, rank: 5, copies: 0, equip: {}, pactHpBattles: 0, pactSilenceBattles: 0 }) });
  }
  return units;
}

/* ------------------------------- Idle income ------------------------------- */

export function idleRatesPerHour(state: GameState): { gold: number; exp: number; shardChance: number } {
  const stage = Math.max(1, state.campaign.maxStage);
  const prestige = state.prestige.multiplier;
  const gold = Math.round((600 + stage * 320) * Math.pow(1.045, stage) * prestige);
  const exp = Math.round((350 + stage * 210) * Math.pow(1.042, stage) * prestige);
  return { gold, exp, shardChance: 0.12 + Math.min(0.2, stage * 0.002) };
}
