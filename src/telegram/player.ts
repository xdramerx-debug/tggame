/**
 * Who is playing.
 *
 * The name is only ever used for a greeting on the menu ("Привет, Артём"): no
 * profile data is stored, sent anywhere or written to IndexedDB, because the
 * Telegram ID is not a thing this game needs to keep.
 */
export interface TelegramPlayer {
  readonly id: number | null;
  readonly firstName: string | null;
  readonly username: string | null;
  /** True when the client reports a premium account (only affects the badge). */
  readonly premium: boolean;
}

export const NO_PLAYER: TelegramPlayer = { id: null, firstName: null, username: null, premium: false };

interface InitDataUser {
  readonly id?: number;
  readonly first_name?: string;
  readonly username?: string;
  readonly is_premium?: boolean;
}

/** Parses the `user` field of a launch-params `tgWebAppData` payload. */
export function parsePlayer(user: InitDataUser | null | undefined): TelegramPlayer {
  if (!user) return NO_PLAYER;
  const firstName = typeof user.first_name === 'string' ? user.first_name.trim().slice(0, 32) : '';
  return {
    id: typeof user.id === 'number' && Number.isFinite(user.id) ? user.id : null,
    firstName: firstName.length > 0 ? firstName : null,
    username: typeof user.username === 'string' && user.username.length > 0 ? user.username.slice(0, 32) : null,
    premium: user.is_premium === true,
  };
}

/**
 * Reads the player from the SDK launch params.
 *
 * Wrapped in try/catch on purpose: outside Telegram (and with the mock
 * environment) `retrieveLaunchParams` may throw or return an empty payload, and
 * a missing name must never be a boot error.
 */
export function readPlayer(): TelegramPlayer {
  if (typeof window === 'undefined') return NO_PLAYER;
  try {
    const hash = window.location.hash.replace(/^#/, '');
    const data = new URLSearchParams(hash).get('tgWebAppData');
    if (!data) return NO_PLAYER;
    const params = new URLSearchParams(data);
    const raw = params.get('user');
    if (!raw) return NO_PLAYER;
    return parsePlayer(JSON.parse(raw) as InitDataUser);
  } catch {
    return NO_PLAYER;
  }
}

/** "Привет, Артём" / "Добро пожаловать" — one place for the greeting copy. */
export function greetingFor(player: TelegramPlayer): string {
  return player.firstName ? `Привет, ${player.firstName}` : 'Добро пожаловать в TENEBRIS';
}
