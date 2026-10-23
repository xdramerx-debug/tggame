import { describe, expect, it, beforeEach } from 'vitest';
import { AudioManager, DEFAULT_VOLUMES } from '@/game/audio/AudioManager';
import type { AudioBackend } from '@/game/audio/AudioManager';
import { SOUND_IDS, SOUND_SPECS } from '@/game/audio/soundSet';
import type { SoundId } from '@/game/audio/soundSet';

/**
 * Fake backend: records calls instead of touching WebAudio.
 *
 * The point of the interface split is exactly this — throttle, mute and volume
 * policy are pure logic and must be verifiable without a browser.
 */
class FakeBackend implements AudioBackend {
  readonly loaded: { id: SoundId; src: string; loop: boolean }[] = [];
  readonly plays: { id: SoundId; volume: number; rate: number }[] = [];
  readonly stopped: SoundId[] = [];
  master = 1;
  muted = false;
  unlockCalls = 0;
  disposed = false;
  loadedCount = 0;

  load(id: SoundId, src: string, loop: boolean): void {
    this.loaded.push({ id, src, loop });
    this.loadedCount += 1;
  }

  play(id: SoundId, options: { volume: number; rate: number }): number | null {
    this.plays.push({ id, ...options });
    return this.plays.length;
  }

  stop(id: SoundId): void {
    this.stopped.push(id);
  }

  setMasterVolume(volume: number): void {
    this.master = volume;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  unlock(): void {
    this.unlockCalls += 1;
  }

  dispose(): void {
    this.disposed = true;
  }
}

/** Kept in one place so adding a cue is a one-line change in the test too. */
const SOUND_IDS_COUNT = SOUND_IDS.length;

function makeManager(): { manager: AudioManager; backend: FakeBackend; clock: { now: number } } {
  const clock = { now: 0 };
  const manager = new AudioManager(() => clock.now, () => 0.5);
  const backend = new FakeBackend();
  manager.attach(backend);
  return { manager, backend, clock };
}

describe('AudioManager', () => {
  let manager: AudioManager;
  let backend: FakeBackend;
  let clock: { now: number };

  beforeEach(() => {
    ({ manager, backend, clock } = makeManager());
  });

  it('preloads every sound from the base URL', () => {
    manager.preload('/assets/');
    expect(backend.loaded.length).toBe(SOUND_IDS_COUNT);
    expect(backend.loaded[0]?.src.startsWith('/assets/audio/')).toBe(true);
    expect(backend.loaded.filter((entry) => entry.loop).map((entry) => entry.id)).toEqual(['ambience']);
  });

  it('applies group volume and per-cue gain', () => {
    manager.setVolumes({ master: 1, sfx: 0.5, music: 0.5 });
    manager.playSound('hit');
    expect(backend.plays[0]?.volume).toBeCloseTo(0.5 * 0.85, 3);
  });

  it('throttles a cue that fires faster than its retrigger window', () => {
    expect(manager.playSound('hit')).toBe(true);
    expect(manager.playSound('hit')).toBe(false);
    clock.now += SOUND_SPECS.hit.retriggerMs - 1;
    expect(manager.playSound('hit')).toBe(false);
    clock.now += 2;
    expect(manager.playSound('hit')).toBe(true);
    expect(backend.plays.length).toBe(2);
  });

  it('lets force bypass throttling and allows explicit rate', () => {
    manager.playSound('step', { force: true, rate: 1.2 });
    manager.playSound('step', { force: true, rate: 1.2 });
    expect(backend.plays.length).toBe(2);
    expect(backend.plays[0]?.rate).toBe(1.2);
  });

  it('jitters the playback rate for footsteps', () => {
    manager.playSound('step', { force: true });
    // Fake random() returns 0.5, so the jitter term cancels out to exactly 1.
    expect(backend.plays[0]?.rate).toBeCloseTo(1, 5);
  });

  it('goes silent when muted, and stops the ambience loop', () => {
    manager.startAmbience();
    expect(manager.ambience).toBe(true);
    manager.setEnabled(false);
    expect(backend.muted).toBe(true);
    expect(backend.master).toBe(0);
    expect(backend.stopped).toContain('ambience');
    expect(manager.playSound('hit', { force: true })).toBe(false);
    manager.setEnabled(true);
    expect(backend.muted).toBe(false);
    expect(backend.plays.at(-1)?.id).toBe('ambience');
  });

  it('does nothing without a backend (audio may load late or fail)', () => {
    const bare = new AudioManager();
    expect(bare.ready).toBe(false);
    bare.preload('/assets/');
    expect(bare.playSound('ui')).toBe(false);
    bare.startAmbience();
    bare.suspend();
    bare.resume();
    expect(bare.snapshot().plays).toBe(0);
  });

  it('suspends and resumes without losing the ambience intent', () => {
    manager.startAmbience();
    const plays = backend.plays.length;
    manager.suspend();
    expect(backend.muted).toBe(true);
    manager.resume();
    expect(backend.muted).toBe(false);
    expect(backend.plays.length).toBeGreaterThan(plays);
  });

  it('keeps the default mix and reports a debug snapshot', () => {
    expect(DEFAULT_VOLUMES.master).toBeGreaterThan(0.5);
    manager.playSound('crit');
    const snapshot = manager.snapshot();
    expect(snapshot.ready).toBe(true);
    expect(snapshot.total).toBe(SOUND_IDS_COUNT);
    expect(snapshot.plays).toBe(1);
    expect(snapshot.lastId).toBe('crit');
  });

  it('disposes the backend and forgets state', () => {
    manager.dispose();
    expect(backend.disposed).toBe(true);
    expect(manager.ready).toBe(false);
  });

  it('respects the global volume when the master is at zero', () => {
    manager.setVolumes({ master: 0 });
    expect(manager.playSound('ui', { force: true })).toBe(false);
  });
});
