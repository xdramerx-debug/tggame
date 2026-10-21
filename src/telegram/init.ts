import {
  init,
  isTMA,
  mockTelegramEnv,
  retrieveLaunchParams,
  themeParams,
  viewport,
  backButton,
  mainButton,
  hapticFeedback,
  closingBehavior,
  swipeBehavior,
  isThemeParamsMounted,
  isViewportMounted,
  isBackButtonMounted,
  isMainButtonMounted,
  isHapticFeedbackSupported,
} from '@telegram-apps/sdk';
import { isTelegramEnvironment } from './env';

export interface TelegramInitResult {
  readonly inTelegram: boolean;
  readonly themeApplied: boolean;
  readonly mounted: {
    readonly viewport: boolean;
    readonly themeParams: boolean;
    readonly backButton: boolean;
    readonly mainButton: boolean;
    readonly haptics: boolean;
    readonly closingBehavior: boolean;
    /** `disableVerticalSwipes` component (Bot API 7.7+). */
    readonly swipeBehavior: boolean;
  };
}

let initialized: TelegramInitResult | null = null;

/**
 * Builds minimal launch parameters for browser-based development and E2E tests.
 * Serialised as a query string because that is exactly what Telegram puts into
 * the URL hash, so the SDK parses dev and production identically.
 */
function buildMockLaunchParams(): URLSearchParams {
  const params = new URLSearchParams();
  params.set('tgWebAppVersion', '8.0');
  params.set('tgWebAppPlatform', 'android');
  params.set('tgWebAppData', '');
  params.set(
    'tgWebAppThemeParams',
    JSON.stringify({
      bg_color: '#0b0e14',
      secondary_bg_color: '#1e2a3a',
      text_color: '#e8e3d6',
      hint_color: '#9aa3ae',
      link_color: '#4a7c8c',
      button_color: '#c9a227',
      button_text_color: '#0b0e14',
      destructive_text_color: '#b33a3a',
    }),
  );
  return params;
}

/** Reads an SDK availability flag without ever throwing. */
function safeBool(read: () => boolean): boolean {
  try {
    return read();
  } catch {
    return false;
  }
}

/** Safe wrapper: unsupported methods throw inside Telegram SDK, we never let that break boot. */
function attempt<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch (error) {
    console.warn('[telegram] call skipped:', error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Initialises the Telegram SDK exactly once and mounts the components the game
 * uses. Outside Telegram (dev preview, Playwright) it installs a mock
 * environment so the same UI code runs without permission dialogs.
 *
 * Must be called before React renders anything that reads theme values.
 */
export function initTelegram(): TelegramInitResult {
  if (initialized) return initialized;

  const inTelegram = isTelegramEnvironment();
  // `?mock=1` lets QA/PW exercise Telegram-only UI in a plain browser build.
  const wantsMock = import.meta.env.DEV || new URLSearchParams(window.location.search).get('mock') === '1';
  if (!inTelegram && wantsMock) {
    attempt(() => mockTelegramEnv({ launchParams: buildMockLaunchParams() }));
  }

  attempt(() => init());

  const mounted = {
    viewport: Boolean(attempt(() => (viewport.mount.isAvailable() ? (viewport.mount(), true) : false))),
    themeParams: Boolean(attempt(() => (themeParams.mount.isAvailable() ? (themeParams.mount(), true) : false))),
    backButton: Boolean(attempt(() => (backButton.mount.isAvailable() ? (backButton.mount(), true) : false))),
    mainButton: Boolean(attempt(() => (mainButton.mount.isAvailable() ? (mainButton.mount(), true) : false))),
    haptics: Boolean(attempt(() => hapticFeedback.isSupported())),
    closingBehavior: Boolean(
      attempt(() => (closingBehavior.mount.isAvailable() ? (closingBehavior.mount(), true) : false)),
    ),
    swipeBehavior: Boolean(
      attempt(() => (swipeBehavior.mount.isAvailable() ? (swipeBehavior.mount(), true) : false)),
    ),
  };

  attempt(() => viewport.expand());

  initialized = {
    inTelegram,
    themeApplied: safeBool(isThemeParamsMounted),
    mounted: {
      // Re-read the mounted flags: mount() may resolve synchronously or not at all.
      viewport: mounted.viewport && safeBool(isViewportMounted),
      themeParams: mounted.themeParams && safeBool(isThemeParamsMounted),
      backButton: mounted.backButton && safeBool(isBackButtonMounted),
      mainButton: mounted.mainButton && safeBool(isMainButtonMounted),
      haptics: mounted.haptics || safeBool(isHapticFeedbackSupported),
      closingBehavior: mounted.closingBehavior,
      swipeBehavior: mounted.swipeBehavior,
    },
  };

  // Launch params are only needed to warm the bridge; ignore failures in browsers.
  attempt(() => retrieveLaunchParams());
  return initialized;
}

export function getTelegramInit(): TelegramInitResult | null {
  return initialized;
}

/** True when running inside a real Telegram client. */
export function isRealTelegram(): boolean {
  return initialized?.inTelegram ?? isTelegramEnvironment();
}

/** Exposed for tests / diagnostics. */
export function isTelegramSDKActive(): boolean {
  return Boolean(attempt(() => isTMA())) || (initialized?.inTelegram ?? false);
}
