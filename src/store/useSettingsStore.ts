import { create } from 'zustand';
import type { QualityLevel } from '@/types/engine';
import { configureHaptics } from '@/telegram/haptic';
import { SettingsRepository } from '@/db/repository';

export type ButtonScale = 'S' | 'M' | 'L';
export type Handedness = 'right' | 'left';
export type QualityPreference = 'auto' | QualityLevel;

export interface SettingsState {
  /** Camera degrees per pixel of swipe (spec range 0.1–0.5). */
  cameraSensitivity: number;
  buttonScale: ButtonScale;
  handedness: Handedness;
  autoAttack: boolean;
  /** HUD opacity 0.4–1. */
  hudOpacity: number;
  hapticsEnabled: boolean;
  /** 0–1, mapped onto impact styles. */
  hapticIntensity: number;
  quality: QualityPreference;
  /** Invert vertical camera axis (accessibility). */
  invertCameraY: boolean;
  onboardingDone: boolean;
}

export interface SettingsActions {
  setCameraSensitivity: (value: number) => void;
  setButtonScale: (scale: ButtonScale) => void;
  setHandedness: (handedness: Handedness) => void;
  setAutoAttack: (value: boolean) => void;
  setHudOpacity: (value: number) => void;
  setHapticsEnabled: (value: boolean) => void;
  setHapticIntensity: (value: number) => void;
  setQuality: (quality: QualityPreference) => void;
  setInvertCameraY: (value: boolean) => void;
  setOnboardingDone: (value: boolean) => void;
  /** Loads persisted values from IndexedDB. Safe to call once at boot. */
  hydrate: () => Promise<void>;
}

export const DEFAULT_SETTINGS: SettingsState = {
  cameraSensitivity: 0.25,
  buttonScale: 'M',
  handedness: 'right',
  // Spec: tap-to-attack in the camera area is on by default and can be disabled.
  autoAttack: true,
  hudOpacity: 1,
  hapticsEnabled: true,
  hapticIntensity: 1,
  quality: 'auto',
  invertCameraY: false,
  onboardingDone: false,
};

const STORAGE_KEY = 'settings.v1';
const repository = new SettingsRepository();
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

function applyDeviceEffects(state: SettingsState): void {
  configureHaptics({ enabled: state.hapticsEnabled, intensity: state.hapticIntensity });
  document.documentElement.style.setProperty('--hud-opacity', state.hudOpacity.toFixed(2));
  document.documentElement.dataset['hudOpacity'] = state.hudOpacity.toFixed(2);
}

/**
 * User settings store. Every setter writes through to IndexedDB (fire-and-forget)
 * so a mid-run crash never loses preferences; the UI reads from memory.
 */
export const useSettingsStore = create<SettingsState & SettingsActions>()((set, get) => {
  const persist = (): void => {
    const { cameraSensitivity, buttonScale, handedness, autoAttack, hudOpacity, hapticsEnabled,
      hapticIntensity, quality, invertCameraY, onboardingDone } = get();
    void repository.set(STORAGE_KEY, {
      cameraSensitivity,
      buttonScale,
      handedness,
      autoAttack,
      hudOpacity,
      hapticsEnabled,
      hapticIntensity,
      quality,
      invertCameraY,
      onboardingDone,
    });
  };

  const update = (patch: Partial<SettingsState>): void => {
    set(patch);
    applyDeviceEffects(get());
    persist();
  };

  return {
    ...DEFAULT_SETTINGS,

    setCameraSensitivity: (value) => update({ cameraSensitivity: clamp(value, 0.1, 0.5) }),
    setButtonScale: (buttonScale) => update({ buttonScale }),
    setHandedness: (handedness) => update({ handedness }),
    setAutoAttack: (autoAttack) => update({ autoAttack }),
    setHudOpacity: (value) => update({ hudOpacity: clamp(value, 0.4, 1) }),
    setHapticsEnabled: (hapticsEnabled) => update({ hapticsEnabled }),
    setHapticIntensity: (value) => update({ hapticIntensity: clamp(value, 0, 1) }),
    setQuality: (quality) => update({ quality }),
    setInvertCameraY: (invertCameraY) => update({ invertCameraY }),
    setOnboardingDone: (onboardingDone) => update({ onboardingDone }),

    hydrate: async () => {
      const stored = await repository.get<Partial<SettingsState>>(STORAGE_KEY, {});
      const merged: SettingsState = { ...DEFAULT_SETTINGS, ...stored };
      set({
        ...merged,
        cameraSensitivity: clamp(merged.cameraSensitivity, 0.1, 0.5),
        hudOpacity: clamp(merged.hudOpacity, 0.4, 1),
        hapticIntensity: clamp(merged.hapticIntensity, 0, 1),
      });
      applyDeviceEffects(get());
    },
  };
});

/** Scales touch targets from the S/M/L preference. */
export function buttonScaleFactor(scale: ButtonScale): number {
  switch (scale) {
    case 'S':
      return 0.9;
    case 'L':
      return 1.18;
    default:
      return 1;
  }
}
