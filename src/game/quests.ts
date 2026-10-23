import { createRng } from './rng';
import type { QuestState } from './types';

/**
 * Daily/weekly quests (§6): 3–5 daily tasks for a 5–10 minute session,
 * one big weekly goal. Rewards ≈ half a summon or a speed-up.
 */

export interface QuestDef {
  id: string;
  title: string;
  target: number;
  metric: 'battles' | 'wins' | 'upgrades' | 'summons' | 'forge' | 'echo' | 'tower' | 'campaign' | 'souls';
  reward: { gold?: number; crystals?: number; scrolls?: number; shards?: number; souls?: number; heroExp?: number };
  rewardLabel: string;
}

export const DAILY_POOL: QuestDef[] = [
  { id: 'q_battles3', title: 'Провести 3 боя', target: 3, metric: 'battles', reward: { gold: 3000 }, rewardLabel: '3 000 🪙' },
  { id: 'q_wins5', title: 'Победить в 5 боях', target: 5, metric: 'wins', reward: { heroExp: 2500 }, rewardLabel: '2 500 опыта' },
  { id: 'q_upgrade3', title: 'Улучшить героев 3 раза', target: 3, metric: 'upgrades', reward: { gold: 4000 }, rewardLabel: '4 000 🪙' },
  { id: 'q_summon2', title: 'Совершить 2 призыва', target: 2, metric: 'summons', reward: { scrolls: 1 }, rewardLabel: '1 свиток' },
  { id: 'q_forge1', title: 'Выковать предмет в Кузнице душ', target: 1, metric: 'forge', reward: { souls: 2 }, rewardLabel: '2 осколка душ' },
  { id: 'q_echo1', title: 'Активировать бафф Эха', target: 1, metric: 'echo', reward: { crystals: 15 }, rewardLabel: '15 💎' },
  { id: 'q_tower2', title: 'Пройти 2 этажа Башни', target: 2, metric: 'tower', reward: { shards: 15 }, rewardLabel: '15 шардов' },
];

export const WEEKLY_POOL: QuestDef[] = [
  { id: 'w_campaign15', title: 'Пройти 15 этапов кампании', target: 15, metric: 'campaign', reward: { crystals: 120, scrolls: 3 }, rewardLabel: '120 💎 + 3 свитка' },
  { id: 'w_wins40', title: 'Победить в 40 боях', target: 40, metric: 'wins', reward: { gold: 60000, heroExp: 30000 }, rewardLabel: '60 000 🪙 + 30 000 опыта' },
  { id: 'w_souls10', title: 'Собрать 10 осколков душ', target: 10, metric: 'souls', reward: { crystals: 80 }, rewardLabel: '80 💎' },
];

export function rollDailies(dateKey: string): QuestState[] {
  const rng = createRng(hash(dateKey));
  const pool = [...DAILY_POOL];
  const picked: QuestState[] = [];
  for (let i = 0; i < 4 && pool.length > 0; i++) {
    const idx = rng.int(0, pool.length - 1);
    const def = pool.splice(idx, 1)[0];
    if (def) picked.push({ id: def.id, progress: 0, target: def.target, claimed: false });
  }
  return picked;
}

export function rollWeeklies(weekKey: string): QuestState[] {
  const rng = createRng(hash(weekKey));
  const def = WEEKLY_POOL[rng.int(0, WEEKLY_POOL.length - 1)];
  if (!def) return [];
  return [{ id: def.id, progress: 0, target: def.target, claimed: false }];
}

export function questDef(id: string): QuestDef | undefined {
  return [...DAILY_POOL, ...WEEKLY_POOL].find((q) => q.id === id);
}

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function dayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function weekKey(d = new Date()): string {
  const monday = new Date(d);
  monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return dayKey(monday);
}

/** «Следующая цель» on the home screen (§9) — derived, always visible. */
export function currentGoalText(campaignStage: number, teamSize: number, heroLevels: number[]): string {
  if (teamSize < 2) return 'Собери отряд: добавь героев в состав';
  if (campaignStage <= 2) return `Победить этап ${campaignStage} кампании`;
  if (heroLevels.length > 0 && Math.max(...heroLevels) < 10) return 'Улучшить любого героя до 10 уровня';
  if (campaignStage % 10 !== 0) return `Пройти ещё ${10 - (campaignStage % 10)} этап(ов) до босса`;
  return `Одолеть босса этапа ${campaignStage}`;
}
