/**
 * «Хроники Эха» — core domain types.
 * Battle simulation is pure and UI-agnostic: everything the renderer needs
 * arrives as a replayable event log inside BattleResult.
 */

export type Faction = 'shadow' | 'abyss' | 'forest' | 'fortress' | 'light' | 'dark';

export type Role = 'tank' | 'warrior' | 'mage' | 'assassin' | 'healer' | 'support';

export type Rarity = 3 | 4 | 5;

/** Hero growth rank. 5★ base → 6..10★ → E1..E5 → T1..T5 (Transcendence). */
export type Rank = 5 | 6 | 7 | 8 | 9 | 10 | 'E1' | 'E2' | 'E3' | 'E4' | 'E5' | 'T1' | 'T2' | 'T3' | 'T4' | 'T5';

export type EquipSlot = 'weapon' | 'armor' | 'trinket' | 'boots';

export interface BaseStats {
  hp: number;
  atk: number;
  def: number;
  spd: number;
  /** 0..1 */
  crit: number;
  /** multiplier, e.g. 1.5 = 150% damage on crit */
  critDmg: number;
  /** flat armor penetration percent, 0..1 */
  armorBreak: number;
  /** fraction of dealt damage returned as HP, 0..1 */
  lifesteal: number;
}

export type SkillTarget =
  | 'enemyFrontFirst' // default single-target order: front slot 1 → slot 2 → back row
  | 'enemyAll'
  | 'enemyBackRow'
  | 'enemyLowestHp'
  | 'allyLowestHp'
  | 'allyAll';

export type SkillEffect =
  | { kind: 'damage'; mult: number; target: SkillTarget }
  | { kind: 'heal'; mult: number; target: SkillTarget } // mult of caster ATK
  | { kind: 'shield'; mult: number; target: SkillTarget } // absorbs damage, mult of caster ATK
  | { kind: 'buffAtk'; mult: number; rounds: number; target: SkillTarget } // +% ATK to allies
  | { kind: 'debuffDef'; mult: number; rounds: number; target: SkillTarget }; // -% DEF to enemies

export interface SkillDef {
  name: string;
  /** proc chance per turn, 0..1 — never 100% for actives */
  chance: number;
  effect: SkillEffect;
  desc: string;
}

export interface HeroDef {
  id: string;
  name: string;
  title: string;
  faction: Faction;
  role: Role;
  rarity: Rarity;
  emoji: string;
  base: BaseStats;
  /** growth per level, e.g. 0.08 = +8% per level */
  growth: number;
  skill: SkillDef;
  /** passive aura text, small always-on bonus encoded in `passive` */
  passiveName: string;
  passiveDesc: string;
  /**
   * Passive bonuses. Semantics (see stats.ts):
   * hp/def — fractional multiplier (+0.1 = +10%); atk — fractional (+0.08 = +8%);
   * spd — flat add; crit/armorBreak/lifesteal — flat add to chance; critDmg — flat add to multiplier.
   */
  passive: Partial<BaseStats>;
}

export interface EquipItem {
  uid: string;
  slot: EquipSlot;
  name: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  /** fractional bonuses, e.g. { hp: 0.12, atk: 0.08 } */
  bonus: Partial<Record<'hp' | 'atk' | 'def' | 'spd' | 'crit', number>>;
  /** legendary unique effect id */
  special?: 'firstStrikeCrit' | 'critChance5' | 'roundOneShield' | 'executeLow';
  specialDesc?: string;
}

export interface HeroState {
  uid: string;
  defId: string;
  level: number;
  rank: Rank;
  /** universal shards banked for THIS hero (dupes convert here) */
  copies: number;
  equip: Partial<Record<EquipSlot, EquipItem>>;
  /** Shadow Pact debuffs (14.4) */
  pactHpBattles: number; // battles left with -20% HP
  pactSilenceBattles: number; // battles left without skill casts
}

/** Team layout: slots 0..1 = front row, 2..5 = back row. */
export type TeamSlots = (string | null)[]; // 6 hero uids

export interface AuraInfo {
  id: string;
  name: string;
  desc: string;
  mods: Partial<BaseStats & { healPower: number; controlImmunity: number }>;
}

export interface ComputedStats extends BaseStats {
  healPower: number;
  controlImmunity: number;
}

/* ------------------------------- Battle -------------------------------- */

