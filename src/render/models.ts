import * as THREE from 'three';
import type { CharacterDef, FighterSnapshot, MoveData } from '@/fight/types';

/**
 * Procedural freak models.
 *
 * Every fighter is built from primitives at runtime — there is not a single
 * imported mesh, texture or rig in the repository. Silhouette is what matters
 * in a side-view fighter, so each freak gets one unmistakable shape:
 * GRIZLO is a wall of lard, SHVEYA is a stitched tower of limbs, OKO is a
 * floating eyeball and PECH is a walking furnace.
 */

export interface FreakRig {
  readonly group: THREE.Group;
  update(snapshot: FighterSnapshot, time: number, delta: number): void;
  dispose(): void;
}

interface Pose {
  lean: number;
  side: number;
  crouch: number;
  armFront: number;
  armBack: number;
  armFrontOpen: number;
  armBackOpen: number;
  legFront: number;
  legBack: number;
  head: number;
  glow: number;
}

const POSE_NEUTRAL: Pose = {
  lean: 0,
  side: 0,
  crouch: 0,
  armFront: -0.16,
  armBack: 0.16,
  armFrontOpen: 0.12,
  armBackOpen: 0.12,
  legFront: 0,
  legBack: 0,
  head: 0,
  glow: 1,
};

/** Frame-rate independent exponential smoothing. */
function damp(current: number, target: number, delta: number, speed = 16): number {
  return current + (target - current) * Math.min(1, delta * speed);
}

function mix(a: number, b: number, t: number): number {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}

/** Attack progress in 0…1 across windup, strike and recovery. */
function attackPhase(move: MoveData | undefined, ticks: number): { windup: number; strike: number } {
  if (!move) return { windup: 0, strike: 0 };
  const startupEnd = move.startup;
  const activeEnd = move.startup + move.active;
  if (ticks <= startupEnd) {
    return { windup: ticks / Math.max(1, startupEnd), strike: 0 };
  }
  if (ticks <= activeEnd) return { windup: 1, strike: 1 };
  return { windup: 1, strike: Math.max(0, 1 - (ticks - activeEnd) / Math.max(1, move.recovery)) };
}

interface Materials {
  skin: THREE.MeshStandardMaterial;
  cloth: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
  glow: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
}

function buildMaterials(def: CharacterDef): Materials {
  const skin = new THREE.MeshStandardMaterial({ color: def.palette.skin, roughness: 0.78, metalness: 0.08, emissive: 0x000000 });
  const cloth = new THREE.MeshStandardMaterial({ color: def.palette.cloth, roughness: 0.94, metalness: 0.02, emissive: 0x000000 });
  const accent = new THREE.MeshStandardMaterial({ color: def.palette.accent, roughness: 0.55, metalness: 0.35, emissive: 0x000000 });
  const glow = new THREE.MeshStandardMaterial({
    color: def.palette.glow,
    emissive: def.palette.glow,
    emissiveIntensity: 1.6,
    roughness: 0.35,
    metalness: 0.2,
  });
  const metal = new THREE.MeshStandardMaterial({ color: 0x53525a, roughness: 0.42, metalness: 0.82, emissive: 0x000000 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x15131a, roughness: 0.9, metalness: 0.1, emissive: 0x000000 });
  return { skin, cloth, accent, glow, metal, dark };
}

function capsule(radius: number, length: number, material: THREE.Material): THREE.Mesh {
  const geometry = new THREE.CapsuleGeometry(radius, Math.max(0.01, length), 4, 8);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  return mesh;
}

function sphere(radius: number, material: THREE.Material, widthSegments = 14): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, widthSegments, 10), material);
  mesh.castShadow = true;
  return mesh;
}

function box(width: number, height: number, depth: number, material: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.castShadow = true;
  return mesh;
}

interface RigParts {
  readonly inner: THREE.Group;
  readonly head: THREE.Group;
  readonly armFront: THREE.Group;
  readonly armBack: THREE.Group;
  readonly extraArms: THREE.Group[];
  readonly legFront: THREE.Group;
  readonly legBack: THREE.Group;
  readonly chest: THREE.Object3D | null;
  readonly materials: Materials;
  readonly height: number;
  readonly girth: number;
  readonly root: THREE.Group;
  readonly disposables: THREE.BufferGeometry[];
}

