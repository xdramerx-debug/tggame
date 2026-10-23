import { cloudStorage, isTMA } from '@telegram-apps/sdk';

/**
 * Telegram CloudStorage bridge.
 *
 * Why it exists: inside a Telegram WebView IndexedDB can be evicted (storage
 * pressure, iOS "clear website data"), and a roguelite that forgets the embers
 * you paid for is worse than one that never had meta-progression. CloudStorage
 * is per-user, survives reinstall and is available since Bot API 6.9, so it is
 * used as a *mirror*: Dexie stays the source of truth for reads, every write is
 * copied to the cloud when the client supports it.
 *
 * Everything here is best-effort: outside Telegram (browser, Playwright) or on an
 * old client the calls resolve to null/false and the game keeps working on Dexie.
 */

/** CloudStorage limits a value to 128 KB; our snapshots are well under 4 KB. */
export const CLOUD_VALUE_LIMIT = 128 * 1024;

/** Reported once at boot so the settings screen can say where progress lives. */
export interface CloudStatus {
  readonly available: boolean;
  readonly reason?: string;
}

export function cloudStatus(): CloudStatus {
  try {
    if (!isTMA()) return { available: false, reason: 'не в Telegram' };
    if (!cloudStorage.isSupported()) return { available: false, reason: 'клиент старше Bot API 6.9' };
    if (!cloudStorage.getItem.isAvailable()) return { available: false, reason: 'API недоступен' };
    return { available: true };
  } catch (error) {
    return { available: false, reason: error instanceof Error ? error.message : 'ошибка SDK' };
  }
}

/** True when the current client can actually store values in the cloud. */
export function isCloudStorageAvailable(): boolean {
  return cloudStatus().available;
}

/**
 * Reads a key.
 * @returns the stored string, or null when missing/unsupported
 */
export async function cloudGet(key: string): Promise<string | null> {
  if (!isCloudStorageAvailable()) return null;
  try {
    const value = await cloudStorage.getItem(key);
    return typeof value === 'string' && value.length > 0 ? value : null;
  } catch (error) {
    console.warn('[cloud] read failed', key, error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Writes a key, mirroring a Dexie write.
 * @returns true when the value reached the cloud
 */
export async function cloudSet(key: string, value: string): Promise<boolean> {
  if (value.length > CLOUD_VALUE_LIMIT) {
    // Never send a value that the client would reject: local storage keeps it.
    console.warn('[cloud] value too large, keeping it local only:', key, value.length);
    return false;
  }
  if (!isCloudStorageAvailable()) return false;
  try {
    await cloudStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn('[cloud] write failed', key, error instanceof Error ? error.message : error);
    return false;
  }
}

export async function cloudRemove(key: string): Promise<boolean> {
  if (!isCloudStorageAvailable()) return false;
  try {
    await cloudStorage.deleteItem(key);
    return true;
  } catch {
    return false;
  }
}
