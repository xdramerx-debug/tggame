import { audio } from './AudioManager';
import type { AudioBackend } from './AudioManager';
import { assetUrl } from '@/game/assets/manifest';

export { audio, AudioManager, DEFAULT_VOLUMES } from './AudioManager';
export type { AudioBackend, AudioDebugSnapshot, VolumeState } from './AudioManager';
export { SOUND_IDS, SOUND_SPECS, STEP_DISTANCE } from './soundSet';
export type { SoundId, SoundSpec } from './soundSet';

let loading: Promise<boolean> | null = null;

/**
 * Boots the audio layer: loads Howler, attaches the backend and queues every cue.
 *
 * Never rejects — a WebView with a broken/blocked WebAudio implementation must
 * still let the player walk into the dungeon. The scene simply stays silent.
 */
export function loadAudio(): Promise<boolean> {
  if (loading) return loading;
  loading = (async () => {
    try {
      const { createHowlBackend } = await import('./HowlBackend');
      const backend: AudioBackend = await createHowlBackend();
      audio.attach(backend);
      audio.preload(assetUrl(''));
      return true;
    } catch (error) {
      console.warn('[audio] unavailable, continuing silently', error);
      return false;
    }
  })();
  return loading;
}

/** Test-only reset for the lazy singleton (also used by the E2E bridge). */
export function resetAudioLoader(): void {
  loading = null;
}
