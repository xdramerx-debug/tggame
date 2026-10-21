import type { Object3D, Scene, Vector3 } from 'three';
import type { QualityPreset } from './engine';

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
  /** Re-apply tier-dependent knobs (shadow size, light count, particle budget). */
  applyQuality(preset: QualityPreset): void;
  dispose(): void;
}
