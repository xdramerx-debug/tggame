import type { BattleUnit, Faction, HeroRole, HeroVisualSpec, StageBiome, StageDefinition } from './types';

export const BIOMES: readonly StageBiome[] = [
  {
    id: 'ash_citadel',
    chapterName: 'Пепельные Руины',
    skyTop: '#2a0f18',
    skyMid: '#4c1d24',
    floorColor: '#1f1218',
    accentColor: '#fb7185',
    particleKind: 'embers',
  },
  {
    id: 'emerald_wilds',
    chapterName: 'Изумрудный Лес',
    skyTop: '#08201e',
    skyMid: '#113a34',
    floorColor: '#0c221d',
    accentColor: '#34d399',
    particleKind: 'fireflies',
  },
  {
    id: 'frost_spire',
    chapterName: 'Цитадель Стужи',
    skyTop: '#09182e',
    skyMid: '#13325c',
    floorColor: '#0d2038',
    accentColor: '#38bdf8',
    particleKind: 'snow',
  },
  {
    id: 'eclipse_temple',
    chapterName: 'Храм Затмения',
    skyTop: '#160b2e',
    skyMid: '#2e1559',
    floorColor: '#170d2e',
    accentColor: '#c084fc',
    particleKind: 'void',
  },
  {
    id: 'celestial_throne',
    chapterName: 'Небесный Престол',
    skyTop: '#1c1608',
    skyMid: '#423012',
    floorColor: '#241b0c',
    accentColor: '#fbbf24',
    particleKind: 'stars',
  },
];

interface MonsterArchetype {
  readonly id: string;
  readonly name: string;
  readonly title: string;
  readonly faction: Faction;
  readonly role: HeroRole;
  readonly hpMult: number;
  readonly atkMult: number;
  readonly skillName: string;
  readonly visual: HeroVisualSpec;
}

const MONSTER_POOL: readonly MonsterArchetype[] = [
  {
    id: 'm_ash_guard',
    name: 'Страж Углей',
    title: 'Слуга Пепла',
    faction: 'flame',
    role: 'tank',
    hpMult: 1.15,
    atkMult: 0.85,
    skillName: 'Раскалённый Таран',
    visual: {
      primary: '#b91c1c',
      secondary: '#f97316',
      glow: '#ef4444',
      skin: '#451a1a',
      eye: '#fde047',
      weapon: 'monster_claw',
      head: 'demon_skull',
      back: 'chains',
      attackVfx: 'slash_fire',
      ultVfx: 'ult_meteor',
    },
  },
  {
    id: 'm_thorn_stalker',
    name: 'Шипастый Ловец',
    title: 'Тень Чащи',
    faction: 'sylvan',
    role: 'assassin',
    hpMult: 0.88,
    atkMult: 1.12,
    skillName: 'Ядовитый Выпад',
    visual: {
      primary: '#15803d',
      secondary: '#84cc16',
      glow: '#4ade80',
      skin: '#14532d',
      eye: '#bef264',
      weapon: 'dual_daggers',
      head: 'hooded_rogue',
      back: 'leaf_mantle',
      attackVfx: 'slash_wind',
      ultVfx: 'ult_bloom',
    },
  },
  {
    id: 'm_frost_wraith',
    name: 'Вестник Стужи',
    title: 'Дух Метели',
    faction: 'frost',
    role: 'mage',
    hpMult: 0.9,
    atkMult: 1.08,
    skillName: 'Ледяной Осколок',
    visual: {
      primary: '#0369a1',
      secondary: '#67e8f9',
      glow: '#38bdf8',
      skin: '#0f172a',
      eye: '#67e8f9',
      weapon: 'frost_scepter',
      head: 'reaper_cowl',
      back: 'wraith_shroud',
      attackVfx: 'proj_frost',
      ultVfx: 'ult_blizzard',
    },
  },
  {
    id: 'm_void_acolyte',
    name: 'Адепт Бездны',
    title: 'Голос Затмения',
    faction: 'astral',
    role: 'mage',
    hpMult: 0.95,
    atkMult: 1.15,
    skillName: 'Тёмный Импульс',
    visual: {
      primary: '#6d28d9',
      secondary: '#f43f5e',
      glow: '#c084fc',
      skin: '#1e1b4b',
      eye: '#f43f5e',
      weapon: 'void_blade',
      head: 'void_horns',
      back: 'void_tendrils',
      attackVfx: 'slash_shadow',
      ultVfx: 'ult_abyss',
    },
  },
];

