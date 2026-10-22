import type { Group } from 'three';
import { CharacterModel } from './CharacterModel';
import { createPlaceholderHero, placeHero } from './PlaceholderHero';
import type { PlaceholderHero } from './PlaceholderHero';
import type { LoadedCharacter } from '@/game/assets/AssetLoader';
import { PLAYER_TUNING } from './PlayerController';

/**
 * Minimal contract the scene needs from whatever represents the player.
 *
 * Two implementations exist on purpose: the generated GLB with animation clips
 * (normal path) and the primitive placeholder (fallback when the asset pipeline
 * has not run yet, and in headless tests). The scene never branches on which one
 * is active.
 */
export interface HeroView {
  readonly group: Group;
  /** Eye height used by the follow camera, metres. */
  readonly eyeHeight: number;
  /** `gltf` or `placeholder`, surfaced in the debug snapshot. */
  readonly kind: 'gltf' | 'placeholder';
  /** Logical animation state for the dev overlay / E2E. */
  readonly state: string;
  update(dt: number, elapsed: number, speed: number, busy: boolean): void;
  attack(): void;
  dodge(): void;
  /** Plays the death clip/pose; the character stops responding afterwards. */
  die(): void;
  /** Returns to life for a new run (clears the death pose). */
  revive(): void;
  dispose(): void;
}

/** GLB hero with the animation state machine. */
class AnimatedHero implements HeroView {
  readonly group: Group;
  readonly eyeHeight: number;
  readonly kind = 'gltf' as const;
  private readonly model: CharacterModel;

  constructor(source: LoadedCharacter) {
    this.model = new CharacterModel(source, {
      attackSeconds: PLAYER_TUNING.attackDuration,
      dashSeconds: PLAYER_TUNING.dashDuration,
      eyeHeight: 1.25,
      runThreshold: PLAYER_TUNING.walkSpeed * 0.85,
      moveThreshold: 0.05,
    });
    this.group = this.model.group;
    this.eyeHeight = this.model.eyeHeight;
  }

  get state(): string {
    return this.model.state;
  }

  update(dt: number, _elapsed: number, speed: number): void {
    this.model.update(dt, speed);
  }

  attack(): void {
    this.model.playAttack();
  }

  dodge(): void {
    this.model.playDodge();
  }

  die(): void {
    this.model.playDeath();
  }

  revive(): void {
    this.model.revive();
  }

  dispose(): void {
    this.model.dispose();
  }
}

/** Capsule-and-blade stand-in: works with zero assets on disk. */
class PlaceholderHeroView implements HeroView {
  readonly group: Group;
  readonly eyeHeight: number;
  readonly kind = 'placeholder' as const;
  private readonly hero: PlaceholderHero;
  private attackTime = 0;
  private tiltTime = 0;

  constructor() {
    this.hero = createPlaceholderHero();
    this.group = this.hero.group;
    this.eyeHeight = this.hero.eyeHeight;
  }

  get state(): string {
    if (this.dead) return 'death';
    if (this.attackTime > 0) return 'attack';
    return this.moving ? 'walk' : 'idle';
  }

  private moving = false;
  private dead = false;

  update(dt: number, elapsed: number, speed: number, busy = false): void {
    this.moving = !this.dead && speed > 0.05;
    this.attackTime = Math.max(0, this.attackTime - dt);
    const progress = this.attackTime > 0 ? 1 - this.attackTime / PLAYER_TUNING.attackDuration : 0;
    this.hero.update(dt, elapsed, this.moving, busy ? 0 : progress);
    // Placeholder dodge: a short forward tilt instead of a roll animation.
    this.tiltTime = Math.max(0, this.tiltTime - dt);
    this.group.rotation.x = this.tiltTime > 0 ? 0.35 * (this.tiltTime / 0.16) : 0;
  }

  attack(): void {
    this.attackTime = PLAYER_TUNING.attackDuration;
  }

  dodge(): void {
    this.tiltTime = 0.16;
  }

  die(): void {
    // No death clip on the capsule: fall backwards and stop moving.
    this.dead = true;
    this.group.rotation.x = -1.2;
  }

  revive(): void {
    this.dead = false;
    this.attackTime = 0;
    this.tiltTime = 0;
    this.group.rotation.x = 0;
  }

  dispose(): void {
    this.hero.dispose();
  }
}

/**
 * Builds the hero representation: the generated model when it loaded, otherwise
 * the placeholder. Never throws, so a failed asset download degrades to a
 * playable game instead of a black screen.
 */
export function createHeroView(source: LoadedCharacter | null): HeroView {
  return source ? new AnimatedHero(source) : new PlaceholderHeroView();
}

/** Applies feet position and yaw to any hero view. */
export function placeHeroView(view: HeroView, feet: { x: number; y: number; z: number }, yaw: number): void {
  placeHero(view.group, feet, yaw);
}
