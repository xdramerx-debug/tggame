import { SOUND_IDS, SOUND_SPECS } from './soundSet';
import type { SoundGroup, SoundId } from './soundSet';

/**
 * What the audio manager needs from a sound engine.
 *
 * An interface, not a Howl: the whole mixing/throttling policy is then testable
 * in Node with a fake backend, and a future WebAudio/Telegram-native backend can
 * replace Howler without touching gameplay code.
 */
export interface AudioBackend {
  /** Queues one file; `loaded` counts completed loads for the splash/debug UI. */
  load(id: SoundId, src: string, loop: boolean): void;
  /** Plays one voice; returns a handle or null when the file is not ready. */
  play(id: SoundId, options: { volume: number; rate: number }): number | null;
  stop(id: SoundId): void;
  setMasterVolume(volume: number): void;
  setMuted(muted: boolean): void;
  /** Resumes the underlying context after a user gesture (iOS). */
  unlock(): void;
  readonly loadedCount: number;
  dispose(): void;
}

export interface VolumeState {
  /** 0…1, applies to everything. */
  readonly master: number;
  readonly sfx: number;
  readonly music: number;
}

export const DEFAULT_VOLUMES: VolumeState = { master: 0.8, sfx: 0.9, music: 0.6 };

export interface AudioDebugSnapshot {
  readonly enabled: boolean;
  readonly ready: boolean;
  readonly loaded: number;
  readonly total: number;
  readonly ambience: boolean;
  readonly plays: number;
  readonly lastId: SoundId | null;
  readonly volumes: VolumeState;
}

/**
 * Mixing, throttling and lifecycle for all game audio.
 *
 * Deliberately ignorant of Howler and of the DOM: it owns *policy* (who hears
 * what, how often), the backend owns *plumbing*. Every gameplay cue goes through
 * `playSound`, which keeps a global voice budget: a busy fight can request a hit
 * sound six times in one frame, and stacking six copies is how mobile audio
 * starts clipping.
 */
export class AudioManager {
  private backend: AudioBackend | null = null;
  private volumesValue: VolumeState = DEFAULT_VOLUMES;
  private enabledValue = true;
  private ambiencePlaying = false;
  private readonly lastPlayedAt = new Map<SoundId, number>();
  private playsValue = 0;
  private lastIdValue: SoundId | null = null;

  constructor(
    private readonly now: () => number = () => Date.now(),
    private readonly random: () => number = Math.random,
  ) {}

  get volumes(): VolumeState {
    return this.volumesValue;
  }

  get enabled(): boolean {
    return this.enabledValue;
  }

  get ready(): boolean {
    return this.backend !== null;
  }

  get ambience(): boolean {
    return this.ambiencePlaying;
  }

  /** Attaches the real backend (called once, when the engine boots). */
  attach(backend: AudioBackend): void {
    this.backend = backend;
    // A backend that arrives late inherits the current mix and mute state.
    backend.setMasterVolume(this.enabledValue ? this.volumesValue.master : 0);
    backend.setMuted(!this.enabledValue);
  }

  /** Queues every known file. Safe to call before `attach` (no-op then). */
  preload(baseUrl: string): void {
    const backend = this.backend;
    if (!backend) return;
    for (const id of SOUND_IDS) {
      const spec = SOUND_SPECS[id];
      backend.load(id, `${baseUrl}${spec.file}`, spec.loop === true);
    }
  }

  setVolumes(volumes: Partial<VolumeState>): void {
    this.volumesValue = { ...this.volumesValue, ...volumes };
    this.applyMaster();
    if (this.ambiencePlaying) this.playSound('ambience', { force: true });
  }

  /** Global mute. Also silences the ambience loop, which Howler keeps running. */
  setEnabled(enabled: boolean): void {
    this.enabledValue = enabled;
    this.applyMaster();
    this.backend?.setMuted(!enabled);
    if (!enabled) this.backend?.stop('ambience');
    else if (this.ambiencePlaying) this.playSound('ambience', { force: true });
  }

  /** iOS suspends the context until a gesture; call from the first touch. */
  unlock(): void {
    this.backend?.unlock();
  }

  /**
   * Plays one cue.
   * @returns true when a voice was actually started
   */
  playSound(id: SoundId, options: { rate?: number; force?: boolean } = {}): boolean {
    const backend = this.backend;
    if (!backend || !this.enabledValue || this.volumesValue.master <= 0) return false;
    const spec = SOUND_SPECS[id];
    const now = this.now();
    const previous = this.lastPlayedAt.get(id) ?? Number.NEGATIVE_INFINITY;
    if (!options.force && now - previous < spec.retriggerMs) return false;

    const volume = this.groupVolume(spec.group) * spec.gain;
    if (volume <= 0.001) return false;
    const jitter = spec.rateJitter ?? 0;
    const rate = options.rate ?? 1 + (jitter === 0 ? 0 : (this.random() * 2 - 1) * jitter);

    const handle = backend.play(id, { volume: Math.min(1, volume), rate });
    if (handle === null) return false;
    this.lastPlayedAt.set(id, now);
    this.playsValue += 1;
    this.lastIdValue = id;
    return true;
  }

  startAmbience(): void {
    this.ambiencePlaying = true;
    if (this.enabledValue) this.playSound('ambience', { force: true });
  }

  stopAmbience(): void {
    this.ambiencePlaying = false;
    this.backend?.stop('ambience');
  }

  /** Called when the app is backgrounded: silence everything without forgetting state. */
  suspend(): void {
    this.backend?.setMuted(true);
  }

  resume(): void {
    if (!this.backend) return;
    this.backend.setMuted(!this.enabledValue);
    this.applyMaster();
    if (this.ambiencePlaying && this.enabledValue) this.playSound('ambience', { force: true });
  }

  snapshot(): AudioDebugSnapshot {
    return {
      enabled: this.enabledValue,
      ready: this.ready,
      loaded: this.backend?.loadedCount ?? 0,
      total: SOUND_IDS.length,
      ambience: this.ambiencePlaying,
      plays: this.playsValue,
      lastId: this.lastIdValue,
      volumes: this.volumesValue,
    };
  }

  dispose(): void {
    this.stopAmbience();
    this.backend?.dispose();
    this.backend = null;
    this.lastPlayedAt.clear();
  }

  private groupVolume(group: SoundGroup): number {
    switch (group) {
      case 'ui':
        return this.volumesValue.sfx;
      case 'ambience':
        return this.volumesValue.music;
      default:
        return this.volumesValue.sfx;
    }
  }

  private applyMaster(): void {
    this.backend?.setMasterVolume(this.enabledValue ? this.volumesValue.master : 0);
  }
}

/** Shared instance: gameplay calls it from the scene callbacks, UI from buttons. */
export const audio = new AudioManager();
