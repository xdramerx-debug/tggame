import type { PerkId } from './types';

/** Perk tree, XP curve and derived perk effects — pure, unit-tested. */

export type PerkBranch = 'sur' | 'gun' | 'mob';

export interface PerkDef {
  id: PerkId;
  branch: PerkBranch;
  tier: number;
  name: string;
  desc: string;
  requires: PerkId | null;
}

export const PERK_DEFS: PerkDef[] = [
  { id: 'sur1', branch: 'sur', tier: 1, name: 'Живучесть', desc: '+20 к максимальному здоровью', requires: null },
  { id: 'sur2', branch: 'sur', tier: 2, name: 'Регенерация', desc: '+0.8 HP/с через 5 с без урона', requires: 'sur1' },
  { id: 'sur3', branch: 'sur', tier: 3, name: 'Бронеплиты', desc: 'Броня гасит 65% урона, предел брони +25', requires: 'sur2' },
  { id: 'sur4', branch: 'sur', tier: 4, name: 'Полевая аптечка', desc: 'Аптечки лечат ×1.6, одна в начале забега', requires: 'sur3' },
  { id: 'gun1', branch: 'gun', tier: 1, name: 'Тяжёлые пули', desc: '+10% урона всем оружием', requires: null },
  { id: 'gun2', branch: 'gun', tier: 2, name: 'Быстрые руки', desc: '−15% времени перезарядки', requires: 'gun1' },
  { id: 'gun3', branch: 'gun', tier: 3, name: 'Снайперский глаз', desc: '+0.5 к множителю урона в голову', requires: 'gun2' },
  { id: 'gun4', branch: 'gun', tier: 4, name: 'Хладнокровие', desc: '12% шанс критического попадания ×1.6', requires: 'gun3' },
  { id: 'mob1', branch: 'mob', tier: 1, name: 'Лёгкий шаг', desc: '+8% к скорости движения', requires: null },
  { id: 'mob2', branch: 'mob', tier: 2, name: 'Тень', desc: 'Присед почти не тормозит, разброс в приседе ниже', requires: 'mob1' },
  { id: 'mob3', branch: 'mob', tier: 3, name: 'Боевой перекат', desc: 'Открывает боевой рывок (кд 5 с)', requires: 'mob2' },
  { id: 'mob4', branch: 'mob', tier: 4, name: 'Жонглёр', desc: 'Смена оружия и гранаты на 40% быстрее, +1 к лимиту гранат', requires: 'mob3' },
];

export const PERK_BY_ID: Record<PerkId, PerkDef> = Object.fromEntries(
  PERK_DEFS.map((d) => [d.id, d]),
) as Record<PerkId, PerkDef>;

export const BRANCH_NAMES: Record<PerkBranch, string> = {
  sur: 'Выживание',
  gun: 'Огневая мощь',
  mob: 'Мобильность',
};

/** XP needed to advance FROM `level` to the next one. */
export function xpForLevel(level: number): number {
  return Math.floor(120 * Math.pow(Math.max(1, level), 1.45));
}

export function levelFromXp(xp: number): { level: number; into: number; need: number } {
  let level = 1;
  let rest = Math.max(0, Math.floor(xp));
  for (;;) {
    const need = xpForLevel(level);
    if (rest < need || level >= 200) return { level, into: rest, need };
    rest -= need;
    level += 1;
  }
}

export function perkPointsAvailable(meta: { xp: number; perks: readonly PerkId[] }): number {
  return Math.max(0, levelFromXp(meta.xp).level - 1 - meta.perks.length);
}

export function canTakePerk(taken: readonly PerkId[], id: PerkId): boolean {
  const def = PERK_BY_ID[id];
  if (taken.includes(id)) return false;
  return def.requires === null || taken.includes(def.requires);
}

export interface PerkEffects {
  maxHpBonus: number;
  regenPerSec: number;
  regenDelay: number;
  /** fraction of body damage absorbed while armor holds */
  armorAbsorb: number;
  armorBonus: number;
  medkitMult: number;
  startMedkit: boolean;
  dmgMult: number;
  reloadMult: number;
  headBonus: number;
  critChance: number;
  critMult: number;
  speedMult: number;
  /** multiplier on crouch move speed */
  crouchMult: number;
  /** multiplier on spread while crouched */
  crouchSpreadMult: number;
  /** 0 = dash locked */
  dashCd: number;
  /** multiplier on switch/throw times */
  switchMult: number;
  grenadeBonus: number;
}

export function perkEffects(taken: readonly PerkId[]): PerkEffects {
  const has = (id: PerkId): boolean => taken.includes(id);
  return {
    maxHpBonus: has('sur1') ? 20 : 0,
    regenPerSec: has('sur2') ? 0.8 : 0,
    regenDelay: 5,
    armorAbsorb: has('sur3') ? 0.65 : 0.5,
    armorBonus: has('sur3') ? 25 : 0,
    medkitMult: has('sur4') ? 1.6 : 1,
    startMedkit: has('sur4'),
    dmgMult: has('gun1') ? 1.1 : 1,
    reloadMult: has('gun2') ? 0.85 : 1,
    headBonus: has('gun3') ? 0.5 : 0,
    critChance: has('gun4') ? 0.12 : 0,
    critMult: 1.6,
    speedMult: has('mob1') ? 1.08 : 1,
    crouchMult: has('mob2') ? 1.5 : 1,
    crouchSpreadMult: has('mob2') ? 0.5 : 0.7,
    dashCd: has('mob3') ? 5 : 0,
    switchMult: has('mob4') ? 0.6 : 1,
    grenadeBonus: has('mob4') ? 1 : 0,
  };
}