function buildBody(def: CharacterDef): RigParts {
  const materials = buildMaterials(def);
  const height = def.model.height;
  const girth = def.model.girth;
  const hipY = height * 0.47;
  const torsoHeight = height * 0.34;
  const shoulderY = hipY + torsoHeight * 0.55;
  const disposables: THREE.BufferGeometry[] = [];

  const inner = new THREE.Group();
  inner.position.y = 0;

  const torsoMaterial = def.model.kind === 'furnace' ? materials.metal : def.model.kind === 'brute' ? materials.skin : materials.skin;
  const torso = capsule(0.2 * girth, torsoHeight, torsoMaterial);
  torso.position.y = hipY + torsoHeight * 0.5;
  inner.add(torso);

  // Shoulders: a slab of cloth/muscle reads better than a perfect capsule.
  const shoulders = box(0.62 * girth, 0.16 * height, 0.34 * girth, def.model.kind === 'furnace' ? materials.metal : materials.cloth);
  shoulders.position.y = shoulderY;
  inner.add(shoulders);

  const head = new THREE.Group();
  head.position.y = shoulderY + height * 0.12;
  inner.add(head);

  let chest: THREE.Object3D | null = null;

  switch (def.model.kind) {
    case 'brute': {
      const belly = sphere(0.3 * girth, materials.skin, 16);
      belly.position.set(0, hipY + torsoHeight * 0.32, 0.1);
      belly.scale.set(1, 0.9, 1);
      inner.add(belly);

      const skull = sphere(0.15 * height, materials.skin, 12);
      skull.scale.set(1.15, 0.9, 1.05);
      head.add(skull);

      const snout = box(0.2, 0.13, 0.22, materials.skin);
      snout.position.set(0, -0.03, 0.16);
      head.add(snout);

      for (const side of [-1, 1]) {
        const tusk = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.13, 6), materials.accent);
        tusk.position.set(side * 0.09, -0.05, 0.24);
        tusk.rotation.x = -0.5;
        head.add(tusk);
        const eye = sphere(0.022, materials.glow, 8);
        eye.position.set(side * 0.06, 0.03, 0.14);
        head.add(eye);
      }

      const hump = sphere(0.22 * girth, materials.skin, 12);
      hump.position.set(0, shoulderY - 0.02, -0.14);
      hump.scale.set(1, 0.7, 0.9);
      inner.add(hump);
      break;
    }
    case 'stitched': {
      const sack = sphere(0.14 * height, materials.cloth, 12);
      sack.scale.set(0.95, 1.1, 0.95);
      head.add(sack);
      const eye = sphere(0.035, materials.glow, 10);
      eye.position.set(0.05, 0.02, 0.11);
      head.add(eye);
      for (let i = 0; i < 4; i += 1) {
        const stitch = box(0.14 * girth, 0.012, 0.012, materials.accent);
        stitch.position.set(0, hipY + torsoHeight * (0.15 + i * 0.2), 0.17 * girth);
        stitch.rotation.z = i % 2 === 0 ? 0.12 : -0.1;
        inner.add(stitch);
      }

      for (let i = 0; i < 7; i += 1) {
        const patch = box(0.05, 0.045, 0.02, i % 2 === 0 ? materials.accent : materials.cloth);
        const angle = (i / 7) * Math.PI * 2;
        patch.position.set(Math.cos(angle) * 0.42 * girth, hipY + torsoHeight * (0.2 + (i % 3) * 0.22), Math.sin(angle) * 0.16);
        patch.rotation.z = angle;
        inner.add(patch);
      }

      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.16 * girth, 0.025, 6, 12), materials.accent);
      collar.rotation.x = Math.PI / 2;
      collar.position.y = shoulderY;
      inner.add(collar);
      break;
    }
    case 'eye': {
      const stalk = capsule(0.05, height * 0.1, materials.skin);
      stalk.position.y = 0.02;
      head.add(stalk);
      const eyeball = sphere(0.17 * height, materials.skin, 20);
      eyeball.position.y = 0.19 * height;
      head.add(eyeball);
      const iris = sphere(0.075 * height, materials.glow, 16);
      iris.position.set(0, 0.19 * height, 0.13 * height);
      head.add(iris);
      const pupil = sphere(0.034 * height, materials.dark, 12);
      pupil.position.set(0, 0.19 * height, 0.18 * height);
      head.add(pupil);

      for (let i = 0; i < 5; i += 1) {
        const lid = box(0.03, 0.14 * height, 0.02, materials.accent);
        const angle = (i / 5) * Math.PI * 2;
        lid.position.set(Math.cos(angle) * 0.15 * height, 0.19 * height + Math.sin(angle) * 0.15 * height, 0.04);
        lid.rotation.z = angle;
        head.add(lid);
      }

      const ribcage = new THREE.Mesh(new THREE.TorusGeometry(0.22 * girth, 0.02, 5, 14), materials.glow);
      ribcage.position.y = hipY + torsoHeight * 0.45;
      ribcage.rotation.x = Math.PI / 2;
      ribcage.scale.set(1, 1, 0.5);
      inner.add(ribcage);
      break;
    }
    case 'furnace': {
      const frame = box(0.5 * girth, height * 0.34, 0.42 * girth, materials.metal);
      frame.position.y = hipY + torsoHeight * 0.5;
      inner.add(frame);

      const grate = box(0.26 * girth, height * 0.16, 0.02, materials.glow);
      grate.position.set(0, hipY + torsoHeight * 0.45, 0.21 * girth);
      inner.add(grate);
      chest = grate;

      for (const side of [-1, 1]) {
        const chimney = capsule(0.05, height * 0.16, materials.metal);
        chimney.position.set(side * 0.2 * girth, shoulderY + height * 0.1, -0.12);
        inner.add(chimney);
        const ember = sphere(0.03, materials.glow, 8);
        ember.position.set(side * 0.2 * girth, shoulderY + height * 0.19, -0.12);
        inner.add(ember);
      }

      const headBox = box(0.26, 0.22, 0.24, materials.metal);
      head.add(headBox);
      const visor = box(0.2, 0.04, 0.02, materials.glow);
      visor.position.set(0, 0.01, 0.13);
      head.add(visor);

      for (const side of [-1, 1]) {
        const bolt = sphere(0.03, materials.accent, 6);
        bolt.position.set(side * 0.07, 0.06, 0.13);
        head.add(bolt);
      }
      break;
    }
  }

  const armLength = height * 0.36;
  const armRadius = 0.055 * girth * (def.model.kind === 'brute' ? 1.5 : 1);

  const makeArm = (anchorX: number, anchorY: number, material: THREE.Material): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.position.set(anchorX, anchorY, 0);
    const limb = capsule(armRadius, armLength, material);
    limb.position.y = -armLength / 2;
    pivot.add(limb);
    const hand = sphere(armRadius * 1.35, def.model.kind === 'eye' ? material : materials.accent, 8);
    hand.position.y = -armLength;
    pivot.add(hand);
    return pivot;
  };

  const armFront = makeArm(0.15 * girth, shoulderY, torsoMaterial);
  const armBack = makeArm(-0.15 * girth, shoulderY - 0.02, torsoMaterial);
  inner.add(armBack);
  inner.add(armFront);

  const extraArms: THREE.Group[] = [];
  if (def.model.kind === 'stitched') {
    for (const side of [-1, 1]) {
      const extra = makeArm(side * 0.24 * girth, shoulderY - height * 0.12, materials.skin);
      extra.rotation.z = side * 0.5;
      inner.add(extra);
      extraArms.push(extra);
    }
  }
  if (def.model.kind === 'eye') {
    for (const side of [-1, 1]) {
      const tendril = makeArm(side * 0.24 * girth, shoulderY - height * 0.04, materials.skin);
      tendril.rotation.z = side * 0.9;
      inner.add(tendril);
      extraArms.push(tendril);
    }
  }

  const legLength = hipY * 0.95;
  const makeLeg = (anchorX: number): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.position.set(anchorX, hipY, 0);
    const limb = capsule(0.075 * girth * (def.model.kind === 'brute' ? 1.35 : 1), legLength, torsoMaterial);
    limb.position.y = -legLength / 2;
    pivot.add(limb);
    const foot = box(0.16 * girth, 0.08, 0.26, materials.dark);
    foot.position.set(0, -legLength, 0.05);
    pivot.add(foot);
    return pivot;
  };

  const legFront = makeLeg(0.11 * girth);
  const legBack = makeLeg(-0.11 * girth);
  inner.add(legFront);
  inner.add(legBack);

  for (const child of inner.children) {
    child.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      const mesh = node as THREE.Mesh;
      disposables.push(mesh.geometry);
    });
  }

  const group = new THREE.Group();
  group.add(inner);

  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.42 * girth, 18),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.42, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.012;
  group.add(shadow);
  disposables.push(shadow.geometry);

  return { inner, head, armFront, armBack, extraArms, legFront, legBack, chest, materials, height, girth, root: group, disposables };
}

