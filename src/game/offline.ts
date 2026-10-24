import { OFFLINE_CAP_HOURS } from './constants';
import { idleRatesPerHour } from './stages';
import type { GameState } from './types';

/**
 * Offline income (§2): capped at 12 hours, split gold/exp/shards, one «Забрать».
 * Cap-near state drives the badge on the resource icon in the menu.
 */

export interface OfflineReward {
  seconds: number;
  capped: boolean;
  nearCap: boolean; // ≥90% of cap — badge on tab
  gold: number;
  exp: number;
  shards: number;
  souls: number;
}

export function computeOffline(state: GameState, now: number): OfflineReward | null {
  const elapsed = Math.max(0, now - state.lastSeen);
  if (elapsed < 5 * 60 * 1000) return null; // показываем только от 5 минут
  const capMs = OFFLINE_CAP_HOURS * 3600 * 1000;
  const capped = elapsed >= capMs;
  const seconds = Math.min(elapsed, capMs) / 1000;
  const hours = seconds / 3600;
  const rates = idleRatesPerHour(state);
  const shards = Math.floor(hours * rates.shardChance * 10);
  const souls = Math.min(2, Math.floor(hours / 6)); // редкий оффлайн-дроп
  return {
    seconds,
    capped,
    nearCap: elapsed >= capMs * 0.9,
    gold: Math.round(rates.gold * hours),
    exp: Math.round(rates.exp * hours),
    shards,
    souls,
  };
}

export function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h} ч ${m} мин`;
  return `${m} мин`;
}
