/**
 * Runtime sound catalogue — the mirror of `scripts/audio/sfx.ts`.
 *
 * Ids are stable strings because they cross the scene → engine → audio boundary
 * as plain events. `SOUND_SPECS` carries the mix decisions (how loud each cue is
 * relative to its group, how fast it may retrigger), while the asset pipeline
 * carries the waveform. A unit test keeps both tables in sync.
 */
export type SoundId =
  | 'ui'
  | 'swing'
  | 'hit'
  | 'crit'
  | 'hurt'
  | 'enemy-death'
  | 'chest'
  | 'door'
  | 'campfire'
  | 'ration'
  | 'step'
  | 'hunger'
  | 'descend'
  | 'boss-roar'
  | 'boss-phase'
  | 'victory'
  | 'death'
  | 'ambience';

export type SoundGroup = 'ui' | 'sfx' | 'ambience';

export interface SoundSpec {
  /** Path relative to `public/assets`. */
  readonly file: string;
  readonly group: SoundGroup;
  /** Multiplier applied on top of the group volume. */
  readonly gain: number;
  /** Minimum gap between two plays of this id, ms (anti machine-gun). */
  readonly retriggerMs: number;
  /** Random ± variation of playback rate, 0…1 (footsteps, hits). */
  readonly rateJitter?: number;
  readonly loop?: boolean;
}

export const SOUND_SPECS: Readonly<Record<SoundId, SoundSpec>> = {
  ui: { file: 'audio/ui.wav', group: 'ui', gain: 0.5, retriggerMs: 60 },
  swing: { file: 'audio/swing.wav', group: 'sfx', gain: 0.7, retriggerMs: 90, rateJitter: 0.06 },
  hit: { file: 'audio/hit.wav', group: 'sfx', gain: 0.85, retriggerMs: 55, rateJitter: 0.08 },
  crit: { file: 'audio/crit.wav', group: 'sfx', gain: 0.9, retriggerMs: 80 },
  hurt: { file: 'audio/hurt.wav', group: 'sfx', gain: 0.9, retriggerMs: 220 },
  'enemy-death': { file: 'audio/enemy-death.wav', group: 'sfx', gain: 0.8, retriggerMs: 120 },
  chest: { file: 'audio/chest.wav', group: 'sfx', gain: 0.85, retriggerMs: 200 },
  door: { file: 'audio/door.wav', group: 'sfx', gain: 0.55, retriggerMs: 400, rateJitter: 0.05 },
  campfire: { file: 'audio/campfire.wav', group: 'sfx', gain: 0.8, retriggerMs: 300 },
  ration: { file: 'audio/ration.wav', group: 'sfx', gain: 0.8, retriggerMs: 250 },
  step: { file: 'audio/step.wav', group: 'sfx', gain: 0.35, retriggerMs: 120, rateJitter: 0.12 },
  hunger: { file: 'audio/hunger.wav', group: 'sfx', gain: 0.7, retriggerMs: 1500 },
  descend: { file: 'audio/descend.wav', group: 'sfx', gain: 0.8, retriggerMs: 1000 },
  'boss-roar': { file: 'audio/boss-roar.wav', group: 'sfx', gain: 0.9, retriggerMs: 3000 },
  'boss-phase': { file: 'audio/boss-phase.wav', group: 'sfx', gain: 0.9, retriggerMs: 2000 },
  victory: { file: 'audio/victory.wav', group: 'sfx', gain: 1, retriggerMs: 5000 },
  death: { file: 'audio/death.wav', group: 'sfx', gain: 1, retriggerMs: 5000 },
  ambience: { file: 'audio/ambience.wav', group: 'ambience', gain: 0.6, retriggerMs: 0, loop: true },
};

export const SOUND_IDS = Object.keys(SOUND_SPECS) as SoundId[];

/** Steps between two footstep sounds, in metres walked. */
export const STEP_DISTANCE = 1.9;
