import {
  BoxGeometry,
  CapsuleGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
} from 'three';
import { PLAYER_CAPSULE } from '@/game/physics';
import type { Object3D } from 'three';

export interface PlaceholderHero {
  readonly group: Group;
  /** Chest height, used to place the follow target. */
  readonly eyeHeight: number;
  update(dt: number, elapsed: number, moving: boolean, attackProgress: number): void;
  dispose(): void;
}

/**
 * Capsule-and-blade stand-in for the rigged player model (stage 5).
 *
 * Kept in one factory so no scene hardcodes geometry: swapping in a GLTF plus
 * AnimationMixer later only replaces this function's body.
 */
export function createPlaceholderHero(): PlaceholderHero {
  const group = new Group();
  group.name = 'hero';

  const bodyMaterial = new MeshStandardMaterial({ color: 0x4a7c8c, roughness: 0.55, metalness: 0.25 });
  const bodyGeometry = new CapsuleGeometry(PLAYER_CAPSULE.radius, PLAYER_CAPSULE.halfHeight * 2, 4, 10);
  const headGeometry = new SphereGeometry(0.24, 12, 8);
  const bladeMaterial = new MeshStandardMaterial({
    color: 0xd6d6d6,
    metalness: 0.9,
    roughness: 0.25,
    emissive: 0x1b2a3a,
  });
  const bladeGeometry = new BoxGeometry(0.07, 1.1, 0.16);

  const body = new Mesh(bodyGeometry, bodyMaterial);
  const bodyRestY = PLAYER_CAPSULE.halfHeight + PLAYER_CAPSULE.radius;
  body.position.y = bodyRestY;
  body.castShadow = true;

  const head = new Mesh(headGeometry, bodyMaterial);
  head.position.y = 1.62;
  head.castShadow = true;

  const blade = new Mesh(bladeGeometry, bladeMaterial);
  blade.position.set(0.42, 1.05, 0);
  blade.rotation.z = 0.28;
  blade.castShadow = true;

  group.add(body, head, blade);

  return {
    group,
    eyeHeight: 1.35,
    update(dt: number, elapsed: number, moving: boolean, attackProgress: number): void {
      const bob = Math.sin(elapsed * (moving ? 9 : 2.2)) * (moving ? 0.04 : 0.012);
      body.position.y = bodyRestY + bob;

      if (attackProgress > 0) {
        blade.rotation.z = 0.28 - Math.sin(attackProgress * Math.PI) * 1.9;
      } else {
        blade.rotation.z += (0.28 - blade.rotation.z) * Math.min(1, dt * 12);
      }
    },
    dispose(): void {
      bodyGeometry.dispose();
      headGeometry.dispose();
      bladeGeometry.dispose();
      bodyMaterial.dispose();
      bladeMaterial.dispose();
    },
  };
}

/** Applies a feet position and yaw to the hero root. */
export function placeHero(root: Object3D, feet: { x: number; y: number; z: number }, facing: number): void {
  root.position.set(feet.x, feet.y, feet.z);
  root.rotation.y = facing;
}
