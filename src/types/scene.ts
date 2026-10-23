import type { StatBonuses } from '@/game/player/PlayerStats';
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
  /** Current dungeon floor (1-based) when the scene has floors. */
  readonly floor?: number;
  /** Room count of the loaded floor. */
  readonly rooms?: number;
  /** Doorway count of the loaded floor. */
  readonly doors?: number;
  /** Point lights currently enabled (must stay ≤ 4 on medium/high). */
  readonly activeLights?: number;
  /** Room id the player is standing in, or null in a corridor. */
  readonly roomId?: number | null;
  /** Which hero representation is active: the generated GLB or the placeholder. */
  readonly heroAsset?: 'gltf' | 'placeholder';
  /** Animation state of the hero (idle/walk/run/attack/dodge/hit/death). */
  readonly heroState?: string;
  /** Player health, rounded for the HUD. */
  readonly hp?: number;
  readonly maxHp?: number;
  /** Player stamina, rounded for the HUD. */
  readonly stamina?: number;
  /** Stamina ceiling (meta endurance upgrades raise it). */
  readonly maxStamina?: number;
  /** Enemies killed this run. */
  readonly kills?: number;
  /** Gold carried this run. */
  readonly gold?: number;
  /** Items in the bag (equipped items are counted separately). */
  readonly items?: number;
  /** Definition id of the equipped weapon, or null. */
  readonly weapon?: string | null;
  /** Satiety (0…100) and its tier, for the HUD hunger bar. */
  readonly satiety?: number;
  readonly hunger?: 'fed' | 'hungry' | 'starving';
  /** Food rations left in the run. */
  readonly rations?: number;
  /** Campfire rests used on this floor. */
  readonly restCount?: number;
  /** True once the run has ended; the death screen reads the summary. */
  readonly dead?: boolean;
  /** Run time in whole seconds (death summary, difficulty gates). */
  readonly runSeconds?: number;
  /** Chests generated on the current floor. */
  readonly chests?: number;
  /** Chests opened on the current floor. */
  readonly chestsOpened?: number;
  /** Experience earned from kills this run. */
  readonly xp?: number;
  /** Character level inside the run (1-based, resets every run). */
  readonly level?: number;
  /** XP banked inside the current level. */
  readonly xpInLevel?: number;
  /** XP needed to reach the next level (0 at the cap). */
  readonly xpToNext?: number;
  /** Player deaths this run (respawns at the entrance until stage 8). */
  readonly deaths?: number;
  /** Living enemies currently instantiated around the player. */
  readonly enemies?: number;
}

/** Shape of the end-of-run summary the HUD renders (see `DungeonScene`). */
export interface RunSummaryLike {
  readonly floor: number;
  readonly kills: number;
  readonly gold: number;
  readonly xp: number;
  readonly level: number;
  readonly items: number;
  readonly seconds: number;
  readonly cause: 'combat' | 'starvation' | 'victory';
  readonly chestsOpened: number;
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
  /** Starts a fresh run on the same scene instance. */
  restartRun?(seed?: number): void;
  /** Consumes one food ration. */
  eatRation?(): void;
  /** End-of-run summary, or null while alive. */
  getSummary?(): RunSummaryLike | null;
  /** Dev-only: apply direct damage (survival/death QA). */
  debugHurt?(amount: number): void;
  /** Dev-only: bank experience, bypassing combat (`?xp=N` level-up QA). */
  debugGrantXp?(amount: number): void;
  /** Dev-only: arena position of the floor's boss (null without one). */
  debugBossPosition?(): { x: number; z: number } | null;
  /** Moves the player instantly (QA hooks, floor saves). */
  teleportTo?(position: { x: number; z: number }): void;
  /** Dev-only: spawn a training dummy in front of the player. */
  debugSpawnDummy?(distance?: number): void;
  /** Dev-only collider wireframes. */
  setPhysicsDebug?(enabled: boolean): void;
  /** Locomotion command, already resolved to world space by the engine. */
  setMoveInput(command: MoveCommand): void;
  /** Player action from the touch HUD (attack, dodge, interact, skills). */
  triggerAction(action: InputAction): void;
  /** Applies meta upgrades bought between runs to the live scene. */
  setMetaBonuses?(bonuses: StatBonuses, startingRations?: number): void;
  /** Boss health for the top bar, or null when no boss is engaged. */
  getBossState?(): { name: string; ratio: number; phase: number } | null;
  /** What the interact button should offer right now, or null when nothing is near. */
  getInteractionHint(): InteractionHint | null;
  /** Camera shake requested by combat this frame (0…1), consumed by the rig. */
  readonly shakeAmount?: number;
  /** Clears the accumulated shake once the camera rig has applied it. */
  consumeShake?(): void;
  /** Impact freeze requested by combat; the engine owns the slowed clock. */
  consumeHitStop?(): { readonly durationSec: number; readonly scale: number } | null;
  /** Plain inventory snapshot for the HUD panel. */
  getInventorySnapshot?(): unknown;
  /** Equips a bag item (uid from the inventory snapshot). */
  equipItem?(uid: number): boolean;
  /** Unequips a slot and returns the item to the bag. */
  unequipItem?(slot: 'weapon' | 'armor' | 'charm'): boolean;
  /** Read-only diagnostics for the dev bridge. */
  getDebugSnapshot(): DebugSceneSnapshot;
  /** Re-apply tier-dependent knobs (shadow size, light count, particle budget). */
  applyQuality(preset: QualityPreset): void;
  dispose(): void;
}
