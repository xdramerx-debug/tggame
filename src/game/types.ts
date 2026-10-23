export type Faction = 'flame' | 'frost' | 'sylvan' | 'astral';

export type Rarity = 'rare' | 'epic' | 'legendary' | 'mythic';

export type HeroRole = 'tank' | 'warrior' | 'mage' | 'assassin' | 'ranger' | 'healer';

export type EquipSlot = 'weapon' | 'armor' | 'ring' | 'relic';

export type WeaponStyle =
  | 'greatsword'
  | 'dual_daggers'
  | 'nature_staff'
  | 'frost_scepter'
  | 'shield_axe'
  | 'twin_axes'
  | 'moon_bow'
  | 'frost_scythe'
  | 'radiant_spear'
  | 'void_blade'
  | 'astrolabe'
  | 'monster_claw'
  | 'boss_mace';

export type HeadStyle =
  | 'knight_crest'
  | 'hooded_rogue'
  | 'antler_crown'
  | 'ice_tiara'
  | 'viking_horns'
  | 'phoenix_crown'
  | 'berserker_mane'
  | 'moon_circlet'
  | 'reaper_cowl'
  | 'valkyrie_wings'
  | 'void_horns'
  | 'halo_visor'
  | 'demon_skull';

export type BackStyle =
  | 'cape'
  | 'scarf'
  | 'leaf_mantle'
  | 'ice_crystals'
  | 'fur_cloak'
  | 'phoenix_wings'
  | 'chains'
  | 'star_quiver'
  | 'wraith_shroud'
  | 'seraph_wings'
  | 'void_tendrils'
  | 'orbit_rings';

export type VfxKind =
  | 'slash_fire'
  | 'slash_wind'
  | 'slash_shadow'
  | 'slash_frost'
  | 'proj_fire'
  | 'proj_frost'
  | 'proj_nature'
  | 'proj_arrow'
  | 'proj_star'
  | 'ult_meteor'
  | 'ult_blizzard'
  | 'ult_bloom'
  | 'ult_judgment'
  | 'ult_abyss'
  | 'ult_supernova';

export interface HeroVisualSpec {
  readonly primary: string;
  readonly secondary: string;
  readonly glow: string;
  readonly skin: string;
  readonly eye: string;
  readonly weapon: WeaponStyle;
  readonly head: HeadStyle;
  readonly back: BackStyle;
  readonly attackVfx: VfxKind;
  readonly ultVfx: VfxKind;
}

export type SkillEffectKind =
  | 'aoe_damage'
  | 'front_cleave_shield'
  | 'heal_all_buff'
  | 'assassinate_reset'
  | 'aoe_freeze'
  | 'team_shield_smash'
  | 'aoe_burn'
  | 'lifesteal_burst'
  | 'multi_arrow'
  | 'execute_backline'
  | 'divine_judgment'
  | 'void_drain'
  | 'supernova_crit';

export interface HeroTemplate {
  readonly id: string;
  readonly name: string;
  readonly title: string;
  readonly faction: Faction;
  readonly rarity: Rarity;
  readonly role: HeroRole;
  readonly baseHp: number;
  readonly baseAtk: number;
  readonly baseDef: number;
  readonly baseSpeed: number;
  readonly baseCrit: number; // e.g., 0.15 = 15%
  readonly skillName: string;
  readonly skillDesc: string;
  readonly passiveName: string;
  readonly passiveDesc: string;
  readonly skillKind: SkillEffectKind;
  readonly skillPower: number; // multiplier e.g. 2.1 = 210% ATK
  readonly visual: HeroVisualSpec;
}

export interface OwnedHero {
  readonly heroId: string;
  readonly level: number;
  readonly stars: number; // 1 to 10 (1..5 gold stars, 6..10 crimson/astral stars)
  readonly shards: number;
  readonly equip: Record<EquipSlot, number>; // 0 = empty, 1..6 = tier level
}

export interface RelicLevels {
  readonly valor: number; // +ATK %
  readonly vitality: number; // +HP %
  readonly precision: number; // +Crit %
  readonly wisdom: number; // +Starting Energy & Skill DMG
}

export interface FactionAura {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly hpBonus: number;
  readonly atkBonus: number;
  readonly critBonus: number;
  readonly active: boolean;
}

export interface ComputedStats {
  readonly maxHp: number;
  readonly atk: number;
  readonly def: number;
  readonly speed: number;
  readonly crit: number;
  readonly power: number;
}

export interface BattleUnit {
  readonly uid: string;
  readonly templateId: string;
  readonly name: string;
  readonly title: string;
  readonly side: 'ally' | 'enemy';
  readonly slot: number; // 0,1 = front row; 2,3,4 = back row
  readonly faction: Faction;
  readonly rarity: Rarity;
  readonly role: HeroRole;
  readonly level: number;
  readonly stars: number;
  readonly isBoss: boolean;
  readonly visual: HeroVisualSpec;
  readonly skillName: string;
  readonly skillKind: SkillEffectKind;
  readonly skillPower: number;
  maxHp: number;
  hp: number;
  shield: number;
  atk: number;
  def: number;
  speed: number;
  crit: number;
  energy: number; // 0..100+
  frozenTurns: number;
  burnTurns: number;
  burnDamage: number;
  atkBuffTurns: number;
  critBuffTurns: number;
}

export interface TargetImpact {
  readonly targetUid: string;
  readonly amount: number;
  readonly isCrit: boolean;
  readonly isHeal: boolean;
  readonly isShield: boolean;
  readonly isWeakness: boolean;
  readonly killed: boolean;
  readonly statusApplied?: 'freeze' | 'burn' | 'atk_up' | 'energy';
}

export interface BattleStepResult {
  readonly actorUid: string;
  readonly actorName: string;
  readonly actorSide: 'ally' | 'enemy';
  readonly isUlt: boolean;
  readonly skillName: string;
  readonly vfx: VfxKind;
  readonly impacts: readonly TargetImpact[];
  readonly outcome: 'ongoing' | 'victory' | 'defeat';
}

export interface StageBiome {
  readonly id: string;
  readonly chapterName: string;
  readonly skyTop: string;
  readonly skyMid: string;
  readonly floorColor: string;
  readonly accentColor: string;
  readonly particleKind: 'embers' | 'fireflies' | 'snow' | 'void' | 'stars';
}

export interface StageDefinition {
  readonly stageNumber: number; // 1, 2, 3...
  readonly chapter: number;
  readonly stageInChapter: number; // 1..5
  readonly isBossStage: boolean;
  readonly label: string; // e.g. "1-5 БОСС"
  readonly biome: StageBiome;
  readonly enemies: BattleUnit[];
  readonly goldReward: number;
  readonly essenceReward: number;
  readonly gemReward: number;
  readonly relicStoneReward: number;
  readonly idleGoldPerMin: number;
  readonly idleEssencePerMin: number;
}

export interface SummonResultItem {
  readonly heroId: string;
  readonly isNew: boolean;
  readonly shardsGranted: number;
  readonly rarity: Rarity;
}

export interface QuestDefinition {
  readonly id: string;
  readonly title: string;
  readonly target: number;
  readonly statKey: 'totalKills' | 'maxStage' | 'totalSummons' | 'highestHeroLevel' | 'towerFloor';
  readonly rewardGems: number;
  readonly rewardGold: number;
  readonly rewardScrolls: number;
}
