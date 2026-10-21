import { create } from 'zustand';
import type { FrameStats, InitProgress, QualityLevel } from '@/types/engine';

export type ScreenName = 'splash' | 'menu' | 'game';

export interface GameState {
  screen: ScreenName;
  /** Boot pipeline progress shown on the splash. */
  progress: InitProgress;
  booted: boolean;
  /** Fatal boot error (no WebGL, context creation failed) — shown instead of a blank screen. */
  bootError: string | null;
  /** Latest frame stats (throttled to 4 Hz by the engine). */
  stats: FrameStats | null;
  quality: QualityLevel;
  /** Short HUD toast (floor change, blocked interaction); auto-clears. */
  message: { readonly id: number; readonly text: string } | null;
  showMessage: (text: string) => void;
  clearMessage: () => void;
  setScreen: (screen: ScreenName) => void;
  setProgress: (progress: InitProgress) => void;
  setBooted: (booted: boolean) => void;
  setBootError: (message: string | null) => void;
  setStats: (stats: FrameStats) => void;
  setQuality: (quality: QualityLevel) => void;
}

const initialProgress: InitProgress = { stage: 'engine', progress: 0 };

/** Cross-screen game state. Engine objects live outside the store (GameHost). */
export const useGameStore = create<GameState>()((set) => ({
  screen: 'splash',
  progress: initialProgress,
  booted: false,
  bootError: null,
  stats: null,
  quality: 'medium',
  message: null,
  showMessage: (text) => set({ message: { id: Date.now() + Math.random(), text } }),
  clearMessage: () => set({ message: null }),
  setScreen: (screen) => set({ screen }),
  setProgress: (progress) => set({ progress }),
  setBooted: (booted) => set({ booted }),
  setBootError: (bootError) => set({ bootError }),
  setStats: (stats) => set({ stats }),
  setQuality: (quality) => set({ quality }),
}));

export type UiSheet = 'none' | 'settings' | 'credits';

export interface UiState {
  sheet: UiSheet;
  openSheet: (sheet: UiSheet) => void;
  closeSheet: () => void;
}

export const useUiStore = create<UiState>()((set) => ({
  sheet: 'none',
  openSheet: (sheet) => set({ sheet }),
  closeSheet: () => set({ sheet: 'none' }),
}));
