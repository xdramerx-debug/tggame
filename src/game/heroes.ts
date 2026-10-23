import type {
  ComputedStats,
  EquipSlot,
  Faction,
  FactionAura,
  HeroRole,
  HeroTemplate,
  OwnedHero,
  QuestDefinition,
  Rarity,
  RelicLevels,
} from './types';

export interface FactionMeta {
  readonly name: string;
  readonly color: string;
  readonly bg: string;
  readonly beats: Faction | 'all';
}

export const FACTION_META: Record<Faction, FactionMeta> = {
  flame: {
    name: 'Пламя',
    color: '#ff6b4a',
    bg: 'rgba(255, 107, 74, 0.16)',
    beats: 'sylvan',
  },
  sylvan: {
    name: 'Природа',
    color: '#34d399',
    bg: 'rgba(52, 211, 153, 0.16)',
    beats: 'frost',
  },
  frost: {
    name: 'Лёд',
    color: '#38bdf8',
    bg: 'rgba(56, 189, 248, 0.16)',
    beats: 'flame',
  },
  astral: {
    name: 'Астрал',
    color: '#c084fc',
    bg: 'rgba(192, 132, 252, 0.18)',
    beats: 'all',
  },
};

export interface RarityMeta {
  readonly name: string;
  readonly badge: string;
  readonly color: string;
  readonly border: string;
  readonly baseStars: number;
  readonly dupShards: number;
}

export const RARITY_META: Record<Rarity, RarityMeta> = {
  rare: {
    name: 'Редкий',
    badge: 'R',
    color: '#60a5fa',
    border: 'rgba(96, 165, 250, 0.55)',
    baseStars: 1,
    dupShards: 15,
  },
  epic: {
    name: 'Эпический',
    badge: 'SR',
    color: '#c084fc',
    border: 'rgba(192, 132, 252, 0.65)',
    baseStars: 2,
    dupShards: 20,
  },
  legendary: {
    name: 'Легендарный',
    badge: 'SSR',
    color: '#fbbf24',
    border: 'rgba(251, 191, 36, 0.75)',
    baseStars: 3,
    dupShards: 25,
  },
  mythic: {
    name: 'Мифический',
    badge: 'UR',
    color: '#fb7185',
    border: 'rgba(251, 113, 133, 0.85)',
    baseStars: 4,
    dupShards: 30,
  },
};

export const ROLE_NAMES: Record<HeroRole, string> = {
  tank: 'Танк',
  warrior: 'Воин',
  mage: 'Маг',
  assassin: 'Убийца',
  ranger: 'Стрелок',
  healer: 'Целитель',
};

export const EQUIP_SLOT_META: Record<EquipSlot, { readonly name: string; readonly statLabel: string }> = {
  weapon: { name: 'Оружие', statLabel: 'АТК' },
  armor: { name: 'Доспех', statLabel: 'HP и ЗАЩ' },
  ring: { name: 'Кольцо', statLabel: 'КРИТ и АТК' },
  relic: { name: 'Амулет', statLabel: 'HP и СКР' },
};

export interface EquipTierMeta {
  readonly tier: number;
  readonly name: string;
  readonly color: string;
  readonly mult: number;
  readonly forgeCostGold: number;
}

export const EQUIP_TIERS: readonly EquipTierMeta[] = [
  { tier: 0, name: 'Пусто', color: '#64748b', mult: 0, forgeCostGold: 0 },
  { tier: 1, name: 'Железный', color: '#94a3b8', mult: 0.08, forgeCostGold: 250 },
  { tier: 2, name: 'Рунический', color: '#38bdf8', mult: 0.18, forgeCostGold: 650 },
  { tier: 3, name: 'Эпический', color: '#c084fc', mult: 0.32, forgeCostGold: 1600 },
  { tier: 4, name: 'Драконий', color: '#fbbf24', mult: 0.5, forgeCostGold: 3800 },
  { tier: 5, name: 'Мифический', color: '#fb7185', mult: 0.75, forgeCostGold: 8500 },
  { tier: 6, name: 'Астральный', color: '#2dd4bf', mult: 1.1, forgeCostGold: 18000 },
];

