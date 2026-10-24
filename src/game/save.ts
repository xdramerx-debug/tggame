import type { MetaProgress, PerkId } from './types';
import { canTakePerk, levelFromXp, PERK_BY_ID } from './perks';

/** Meta-progression persistence (localStorage) — pure, unit-tested. */

export const SAVE_KEY = 'khamsin-meta-v1';

export const DEFAULT_META: MetaProgress = {
  xp: 0,
  perks: [],
  bestWave: 0,
  bestScore: 0,
  totalKills: 0,
  runs: 0,
};

export function sanitizeMeta(raw: unknown): MetaProgress {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_META, perks: [] };
  const r = raw as Partial<Record<keyof MetaProgress, unknown>>;
  const num = (v: unknown): number =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
  const perks: PerkId[] = [];
  if (Array.isArray(r.perks)) {
    for (const p of r.perks) {
      if (typeof p === 'string' && p in PERK_BY_ID && canTakePerk(perks, p as PerkId)) {
        perks.push(p as PerkId);
      }
    }
  }
  return {
    xp: num(r.xp),
    perks,
    bestWave: num(r.bestWave),
    bestScore: num(r.bestScore),
    totalKills: num(r.totalKills),
    runs: num(r.runs),
  };
}

export function loadMeta(): MetaProgress {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return { ...DEFAULT_META, perks: [] };
    return sanitizeMeta(JSON.parse(raw) as unknown);
  } catch {
    return { ...DEFAULT_META, perks: [] };
  }
}

export function saveMeta(m: MetaProgress): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(m));
  } catch {
    // private mode — keep playing in memory
  }
}

/** Grant XP; returns how many levels were gained (engine awards perk points + fanfare). */
export function addXp(m: MetaProgress, amount: number): { meta: MetaProgress; levelsGained: number } {
  const before = levelFromXp(m.xp).level;
  const xp = Math.max(0, m.xp + Math.max(0, Math.floor(amount)));
  const levelsGained = levelFromXp(xp).level - before;
  return { meta: { ...m, xp }, levelsGained };
}

/** Fold a finished run into the persistent record. */
export function finishRun(m: MetaProgress, wave: number, score: number, kills: number): MetaProgress {
  return {
    ...m,
    bestWave: Math.max(m.bestWave, wave),
    bestScore: Math.max(m.bestScore, score),
    totalKills: m.totalKills + kills,
    runs: m.runs + 1,
  };
}
