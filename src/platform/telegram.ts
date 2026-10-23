import { init, miniApp, viewport, hapticFeedback, retrieveLaunchParams } from '@telegram-apps/sdk';

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
  } catch {
    insideTelegram = false;
  }
}

export function isTelegram(): boolean {
  return insideTelegram;
}

export type HapticKind = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

export function haptic(kind: HapticKind): void {
  try {
    if (kind === 'success' || kind === 'warning' || kind === 'error') {
      if (hapticFeedback.notificationOccurred.isAvailable()) {
        hapticFeedback.notificationOccurred(kind);
      }
      return;
    }
    if (hapticFeedback.impactOccurred.isAvailable()) {
      hapticFeedback.impactOccurred(kind);
    }
  } catch {
    // Plain browser fallback: safely ignore
  }
}

export function getPlayerName(): string {
  try {
    const launch = retrieveLaunchParams();
    const user = launch.tgWebAppData?.user;
    if (user) {
      const trimmed = user.first_name.trim();
      return trimmed !== '' ? trimmed : (user.username ?? 'Командир');
    }
  } catch {
    // Running outside Telegram WebView
  }
  return 'Командир';
}