export interface RelicDef {
  readonly key: keyof RelicLevels;
  readonly name: string;
  readonly subtitle: string;
  readonly perLevelDesc: string;
  readonly color: string;
}

export const RELIC_DEFS: readonly RelicDef[] = [
  {
    key: 'valor',
    name: 'Клинок Титанов',
    subtitle: 'Древний артефакт войны',
    perLevelDesc: '+6% к АТК всех героев за уровень',
    color: '#fb923c',
  },
  {
    key: 'vitality',
    name: 'Сердце Древа',
    subtitle: 'Живой изумруд бессмертия',
    perLevelDesc: '+7% к HP всех героев за уровень',
    color: '#34d399',
  },
  {
    key: 'precision',
    name: 'Око Кометы',
    subtitle: 'Кристалл звёздной точности',
    perLevelDesc: '+2.5% к шансу крита отряда за уровень',
    color: '#38bdf8',
  },
  {
    key: 'wisdom',
    name: 'Чаша Вечности',
    subtitle: 'Сосуд первородного эфира',
    perLevelDesc: '+5 начальной энергии в бою за уровень',
    color: '#c084fc',
  },
];

export const HERO_ROSTER: readonly HeroTemplate[] = [
  {
    id: 'ignis',
    name: 'Игнис',
    title: 'Рыцарь Пепла',
    faction: 'flame',
    rarity: 'epic',
    role: 'warrior',
    baseHp: 1480,
    baseAtk: 175,
    baseDef: 52,
    baseSpeed: 104,
    baseCrit: 0.14,
    skillName: 'Клинок Вулкана',
    skillDesc: 'Обрушивает огненную волну (230% АТК) на первый ряд врагов и укрывается щитом (25% макс. HP).',
    passiveName: 'Сердце Горна',
    passiveDesc: 'Тяжёлые латы снижают входящий урон и усиливают атаку при каждом ударе.',
    skillKind: 'front_cleave_shield',
    skillPower: 2.3,
    visual: {
      primary: '#ef4444',
      secondary: '#f59e0b',
      glow: '#ff7849',
      skin: '#f5d0b5',
      eye: '#fef08a',
      weapon: 'greatsword',
      head: 'knight_crest',
      back: 'cape',
      attackVfx: 'slash_fire',
      ultVfx: 'ult_meteor',
    },
  },
  {
    id: 'lyra',
    name: 'Лира',
    title: 'Голос Зари',
    faction: 'sylvan',
    rarity: 'rare',
    role: 'healer',
    baseHp: 1120,
    baseAtk: 148,
    baseDef: 38,
    baseSpeed: 108,
    baseCrit: 0.12,
    skillName: 'Цветение Жизни',
    skillDesc: 'Исцеляет весь отряд на 165% АТК и повышает атаку союзников на 20% на 2 хода.',
    passiveName: 'Дыхание Весны',
    passiveDesc: 'Каждое исцеление наполняет союзников живительной силой леса.',
    skillKind: 'heal_all_buff',
    skillPower: 1.65,
    visual: {
      primary: '#10b981',
      secondary: '#fde047',
      glow: '#6ee7b7',
      skin: '#fde2cf',
      eye: '#a7f3d0',
      weapon: 'nature_staff',
      head: 'antler_crown',
      back: 'leaf_mantle',
      attackVfx: 'proj_nature',
      ultVfx: 'ult_bloom',
    },
  },
  {
    id: 'kai',
    name: 'Кай',
    title: 'Клинок Ветра',
    faction: 'sylvan',
    rarity: 'epic',
    role: 'assassin',
    baseHp: 1080,
    baseAtk: 215,
    baseDef: 34,
    baseSpeed: 126,
    baseCrit: 0.26,
    skillName: 'Вихрь Лепестков',
    skillDesc: 'Мгновенно атакует самого раненого врага (315% АТК). Если цель повержена — возвращает 55 энергии!',
    passiveName: 'Шаг в листве',
    passiveDesc: 'Всегда выслеживает уязвимых врагов в тылу с повышенным шансом крита.',
    skillKind: 'assassinate_reset',
    skillPower: 3.15,
    visual: {
      primary: '#059669',
      secondary: '#2dd4bf',
      glow: '#34d399',
      skin: '#f3d1bc',
      eye: '#5eead4',
      weapon: 'dual_daggers',
      head: 'hooded_rogue',
      back: 'scarf',
      attackVfx: 'slash_wind',
      ultVfx: 'slash_wind',
    },
  },
  {
    id: 'bjorn',
    name: 'Бьорн',
    title: 'Страж Фьордов',
    faction: 'frost',
    rarity: 'rare',
    role: 'tank',
    baseHp: 1760,
    baseAtk: 132,
    baseDef: 68,
    baseSpeed: 94,
    baseCrit: 0.1,
    skillName: 'Стена Ледника',
    skillDesc: 'Раскалывает землю (160% АТК всем врагам впереди) и укрывает ВЕСЬ отряд ледяным щитом (22% HP Бьорна).',
    passiveName: 'Нерушимый бастион',
    passiveDesc: 'Огромный запас здоровья удерживает натиск боссов на первой линии.',
    skillKind: 'team_shield_smash',
    skillPower: 1.6,
    visual: {
      primary: '#0284c7',
      secondary: '#93c5fd',
      glow: '#38bdf8',
      skin: '#f1cdb6',
      eye: '#e0f2fe',
      weapon: 'shield_axe',
      head: 'viking_horns',
      back: 'fur_cloak',
      attackVfx: 'slash_frost',
      ultVfx: 'ult_blizzard',
    },
  },
  {
    id: 'draven',
    name: 'Дрейк',
    title: 'Палач Бездны',
    faction: 'flame',
    rarity: 'rare',
    role: 'warrior',
    baseHp: 1340,
    baseAtk: 186,
    baseDef: 42,
    baseSpeed: 109,
    baseCrit: 0.18,
    skillName: 'Кровавый Вихрь',
    skillDesc: 'Наносит сокрушительный удар (285% АТК) и восстанавливает себе 40% от нанесённого урона.',
    passiveName: 'Ярость Берсерка',
    passiveDesc: 'Парные топоры исцеляют владельца прямо в гуще схватки.',
    skillKind: 'lifesteal_burst',
    skillPower: 2.85,
    visual: {
      primary: '#dc2626',
      secondary: '#fb923c',
      glow: '#f87171',
      skin: '#eabf9f',
      eye: '#fca5a5',
      weapon: 'twin_axes',
      head: 'berserker_mane',
      back: 'chains',
      attackVfx: 'slash_fire',
      ultVfx: 'ult_meteor',
    },
  },
  {
    id: 'krios',
    name: 'Криос',
    title: 'Ледяной Жнец',
    faction: 'frost',
    rarity: 'epic',
    role: 'assassin',
    baseHp: 1140,
    baseAtk: 218,
    baseDef: 36,
    baseSpeed: 122,
    baseCrit: 0.24,
    skillName: 'Приговор Зимы',
    skillDesc: 'Рассекает задний ряд врагов косой (225% АТК). Наносит +45% урона целям с HP ниже 50%.',
    passiveName: 'Холодная жатва',
    passiveDesc: 'Призрачная коса игнорирует строй и добивает раненых магов и стрелков.',
    skillKind: 'execute_backline',
    skillPower: 2.25,
    visual: {
      primary: '#0ea5e9',
      secondary: '#818cf8',
      glow: '#67e8f9',
      skin: '#dbeafe',
      eye: '#22d3ee',
      weapon: 'frost_scythe',
      head: 'reaper_cowl',
      back: 'wraith_shroud',
      attackVfx: 'slash_frost',
      ultVfx: 'ult_blizzard',
    },
  },
  {
    id: 'glacia',
    name: 'Глация',
    title: 'Королева Инея',
    faction: 'frost',
    rarity: 'legendary',
    role: 'mage',
    baseHp: 1290,
    baseAtk: 232,
    baseDef: 44,
    baseSpeed: 116,
    baseCrit: 0.2,
    skillName: 'Вечная Мерзлота',
    skillDesc: 'Обрушивает бурю ледяных пик на ВСЕХ врагов (190% АТК) и замораживает до 2 целей на 1 ход!',
    passiveName: 'Хрустальный трон',
    passiveDesc: 'Замороженные враги пропускают ход под градом атак вашего отряда.',
    skillKind: 'aoe_freeze',
    skillPower: 1.9,
    visual: {
      primary: '#38bdf8',
      secondary: '#e0f2fe',
      glow: '#7dd3fc',
      skin: '#f8fafc',
      eye: '#38bdf8',
      weapon: 'frost_scepter',
      head: 'ice_tiara',
      back: 'ice_crystals',
      attackVfx: 'proj_frost',
      ultVfx: 'ult_blizzard',
    },
  },
  {
    id: 'pyrrha',
    name: 'Пирра',
    title: 'Пламенный Феникс',
    faction: 'flame',
    rarity: 'legendary',
    role: 'mage',
    baseHp: 1260,
    baseAtk: 246,
    baseDef: 40,
    baseSpeed: 118,
    baseCrit: 0.22,
    skillName: 'Звездопад Инферно',
    skillDesc: 'Призывает метеоритный дождь по ВСЕМ врагам (210% АТК) и поджигает их на 2 хода (55% АТК за ход).',
    passiveName: 'Пепел Возрождения',
    passiveDesc: 'Крылья феникса наполняют каждую атаку обжигающим пламенем.',
    skillKind: 'aoe_burn',
    skillPower: 2.1,
    visual: {
      primary: '#f97316',
      secondary: '#facc15',
      glow: '#fb923c',
      skin: '#fde6d8',
      eye: '#fde047',
      weapon: 'astrolabe',
      head: 'phoenix_crown',
      back: 'phoenix_wings',
      attackVfx: 'proj_fire',
      ultVfx: 'ult_meteor',
    },
  },
  {
    id: 'sylva',
    name: 'Сильвана',
    title: 'Охотница Луны',
    faction: 'sylvan',
    rarity: 'legendary',
    role: 'ranger',
    baseHp: 1240,
    baseAtk: 242,
    baseDef: 40,
    baseSpeed: 124,
    baseCrit: 0.25,
    skillName: 'Звёздный Залп',
    skillDesc: 'Выпускает 4 лунные стрелы по случайным врагам (по 118% АТК каждая — до 472% урона боссу!).',
    passiveName: 'Благословение Артемиды',
    passiveDesc: 'Идеальна против одиночных боссов и этажей Башни Вечности.',
    skillKind: 'multi_arrow',
    skillPower: 1.18,
    visual: {
      primary: '#14b8a6',
      secondary: '#a7f3d0',
      glow: '#5eead4',
      skin: '#fce7d6',
      eye: '#6ee7b7',
      weapon: 'moon_bow',
      head: 'moon_circlet',
      back: 'star_quiver',
      attackVfx: 'proj_arrow',
      ultVfx: 'ult_bloom',
    },
  },
  {
    id: 'orion',
    name: 'Орион',
    title: 'Хранитель Космоса',
    faction: 'astral',
    rarity: 'legendary',
    role: 'mage',
    baseHp: 1380,
    baseAtk: 248,
    baseDef: 48,
    baseSpeed: 120,
    baseCrit: 0.22,
    skillName: 'Сверхновая',
    skillDesc: 'Взрывает звезду в гуще врагов (205% АТК всем), повышает крит отряда на +25% и даёт щит раненому союзнику.',
    passiveName: 'Нити Времени',
    passiveDesc: 'Герой Астрала: наносит повышенный урон любым стихиям.',
    skillKind: 'supernova_crit',
    skillPower: 2.05,
    visual: {
      primary: '#6366f1',
      secondary: '#facc15',
      glow: '#a5b4fc',
      skin: '#e0e7ff',
      eye: '#fde047',
      weapon: 'astrolabe',
      head: 'halo_visor',
      back: 'orbit_rings',
      attackVfx: 'proj_star',
      ultVfx: 'ult_supernova',
    },
  },
  {
    id: 'seraphina',
    name: 'Серафина',
    title: 'Валькирия Света',
    faction: 'astral',
    rarity: 'mythic',
    role: 'warrior',
    baseHp: 1680,
    baseAtk: 268,
    baseDef: 60,
    baseSpeed: 125,
    baseCrit: 0.24,
    skillName: 'Небесный Суд',
    skillDesc: 'Низвергает столпы света на ВСЕХ врагов (230% АТК), исцеляет отряд (125% АТК) и дарит союзникам +25 энергии!',
    passiveName: 'Шесть Золотых Крыльев',
    passiveDesc: 'Мифическая валькирия сочетает сокрушительный урон и небесную защиту.',
    skillKind: 'divine_judgment',
    skillPower: 2.3,
    visual: {
      primary: '#f59e0b',
      secondary: '#fef3c7',
      glow: '#fde047',
      skin: '#fff1e6',
      eye: '#fef08a',
      weapon: 'radiant_spear',
      head: 'valkyrie_wings',
      back: 'seraph_wings',
      attackVfx: 'proj_star',
      ultVfx: 'ult_judgment',
    },
  },
  {
    id: 'noctis',
    name: 'Ноктис',
    title: 'Владыка Теней',
    faction: 'astral',
    rarity: 'mythic',
    role: 'assassin',
    baseHp: 1460,
    baseAtk: 292,
    baseDef: 50,
    baseSpeed: 132,
    baseCrit: 0.3,
    skillName: 'Разлом Бездны',
    skillDesc: 'Рассекает пространство по ВСЕМ врагам (260% АТК) и похищает по 18 энергии у каждой поражённой цели!',
    passiveName: 'Венец Затмения',
    passiveDesc: 'Абсолютный хищник Бездны с высочайшей скоростью и критическим уроном.',
    skillKind: 'void_drain',
    skillPower: 2.6,
    visual: {
      primary: '#9333ea',
      secondary: '#f43f5e',
      glow: '#d946ef',
      skin: '#ede9fe',
      eye: '#fb7185',
      weapon: 'void_blade',
      head: 'void_horns',
      back: 'void_tendrils',
      attackVfx: 'slash_shadow',
      ultVfx: 'ult_abyss',
    },
  },
];

