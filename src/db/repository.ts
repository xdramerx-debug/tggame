import type { TenebrisDatabase } from './db';
import { db as defaultDb } from './db';

/** Version of the exported JSON envelope; bump on breaking changes. */
export const EXPORT_VERSION = 1;

export interface ExportedDatabase {
  readonly app: 'tenebris';
  readonly version: number;
  readonly exportedAt: string;
  readonly saves: unknown[];
  readonly meta: unknown[];
  readonly stats: unknown[];
  readonly settings: unknown[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Typed key/value persistence on top of Dexie.
 * All methods swallow IndexedDB errors (private mode, quota) and fall back to
 * in-memory behaviour so gameplay never crashes because storage is unavailable.
 */
export class SettingsRepository {
  constructor(private readonly database: TenebrisDatabase = defaultDb) {}

  async get<T>(key: string, fallback: T): Promise<T> {
    try {
      const row = await this.database.settings.get(key);
      if (!row) return fallback;
      return JSON.parse(row.value) as T;
    } catch (error) {
      console.warn('[db] settings read failed', key, error);
      return fallback;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    try {
      await this.database.settings.put({ key, value: JSON.stringify(value), updatedAt: Date.now() });
    } catch (error) {
      console.warn('[db] settings write failed', key, error);
    }
  }

  async remove(key: string): Promise<void> {
    try {
      await this.database.settings.delete(key);
    } catch (error) {
      console.warn('[db] settings delete failed', key, error);
    }
  }
}

/** Meta-progression storage (essence, unlocks). */
export class MetaRepository {
  constructor(private readonly database: TenebrisDatabase = defaultDb) {}

  async get<T>(key: string, fallback: T): Promise<T> {
    try {
      const row = await this.database.meta.get(key);
      if (!row) return fallback;
      return JSON.parse(row.value) as T;
    } catch (error) {
      console.warn('[db] meta read failed', key, error);
      return fallback;
    }
  }

  async set<T>(key: string, value: T): Promise<void> {
    try {
      await this.database.meta.put({ key, value: JSON.stringify(value), updatedAt: Date.now() });
    } catch (error) {
      console.warn('[db] meta write failed', key, error);
    }
  }
}

/**
 * Serialises every table into a single JSON document (settings export).
 * Uses `toArray()` per table; the dataset is tiny (< 100 KB), so no streaming.
 */
export async function exportDatabase(database: TenebrisDatabase = defaultDb): Promise<ExportedDatabase> {
  const [saves, meta, stats, settings] = await Promise.all([
    database.saves.toArray(),
    database.meta.toArray(),
    database.stats.toArray(),
    database.settings.toArray(),
  ]);
  return {
    app: 'tenebris',
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    saves,
    meta,
    stats,
    settings,
  };
}

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

/**
 * Validates and restores a previously exported JSON document.
 * Import is additive: existing rows with the same primary key are overwritten,
 * everything else is preserved.
 */
export async function importDatabase(payload: string, database: TenebrisDatabase = defaultDb): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw new ImportError('Файл повреждён: это не JSON');
  }
  if (!isRecord(parsed) || parsed['app'] !== 'tenebris') {
    throw new ImportError('Это не резервная копия TENEBRIS');
  }
  const version = parsed['version'];
  if (version !== EXPORT_VERSION) {
    throw new ImportError(`Неподдерживаемая версия сохранения: ${String(version)}`);
  }
  const table = (key: string): unknown[] => (Array.isArray(parsed[key]) ? (parsed[key] as unknown[]) : []);

  await database.transaction('rw', database.saves, database.meta, database.stats, database.settings, async () => {
    const saves = table('saves').filter(isRecord) as unknown as Parameters<typeof database.saves.bulkPut>[0];
    if (saves.length > 0) await database.saves.bulkPut(saves);
    const meta = table('meta').filter(isRecord) as unknown as Parameters<typeof database.meta.bulkPut>[0];
    if (meta.length > 0) await database.meta.bulkPut(meta);
    const stats = table('stats').filter(isRecord) as unknown as Parameters<typeof database.stats.bulkPut>[0];
    if (stats.length > 0) await database.stats.bulkPut(stats);
    const settings = table('settings').filter(isRecord) as unknown as Parameters<typeof database.settings.bulkPut>[0];
    if (settings.length > 0) await database.settings.bulkPut(settings);
  });
}

/** Wipes all four tables — used by "сбросить прогресс" in settings. */
export async function clearDatabase(database: TenebrisDatabase = defaultDb): Promise<void> {
  await database.transaction('rw', database.saves, database.meta, database.stats, database.settings, async () => {
    await Promise.all([
      database.saves.clear(),
      database.meta.clear(),
      database.stats.clear(),
      database.settings.clear(),
    ]);
  });
}
