import { shareURL } from '@telegram-apps/sdk';

/**
 * "Invite a friend" links.
 *
 * A Mini App link is `https://t.me/<bot>/<app>?startapp=<payload>`; the payload
 * is what the bot receives as `start_param`. Keeping the URL builder pure means
 * the format can be tested without a Telegram client, which matters because a
 * malformed link fails silently (Telegram just opens the app without the param).
 */
export interface ShareInvite {
  readonly url: string;
  readonly text: string;
}

/** Bot/app slug, overridable at build time (`VITE_TG_APP_SLUG`). */
export const APP_SLUG = (import.meta.env.VITE_TG_APP_SLUG as string | undefined) ?? 'tenebris_bot/tenebris';

/**
 * Builds a share link.
 * @param startParam payload for the bot (letters, digits, `_` and `-`, ≤ 64 chars)
 */
export function buildShareUrl(startParam = 'invite'): string {
  const safe = startParam.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  return `https://t.me/${APP_SLUG}?startapp=${safe}`;
}

export function buildInvite(startParam = 'invite'): ShareInvite {
  return {
    url: buildShareUrl(startParam),
    text: 'TENEBRIS — подземелье не прощает ошибок. Спустись и попробуй пройти дальше меня.',
  };
}

/**
 * Opens the Telegram share sheet.
 * @returns true when the sheet was requested (the client takes over from here)
 */
export function shareInvite(startParam = 'invite'): boolean {
  const invite = buildInvite(startParam);
  try {
    if (shareURL.isAvailable()) {
      shareURL(invite.url, invite.text);
      return true;
    }
  } catch (error) {
    console.warn('[share] Telegram share unavailable', error instanceof Error ? error.message : error);
  }
  // Browser fallback: the same link in a new tab (dev preview, E2E).
  if (typeof window !== 'undefined') {
    window.open(invite.url, '_blank', 'noopener');
    return true;
  }
  return false;
}