function poseFor(snapshot: FighterSnapshot, def: CharacterDef, time: number, index: number): Pose {
  const pose: Pose = { ...POSE_NEUTRAL };
  const moveData = snapshot.move ? def.moves[snapshot.move] : undefined;
  const swing = Math.sin(time * 7 + index * 1.7);

  switch (snapshot.state) {
    case 'idle':
      pose.lean = -0.04;
      pose.armFront = -0.22 + Math.sin(time * 2.4 + index) * 0.05;
      pose.armBack = 0.22 + Math.sin(time * 2.4 + index) * 0.05;
      pose.crouch = 0.01;
      pose.head = Math.sin(time * 1.8 + index) * 0.06;
      break;
    case 'walk':
      pose.lean = -0.1;
      pose.legFront = swing * 0.62;
      pose.legBack = -swing * 0.62;
      pose.armFront = -swing * 0.4 - 0.1;
      pose.armBack = swing * 0.4 + 0.1;
      pose.crouch = Math.abs(swing) * 0.02;
      break;
    case 'crouch':
      pose.crouch = 0.2;
      pose.lean = -0.2;
      pose.legFront = 0.85;
      pose.legBack = 0.85;
      pose.armFront = -0.9;
      pose.armBack = -0.75;
      pose.armFrontOpen = 0.4;
      pose.armBackOpen = 0.4;
      break;
    case 'jump':
      pose.crouch = 0.04;
      pose.legFront = -0.75;
      pose.legBack = -0.4;
      pose.armFront = -1.4;
      pose.armBack = 1.1;
      pose.lean = 0.12;
      break;
    case 'block':
      pose.crouch = 0.06;
      pose.lean = 0.08;
      pose.armFront = -1.5;
      pose.armBack = -1.35;
      pose.armFrontOpen = 1.0;
      pose.armBackOpen = 0.85;
      pose.head = 0.12;
      break;
    case 'blockstun':
      pose.crouch = 0.1;
      pose.lean = 0.2;
      pose.armFront = -1.35;
      pose.armBack = -1.2;
      pose.armFrontOpen = 0.9;
      pose.armBackOpen = 0.8;
      break;
    case 'hitstun':
      pose.lean = 0.34;
      pose.head = 0.4;
      pose.crouch = 0.04;
      pose.armFront = 0.7;
      pose.armBack = -0.4;
      pose.legFront = -0.2;
      break;
    case 'knockdown':
    case 'ko':
      pose.lean = -1.35;
      pose.crouch = 0;
      pose.armFront = 1.1;
      pose.armBack = -1.2;
      pose.legFront = 0.5;
      pose.legBack = 0.2;
      break;
    case 'wakeup':
      pose.lean = mix(-1.2, -0.2, snapshot.stateTicks / 30);
      pose.crouch = 0.18;
      pose.legFront = 0.7;
      break;
    case 'victory':
      pose.armFront = -2.7 + Math.sin(time * 3) * 0.16;
      pose.armBack = 2.5;
      pose.lean = -0.15;
      pose.head = -0.2;
      pose.crouch = Math.abs(Math.sin(time * 3)) * 0.03;
      break;
    case 'attack': {
      const { windup, strike } = attackPhase(moveData, snapshot.moveTicks);
      const id = snapshot.move;
      pose.crouch = 0.06;
      if (id === 'punch') {
        pose.armFront = mix(-0.2, 0.7, windup) - strike * 2.4;
        pose.armFrontOpen = -0.15;
        pose.lean = -0.12 + strike * 0.22;
        pose.armBack = 0.4;
        pose.legFront = 0.2;
      } else if (id === 'kick') {
        pose.legFront = mix(0, 0.7, windup) - strike * 2.0;
        pose.legBack = -0.25;
        pose.lean = 0.15;
        pose.armFront = 0.8;
        pose.armBack = -1.2;
      } else if (id === 'sweep') {
        pose.crouch = 0.28;
        pose.lean = -0.5;
        pose.legFront = mix(0.4, 0.9, windup) - strike * 1.95;
        pose.legBack = 1.0;
        pose.armFront = -0.4;
        pose.armBack = 0.9;
      } else if (id === 'airkick') {
        pose.legFront = -1.9;
        pose.legBack = -0.5;
        pose.lean = 0.5;
        pose.armFront = -0.9;
        pose.armBack = 1.4;
      } else if (id === 'special') {
        pose.lean = -0.35;
        pose.armFront = mix(-0.2, 1.1, windup) - strike * 2.7;
        pose.armBack = mix(0.2, 0.9, windup) - strike * 1.4;
        pose.armFrontOpen = 0.2;
        pose.crouch = 0.08;
        pose.glow = 1.4 + strike;
        if (def.model.kind === 'furnace') {
          pose.head = -0.5 * strike;
          pose.lean = 0.25 * strike;
        }
      } else if (id === 'super') {
        pose.armFront = -2.2 + Math.sin(snapshot.moveTicks * 0.6) * 0.4;
        pose.armBack = 1.8;
        pose.lean = 0.2 * strike;
        pose.crouch = 0.1;
        pose.glow = 2.4;
        pose.head = -0.25;
      }
      break;
    }
  }

  return pose;
}

