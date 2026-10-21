import type { Object3D, Scene, Vector3 } from 'three';
import type { Collider } from '@dimforge/rapier3d-compat';
import type { QualityPreset } from './engine';
import type { InputAction, InteractionHint } from '@/input/types';

/** Scene-specific numbers used by input tests and manual QA. */
export interface DebugSceneSnapshot {
  /** Hero position in world metres. */
  readonly hero: { readonly x: number; readonly y: number; readonly z: number };
  /** How many attacks the scene has processed (incl. tap-to-attack). */
  readonly attacks: number;
  /** True while the hero is inside a dash. */
  readonly dodging: boolean;
  /** Resources collected via the interact action. */
  readonly collected: number;
  /** Whether an interaction is offered right now. */
  readonly canInteract: boolean;
  /** Ground contact reported by the character controller. */
  readonly grounded: boolean;
}

/** Camera-relative stick input converted into world space by the engine. */
export interface MoveCommand {
  /** World X direction, unit length (0 when idle). */
  readonly x: number;
  /** World Z direction, unit length (0 when idle). */
  readonly z: number;
  /** 0…1 analog magnitude. */
  readonly magnitude: number;
}

/**
 * Contract between the engine shell and a playable/visual scene.
 * Dungeon, hub and test scenes all implement this so the engine stays agnostic.
 */
export interface GameScene {
  readonly root: Scene;
  /** Meshes the orbit camera must not clip through. */
  readonly collisionObjects: Object3D[];
  /** Point the follow camera tracks each frame. */
  readonly followTarget: Vector3;
  update(dtSeconds: number, elapsedSeconds: number): void;
  /** Simulation at a fixed rate (physics + locomotion); called 60×/s. */
  fixedUpdate?(stepSeconds: number): void;
  /** Collider excluded from the camera boom raycast (the player capsule). */
  getPlayerCollider?(): Collider | null;
  /** Locomotion command, already resolved to world space by the engine. */
  setMoveInput(command: MoveCommand): void;
  /** Player action from the touch HUD (attack, dodge, interact, skills). */
  triggerAction(action: InputAction): void;
  /** What the interact button should offer right now, or null when nothing is near. */
  getInteractionHint(): InteractionHint | null;
  /** Read-only diagnostics for the dev bridge. */
  getDebugSnapshot(): DebugSceneSnapshot;
  /** Re-apply tier-dependent knobs (shadow size, light count, particle budget). */
  applyQuality(preset: QualityPreset): void;
  dispose(): void;
}
