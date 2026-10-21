import Dexie from 'dexie';
import type { EntityTable } from 'dexie';

/** A snapshot of a run, serialised as JSON (no server, no binary blobs). */
export interface SaveRow {
  id?: number;
  /** Slot name, e.g. `run-auto` or `floor-2`. */
  slot: string;
  timestamp: number;
  /** Opaque JSON payload; schema versioned by `meta` owner. */
  payload: string;
}

/** Key/value meta-progression: essence, unlocks, onboarding flags. */
export interface MetaRow {
  key: string;
  value: string;
  updatedAt: number;
}

/** Aggregate result of one run, kept for the statistics screen. */
export interface StatRow {
  id?: number;
  runId: string;
  monstersKilled: number;
  lootCollected: number;
  timeSec: number;
  floorReached: number;
  createdAt: number;
}

/** User settings persisted as JSON per key. */
export interface SettingRow {
  key: string;
  value: string;
  updatedAt: number;
}

export type TenebrisDatabase = Dexie & {
  saves: EntityTable<SaveRow, 'id'>;
  meta: EntityTable<MetaRow, 'key'>;
  stats: EntityTable<StatRow, 'id'>;
  settings: EntityTable<SettingRow, 'key'>;
};

/** IndexedDB name is versioned so a schema break never corrupts a player's data. */
export const DB_NAME = 'tenebris';

/**
 * Dexie instance with the exact schema required by the tech spec.
 * `version(1)` mirrors the spec; later migrations must add new versions instead
 * of editing this block.
 */
export function createDatabase(name: string = DB_NAME): TenebrisDatabase {
  const database = new Dexie(name) as TenebrisDatabase;
  database.version(1).stores({
    saves: '++id, slot, timestamp',
    meta: 'key',
    stats: '++id, runId, monstersKilled, lootCollected, timeSec, floorReached',
    settings: 'key',
  });
  return database;
}

export const db = createDatabase();
