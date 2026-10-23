import { init, miniApp, viewport, hapticFeedback, retrieveLaunchParams, themeParams } from '@telegram-apps/sdk';
import { track } from './analytics';

let initialised = false;
let insideTelegram = false;
let telegramUserId = 0;

export function initTelegram(): void {
  if (initialised) return;
  initialised = true;
  try {
    init();
    // outside Telegram the SDK init throws or launch params are empty
    const launch = retrieveLaunchParams();
    insideTelegram = Boolean(launch.tgWebAppData?.user);
    telegramUserId = launch.tgWebAppData?.user?.id ?? 0;
    if (insideTelegram) {
      if (miniApp.mountSync.isAvailable()) miniApp.mountSync();
      if (miniApp.ready.isAvailable()) miniApp.ready();
      if (viewport.expand.isAvailable()) viewport.expand();
    }
  } catch {
    insideTelegram = false;
  }
  track('boot', { telegram: insideTelegram });
}

export function isTelegram(): boolean {
  return insideTelegram;
}

export function getTelegramUserId(): number {
  return telegramUserId;
}

/** Dev mode: outside Telegram, or ?dev=1 — enables dev_ commands and admin codes. */
export function isDevMode(): boolean {
  if (typeof window !== 'undefined' && window.location.search.includes('dev=1')) return true;
  return !insideTelegram;
}

export function getPlayerName(): string {
  try {
    const launch = retrieveLaunchParams();
    const user = launch.tgWebAppData?.user;
    if (user) {
      const trimmed = user.first_name.trim();
      return trimmed !== '' ? trimmed : (user.username ?? 'Странник');
    }
  } catch {
    // running outside Telegram WebView
  }
  return 'Странник';
}

export type HapticKind = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

export function haptic(kind: HapticKind): void {
  try {
    if (kind === 'success' || kind === 'warning' || kind === 'error') {
      if (hapticFeedback.notificationOccurred.isAvailable()) hapticFeedback.notificationOccurred(kind);
      return;
    }
    if (hapticFeedback.impactOccurred.isAvailable()) hapticFeedback.impactOccurred(kind);
  } catch {
    // plain browser fallback
  }
}

/** Telegram theme (§7): follow dark/light so the UI never «слепнет». */
export function getTelegramTheme(): 'dark' | 'light' {
  try {
    const bg = themeParams.backgroundColor() as string | undefined;
    if (typeof bg === 'string') {
      const m = /^#([0-9a-f]{6})$/i.exec(bg);
      if (m) {
        const v = parseInt(m[1] ?? '000000', 16);
        const r = (v >> 16) & 255, g = (v >> 8) & 255, b = v & 255;
        return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? 'light' : 'dark';
      }
    }
  } catch {
    // ignore — outside Telegram
  }
  return 'dark';
}
