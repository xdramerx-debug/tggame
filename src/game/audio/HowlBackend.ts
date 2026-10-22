import type { AudioBackend } from './AudioManager';
import type { SoundId } from './soundSet';

/**
 * Howler backend — the only module that knows a sound library exists.
 *
 * Howler is imported **lazily**: it is ~10 kB gzip plus a WebAudio context, and
 * none of that is needed before the first frame. `createHowlBackend` resolves
 * after the module loads and attaches, so a slow decode never blocks the engine.
 *
 * Each sound keeps one `Howl`. Overlapping plays are Howler's own voice ids, so
 * two sword swings a frame apart are two voices, not a stutter. HTML5 streaming
 * is disabled on purpose: these files are tiny and WebAudio gives sample-accurate
 * rate changes (the footstep jitter).
 */
export async function createHowlBackend(): Promise<AudioBackend> {
  const { Howl, Howler } = await import('howler');
  const howls = new Map<SoundId, Howl>();
  let loadedCount = 0;
  const missing = new Set<SoundId>();

  const backend: AudioBackend = {
    load(id, src, loop) {
      if (howls.has(id)) return;
      const howl = new Howl({
        src: [src],
        format: ['wav'],
        loop,
        preload: true,
        html5: false,
        volume: 0,
        onload: () => {
          loadedCount += 1;
        },
        onloaderror: () => {
          // A missing cue must never break the run: log once and stay silent.
          if (!missing.has(id)) {
            missing.add(id);
            console.warn('[audio] failed to load', src);
          }
        },
      });
      howls.set(id, howl);
    },
    play(id, options) {
      const howl = howls.get(id);
      if (!howl) return null;
      const soundId = howl.play();
      howl.volume(options.volume, soundId);
      howl.rate(options.rate, soundId);
      return soundId;
    },
    stop(id) {
      howls.get(id)?.stop();
    },
    setMasterVolume(volume) {
      Howler.volume(volume);
    },
    setMuted(muted) {
      Howler.mute(muted);
    },
    unlock() {
      // Safari keeps the context suspended until a gesture resumes it.
      void Howler.ctx?.resume?.();
    },
    get loadedCount() {
      return loadedCount;
    },
    dispose() {
      for (const howl of howls.values()) howl.unload();
      howls.clear();
      Howler.unload();
    },
  };

  return backend;
}