export type BattleEvent =
  | { t: 'round'; n: number }
  | { t: 'turn'; side: Side; unit: number }
  | { t: 'cast'; side: Side; unit: number; skill: string } // visual "about to cast" marker
  | { t: 'attack'; side: Side; unit: number; targetSide: Side; target: number }
  | { t: 'damage'; side: Side; unit: number; targetSide: Side; target: number; amount: number; crit: boolean; blocked: number; targetDead: boolean }
  | { t: 'heal'; side: Side; unit: number; amount: number }
  | { t: 'shield'; side: Side; unit: number; amount: number }
  | { t: 'buff'; side: Side; unit: number; text: string }
  | { t: 'debuff'; side: Side; unit: number; text: string }
  | { t: 'lifesteal'; side: Side; unit: number; amount: number }
  | { t: 'death'; side: Side; unit: number }
  | { t: 'revive'; side: Side; unit: number; hp: number } // Echo buff «Воскрешение»
  | { t: 'end'; victory: boolean; rounds: number };

export type Side = 'ally' | 'enemy';

export interface BattleUnitSnapshot {
  side: Side;
  index: number; // 0..5, 0-1 front row
  defId: string;
  name: string;
  emoji: string;
  faction: Faction;
  rarity: Rarity;
  rank: Rank;
  level: number;
  hp: number;
  maxHp: number;
  isBoss?: boolean;
}

export interface BattleResult {
  victory: boolean;
  rounds: number;
  events: BattleEvent[];
  allies: BattleUnitSnapshot[];
  enemies: BattleUnitSnapshot[];
  fallenAllies: number; // heroes that died — feeds «Эхо павших»
  fallenEnemies: number;
  /** ally hero uids in slot order (for echo/pact bookkeeping) */
  allyUids: (string | null)[];
  firstHitDamage: number; // FTUE pause moment
  powerAlly: number;
  powerEnemy: number;
}

export interface BattleModifiers {
  /** Echo of the Fallen active buff (14.1) */
  echoBuff?: 'atk3' | 'hp1' | 'revive' | null;
  /** Shadow Pact (14.4): index of allied slot with +30% damage this battle */
  pactSlot?: number | null;
  /** admin_force_win / admin_force_lose */
  forceResult?: 'win' | 'lose' | null;
  /** Mirror Labyrinth enemy modifiers (14.3) */
  mirror?: { hpMult?: number; skillChanceMult?: number; noHealers?: boolean } | null;
}

/* ------------------------------ Meta state ------------------------------ */

export type BuffKind = 'atk3' | 'hp1' | 'revive';

export interface ActiveBuff {
  kind: BuffKind;
  battlesLeft: number;
}

export interface QuestState {
  id: string;
  progress: number;
  target: number;
  claimed: boolean;
}

export interface GameState {
  saveVersion: number;
  resources: {
    gold: number;
    heroExp: number; // shared exp pool spent on levels
    crystals: number; // premium currency «Кристаллы Эха»
    shards: number; // rare star-up currency
    souls: number; // осколки душ (14.1 / 14.2), capped at 20
    scrolls: number; // summon scrolls
    fodder: number; // «еда» count (3★ fodder heroes abstracted as a count)
  };
  heroes: Record<string, HeroState>;
  team: TeamSlots;
  campaign: { stage: number; maxStage: number }; // stage = next to beat
  tower: { floor: number; bestFloor: number; lastResetDay: string };
  labyrinth: { unlocked: boolean; floor: number; weekKey: string; completedWeeks: number };
  prestige: { ascensions: number; multiplier: number };
  echo: { buff: ActiveBuff | null; totalEarned: number };
  pact: { slot: number | null };
  daily: { lastClaimDay: number; streak: number; lastClaimDate: string };
  quests: { daily: QuestState[]; weekly: QuestState[]; dailyDate: string; weeklyKey: string };
  diary: string[]; // unlocked entry ids (14.5)
  pity: { premium: number }; // summons since last 5★
  settings: { muted: boolean; theme: 'dark' | 'light' };
  stats: {
    battlesWon: number;
    battlesLost: number;
    kills: number;
    summons: number;
    upgrades: number;
    forges: number;
    adWatches: number;
    firstPayment: boolean;
  };
  adsToday: { date: string; count: number };
  codes: { used: string[]; history: { code: string; ok: boolean; at: number }[] };
  ftue: { step: number; done: boolean };
  goals: { id: string; progress: number }[];
  lastSeen: number; // offline income anchor
  inventory: EquipItem[]; // unequipped forged items
  forcedNextResult: 'win' | 'lose' | null;
  devFlags: { fps: boolean; hitboxes: boolean };
  createdAt: number;
}

export interface RewardBundle {
  gold?: number;
  heroExp?: number;
  crystals?: number;
  shards?: number;
  souls?: number;
  scrolls?: number;
  fodder?: number;
  heroDefId?: string;
}
