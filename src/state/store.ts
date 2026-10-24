import { create } from 'zustand';
import type { GameSnapshot } from '../game/types';
import { PLAYER, WEAPON } from '../game/types';
import type { Game, GameEvent } from '../engine/game';
import { BEST_KEY } from '../engine/game';
import { setMuted } from '../engine/audio';

/**
 * UI store: a thin bridge between the engine and React. The engine pushes
 * snapshots (~10 Hz) and events; the UI never touches game math directly.
 */

const DEFAULT_SNAP: GameSnapshot = {
  phase: 'menu',
  hp: PLAYER.maxHp,
  maxHp: PLAYER.maxHp,
  ammo: WEAPON.magSize,
  magSize: WEAPON.magSize,
  reloading: false,
  reloadProgress: 0,
  wave: 1,
  waveState: 'intermission',
  intermissionT: 0,
  score: 0,
  kills: 0,
  combo: 0,
  comboMult: 1,
  dashReady: 1,
  rapidT: 0,
  zombiesLeft: 0,
};

interface UiState {
  snap: GameSnapshot;
  engine: Game | null;
  bannerWave: number | null;
  toast: string | null;
  hurtTick: number;
  killTick: number;
  lastKillHeadshot: boolean;
  lastKillGained: number;
  best: number;
  newBest: boolean;
  muted: boolean;
  webglFailed: boolean;

  attachEngine: (g: Game) => void;
  detachEngine: () => void;
  applySnapshot: (s: GameSnapshot) => void;
  applyEvent: (e: GameEvent) => void;
  failWebgl: () => void;
  toggleMute: () => void;
}

let bannerTimer: number | null = null;
let toastTimer: number | null = null;

export const useUi = create<UiState>()((set, get) => ({
  snap: DEFAULT_SNAP,
  engine: null,
  bannerWave: null,
  toast: null,
  hurtTick: 0,
  killTick: 0,
  lastKillHeadshot: false,
  lastKillGained: 0,
  best: 0,
  newBest: false,
  muted: false,
  webglFailed: false,

  attachEngine: (g) => {
    set({ engine: g, best: g.getBest() });
  },
  detachEngine: () => { set({ engine: null }); },

  applySnapshot: (s) => { set({ snap: s }); },

  applyEvent: (e) => {
    switch (e.type) {
      case 'wave':
        set({ bannerWave: e.wave, newBest: false });
        if (bannerTimer !== null) window.clearTimeout(bannerTimer);
        bannerTimer = window.setTimeout(() => {
          bannerTimer = null;
          set({ bannerWave: null });
        }, 1800);
        break;
      case 'bonus':
        showToast(set, `Бонус волны: +${e.amount}`);
        break;
      case 'powerup':
        showToast(set, e.label);
        break;
      case 'hurt':
        set((st) => ({ hurtTick: st.hurtTick + 1 }));
        break;
      case 'kill':
        set((st) => ({
          killTick: st.killTick + 1,
          lastKillHeadshot: e.headshot,
          lastKillGained: e.gained,
        }));
        break;
      case 'gameover': {
        const best = get().engine?.getBest() ?? get().best;
        set({ best, newBest: e.newBest });
        break;
      }
    }
  },

  failWebgl: () => { set({ webglFailed: true }); },

  toggleMute: () => {
    const muted = !get().muted;
    setMuted(muted);
    set({ muted });
  },
}));

type SetFn = (partial: Partial<UiState>) => void;

function showToast(set: SetFn, text: string): void {
  set({ toast: text });
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastTimer = null;
    set({ toast: null });
  }, 1700);
}

export function readBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}