export function getHeroTemplate(heroId: string): HeroTemplate {
  const found = HERO_ROSTER.find((h) => h.id === heroId);
  if (!found) {
    const fallback = HERO_ROSTER[0];
    if (!fallback) {
      throw new Error('Hero roster cannot be empty');
    }
    return fallback;
  }
  return found;
}

export function getLevelUpCost(currentLevel: number): { readonly gold: number; readonly essence: number } {
  const gold = Math.floor(80 * Math.pow(1.135, currentLevel - 1) + currentLevel * 25);
  const essence = Math.floor(25 * Math.pow(1.12, currentLevel - 1) + currentLevel * 10);
  return { gold, essence };
}

export function getAscendShardCost(currentStars: number): number {
  if (currentStars >= 10) return 9999;
  return 15 + (currentStars - 1) * 10;
}

export function getRelicUpgradeCost(currentLevel: number): number {
  return Math.max(1, 2 + currentLevel * 2);
}

export function computeFactionAura(lineupTemplateIds: readonly (string | null)[]): FactionAura {
  const activeHeroes = lineupTemplateIds
    .filter((id): id is string => id !== null)
    .map((id) => getHeroTemplate(id));

  if (activeHeroes.length < 3) {
    return {
      id: 'none',
      name: 'Соберите 3+ героев',
      description: 'Поставьте минимум 3 героев в отряд для активации боевой ауры стихий.',
      hpBonus: 0,
      atkBonus: 0,
      critBonus: 0,
      active: false,
    };
  }

  const counts: Record<Faction, number> = {
    flame: 0,
    sylvan: 0,
    frost: 0,
    astral: 0,
  };
  for (const h of activeHeroes) {
    counts[h.faction] += 1;
  }

  if (activeHeroes.length === 5 && counts.astral >= 2) {
    return {
      id: 'astral_dominion',
      name: 'Владыки Астрала',
      description: '5 героев в строю (2+ Астрал): +25% HP, +25% АТК, +12% КРИТ',
      hpBonus: 0.25,
      atkBonus: 0.25,
      critBonus: 0.12,
      active: true,
    };
  }

  if (counts.flame >= 1 && counts.sylvan >= 1 && counts.frost >= 1 && counts.astral >= 1) {
    return {
      id: 'prismatic',
      name: 'Радужный Порядок',
      description: 'Все 4 стихии в отряде: +22% HP, +20% АТК, +10% КРИТ',
      hpBonus: 0.22,
      atkBonus: 0.2,
      critBonus: 0.1,
      active: true,
    };
  }

  const maxSame = Math.max(counts.flame, counts.sylvan, counts.frost, counts.astral);
  if (maxSame >= 3) {
    return {
      id: 'resonance',
      name: 'Резонанс Стихии',
      description: '3+ героя одной стихии: +18% HP, +16% АТК, +6% КРИТ',
      hpBonus: 0.18,
      atkBonus: 0.16,
      critBonus: 0.06,
      active: true,
    };
  }

  if (activeHeroes.length === 5) {
    return {
      id: 'legion_unity',
      name: 'Единство Легиона',
      description: 'Полный отряд из 5 героев: +12% HP, +10% АТК, +4% КРИТ',
      hpBonus: 0.12,
      atkBonus: 0.1,
      critBonus: 0.04,
      active: true,
    };
  }

  return {
    id: 'vanguard_pact',
    name: 'Малый Пакт',
    description: 'Отряд из 3–4 героев: +7% HP, +6% АТК',
    hpBonus: 0.07,
    atkBonus: 0.06,
    critBonus: 0,
    active: true,
  };
}

