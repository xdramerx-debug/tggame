import { AnimationMixer, LoopOnce, LoopRepeat } from 'three';
import type { AnimationAction, AnimationClip, Group, Object3D } from 'three';
import type { LoadedCharacter } from '@/game/assets/AssetLoader';

export type LocomotionState = 'idle' | 'walk' | 'run';
export type OneShotState = 'attack' | 'dodge' | 'hit';
export type CharacterState = LocomotionState | OneShotState | 'death';

export interface CharacterModelOptions {
  /** Fade time between clips, seconds. Short enough to feel responsive on touch. */
  readonly fadeSeconds?: number;
  /** Speed above which the run cycle is used instead of the walk cycle, m/s. */
  readonly runThreshold?: number;
  /** Speed above which the character is considered moving, m/s. */
  readonly moveThreshold?: number;
  /** Gameplay length of one attack (used to time-scale the clip), seconds. */
  readonly attackSeconds?: number;
  /** Gameplay length of the dash (dodge clip is compressed to fit), seconds. */
  readonly dashSeconds?: number;
  /** Camera/interaction focus height above the feet, metres. */
  readonly eyeHeight?: number;
  /** Per-state clip overrides for models that name their clips differently. */
  readonly clipNames?: Partial<Record<CharacterState, string>>;
}

const DEFAULT_CLIPS: Record<CharacterState, string> = {
  idle: 'idle',
  walk: 'walk',
  run: 'run',
  attack: 'attack',
  dodge: 'dodge',
  hit: 'hit',
  death: 'death',
};

/**
 * Animation state machine for a skinned character.
 *
 * Owns one `AnimationMixer` and translates gameplay state (speed, attack, dash,
 * damage) into blended clips:
 * - locomotion crossfades between idle/walk/run with a short fade;
 * - one-shot actions (attack, dodge, hit) take over, are time-scaled to the
 *   gameplay window and hand control back when the clip finishes;
 * - death holds its last frame and blocks every other transition.
 *
 * The class never touches physics or input: the scene feeds it numbers, so the
 * same component drives the player, monsters and (stage 9) any boss.
 */
export class CharacterModel {
  readonly group: Group;
  readonly eyeHeight: number;

  private readonly mixer: AnimationMixer;
  private readonly actions = new Map<string, AnimationAction>();
  private readonly clips = new Map<string, AnimationClip>();
  private readonly fadeSeconds: number;
  private readonly options: Required<Omit<CharacterModelOptions, 'clipNames'>> & {
    readonly clipNames: Record<CharacterState, string>;
  };

  private current: CharacterState = 'idle';
  private oneShot: OneShotState | null = null;
  private dead = false;
  private disposed = false;

  constructor(source: LoadedCharacter, options: CharacterModelOptions = {}) {
    this.options = {
      fadeSeconds: options.fadeSeconds ?? 0.16,
      runThreshold: options.runThreshold ?? 4.2,
      moveThreshold: options.moveThreshold ?? 0.08,
      attackSeconds: options.attackSeconds ?? 0.28,
      dashSeconds: options.dashSeconds ?? 0.18,
      eyeHeight: options.eyeHeight ?? 1.15,
      clipNames: { ...DEFAULT_CLIPS, ...options.clipNames },
    };
    this.fadeSeconds = this.options.fadeSeconds;
    this.eyeHeight = this.options.eyeHeight;

    this.group = source.scene;
    this.mixer = new AnimationMixer(this.group);
    this.mixer.addEventListener('finished', this.handleFinished);

    for (const clip of source.animations) {
      this.clips.set(clip.name, clip);
      const action = this.mixer.clipAction(clip);
      action.enabled = true;
      this.actions.set(clip.name, action);
    }

    this.playState('idle', true);
  }

  /** Current logical state (for the dev overlay and E2E assertions). */
  get state(): CharacterState {
    return this.oneShot ?? this.current;
  }

  get isDead(): boolean {
    return this.dead;
  }

  /** Clip names actually present in the loaded asset. */
  get availableClips(): string[] {
    return [...this.actions.keys()];
  }

  /**
   * Advances the animation and applies locomotion.
   * @param speed horizontal speed in m/s (dash included)
   */
  update(dt: number, speed: number): void {
    if (this.disposed) return;
    this.mixer.update(dt);
    if (this.dead) return;

    const next: LocomotionState =
      speed < this.options.moveThreshold ? 'idle' : speed >= this.options.runThreshold ? 'run' : 'walk';
    if (next !== this.current) {
      this.current = next;
      if (!this.oneShot) this.playState(next, false);
    }
  }

