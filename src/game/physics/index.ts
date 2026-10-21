/** Rapier3D physics layer: world wrapper, character capsule, fixed-step helpers. */
export { PhysicsWorld, type RapierModule, type RaycastHit, type DebugLines, type FixedStepCallback } from './PhysicsWorld';
export { CharacterBody, type CharacterBodyOptions, type CharacterMoveResult } from './CharacterBody';
export { FixedStepAccumulator, type FixedStepOptions } from './FixedStep';
export {
  PLAYER_CAPSULE,
  MONSTER_CAPSULE,
  capsuleHeight,
  capsuleCentreOffset,
  feetToBodyCenter,
  bodyCenterToFeet,
  type CapsuleDimensions,
} from './capsule';
