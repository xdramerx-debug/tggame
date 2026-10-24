import { FORGE_ODDS, SALVAGE_SOULS } from './constants';
import { createRng } from './rng';
import type { EquipItem, EquipSlot } from './types';

/**
 * «Кузница душ» (14.2): risky crafting from soul shards.
 * Odds are visible before crafting: 50/30/15/5. Legendary items carry a unique effect.
 * Worse-than-current items can be salvaged back for 2–3 souls.
 */

const RARITY_MULT = { common: 1, rare: 1.6, epic: 2.4, legendary: 3.6 } as const;

const NAMES: Record<EquipSlot, string[]> = {
  weapon: ['Клинок Эха', 'Коса Морены', 'Молот Ждана', 'Жезл Люциана'],
  armor: ['Панцирь Бранда', 'Кора Дубомора', 'Плащ Велеса', 'Чешуя Кааса'],
  trinket: ['Амулет Зори', 'Око Бездны', 'Знак Милавы', 'Перо Ворона'],
  boots: ['Сапоги Лисаи', 'Корни Праха', 'Поступь Яниса', 'Тропа Навии'],
};

const LEGENDARY_SPECIALS: Record<EquipSlot, { id: NonNullable<EquipItem['special']>; desc: string }> = {
  weapon: { id: 'firstStrikeCrit', desc: 'Первый удар в бою — всегда критический' },
  armor: { id: 'roundOneShield', desc: 'В начале боя владелец получает щит (150% атаки)' },
  trinket: { id: 'critChance5', desc: '+5% к шансу критического удара' },
  boots: { id: 'executeLow', desc: '+50% урона по врагам с HP ниже 30%' },
};

let uidCounter = 0;
function nextUid(): string {
  uidCounter += 1;
  return `eq-${Date.now().toString(36)}-${uidCounter}`;
}

export function rollForge(slot: EquipSlot, seed: number): EquipItem {
  const rng = createRng(seed);
  const roll = rng.next();
  let acc = 0;
  let rarity: EquipItem['rarity'] = 'common';
  for (const tier of FORGE_ODDS) {
    acc += tier.p;
    if (roll < acc) { rarity = tier.rarity; break; }
  }

  const namePool = NAMES[slot];
  const name = namePool[rng.int(0, namePool.length - 1)] ?? 'Эхо-реликвия';
  const m = RARITY_MULT[rarity];
  const bonus: EquipItem['bonus'] = {};

  switch (slot) {
    case 'weapon':
      bonus.atk = Number((0.08 * m).toFixed(3));
      if (rarity !== 'common') bonus.crit = Number((0.015 * m).toFixed(3));
      break;
    case 'armor':
      bonus.hp = Number((0.1 * m).toFixed(3));
      bonus.def = Number((0.06 * m).toFixed(3));
      break;
    case 'trinket':
      bonus.hp = Number((0.04 * m).toFixed(3));
      bonus.atk = Number((0.04 * m).toFixed(3));
      bonus.crit = Number((0.01 * m).toFixed(3));
      break;
    case 'boots':
      bonus.spd = Math.round(3 * m);
      bonus.hp = Number((0.03 * m).toFixed(3));
      break;
  }

  const item: EquipItem = { uid: nextUid(), slot, name: `${name} · ${rarityLabel(rarity)}`, rarity, bonus };
  if (rarity === 'legendary') {
    const sp = LEGENDARY_SPECIALS[slot];
    item.special = sp.id;
    item.specialDesc = sp.desc;
  }
  return item;
}

export function rarityLabel(r: EquipItem['rarity']): string {
  return { common: 'Обычный', rare: 'Редкий', epic: 'Эпический', legendary: 'Легендарный' }[r];
}

export function salvageSouls(rngRoll: number): number {
  // частичный возврат: 2–3 осколка
  return 2 + Math.floor(Math.max(0, Math.min(0.999, rngRoll)) * SALVAGE_SOULS.length);
}

export function itemScore(item: EquipItem): number {
  const b = item.bonus;
  return (b.hp ?? 0) * 100 + (b.atk ?? 0) * 120 + (b.def ?? 0) * 90 + (b.spd ?? 0) * 4 + (b.crit ?? 0) * 200 + (item.special ? 1.5 : 0);
}
