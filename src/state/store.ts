import { create } from 'zustand';
import type { Difficulty } from '@/fight/ai';
import type { QualityChoice } from '@/render/stage';
import { characterById, ROSTER } from '@/characters/roster';

export type Screen = 'menu' | 'select' | 'fight' | 'result';

export interface MatchResult {
  readonly victory: boolean;
  readonly playerId: string;
  readonly opponentId: string;
  readonly rounds: readonly [number, number];
  readonly hits: number;
  readonly blocks: number;
  readonly maxCombo: number;
  readonly damageDealt: number;
  readonly durationSeconds: number;
}

interface PersistedSettings {
  sound: boolean;
  quality: QualityChoice;
  difficulty: Difficulty;
  fighterId: string;
  wins: number;
  fights: number;
}

interface GameState extends PersistedSettings {
  screen: Screen;
  opponentId: string;
  result: MatchResult | null;
  setScreen: (screen: Screen) => void;
  setFighter: (id: string) => void;
  setOpponent: (id: string) => void;
  setDifficulty: (difficulty: Difficulty) => void;
  toggleSound: () => void;
  setQuality: (quality: QualityChoice) => void;
  finishMatch: (result: MatchResult) => void;
  rematch: () => void;
}

const STORAGE_KEY = 'freakpit.settings.v1';

const DEFAULTS: PersistedSettings = {
  sound: true,
  quality: 'auto',
  difficulty: 'normal',
  fighterId: 'grizlo',
  wins: 0,
  fights: 0,
};

function loadSettings(): PersistedSettings {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return DEFAULTS;
    const record = parsed as Partial<Record<keyof PersistedSettings, unknown>>;
    const fighterId = typeof record.fighterId === 'string' && ROSTER.some((c) => c.id === record.fighterId) ? record.fighterId : DEFAULTS.fighterId;
    const difficulty: Difficulty =
      record.difficulty === 'easy' || record.difficulty === 'hard' || record.difficulty === 'normal' ? record.difficulty : DEFAULTS.difficulty;
    const quality: QualityChoice =
      record.quality === 'low' || record.quality === 'medium' || record.quality === 'high' || record.quality === 'auto'
        ? record.quality
        : DEFAULTS.quality;
    return {
      sound: typeof record.sound === 'boolean' ? record.sound : DEFAULTS.sound,
      quality,
      difficulty,
      fighterId,
      wins: typeof record.wins === 'number' ? record.wins : 0,
      fights: typeof record.fights === 'number' ? record.fights : 0,
    };
  } catch {
    return DEFAULTS;
  }
}

function saveSettings(state: PersistedSettings): void {
  try {
    const payload: PersistedSettings = {
      sound: state.sound,
      quality: state.quality,
      difficulty: state.difficulty,
      fighterId: state.fighterId,
      wins: state.wins,
      fights: state.fights,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Private mode / no storage: settings simply do not persist.
  }
}

const initial = loadSettings();

export const useGame = create<GameState>((set, get) => ({
  ...initial,
  screen: 'menu',
  opponentId: characterById(initial.fighterId).id === 'grizlo' ? 'shveya' : 'grizlo',
  result: null,

  setScreen: (screen) => {
    set({ screen });
  },

  setFighter: (id) => {
    if (!ROSTER.some((character) => character.id === id)) return;
    // The opponent is always someone else: mirror matches are confusing with
    // four distinct silhouettes.
    const opponentId = get().opponentId === id ? (id === 'grizlo' ? 'shveya' : 'grizlo') : get().opponentId;
    const next = { fighterId: id, opponentId };
    set(next);
    saveSettings({ ...get(), ...next });
  },

  setOpponent: (id) => {
    if (!ROSTER.some((character) => character.id === id)) return;
    set({ opponentId: id });
  },

  setDifficulty: (difficulty) => {
    set({ difficulty });
    saveSettings({ ...get(), difficulty });
  },

  toggleSound: () => {
    const sound = !get().sound;
    set({ sound });
    saveSettings({ ...get(), sound });
  },

  setQuality: (quality) => {
    set({ quality });
    saveSettings({ ...get(), quality });
  },

  finishMatch: (result) => {
    set({
      result,
      screen: 'result',
      wins: get().wins + (result.victory ? 1 : 0),
      fights: get().fights + 1,
    });
    saveSettings(get());
  },

  rematch: () => {
    set({ screen: 'fight', result: null });
  },
}));

/** Picks a believable opponent for the selection screen. */
export function suggestOpponent(playerId: string): string {
  const index = ROSTER.findIndex((character) => character.id === playerId);
  const next = ROSTER[(index + 1 + Math.floor(Math.random() * (ROSTER.length - 1))) % ROSTER.length];
  return next && next.id !== playerId ? next.id : 'grizlo';
}