const BOSS_POOL: readonly MonsterArchetype[] = [
  {
    id: 'boss_ignivar',
    name: 'Игнивар Разрушитель',
    title: 'Повелитель Вулкана',
    faction: 'flame',
    role: 'warrior',
    hpMult: 2.35,
    atkMult: 1.32,
    skillName: 'Катаклизм Пепла',
    visual: {
      primary: '#dc2626',
      secondary: '#facc15',
      glow: '#fb7185',
      skin: '#290d0d',
      eye: '#fef08a',
      weapon: 'boss_mace',
      head: 'demon_skull',
      back: 'phoenix_wings',
      attackVfx: 'slash_fire',
      ultVfx: 'ult_meteor',
    },
  },
  {
    id: 'boss_verdan',
    name: 'Морвейн Древний',
    title: 'Хранитель Корней',
    faction: 'sylvan',
    role: 'tank',
    hpMult: 2.5,
    atkMult: 1.25,
    skillName: 'Гнев Древнего Леса',
    visual: {
      primary: '#059669',
      secondary: '#bef264',
      glow: '#34d399',
      skin: '#062c1b',
      eye: '#fde047',
      weapon: 'boss_mace',
      head: 'antler_crown',
      back: 'leaf_mantle',
      attackVfx: 'proj_nature',
      ultVfx: 'ult_bloom',
    },
  },
  {
    id: 'boss_skadi',
    name: 'Вальгард Ледяной',
    title: 'Король Вечной Зимы',
    faction: 'frost',
    role: 'mage',
    hpMult: 2.3,
    atkMult: 1.36,
    skillName: 'Абсолютный Ноль',
    visual: {
      primary: '#0284c7',
      secondary: '#e0f2fe',
      glow: '#38bdf8',
      skin: '#0c192c',
      eye: '#7dd3fc',
      weapon: 'frost_scythe',
      head: 'viking_horns',
      back: 'ice_crystals',
      attackVfx: 'slash_frost',
      ultVfx: 'ult_blizzard',
    },
  },
  {
    id: 'boss_malakor',
    name: 'Малакор Звездолом',
    title: 'Архонт Пустоты',
    faction: 'astral',
    role: 'warrior',
    hpMult: 2.6,
    atkMult: 1.42,
    skillName: 'Гибель Созвездий',
    visual: {
      primary: '#7e22ce',
      secondary: '#fbbf24',
      glow: '#e879f9',
      skin: '#17092b',
      eye: '#fb7185',
      weapon: 'boss_mace',
      head: 'void_horns',
      back: 'seraph_wings',
      attackVfx: 'slash_shadow',
      ultVfx: 'ult_abyss',
    },
  },
];

function createMonsterUnit(
  arch: MonsterArchetype,
  uid: string,
  slot: number,
  level: number,
  scaleHp: number,
  scaleAtk: number,
  isBoss: boolean,
): BattleUnit {
  const maxHp = Math.round(520 * scaleHp * arch.hpMult);
  const atk = Math.round(68 * scaleAtk * arch.atkMult);
  const def = Math.round(16 + level * 3.2);
  return {
    uid,
    templateId: arch.id,
    name: arch.name,
    title: arch.title,
    side: 'enemy',
    slot,
    faction: arch.faction,
    rarity: isBoss ? 'mythic' : level >= 10 ? 'legendary' : 'rare',
    role: arch.role,
    level,
    stars: Math.min(5, 1 + Math.floor(level / 6)),
    isBoss,
    visual: arch.visual,
    skillName: arch.skillName,
    skillKind: 'aoe_damage',
    skillPower: isBoss ? 1.55 : 1.3,
    maxHp,
    hp: maxHp,
    shield: 0,
    atk,
    def,
    speed: (isBoss ? 98 : 90) + Math.min(25, level),
    crit: isBoss ? 0.16 : 0.08,
    energy: isBoss ? 40 : 20,
    frozenTurns: 0,
    burnTurns: 0,
    burnDamage: 0,
    atkBuffTurns: 0,
    critBuffTurns: 0,
  };
}

