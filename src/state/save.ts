import { SAVE_KEY } from '../game/constants';
import { createInitialGameState } from './initialState';
import type { GameState } from '../game/types';

/**
 * Save versioning & migration (§2): old saves migrate forward, never reset.
 */

export function loadSave(): GameState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<GameState> & { saveVersion?: number };
    return migrate(parsed);
  } catch {
    return null;
  }
}

export function persistSave(state: GameState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({ ...state, lastSeen: Date.now() }));
  } catch {
    // storage full / private mode — game keeps running in memory
  }
}

export function clearSave(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}

type LooseSave = { [K in keyof GameState]?: GameState[K] | undefined | null };

export function migrate(partial: Partial<GameState> & { saveVersion?: number }): GameState {
  const fresh = createInitialGameState();
  const loose = partial as LooseSave;
  let state: GameState = { ...fresh, ...partial, saveVersion: loose.saveVersion ?? 1 };

  const incomingVersion = loose.saveVersion ?? 1;
    // v1 → v2: added labyrinth, diary, pact, devFlags, inventory (prototype-era saves)
  if (incomingVersion < 2) {
    state = {
      ...state,
      labyrinth: loose.labyrinth ?? fresh.labyrinth,
      diary: loose.diary ?? [],
      pact: loose.pact ?? { slot: null },
      inventory: loose.inventory ?? [],
      devFlags: loose.devFlags ?? { fps: false, hitboxes: false },
      forcedNextResult: loose.forcedNextResult ?? null,
      codes: loose.codes ?? fresh.codes,
      goals: loose.goals ?? fresh.goals,
    };
    state.saveVersion = 2;
  }

  // Structural safety net: deep-merge nested objects that may be missing keys
  state.resources = { ...fresh.resources, ...state.resources };
  state.campaign = { ...fresh.campaign, ...state.campaign };
  state.tower = { ...fresh.tower, ...state.tower };
  state.prestige = { ...fresh.prestige, ...state.prestige };
  state.echo = { ...fresh.echo, ...state.echo };
  state.daily = { ...fresh.daily, ...state.daily };
  state.quests = { ...fresh.quests, ...state.quests };
  state.pity = { ...fresh.pity, ...state.pity };
  state.settings = { ...fresh.settings, ...state.settings };
  state.stats = { ...fresh.stats, ...state.stats };
  state.ftue = { ...fresh.ftue, ...state.ftue };
  state.adsToday = { ...fresh.adsToday, ...state.adsToday };
  if (!Array.isArray(state.team) || state.team.length !== 6) state.team = fresh.team;
  if (typeof (state.heroes as unknown) !== 'object') state.heroes = fresh.heroes;
  return state;
}
