import { init, miniApp, viewport, hapticFeedback, retrieveLaunchParams } from '@telegram-apps/sdk';

/**
 * Thin, crash-proof wrapper around the Telegram Mini App SDK.
 *
 * The game must also run in a plain mobile browser during development, so every
 * call is guarded by `isAvailable()` and wrapped in try/catch. No `any` and no
 * direct `window.Telegram` access: the SDK is the single source of truth.
 */

let initialised = false;
let insideTelegram = false;

export function initTelegram(): void {
  if (initialised) return;
  initialised = true;

  try {
    init();
    insideTelegram = true;

    if (miniApp.mountSync.isAvailable()) miniApp.mountSync();
    if (miniApp.ready.isAvailable()) miniApp.ready();
    if (viewport.expand.isAvailable()) viewport.expand();
    if (viewport.requestFullscreen.isAvailable()) {
      void viewport.requestFullscreen().catch(() => undefined);
    }
  } catch {
    // Browser preview: keep going with the DOM-only build.
    insideTelegram = false;
  }
}

export function isTelegram(): boolean {
  return insideTelegram;
}

export type HapticStyle = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';
export type HapticNote = 'error' | 'success' | 'warning';

/** Haptics go through Telegram only — `navigator.vibrate` is deliberately unused. */
export function haptic(kind: HapticStyle | HapticNote): void {
  try {
    if (kind === 'error' || kind === 'success' || kind === 'warning') {
      if (hapticFeedback.notificationOccurred.isAvailable()) {
        hapticFeedback.notificationOccurred(kind);
      }
      return;
    }
    if (hapticFeedback.impactOccurred.isAvailable()) hapticFeedback.impactOccurred(kind);
  } catch {
    // Unsupported client: silently ignore, never break the fight loop.
  }
}

export interface PlayerIdentity {
  readonly name: string;
  readonly photoUrl: string | null;
}

export function playerIdentity(): PlayerIdentity {
  try {
    const launch = retrieveLaunchParams();
    const user = launch.tgWebAppData?.user;
    if (user) {
      const firstName = user.first_name.trim();
      const name = firstName !== '' ? firstName : (user.username ?? 'Боец');
      return { name, photoUrl: user.photo_url ?? null };
    }
  } catch {
    // Outside Telegram there is no signed launch data.
  }
  return { name: 'Боец', photoUrl: null };
}

/** Locks the WebView to landscape where the platform allows it. */
export async function lockLandscape(): Promise<void> {
  try {
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (mode: string) => Promise<void>;
    };
    if (typeof orientation.lock === 'function') await orientation.lock('landscape');
  } catch {
    // iOS refuses orientation lock without fullscreen; CSS handles it instead.
  }
}