export function computeHeroStats(
  owned: OwnedHero,
  relics: RelicLevels,
  aura?: FactionAura,
): ComputedStats {
  const tpl = getHeroTemplate(owned.heroId);
  const lvlFactor = 1 + (owned.level - 1) * 0.145;
  const starFactor = Math.pow(1.22, owned.stars - 1);

  const weaponTier = EQUIP_TIERS[owned.equip.weapon]?.mult ?? 0;
  const armorTier = EQUIP_TIERS[owned.equip.armor]?.mult ?? 0;
  const ringTier = EQUIP_TIERS[owned.equip.ring]?.mult ?? 0;
  const relicTier = EQUIP_TIERS[owned.equip.relic]?.mult ?? 0;

  const hpEquipMult = 1 + armorTier + relicTier * 0.85;
  const atkEquipMult = 1 + weaponTier + ringTier * 0.7;

  const relicHpMult = 1 + relics.vitality * 0.07;
  const relicAtkMult = 1 + relics.valor * 0.06;
  const auraHpMult = 1 + (aura?.hpBonus ?? 0);
  const auraAtkMult = 1 + (aura?.atkBonus ?? 0);

  const maxHp = Math.round(tpl.baseHp * lvlFactor * starFactor * hpEquipMult * relicHpMult * auraHpMult);
  const atk = Math.round(tpl.baseAtk * lvlFactor * starFactor * atkEquipMult * relicAtkMult * auraAtkMult);
  const def = Math.round(tpl.baseDef * (1 + (owned.level - 1) * 0.1) * starFactor * (1 + armorTier * 0.6));
  const speed = Math.round(tpl.baseSpeed + owned.stars * 2 + (owned.equip.relic > 0 ? owned.equip.relic * 4 : 0));
  const crit = Math.min(
    0.85,
    tpl.baseCrit +
      ringTier * 0.22 +
      relics.precision * 0.025 +
      (aura?.critBonus ?? 0) +
      (owned.stars - 1) * 0.015,
  );

  const power = Math.round(maxHp * 0.22 + atk * 3.1 + def * 2.4 + speed * 1.8 + crit * 650);

  return { maxHp, atk, def, speed, crit, power };
}

