import type { LootKind } from './types';

/** Loot crate tables — pure, unit-tested. */

export const CRATE_TABLE: [LootKind, number][] = [
  ['money', 30],
  ['parts', 22],
  ['ammo', 16],
  ['medkit', 10],
  ['grenade', 8],
  ['armor', 8],
  ['xp', 6],
];

export const CRATE_TOTAL_WEIGHT = CRATE_TABLE.reduce((s, [, w]) => s + w, 0);

export function rollCrate(r: () => number): LootKind {
  let x = r() * CRATE_TOTAL_WEIGHT;
  for (const [kind, w] of CRATE_TABLE) {
    x -= w;
    if (x < 0) return kind;
  }
  return 'money';
}

export function crateAmount(kind: LootKind, r: () => number, wave: number): number {
  switch (kind) {
    case 'money':
      return Math.round((60 + r() * 120) * (1 + Math.max(0, wave - 1) * 0.1));
    case 'parts':
      return 1 + Math.floor(r() * 3);
    case 'ammo':
      return 90;
    case 'armor':
      return 30;
    case 'xp':
      return Math.round(40 + r() * 50);
    case 'grenade':
      return 1 + (r() < 0.3 ? 1 : 0);
    case 'medkit':
      return 1;
  }
}

export function crateCount(wave: number): number {
  return Math.min(12, 6 + Math.floor(Math.max(1, wave) / 2));
}

export const CRATE_LABEL: Record<LootKind, string> = {
  money: '💰 Деньги',
  parts: '⚙️ Детали',
  ammo: '🧰 Патроны +90',
  armor: '🛡️ Броня +30',
  grenade: '💣 Граната',
  medkit: '❤️ Аптечка',
  xp: '⭐ Опыт',
};
