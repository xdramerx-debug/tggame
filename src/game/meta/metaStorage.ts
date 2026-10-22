import { MetaRepository } from '@/db/repository';
import { MetaState } from './MetaState';
import type { MetaSnapshot } from './MetaState';

const STORAGE_KEY = 'progression';

/**
 * Persists meta-progression in IndexedDB (the `meta` table from the spec).
 *
 * Failures are swallowed on purpose: a player in a private WebView with a
 * blocked IndexedDB must still be able to play, they simply lose persistence.
 * A memory copy keeps the current session consistent either way.
 */
export class MetaStorage {
  private readonly repository = new MetaRepository();
  private state = new MetaState();
  private loaded = false;
  private dirty = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  get value(): MetaState {
    return this.state;
  }

  /** Reads the stored snapshot once; later calls are free. */
  async load(): Promise<MetaState> {
    if (this.loaded) return this.state;
    const stored = await this.repository.get<MetaSnapshot | null>(STORAGE_KEY, null);
    // A purchase made while the read was in flight must not be rolled back by
    // the (older) stored snapshot.
    if (!this.dirty) this.state.restore(stored);
    this.loaded = true;
    return this.state;
  }

  /** Applies a mutation and schedules a debounced write (runs end on taps). */
  update(mutator: (state: MetaState) => void): MetaState {
    mutator(this.state);
    this.dirty = true;
    this.scheduleSave();
    return this.state;
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.save();
    }, 250);
  }

  async save(): Promise<void> {
    await this.repository.set(STORAGE_KEY, this.state.snapshot());
  }
}

export const metaStorage = new MetaStorage();
