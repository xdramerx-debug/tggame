import { db } from '@/db/db';
import { cloudRemove } from '@/telegram/cloudStorage';
import { CLOUD_PREFIX } from '@/telegram/cloudSync';

/**
 * QA reset (`?reset=1`).
 *
 * Two problems it solves, both real during testing and support:
 * - a reviewer cannot reach the first-run experience once a run has been saved;
 * - a player whose local data is corrupted needs a way back without hunting for
 *   the browser's "clear site data" dialog inside a Telegram WebView.
 *
 * It wipes local tables and the mirrored cloud keys, then reloads. Dev builds
 * require the explicit param; production requires the same param *plus* a
 * confirmation — a destructive action must never be one accidental tap away.
 */
export const RESET_PARAM = 'reset';

export function resetRequested(search: string = window.location.search): boolean {
  const params = new URLSearchParams(search);
  return params.get(RESET_PARAM) === '1';
}

/** Drops the local databases and the cloud mirrors of our own keys. */
export async function wipeProgress(): Promise<void> {
  try {
    await Promise.all([db.settings.clear(), db.meta.clear(), db.stats.clear(), db.saves.clear()]);
  } catch (error) {
    console.warn('[reset] local wipe failed', error instanceof Error ? error.message : error);
  }
  for (const key of ['progression', 'settings.v1']) {
    await cloudRemove(`${CLOUD_PREFIX}${key}`);
  }
}

/**
 * Runs the reset if the URL asked for it.
 * @returns true when the page is about to reload (callers should stop working)
 */
export async function runRequestedReset(options: { readonly confirm?: boolean } = {}): Promise<boolean> {
  if (!resetRequested()) return false;
  if (options.confirm !== false && typeof window !== 'undefined') {
    const agreed = window.confirm('Сбросить весь прогресс TENEBRIS? Это необратимо.');
    if (!agreed) return false;
  }
  await wipeProgress();
  if (typeof window !== 'undefined') {
    // Strip the param so a reload does not wipe twice.
    const url = new URL(window.location.href);
    url.searchParams.delete(RESET_PARAM);
    window.location.replace(url.toString());
  }
  return true;
}
