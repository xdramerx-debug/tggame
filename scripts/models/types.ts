import type { AnimationClip, Group } from 'three';

/** Result of a character generator: one exportable group plus its clips. */
export interface CharacterAsset {
  readonly group: Group;
  readonly clips: AnimationClip[];
  /** Bone names in hierarchy order (asserted by the asset tests). */
  readonly bones: readonly string[];
  readonly metrics: { readonly triangles: number };
}

/** Result of a static prop generator (chests, altars, braziers). */
export interface PropAsset {
  readonly group: Group;
  readonly metrics: { readonly triangles: number };
}