  /** Attack swing; ignored while dead or while another one-shot owns the body. */
  playAttack(): boolean {
    return this.playOneShot('attack', this.attackTimeScale());
  }

  playDodge(): boolean {
    return this.playOneShot('dodge', this.dodgeTimeScale());
  }

  playHit(): boolean {
    return this.playOneShot('hit', 1);
  }

  /** Plays the death clip and freezes the model on its last frame. */
  playDeath(): void {
    if (this.dead) return;
    this.dead = true;
    this.oneShot = null;
    const action = this.actionFor('death');
    if (!action) {
      this.current = 'death';
      return;
    }
    action.reset();
    action.setLoop(LoopOnce, 1);
    action.clampWhenFinished = true;
    action.timeScale = 1;
    this.fadeTo(action, 0.12);
    this.current = 'death';
  }

  /**
   * Clears the death state and returns to idle (new run after a death).
   *
   * The mixer is reset rather than crossfaded: the death clip is clamped on its
   * last frame, and blending out of a corpse reads as a resurrection bug.
   */
  revive(): void {
    if (!this.dead) return;
    this.dead = false;
    this.oneShot = null;
    this.mixer.stopAllAction();
    this.current = 'idle';
    this.playState('idle', true);
  }

  /** Distance from feet to the model's eye level (camera focus height). */
  get eye(): number {
    return this.eyeHeight;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mixer.removeEventListener('finished', this.handleFinished);
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.group);
    this.group.removeFromParent();
  }

  // --------------------------------------------------------------- internals

  private readonly handleFinished = (event: { action: AnimationAction }): void => {
    if (this.dead) return;
    const finished = event.action;
    if (this.oneShot) {
      const active = this.actionFor(this.oneShot);
      if (active === finished) {
        this.oneShot = null;
        this.playState(this.current, false);
      }
    }
  };

  private playOneShot(state: OneShotState, timeScale: number): boolean {
    if (this.dead) return false;
    if (this.oneShot === state) return false;
    const action = this.actionFor(state);
    if (!action) return false;

    // A lower-priority hit must not interrupt an attack wind-up: combat (stage 6)
    // relies on the swing not being cancelled by chip damage.
    if (this.oneShot === 'attack' && state === 'hit') return false;

    action.reset();
    action.setLoop(LoopOnce, 1);
    action.clampWhenFinished = true;
    action.timeScale = timeScale;
    this.fadeTo(action, this.fadeSeconds * 0.75);
    this.oneShot = state;
    return true;
  }

  private playState(state: CharacterState, immediate: boolean): void {
    const action = this.actionFor(state);
    if (!action) return;
    action.setLoop(LoopRepeat, Infinity);
    action.clampWhenFinished = false;
    action.timeScale = 1;
    if (!action.isRunning()) action.reset();
    this.fadeTo(action, immediate ? 0 : this.fadeSeconds);
  }

  private fadeTo(action: AnimationAction, fadeSeconds: number): void {
    for (const [name, other] of this.actions) {
      if (other === action) continue;
      if (other.isRunning() && other.getEffectiveWeight() > 0.001) {
        other.fadeOut(fadeSeconds);
        // `fadeOut` leaves the action running at zero weight; stop it once faded
        // so the mixer does not keep sampling dead actions.
        if (fadeSeconds <= 0) other.stop();
        void name;
      }
    }
    action.setEffectiveWeight(1);
    if (fadeSeconds > 0) action.fadeIn(fadeSeconds);
    action.play();
  }

  private actionFor(state: CharacterState): AnimationAction | undefined {
    const clip = this.options.clipNames[state];
    return this.actions.get(clip);
  }

  /**
   * Attack clip is 0.55 s but the swing window is 0.28 s: half-speed playback
   * would show a swing that ends long after the hit, full speed feels weightless.
   * ~1.6× the window keeps the blade readable and the recovery honest.
   */
  private attackTimeScale(): number {
    const clip = this.clips.get(this.options.clipNames.attack);
    if (!clip) return 1;
    return clamp(clip.duration / (this.options.attackSeconds * 1.6), 0.8, 2.2);
  }

  /** The dodge roll has to finish inside the dash plus a little recovery. */
  private dodgeTimeScale(): number {
    const clip = this.clips.get(this.options.clipNames.dodge);
    if (!clip) return 1;
    return clamp(clip.duration / (this.options.dashSeconds * 1.6), 0.8, 2.6);
  }
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Convenience: places an animated character on the ground at a yaw. */
export function placeCharacter(root: Object3D, feet: { x: number; y: number; z: number }, yaw: number): void {
  root.position.set(feet.x, feet.y, feet.z);
  root.rotation.y = yaw;
}
