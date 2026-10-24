import { MAX_LEVEL, RANK_STAT_MULT } from './constants';
import { getHeroDef } from './heroes';
import type { AuraInfo, BaseStats, ComputedStats, EquipItem, HeroState } from './types';

/**
 * Stat pipeline: base → level growth → rank multiplier → equipment → auras → battle buffs.
 * Level cost curve lives here too so the store and tests share one source of truth.
 */

export function levelStat(base: number, growth: number, level: number): number {
  return base * (1 + growth * (level - 1));
}

export function equipBonuses(equip: Partial<Record<string, EquipItem>>): { hp: number; atk: number; def: number; spd: number; crit: number } {
  let hp = 0, atk = 0, def = 0, spd = 0, crit = 0;
  for (const item of Object.values(equip)) {
    if (!item) continue;
    hp += item.bonus.hp ?? 0;
    atk += item.bonus.atk ?? 0;
    def += item.bonus.def ?? 0;
    spd += item.bonus.spd ?? 0;
    crit += item.bonus.crit ?? 0;
  }
  return { hp, atk, def, spd, crit };
}

export interface StatContext {
  auras: AuraInfo[];
  /** Echo buff «Гнев павших»: +10% ATK (14.1) */
  atkBuffPct?: number;
  /** Echo buff «Щит памяти»: +15% HP */
  hpBuffPct?: number;
  /** Shadow Pact: +30% damage for one hero (handled in battle, not here) */
}

export function computeStats(hero: HeroState, ctx: StatContext = { auras: [] }): ComputedStats {
  const def = getHeroDef(hero.defId);
  const rankMult = RANK_STAT_MULT[String(hero.rank)] ?? 1;
  const lvl = (v: number): number => levelStat(v, def.growth, hero.level) * rankMult;

  let hp = lvl(typeof def.base.hp === 'number' ? def.base.hp : 0);
  let atk = lvl(def.base.atk);
  let dfe = lvl(def.base.def);
  let spd = def.base.spd + (hero.level - 1) * 0.1;
  let crit = def.base.crit;
  let critDmg = def.base.critDmg;
  let armorBreak = def.base.armorBreak;
  let lifesteal = def.base.lifesteal;
  let healPower = 1;
  let controlImmunity = 0;

  // Passive: hp/def/atk fractional; spd flat; crit/armorBreak/lifesteal flat chance; critDmg flat mult
  const p = def.passive;
  if (p.hp) hp *= 1 + p.hp;
  if (p.atk) atk *= 1 + p.atk;
  if (p.def) dfe *= 1 + p.def;
  if (p.spd) spd += p.spd;
  if (p.crit) crit += p.crit;
  if (p.critDmg) critDmg += p.critDmg;
  if (p.armorBreak) armorBreak += p.armorBreak;
  if (p.lifesteal) lifesteal += p.lifesteal;

  // Equipment (fractional bonuses)
  const eq = equipBonuses(hero.equip);
  hp *= 1 + eq.hp;
  atk *= 1 + eq.atk;
  dfe *= 1 + eq.def;
  spd += eq.spd;
  crit += eq.crit;

  // Auras: hp/atk/def fractional, spd fractional, rest flat
  for (const aura of ctx.auras) {
    const m = aura.mods;
    if (m.hp) hp *= 1 + m.hp;
    if (m.atk) atk *= 1 + m.atk;
    if (m.def) dfe *= 1 + m.def;
    if (m.spd) spd *= 1 + m.spd;
    if (m.crit) crit += m.crit;
    if (m.critDmg) critDmg += m.critDmg;
    if (m.armorBreak) armorBreak += m.armorBreak;
    if (m.lifesteal) lifesteal += m.lifesteal;
    if (m.healPower) healPower += m.healPower;
    if (m.controlImmunity) controlImmunity += m.controlImmunity;
  }

  // Battle-wide echo buffs
  if (ctx.atkBuffPct) atk *= 1 + ctx.atkBuffPct;
  if (ctx.hpBuffPct) hp *= 1 + ctx.hpBuffPct;

  return {
    hp: Math.round(hp),
    atk: Math.round(atk),
    def: Math.round(dfe),
    spd: Math.round(spd),
    crit: clamp(crit, 0, 0.75),
    critDmg,
    armorBreak: clamp(armorBreak, 0, 0.6),
    lifesteal: clamp(lifesteal, 0, 0.4),
    healPower,
    controlImmunity: clamp(controlImmunity, 0, 0.9),
  };
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Combat power rating shown in UI & leaderboards. */
export function powerOf(stats: BaseStats): number {
  return Math.round(stats.hp * 0.35 + stats.atk * 4.2 + stats.def * 3.1 + stats.spd * 5);
}

export function teamPower(heroes: HeroState[], auras: AuraInfo[] = []): number {
  return heroes.reduce((s, h) => s + powerOf(computeStats(h, { auras })), 0);
}

/* --------------------------- Level-up economy --------------------------- */

export function levelUpCost(level: number): { gold: number; exp: number } {
  // «Всегда немного не хватает»: cost grows ~1.13^level
  const gold = Math.round(120 * Math.pow(1.125, level - 1) + level * 60);
  const exp = Math.round(60 * Math.pow(1.115, level - 1) + level * 25);
  return { gold, exp };
}

export function maxLevelForRank(rank: string): number {
  const idx = ['5', '6', '7', '8', '9', '10', 'E1', 'E2', 'E3', 'E4', 'E5', 'T1', 'T2', 'T3', 'T4', 'T5'].indexOf(rank);
  return Math.min(MAX_LEVEL, 20 + idx * 10);
}
