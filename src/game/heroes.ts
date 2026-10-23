import type { HeroDef } from './types';

/**
 * 24 original heroes across 6 factions (Shadow, Abyss, Forest, Fortress, Light, Dark).
 * Starter is a 5★; 4★/3★ come from summons and double as «еда» (fodder).
 */
export const HEROES: HeroDef[] = [
  /* ------------------------------ Тень (Shadow) ------------------------------ */
  {
    id: 'veles', name: 'Велес Тёмный', title: 'Князь теней', faction: 'shadow', role: 'warrior', rarity: 5, emoji: '🐺',
    base: { hp: 1150, atk: 165, def: 85, spd: 102, crit: 0.2, critDmg: 1.6, armorBreak: 0.1, lifesteal: 0 },
    growth: 0.085,
    skill: { name: 'Теневой раскол', chance: 0.28, effect: { kind: 'damage', mult: 2.3, target: 'enemyFrontFirst' }, desc: 'Рассекает первого врага, нанося 230% урона.' },
    passiveName: 'Зов ночи', passiveDesc: '+8% пробитие брони', passive: { armorBreak: 0.08 },
  },
  {
    id: 'mara', name: 'Мара', title: 'Шёпот во тьме', faction: 'shadow', role: 'assassin', rarity: 5, emoji: '🦇',
    base: { hp: 860, atk: 195, def: 60, spd: 118, crit: 0.3, critDmg: 1.8, armorBreak: 0.15, lifesteal: 0 },
    growth: 0.09,
    skill: { name: 'Удар из мрака', chance: 0.3, effect: { kind: 'damage', mult: 2.6, target: 'enemyLowestHp' }, desc: 'Добивает самого раненого врага: 260% урона.' },
    passiveName: 'Тонкое лезвие', passiveDesc: '+5% крит. шанс', passive: { crit: 0.05 },
  },
  {
    id: 'nochnoy', name: 'Ночной страж', title: 'Часовой сумрака', faction: 'shadow', role: 'tank', rarity: 4, emoji: '🗿',
    base: { hp: 1650, atk: 95, def: 130, spd: 78, crit: 0.05, critDmg: 1.5, armorBreak: 0, lifesteal: 0 },
    growth: 0.08,
    skill: { name: 'Покров теней', chance: 0.25, effect: { kind: 'shield', mult: 1.6, target: 'allyLowestHp' }, desc: 'Укрывает самого раненого союзника щитом (160% от атаки).' },
    passiveName: 'Крепкая тень', passiveDesc: '+10% HP', passive: { hp: 0.1 },
  },
  {
    id: 'prah', name: 'Прах', title: 'Пепел былого', faction: 'shadow', role: 'mage', rarity: 3, emoji: '🌫️',
    base: { hp: 780, atk: 125, def: 55, spd: 92, crit: 0.1, critDmg: 1.5, armorBreak: 0.05, lifesteal: 0 },
    growth: 0.075,
    skill: { name: 'Пепельный вихрь', chance: 0.22, effect: { kind: 'damage', mult: 1.5, target: 'enemyAll' }, desc: 'Задевает всех врагов пеплом: 150% урона.' },
    passiveName: 'Осыпание', passiveDesc: '+3% пробитие брони', passive: { armorBreak: 0.03 },
  },

  /* ------------------------------ Бездна (Abyss) ------------------------------ */
  {
    id: 'kaas', name: 'Каас', title: 'Глубинный ужас', faction: 'abyss', role: 'tank', rarity: 5, emoji: '🐙',
    base: { hp: 1750, atk: 130, def: 120, spd: 80, crit: 0.08, critDmg: 1.5, armorBreak: 0, lifesteal: 0.08 },
    growth: 0.085,
    skill: { name: 'Хватка глубин', chance: 0.26, effect: { kind: 'damage', mult: 1.9, target: 'enemyFrontFirst' }, desc: 'Сжимает первого врага щупальцами: 190% урона, вампиризм.' },
    passiveName: 'Бездонная утроба', passiveDesc: '+6% вампиризм', passive: { lifesteal: 0.06 },
  },
  {
    id: 'ssavra', name: 'СС’авра', title: 'Глотка бездны', faction: 'abyss', role: 'warrior', rarity: 5, emoji: '🐍',
    base: { hp: 1200, atk: 180, def: 80, spd: 98, crit: 0.18, critDmg: 1.7, armorBreak: 0.05, lifesteal: 0.1 },
    growth: 0.09,
    skill: { name: 'Поглощение', chance: 0.28, effect: { kind: 'damage', mult: 2.4, target: 'enemyFrontFirst' }, desc: 'Глотает удар врага целиком: 240% урона и много вампиризма.' },
    passiveName: 'Голод', passiveDesc: '+5% вампиризм', passive: { lifesteal: 0.05 },
  },
  {
    id: 'ulg', name: 'Уль-Г’орот', title: 'Шёпот со дна', faction: 'abyss', role: 'mage', rarity: 4, emoji: '🌀',
    base: { hp: 880, atk: 155, def: 60, spd: 94, crit: 0.12, critDmg: 1.6, armorBreak: 0.08, lifesteal: 0.05 },
    growth: 0.08,
    skill: { name: 'Водоворот душ', chance: 0.24, effect: { kind: 'damage', mult: 1.6, target: 'enemyAll' }, desc: 'Затягивает всех врагов в водоворот: 160% урона.' },
    passiveName: 'Давление глубины', passiveDesc: '+5% HP', passive: { hp: 0.05 },
  },
  {
    id: 'mork', name: 'Морк', title: 'Слепой ныряльщик', faction: 'abyss', role: 'assassin', rarity: 3, emoji: '🦑',
    base: { hp: 760, atk: 130, def: 50, spd: 108, crit: 0.2, critDmg: 1.6, armorBreak: 0.1, lifesteal: 0.05 },
    growth: 0.075,
    skill: { name: 'Укол из темноты', chance: 0.22, effect: { kind: 'damage', mult: 2.0, target: 'enemyLowestHp' }, desc: 'Жалит самого слабого: 200% урона.' },
    passiveName: 'Слизь', passiveDesc: '+3% вампиризм', passive: { lifesteal: 0.03 },
  },

  /* ------------------------------ Лес (Forest) ------------------------------ */
  {
    id: 'elana', name: 'Элана', title: 'Дочь росы', faction: 'forest', role: 'healer', rarity: 5, emoji: '🧝‍♀️',
    base: { hp: 980, atk: 140, def: 70, spd: 96, crit: 0.05, critDmg: 1.5, armorBreak: 0, lifesteal: 0 },
    growth: 0.08,
    skill: { name: 'Рассветный дождь', chance: 0.35, effect: { kind: 'heal', mult: 1.8, target: 'allyLowestHp' }, desc: 'Лечит самого раненого союзника на 180% от своей атаки.' },
    passiveName: 'Дыхание леса', passiveDesc: '+10% сила лечения', passive: { hp: 0.05 },
  },
  {
    id: 'dubomor', name: 'Дубомор', title: 'Древний корень', faction: 'forest', role: 'tank', rarity: 5, emoji: '🌳',
    base: { hp: 1900, atk: 105, def: 140, spd: 72, crit: 0.05, critDmg: 1.4, armorBreak: 0, lifesteal: 0.04 },
    growth: 0.085,
    skill: { name: 'Корни земли', chance: 0.25, effect: { kind: 'shield', mult: 1.5, target: 'allyAll' }, desc: 'Всем союзникам вырастает щит (по 150% от его атаки).' },
    passiveName: 'Кора', passiveDesc: '+12% защита', passive: { def: 0.12 },
  },
  {
    id: 'lisaya', name: 'Лисая', title: 'Хитрая тропа', faction: 'forest', role: 'assassin', rarity: 4, emoji: '🦊',
    base: { hp: 840, atk: 160, def: 58, spd: 115, crit: 0.25, critDmg: 1.7, armorBreak: 0.08, lifesteal: 0 },
    growth: 0.08,
    skill: { name: 'Укус лисы', chance: 0.3, effect: { kind: 'damage', mult: 2.2, target: 'enemyBackRow' }, desc: 'Проскальзывает в задний ряд и кусает всех: 220% урона.' },
    passiveName: 'Лёгкий шаг', passiveDesc: '+8 скорость', passive: { spd: 8 },
  },
  {
    id: 'murava', name: 'Мурава', title: 'Сестра грибов', faction: 'forest', role: 'healer', rarity: 3, emoji: '🍄',
    base: { hp: 800, atk: 110, def: 55, spd: 88, crit: 0.03, critDmg: 1.4, armorBreak: 0, lifesteal: 0 },
    growth: 0.07,
    skill: { name: 'Споры жизни', chance: 0.32, effect: { kind: 'heal', mult: 1.2, target: 'allyLowestHp' }, desc: 'Лечит самого раненого на 120% от атаки.' },
    passiveName: 'Грибница', passiveDesc: '+5% HP', passive: { hp: 0.05 },
  },

  /* ---------------------------- Крепость (Fortress) ---------------------------- */
  {
    id: 'brand', name: 'Бранд', title: 'Железный вал', faction: 'fortress', role: 'tank', rarity: 5, emoji: '🏰',
    base: { hp: 2100, atk: 95, def: 160, spd: 70, crit: 0.03, critDmg: 1.4, armorBreak: 0, lifesteal: 0 },
    growth: 0.085,
    skill: { name: 'Стена щитов', chance: 0.3, effect: { kind: 'shield', mult: 2.2, target: 'allyAll' }, desc: 'Весь отряд получает щит (по 100% от его атаки).' },
    passiveName: 'Каменная кожа', passiveDesc: '+15% защита', passive: { def: 0.15 },
  },
  {
    id: 'zhdan', name: 'Ждан Камнелом', title: 'Молот укреплений', faction: 'fortress', role: 'warrior', rarity: 5, emoji: '🔨',
    base: { hp: 1450, atk: 170, def: 110, spd: 85, crit: 0.12, critDmg: 1.6, armorBreak: 0.12, lifesteal: 0 },
    growth: 0.09,
    skill: { name: 'Разлом стены', chance: 0.26, effect: { kind: 'debuffDef', mult: 0.3, rounds: 2, target: 'enemyAll' }, desc: 'Снижает защиту всех врагов на 30% на 2 раунда.' },
    passiveName: 'Осадный опыт', passiveDesc: '+8% пробитие брони', passive: { armorBreak: 0.08 },
  },
  {
    id: 'milava', name: 'Милава', title: 'Знаменосец', faction: 'fortress', role: 'support', rarity: 4, emoji: '🚩',
    base: { hp: 1250, atk: 120, def: 100, spd: 90, crit: 0.06, critDmg: 1.5, armorBreak: 0, lifesteal: 0 },
    growth: 0.08,
    skill: { name: 'Боевой клич', chance: 0.3, effect: { kind: 'buffAtk', mult: 0.25, rounds: 2, target: 'allyAll' }, desc: '+25% атаки всему отряду на 2 раунда.' },
    passiveName: 'Дух братства', passiveDesc: '+8% HP', passive: { hp: 0.08 },
  },
  {
    id: 'kirpich', name: 'Кирпич', title: 'Живой бруствер', faction: 'fortress', role: 'tank', rarity: 3, emoji: '🧱',
    base: { hp: 1500, atk: 70, def: 110, spd: 65, crit: 0.02, critDmg: 1.3, armorBreak: 0, lifesteal: 0 },
    growth: 0.07,
    skill: { name: 'Загородить', chance: 0.25, effect: { kind: 'shield', mult: 1.4, target: 'allyLowestHp' }, desc: 'Прикрывает раненого союзника щитом (140% от атаки).' },
    passiveName: 'Обломки', passiveDesc: '+8% защита', passive: { def: 0.08 },
  },

  /* ------------------------------- Свет (Light) ------------------------------- */
  {
    id: 'lucian', name: 'Люциан', title: 'Первый луч', faction: 'light', role: 'mage', rarity: 5, emoji: '☀️',
    base: { hp: 950, atk: 200, def: 65, spd: 100, crit: 0.15, critDmg: 1.7, armorBreak: 0.05, lifesteal: 0 },
    growth: 0.09,
    skill: { name: 'Суд света', chance: 0.27, effect: { kind: 'damage', mult: 1.7, target: 'enemyAll' }, desc: 'Выжигает всех врагов: 170% урона.' },
    passiveName: 'Озарение', passiveDesc: '+6% крит. урон', passive: { critDmg: 0.1 },
  },
  {
    id: 'zoria', name: 'Зоря', title: 'Утренняя звезда', faction: 'light', role: 'healer', rarity: 5, emoji: '🌅',
    base: { hp: 1000, atk: 150, def: 75, spd: 95, crit: 0.05, critDmg: 1.5, armorBreak: 0, lifesteal: 0 },
    growth: 0.08,
    skill: { name: 'Рассвет', chance: 0.34, effect: { kind: 'heal', mult: 1.4, target: 'allyAll' }, desc: 'Лечит весь отряд на 140% от своей атаки.' },
    passiveName: 'Тёплый свет', passiveDesc: '+12% сила лечения', passive: { hp: 0.04 },
  },
  {
    id: 'yanis', name: 'Янис', title: 'Крылатый страж', faction: 'light', role: 'tank', rarity: 4, emoji: '🕊️',
    base: { hp: 1550, atk: 110, def: 120, spd: 88, crit: 0.06, critDmg: 1.5, armorBreak: 0, lifesteal: 0 },
    growth: 0.08,
    skill: { name: 'Крыло защиты', chance: 0.28, effect: { kind: 'shield', mult: 1.8, target: 'allyAll' }, desc: 'Щит всему отряду (по 70% от его атаки).' },
    passiveName: 'Благословение', passiveDesc: '+6% HP, +3% защита', passive: { hp: 0.06 },
  },
  {
    id: 'svetik', name: 'Светик', title: 'Искра надежды', faction: 'light', role: 'support', rarity: 3, emoji: '🌟',
    base: { hp: 820, atk: 115, def: 55, spd: 97, crit: 0.08, critDmg: 1.5, armorBreak: 0, lifesteal: 0 },
    growth: 0.07,
    skill: { name: 'Приободрить', chance: 0.3, effect: { kind: 'buffAtk', mult: 0.18, rounds: 2, target: 'allyAll' }, desc: '+18% атаки отряду на 2 раунда.' },
    passiveName: 'Тёплые руки', passiveDesc: '+5% сила лечения', passive: { hp: 0.03 },
  },

  /* ------------------------------- Тьма (Dark) ------------------------------- */
  {
    id: 'morena', name: 'Морена', title: 'Владычица ночи', faction: 'dark', role: 'mage', rarity: 5, emoji: '🌑',
    base: { hp: 920, atk: 205, def: 62, spd: 101, crit: 0.18, critDmg: 1.75, armorBreak: 0.08, lifesteal: 0.05 },
    growth: 0.09,
    skill: { name: 'Полночь', chance: 0.28, effect: { kind: 'damage', mult: 2.5, target: 'enemyBackRow' }, desc: 'Тьма бьёт по заднему ряду: 250% урона.' },
    passiveName: 'Чёрная благодать', passiveDesc: '+5% крит. шанс', passive: { crit: 0.05 },
  },
  {
    id: 'chernobog', name: 'Чернобог', title: 'Старый бог', faction: 'dark', role: 'warrior', rarity: 5, emoji: '⚰️',
    base: { hp: 1350, atk: 185, def: 95, spd: 90, crit: 0.15, critDmg: 1.8, armorBreak: 0.1, lifesteal: 0.08 },
    growth: 0.09,
    skill: { name: 'Жатва', chance: 0.25, effect: { kind: 'damage', mult: 2.2, target: 'enemyAll' }, desc: 'Косит всех врагов: 220% урона, вампиризм.' },
    passiveName: 'Древняя мощь', passiveDesc: '+8% атака', passive: { atk: 0.08 },
  },
  {
    id: 'voron', name: 'Ворон Мор', title: 'Вестник беды', faction: 'dark', role: 'assassin', rarity: 4, emoji: '🐦‍⬛',
    base: { hp: 870, atk: 165, def: 58, spd: 116, crit: 0.28, critDmg: 1.8, armorBreak: 0.1, lifesteal: 0 },
    growth: 0.08,
    skill: { name: 'Карканье смерти', chance: 0.3, effect: { kind: 'damage', mult: 2.4, target: 'enemyLowestHp' }, desc: 'Добивает раненого: 240% урона.' },
    passiveName: 'Падальщик', passiveDesc: '+4% вампиризм', passive: { lifesteal: 0.04 },
  },
  {
    id: 'navia', name: 'Навия', title: 'Полуночница', faction: 'dark', role: 'support', rarity: 3, emoji: '🕯️',
    base: { hp: 830, atk: 120, def: 55, spd: 93, crit: 0.1, critDmg: 1.5, armorBreak: 0.03, lifesteal: 0.03 },
    growth: 0.07,
    skill: { name: 'Сглаз', chance: 0.26, effect: { kind: 'debuffDef', mult: 0.2, rounds: 2, target: 'enemyFrontFirst' }, desc: '-20% защиты первому врагу на 2 раунда.' },
    passiveName: 'Полночный дух', passiveDesc: '+4% HP', passive: { hp: 0.04 },
  },
];

export const HERO_BY_ID: Record<string, HeroDef> = Object.fromEntries(HEROES.map((h) => [h.id, h]));

export const STARTER_HERO_ID = 'veles';

export function getHeroDef(id: string): HeroDef {
  const def = HERO_BY_ID[id];
  if (!def) throw new Error(`Unknown hero: ${id}`);
  return def;
}

export const FIVE_STARS = HEROES.filter((h) => h.rarity === 5);
export const FOUR_STARS = HEROES.filter((h) => h.rarity === 4);
export const THREE_STARS = HEROES.filter((h) => h.rarity === 3);
