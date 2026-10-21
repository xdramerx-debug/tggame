import {
  hapticFeedbackImpactOccurred,
  hapticFeedbackNotificationOccurred,
  hapticFeedbackSelectionChanged,
  isHapticFeedbackSupported,
} from '@telegram-apps/sdk';

export type HapticStyle = 'light' | 'medium' | 'heavy';
export type HapticNotification = 'error' | 'success' | 'warning';

/**
 * Haptic intensity 0..1 from the settings slider.
 *
 * Telegram exposes discrete impact styles, not amplitude, so intensity is
 * applied as a style downgrade: below 0.4 heavy→medium→light, at 0 haptics are
 * disabled entirely. This is documented behaviour of the settings screen.
 */
let intensity = 1;
let enabled = true;
/** Throttle: haptics never fire more than once per 32 ms (spam-protection). */
let lastPulse = 0;

export interface HapticConfig {
  readonly enabled: boolean;
  readonly intensity: number;
}

export function configureHaptics(config: Partial<HapticConfig>): void {
  if (config.enabled !== undefined) enabled = config.enabled;
  if (config.intensity !== undefined) intensity = Math.max(0, Math.min(1, config.intensity));
}

export function areHapticsAvailable(): boolean {
  try {
    return isHapticFeedbackSupported();
  } catch {
    return false;
  }
}

function canFire(): boolean {
  if (!enabled || intensity <= 0) return false;
  const now = performance.now();
  if (now - lastPulse < 32) return false;
  lastPulse = now;
  return true;
}

function degraded(style: HapticStyle): HapticStyle {
  if (intensity >= 0.75) return style;
  if (intensity >= 0.4) return style === 'heavy' ? 'medium' : 'light';
  return 'light';
}

/** Impact pulse: use for button presses (light), hits landed (medium), damage taken (heavy). */
export function hapticImpact(style: HapticStyle = 'light'): void {
  if (!canFire()) return;
  try {
    hapticFeedbackImpactOccurred(degraded(style));
  } catch {
    /* outside Telegram: silently ignore */
  }
}

/** Result notification: loot picked up, level up, errors. */
export function hapticNotification(type: HapticNotification): void {
  if (!canFire()) return;
  try {
    hapticFeedbackNotificationOccurred(type);
  } catch {
    /* noop */
  }
}

/** Selection tick: inventory tabs, sliders. */
export function hapticSelection(): void {
  if (!canFire()) return;
  try {
    hapticFeedbackSelectionChanged();
  } catch {
    /* noop */
  }
}

/** Test helper. */
export function resetHapticThrottle(): void {
  lastPulse = 0;
}
