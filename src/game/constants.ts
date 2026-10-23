import type { Faction, Rank, RewardBundle, Role } from './types';

export const GAME_NAME = 'Хроники Эха';
export const GAME_TAGLINE = 'Шесть фракций. Одно эхо. Твой отряд решает всё.';
export const SAVE_KEY = 'echo-chronicles-save';
export const SAVE_VERSION = 2;

export const OFFLINE_CAP_HOURS = 12;
export const SOUL_CAP = 20; // 14.1: не больше 20 осколков в запасе
export const MAX_LEVEL = 100;
export const MAX_BATTLE_ROUNDS = 30;
export const ADS_PER_DAY = 5;

export const FACTION_META: Record<Faction, { name: string; color: string; emoji: string; bonus: string }> = {
  shadow: { name: 'Тень', color: '#a78bfa', emoji: '🌑', bonus: '+20% пробитие брони' },
  abyss: { name: 'Бездна', color: '#f472b6', emoji: '🕳️', bonus: '+8% вампиризм' },
  forest: { name: 'Лес', color: '#4ade80', emoji: '🌿', bonus: '+25% сила лечения' },
  fortress: { name: 'Крепость', color: '#fbbf24', emoji: '🛡️', bonus: '+25% броня' },
  light: { name: 'Свет', color: '#fde68a', emoji: '✨', bonus: '+30% иммунитет к контролю' },
  dark: { name: 'Тьма', color: '#818cf8', emoji: '🔮', bonus: '+30% иммунитет, +10% крит' },
};

export const ROLE_META: Record<Role, { name: string; emoji: string }> = {
  tank: { name: 'Танк', emoji: '🛡️' },
  warrior: { name: 'Воин', emoji: '⚔️' },
  mage: { name: 'Маг', emoji: '🔥' },
  assassin: { name: 'Убийца', emoji: '🗡️' },
  healer: { name: 'Лекарь', emoji: '💚' },
  support: { name: 'Поддержка', emoji: '🎐' },
};

export const RARITY_NAME: Record<number, string> = { 3: 'Обычный', 4: 'Редкий', 5: 'Легендарный' };

/** Rank ladder order for progression. */
export const RANK_ORDER: Rank[] = [5, 6, 7, 8, 9, 10, 'E1', 'E2', 'E3', 'E4', 'E5', 'T1', 'T2', 'T3', 'T4', 'T5'];

export const RANK_LABEL: Record<string, string> = {
  '5': '5★', '6': '6★', '7': '7★', '8': '8★', '9': '9★', '10': '10★',
  E1: 'E1', E2: 'E2', E3: 'E3', E4: 'E4', E5: 'E5',
  T1: 'T1', T2: 'T2', T3: 'T3', T4: 'T4', T5: 'T5',
};

/** Stat multiplier per rank (applied to level-scaled stats). */
export const RANK_STAT_MULT: Record<string, number> = {
  '5': 1, '6': 1.25, '7': 1.55, '8': 1.95, '9': 2.5, '10': 3.2,
  E1: 4.2, E2: 5.5, E3: 7.2, E4: 9.4, E5: 12.5,
  T1: 17, T2: 23, T3: 31, T4: 42, T5: 58,
};

/** Star-up costs: shards (of that hero) + fodder count. Fodder required from E1+. */
export const RANK_UP_COST: Record<string, { shards: number; fodder: number; gold: number }> = {
  '6': { shards: 20, fodder: 0, gold: 5_000 },
  '7': { shards: 40, fodder: 0, gold: 12_000 },
  '8': { shards: 80, fodder: 0, gold: 30_000 },
  '9': { shards: 150, fodder: 0, gold: 60_000 },
  '10': { shards: 250, fodder: 0, gold: 120_000 },
  E1: { shards: 400, fodder: 3, gold: 250_000 },
  E2: { shards: 600, fodder: 5, gold: 450_000 },
  E3: { shards: 900, fodder: 8, gold: 750_000 },
  E4: { shards: 1300, fodder: 12, gold: 1_200_000 },
  E5: { shards: 2000, fodder: 18, gold: 2_000_000 },
  T1: { shards: 3000, fodder: 0, gold: 3_500_000 },
  T2: { shards: 4500, fodder: 0, gold: 5_500_000 },
  T3: { shards: 6500, fodder: 0, gold: 8_000_000 },
  T4: { shards: 9000, fodder: 0, gold: 12_000_000 },
  T5: { shards: 12_000, fodder: 0, gold: 18_000_000 },
};

export const EQUIP_SLOTS = ['weapon', 'armor', 'trinket', 'boots'] as const;

export const EQUIP_SLOT_NAME: Record<string, string> = {
  weapon: 'Оружие', armor: 'Броня', trinket: 'Аксессуар', boots: 'Сапоги',
};

/** Soul Forge (14.2): craft cost & visible odds. */
export const FORGE_COST_SOULS = 8;
export const FORGE_ODDS = [
  { rarity: 'common' as const, p: 0.5 },
  { rarity: 'rare' as const, p: 0.3 },
  { rarity: 'epic' as const, p: 0.15 },
  { rarity: 'legendary' as const, p: 0.05 },
];
export const SALVAGE_SOULS = [2, 3]; // частичный возврат при разборе

/** Echo buffs (14.1) — не складываются, только заменяют друг друга. */
export const ECHO_BUFFS = [
  { kind: 'atk3' as const, name: 'Гнев павших', desc: '+10% к атаке отряда на 3 боя', cost: 3, battles: 3 },
  { kind: 'hp1' as const, name: 'Щит памяти', desc: '+15% к HP отряда на 1 бой', cost: 4, battles: 1 },
  { kind: 'revive' as const, name: 'Второе дыхание', desc: 'Воскресить первого павшего героя с 30% HP', cost: 6, battles: 1 },
];

/** Mirror Labyrinth modifiers (14.3). */
export const LABYRINTH_MODS = [
  { id: 'hp', name: 'Гиганты', desc: 'Все враги имеют +50% HP', hpMult: 1.5 },
  { id: 'haste', name: 'Бешеный ритм', desc: 'Враги кастуют навыки в 2 раза чаще', skillChanceMult: 2 },
  { id: 'shields', name: 'Без лекарей, но в щитах', desc: 'У врагов нет лекарей, зато каждый начинает со щитом', noHealers: true },
  { id: 'hp2', name: 'Титаны эха', desc: 'Все враги имеют +80% HP', hpMult: 1.8 },
  { id: 'haste2', name: 'Шторм навыков', desc: 'Враги кастуют в 2.5 раза чаще и сильнее на 10%', skillChanceMult: 2.5, hpMult: 1.1 },
];
export const LABYRINTH_FLOORS = 5;
export const LABYRINTH_UNLOCK_STAGE = 10; // открывается после 10-го этапа кампании

export const DAILY_LOGIN_REWARDS: { day: number; label: string; reward: RewardBundle }[] = [
  { day: 1, label: '8 000 🪙 + 4 000 опыта', reward: { gold: 8000, heroExp: 4000 } },
  { day: 2, label: '2 свитка призыва', reward: { scrolls: 2 } },
  { day: 3, label: '60 💎', reward: { crystals: 60 } },
  { day: 4, label: '40 шардов', reward: { shards: 40 } },
  { day: 5, label: '5 осколков душ + 20 000 🪙', reward: { souls: 5, gold: 20000 } },
  { day: 6, label: '3 свитка + 60 💎', reward: { scrolls: 3, crystals: 60 } },
  { day: 7, label: '150 💎 + 100 шардов', reward: { crystals: 150, shards: 100 } },
];
