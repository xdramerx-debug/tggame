import { MetaRepository } from '@/db/repository';
import { loadMirrored, saveMirrored } from '@/telegram/cloudSync';
import { MetaState } from './MetaState';
import type { MetaSnapshot } from './MetaState';

const STORAGE_KEY = 'progression';

/** What the storage needs from a repository (Dexie in the app, a map in tests). */
export interface MetaStoreLike {
  get<T>(key: string, fallback: T): Promise<T>;
  set<T>(key: string, value: T): Promise<void>;
}

/**
 * Persists meta-progression in IndexedDB (the `meta` table from the spec).
 *
 * Failures are swallowed on purpose: a player in a private WebView with a
 * blocked IndexedDB must still be able to play, they simply lose persistence.
 * A memory copy keeps the current session consistent either way.
 */
export class MetaStorage {
  private readonly repository: MetaStoreLike;
  private state = new MetaState();
  private loaded = false;
  private dirty = false;

  constructor(repository: MetaStoreLike = new MetaRepository()) {
    this.repository = repository;
  }

  get value(): MetaState {
    return this.state;
  }

  /** Reads the stored snapshot once; later calls are free. */
  async load(): Promise<MetaState> {
    if (this.loaded) return this.state;
    const stored = (await loadMirrored<MetaSnapshot | null>(this.repository, STORAGE_KEY, null)).value;
    // A purchase made while the read was in flight must not be rolled back by
    // the (older) stored snapshot.
    if (!this.dirty) this.state.restore(stored);
    this.loaded = true;
    return this.state;
  }

  /**
   * Applies a mutation and writes it immediately.
   *
   * A purchase is one tap on a static screen, so there is nothing to coalesce —
   * and a debounce timer would lose the write if the WebView is closed (or the
   * page reloaded) within that window, which is exactly what happens when a
   * player buys an upgrade and immediately backs out.
   */
  update(mutator: (state: MetaState) => void): MetaState {
    mutator(this.state);
    this.dirty = true;
    void this.save();
    return this.state;
  }

  /**
   * Writes the snapshot locally and mirrors it into Telegram CloudStorage.
   *
   * Embers are the one number a player would notice losing, and the cloud copy
   * costs one bridge call per purchase — cheap enough to do synchronously with
   * the local write instead of debouncing both.
   */
  async save(): Promise<void> {
    await saveMirrored(this.repository, STORAGE_KEY, this.state.snapshot());
  }
}

export const metaStorage = new MetaStorage();
