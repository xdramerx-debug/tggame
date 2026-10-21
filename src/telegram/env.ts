/**
 * Telegram environment detection.
 *
 * The app never loads `telegram-web-app.js` from a CDN: the SDK reads launch
 * parameters straight from the URL hash, which saves a third-party request on
 * the critical path (first render budget).
 */

interface TelegramWebAppLike {
  readonly initData?: string;
  readonly version?: string;
  readonly platform?: string;
}

interface TelegramWindow extends Window {
  Telegram?: { WebApp?: TelegramWebAppLike };
}

/** True when the page runs inside a Telegram client (not a plain browser). */
export function isTelegramEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  const win = window as TelegramWindow;
  if (win.Telegram?.WebApp?.initData) return true;
  // Bot API 6.1+ appends tgWebAppData to the hash when opening a Mini App.
  return window.location.hash.includes('tgWebAppData');
}

/** Telegram client version as [major, minor], or null outside Telegram. */
export function telegramVersion(): [number, number] | null {
  if (typeof window === 'undefined') return null;
  const raw = (window as TelegramWindow).Telegram?.WebApp?.version;
  if (!raw) return null;
  const [major, minor] = raw.split('.').map((part) => Number.parseInt(part, 10));
  if (Number.isNaN(major ?? Number.NaN)) return null;
  return [major ?? 0, minor ?? 0];
}

/** Returns true when the running Telegram client supports `method` since `since`. */
export function telegramSupports(since: [number, number]): boolean {
  const version = telegramVersion();
  if (!version) return false;
  return version[0] > since[0] || (version[0] === since[0] && version[1] >= since[1]);
}
