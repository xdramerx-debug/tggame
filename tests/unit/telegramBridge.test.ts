import { describe, expect, it } from 'vitest';
import { cloudKey, loadMirrored, mirror, saveMirrored } from '@/telegram/cloudSync';
import type { KeyValueStore } from '@/telegram/cloudSync';
import { greetingFor, parsePlayer, NO_PLAYER } from '@/telegram/player';
import { buildInvite, buildShareUrl } from '@/telegram/share';
import { isHexDark } from '@/telegram/theme';

/** In-memory stand-in for Dexie; the bridge must work with any key/value store. */
class MemoryStore implements KeyValueStore {
  readonly data = new Map<string, unknown>();
  writes = 0;

  get<T>(key: string, fallback: T): Promise<T> {
    return Promise.resolve(this.data.has(key) ? (this.data.get(key) as T) : fallback);
  }

  set<T>(key: string, value: T): Promise<void> {
    this.writes += 1;
    this.data.set(key, value);
    return Promise.resolve();
  }
}

/**
 * Mirrored persistence and deep-link plumbing.
 *
 * These are the parts of the Telegram integration that are *logic* rather than
 * bridge calls, so they are tested without a client: they are also the parts
 * that quietly destroy player data when they get a corner case wrong.
 */
describe('cloud sync', () => {
  it('prefixes cloud keys so the game never collides with another app', () => {
    expect(cloudKey('progression')).toBe('tenebris.progression');
  });

  it('writes locally first and mirrors the same JSON to the cloud', async () => {
    const store = new MemoryStore();
    const sent: { key: string; value: string }[] = [];
    const ok = await saveMirrored(store, 'progression', { embers: 12 }, {
      set: (key, value) => {
        sent.push({ key, value });
        return Promise.resolve(true);
      },
    });
    expect(ok).toBe(true);
    expect(await store.get('progression', null)).toEqual({ embers: 12 });
    expect(sent[0]).toEqual({ key: 'tenebris.progression', value: '{"embers":12}' });
  });

  it('reports a cloud failure without losing the local write', async () => {
    const store = new MemoryStore();
    const ok = await saveMirrored(store, 'settings.v1', { sfxVolume: 0.4 }, {
      set: () => Promise.reject(new Error('bridge gone')),
    });
    expect(ok).toBe(false);
    expect(await store.get('settings.v1', null)).toEqual({ sfxVolume: 0.4 });
  });

  it('ignores a cloud failure when mirroring an already-saved value', async () => {
    expect(await mirror('progression', { embers: 1 }, { set: () => Promise.resolve(false) })).toBe(false);
  });

  it('restores from the cloud only when the local store is empty', async () => {
    const store = new MemoryStore();
    const restored = await loadMirrored<{ embers: number } | null>(store, 'progression', null, {
      get: () => Promise.resolve('{"embers":40}'),
    });
    expect(restored).toEqual({ value: { embers: 40 }, restored: true });
    // The restore is written back locally, so the next boot is a fast path.
    expect(store.writes).toBe(1);
    expect(await store.get('progression', null)).toEqual({ embers: 40 });
  });

  it('never overwrites an existing local value with a stale cloud copy', async () => {
    const store = new MemoryStore();
    await store.set('progression', { embers: 7 });
    const result = await loadMirrored<{ embers: number } | null>(store, 'progression', null, {
      get: () => Promise.resolve('{"embers":999}'),
    });
    expect(result.restored).toBe(false);
    expect(result.value).toEqual({ embers: 7 });
  });

  it('survives a corrupt cloud value', async () => {
    const store = new MemoryStore();
    const result = await loadMirrored<unknown>(store, 'progression', null, {
      get: () => Promise.resolve('{not json'),
    });
    expect(result).toEqual({ value: null, restored: false });
    expect(store.writes).toBe(0);
  });

  it('survives a cloud read that throws', async () => {
    const store = new MemoryStore();
    const result = await loadMirrored<unknown>(store, 'settings.v1', null, {
      get: () => Promise.reject(new Error('timeout')),
    });
    expect(result).toEqual({ value: null, restored: false });
  });
});

describe('player identity', () => {
  it('reads the name from launch params and greets by it', () => {
    const player = parsePlayer({ id: 42, first_name: '  Артём ', username: 'artem', is_premium: true });
    expect(player.firstName).toBe('Артём');
    expect(player.premium).toBe(true);
    expect(greetingFor(player)).toBe('Привет, Артём');
  });

  it('falls back to a neutral greeting without a name', () => {
    expect(greetingFor(NO_PLAYER)).toBe('Добро пожаловать в TENEBRIS');
    expect(parsePlayer(undefined)).toEqual(NO_PLAYER);
  });

  it('drops garbage instead of rendering it', () => {
    const player = parsePlayer({ id: Number.NaN, first_name: '   ', username: '' });
    expect(player).toEqual(NO_PLAYER);
  });
});

describe('share links', () => {
  it('builds a startapp link with a safe payload', () => {
    const url = buildShareUrl('ref_42');
    expect(url).toContain('https://t.me/');
    expect(url.endsWith('?startapp=ref_42')).toBe(true);
  });

  it('sanitises characters Telegram would reject and caps the length', () => {
    const url = buildShareUrl('a b/c?d=' + 'x'.repeat(80));
    const payload = url.split('startapp=')[1] ?? '';
    expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(payload.length).toBeLessThanOrEqual(64);
  });

  it('carries an invite message with the link', () => {
    const invite = buildInvite();
    expect(invite.url).toBe(buildShareUrl('invite'));
    expect(invite.text.length).toBeGreaterThan(10);
  });
});

describe('theme luminance', () => {
  it('classifies Telegram palettes used by the HUD', () => {
    expect(isHexDark('#0B0E14')).toBe(true);
    expect(isHexDark('#FFFFFF')).toBe(false);
  });
});
