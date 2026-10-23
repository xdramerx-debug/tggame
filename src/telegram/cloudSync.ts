import { cloudGet, cloudSet } from './cloudStorage';

/**
 * Write-through mirror from Dexie to Telegram CloudStorage.
 *
 * Deliberately *not* a sync engine: there is no merge, no conflict resolution
 * and no background polling. A mini app has one device and one user at a time,
 * and a lost-write bug in a merge algorithm would be far worse than the eviction
 * it protects against. The rule is simple and testable:
 *
 * - reads always come from Dexie (fast, synchronous-ish, offline),
 * - writes go to Dexie first, then to the cloud (best-effort),
 * - on boot, if Dexie has no value but the cloud does, the cloud value is
 *   restored once and written back locally.
 */

export interface KeyValueStore {
  get<T>(key: string, fallback: T): Promise<T>;
  set<T>(key: string, value: T): Promise<void>;
}

export interface CloudMirrorOptions {
  readonly get?: (key: string) => Promise<string | null>;
  readonly set?: (key: string, value: string) => Promise<boolean>;
}

export const CLOUD_PREFIX = 'tenebris.';

/** CloudStorage keys must be short and ASCII; the prefix namespaces the game. */
export function cloudKey(key: string): string {
  return `${CLOUD_PREFIX}${key}`;
}

/**
 * Mirrors an already-saved value to the cloud (no local write).
 *
 * Used by stores that persist themselves (React setters write to Dexie on every
 * change) and only need the cloud half of {@link saveMirrored}.
 */
export async function mirror<T>(key: string, value: T, options: CloudMirrorOptions = {}): Promise<boolean> {
  try {
    return await (options.set ?? cloudSet)(cloudKey(key), JSON.stringify(value));
  } catch (error) {
    console.warn('[cloud] mirror failed', key, error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * Writes a value to the local store and mirrors it to the cloud.
 * @returns true when the cloud copy succeeded (false is never an error)
 */
export async function saveMirrored<T>(
  store: KeyValueStore,
  key: string,
  value: T,
  options: CloudMirrorOptions = {},
): Promise<boolean> {
  await store.set(key, value);
  try {
    return await (options.set ?? cloudSet)(cloudKey(key), JSON.stringify(value));
  } catch (error) {
    console.warn('[cloud] mirror failed', key, error instanceof Error ? error.message : error);
    return false;
  }
}

export interface RestoreResult<T> {
  readonly value: T;
  /** True when the value came from the cloud and was written back locally. */
  readonly restored: boolean;
}

/**
 * Reads a value, restoring it from the cloud when the local store is empty.
 *
 * `fallback` must describe "nothing stored yet" (e.g. `null`, not `{}`): the
 * restore only happens when the local read returns exactly that value, so a
 * genuinely defaulted setting is never overwritten by a stale cloud copy.
 */
export async function loadMirrored<T>(
  store: KeyValueStore,
  key: string,
  fallback: T,
  options: CloudMirrorOptions = {},
): Promise<RestoreResult<T>> {
  const local = await store.get<T>(key, fallback);
  if (local !== fallback) return { value: local, restored: false };

  let raw: string | null = null;
  try {
    raw = await (options.get ?? cloudGet)(cloudKey(key));
  } catch {
    return { value: fallback, restored: false };
  }
  if (!raw) return { value: fallback, restored: false };

  try {
    const parsed = JSON.parse(raw) as T;
    await store.set(key, parsed);
    return { value: parsed, restored: true };
  } catch {
    // A corrupt cloud value must not brick the boot: keep the local default.
    console.warn('[cloud] stored value is not valid JSON, ignoring', key);
    return { value: fallback, restored: false };
  }
}