export function formatCompactNumber(value: number): string {
  const n = Math.floor(value);
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export const QUEST_DEFINITIONS: readonly QuestDefinition[] = [
  {
    id: 'q_summon_5',
    title: 'Совершить 5 призывов героев',
    target: 5,
    statKey: 'totalSummons',
    rewardGems: 400,
    rewardGold: 2000,
    rewardScrolls: 2,
  },
  {
    id: 'q_kills_12',
    title: 'Победить 12 врагов в походе',
    target: 12,
    statKey: 'totalKills',
    rewardGems: 350,
    rewardGold: 2500,
    rewardScrolls: 1,
  },
  {
    id: 'q_lvl_5',
    title: 'Повысить героя до 5 уровня',
    target: 5,
    statKey: 'highestHeroLevel',
    rewardGems: 300,
    rewardGold: 3000,
    rewardScrolls: 1,
  },
  {
    id: 'q_stage_5',
    title: 'Пройти Босса Главы 1 (Этап 1-5)',
    target: 6,
    statKey: 'maxStage',
    rewardGems: 600,
    rewardGold: 5000,
    rewardScrolls: 3,
  },
  {
    id: 'q_summon_15',
    title: 'Призвать 15 героев в Портале',
    target: 15,
    statKey: 'totalSummons',
    rewardGems: 800,
    rewardGold: 6000,
    rewardScrolls: 3,
  },
  {
    id: 'q_lvl_12',
    title: 'Развить любого героя до 12 уровня',
    target: 12,
    statKey: 'highestHeroLevel',
    rewardGems: 650,
    rewardGold: 9000,
    rewardScrolls: 2,
  },
  {
    id: 'q_tower_3',
    title: 'Покорить 3 этаж Башни Вечности',
    target: 4,
    statKey: 'towerFloor',
    rewardGems: 750,
    rewardGold: 8000,
    rewardScrolls: 3,
  },
  {
    id: 'q_stage_10',
    title: 'Одолеть Босса Главы 2 (Этап 2-5)',
    target: 11,
    statKey: 'maxStage',
    rewardGems: 1200,
    rewardGold: 15000,
    rewardScrolls: 5,
  },
  {
    id: 'q_kills_60',
    title: 'Сокрушить 60 монстров Бездны',
    target: 60,
    statKey: 'totalKills',
    rewardGems: 900,
    rewardGold: 14000,
    rewardScrolls: 3,
  },
  {
    id: 'q_lvl_25',
    title: 'Возвысить героя до 25 уровня',
    target: 25,
    statKey: 'highestHeroLevel',
    rewardGems: 1500,
    rewardGold: 28000,
    rewardScrolls: 5,
  },
  {
    id: 'q_tower_10',
    title: 'Покорить 10 этаж Башни Вечности',
    target: 11,
    statKey: 'towerFloor',
    rewardGems: 1800,
    rewardGold: 35000,
    rewardScrolls: 8,
  },
  {
    id: 'q_stage_20',
    title: 'Пройти Главу 4 (Этап 4-5)',
    target: 21,
    statKey: 'maxStage',
    rewardGems: 2400,
    rewardGold: 55000,
    rewardScrolls: 10,
  },
];