export function createFreak(def: CharacterDef, index: 0 | 1, quality: 'low' | 'medium' | 'high'): FreakRig {
  const parts = buildBody(def);
  const baseEmissive = new Map<THREE.MeshStandardMaterial, number>();
  for (const material of [parts.materials.glow, parts.materials.accent, parts.materials.skin]) {
    baseEmissive.set(material, material.emissiveIntensity);
  }

  const pose: Pose = { ...POSE_NEUTRAL };
  let deathTime = 0;

  const update = (snapshot: FighterSnapshot, time: number, delta: number): void => {
    const target = poseFor(snapshot, def, time, index);
    const speed = 18;
    pose.lean = damp(pose.lean, target.lean, delta, speed);
    pose.crouch = damp(pose.crouch, target.crouch, delta, speed);
    pose.armFront = damp(pose.armFront, target.armFront, delta, speed);
    pose.armBack = damp(pose.armBack, target.armBack, delta, speed);
    pose.armFrontOpen = damp(pose.armFrontOpen, target.armFrontOpen, delta, 12);
    pose.armBackOpen = damp(pose.armBackOpen, target.armBackOpen, delta, 12);
    pose.legFront = damp(pose.legFront, target.legFront, delta, speed);
    pose.legBack = damp(pose.legBack, target.legBack, delta, speed);
    pose.head = damp(pose.head, target.head, delta, 10);
    pose.glow = damp(pose.glow, target.glow, delta, 8);

    const h = parts.height;
    parts.inner.position.y = -pose.crouch * h;
    parts.inner.rotation.x = pose.lean;
    parts.inner.rotation.z = snapshot.state === 'walk' ? Math.sin(time * 7 + index) * 0.03 : 0;

    parts.armFront.rotation.x = pose.armFront;
    parts.armFront.rotation.z = -pose.armFrontOpen;
    parts.armBack.rotation.x = pose.armBack;
    parts.armBack.rotation.z = pose.armBackOpen;
    parts.legFront.rotation.x = pose.legFront;
    parts.legBack.rotation.x = pose.legBack;
    parts.head.rotation.x = pose.head;

    parts.extraArms.forEach((arm, armIndex) => {
      const phase = time * 4 + armIndex * 2.1;
      arm.rotation.x = Math.sin(phase) * 0.35 - 0.2;
      arm.rotation.z = (armIndex % 2 === 0 ? 1 : -1) * (0.9 + Math.cos(phase) * 0.2);
    });

    // Glow: eyes, furnace grates and super charge behave the same way.
    parts.materials.glow.emissiveIntensity = pose.glow * (1 + Math.sin(time * 6) * 0.08);

    const flash = snapshot.hitFlash / 8;
    for (const [material, base] of baseEmissive) {
      if (material === parts.materials.glow) continue;
      material.emissive.setRGB(flash * 0.9, flash * 0.35, flash * 0.2);
      material.emissiveIntensity = base + flash * 2.2;
    }

    // The KO fall gets a small bounce so it does not look like a texture swap.
    if (snapshot.state === 'ko') {
      deathTime += delta;
      parts.inner.position.y += Math.max(0, 0.12 - deathTime) * 0.4;
    } else {
      deathTime = 0;
    }

  };

  // Quality knob: shadows off on low-end devices is the cheapest large win.
  if (quality === 'low') {
    parts.root.traverse((node) => {
      if (node instanceof THREE.Mesh) node.castShadow = false;
    });
  }

  return {
    group: parts.root,
    update,
    dispose: () => {
      for (const geometry of parts.disposables) geometry.dispose();
      const materials: THREE.Material[] = [
        parts.materials.skin,
        parts.materials.cloth,
        parts.materials.accent,
        parts.materials.glow,
        parts.materials.metal,
        parts.materials.dark,
      ];
      for (const material of materials) material.dispose();
    },
  };
}