export function buildStageDefinition(stageNumber: number): StageDefinition {
  const safeStage = Math.max(1, Math.floor(stageNumber));
  const chapter = Math.floor((safeStage - 1) / 5) + 1;
  const stageInChapter = ((safeStage - 1) % 5) + 1;
  const isBossStage = stageInChapter === 5;
  const biome = BIOMES[(chapter - 1) % BIOMES.length] ?? BIOMES[0];
  if (!biome) {
    throw new Error('Biomes must be non-empty');
  }

  const scaleHp = Math.pow(1.205, safeStage - 1);
  const scaleAtk = Math.pow(1.165, safeStage - 1);

  const enemies: BattleUnit[] = [];

  if (isBossStage) {
    const bossArch = BOSS_POOL[(chapter - 1) % BOSS_POOL.length] ?? BOSS_POOL[0];
    const guardA = MONSTER_POOL[(chapter * 2) % MONSTER_POOL.length] ?? MONSTER_POOL[0];
    const guardB = MONSTER_POOL[(chapter * 2 + 1) % MONSTER_POOL.length] ?? MONSTER_POOL[1];
    if (bossArch && guardA && guardB) {
      enemies.push(createMonsterUnit(bossArch, `e_${safeStage}_boss`, 0, safeStage + 1, scaleHp, scaleAtk, true));
      enemies.push(createMonsterUnit(guardA, `e_${safeStage}_g1`, 2, safeStage, scaleHp * 0.72, scaleAtk * 0.82, false));
      enemies.push(createMonsterUnit(guardB, `e_${safeStage}_g2`, 4, safeStage, scaleHp * 0.72, scaleAtk * 0.82, false));
    }
  } else {
    const count = safeStage === 1 ? 2 : safeStage <= 3 ? 3 : 4;
    const slots = count === 2 ? [0, 3] : count === 3 ? [0, 1, 3] : [0, 1, 2, 4];
    for (let i = 0; i < slots.length; i += 1) {
      const slot = slots[i] ?? 0;
      const arch = MONSTER_POOL[(safeStage + i) % MONSTER_POOL.length] ?? MONSTER_POOL[0];
      if (arch) {
        enemies.push(createMonsterUnit(arch, `e_${safeStage}_${i}`, slot, safeStage, scaleHp, scaleAtk, false));
      }
    }
  }

  const goldReward = Math.round(140 * Math.pow(1.18, safeStage - 1) * (isBossStage ? 2.4 : 1));
  const essenceReward = Math.round(55 * Math.pow(1.16, safeStage - 1) * (isBossStage ? 2.2 : 1));
  const gemReward = isBossStage ? 120 + chapter * 30 : 20;
  const relicStoneReward = isBossStage ? 2 + Math.floor(chapter / 2) : 0;

  const idleGoldPerMin = Math.round(95 * Math.pow(1.15, safeStage - 1));
  const idleEssencePerMin = Math.round(36 * Math.pow(1.14, safeStage - 1));

  return {
    stageNumber: safeStage,
    chapter,
    stageInChapter,
    isBossStage,
    label: isBossStage ? `${chapter}-${stageInChapter} БОСС` : `${chapter}-${stageInChapter}`,
    biome,
    enemies,
    goldReward,
    essenceReward,
    gemReward,
    relicStoneReward,
    idleGoldPerMin,
    idleEssencePerMin,
  };
}

export interface TowerFloorDefinition {
  readonly floor: number;
  readonly enemies: BattleUnit[];
  readonly rewardGems: number;
  readonly rewardGold: number;
  readonly rewardEssence: number;
  readonly rewardRelicStones: number;
  readonly recommendedPower: number;
}

export function buildTowerFloor(floor: number): TowerFloorDefinition {
  const safeFloor = Math.max(1, Math.floor(floor));
  const scaleHp = Math.pow(1.26, safeFloor - 1) * 1.25;
  const scaleAtk = Math.pow(1.21, safeFloor - 1) * 1.18;

  const bossArch = BOSS_POOL[(safeFloor - 1) % BOSS_POOL.length] ?? BOSS_POOL[0];
  const mageArch = MONSTER_POOL[(safeFloor + 1) % MONSTER_POOL.length] ?? MONSTER_POOL[0];
  const guardArch = MONSTER_POOL[safeFloor % MONSTER_POOL.length] ?? MONSTER_POOL[1];

  const enemies: BattleUnit[] = [];
  if (bossArch && guardArch && mageArch) {
    enemies.push(createMonsterUnit(guardArch, `tw_${safeFloor}_0`, 0, safeFloor * 2, scaleHp * 0.8, scaleAtk * 0.85, false));
    enemies.push(createMonsterUnit(bossArch, `tw_${safeFloor}_boss`, 1, safeFloor * 2 + 1, scaleHp * 1.15, scaleAtk, true));
    enemies.push(createMonsterUnit(mageArch, `tw_${safeFloor}_2`, 2, safeFloor * 2, scaleHp * 0.75, scaleAtk * 0.95, false));
    enemies.push(createMonsterUnit(mageArch, `tw_${safeFloor}_4`, 4, safeFloor * 2, scaleHp * 0.75, scaleAtk * 0.95, false));
  }

  const totalPower = enemies.reduce(
    (sum, e) => sum + Math.round(e.maxHp * 0.22 + e.atk * 3.1 + e.def * 2.4 + e.speed * 1.8),
    0,
  );

  return {
    floor: safeFloor,
    enemies,
    rewardGems: 150 + safeFloor * 35,
    rewardGold: Math.round(450 * Math.pow(1.25, safeFloor - 1)),
    rewardEssence: Math.round(180 * Math.pow(1.23, safeFloor - 1)),
    rewardRelicStones: 2 + Math.floor(safeFloor / 2),
    recommendedPower: totalPower,
  };
}
