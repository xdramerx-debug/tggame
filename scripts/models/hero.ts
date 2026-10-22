import { Group, MeshStandardMaterial } from 'three';
import type { AnimationClip } from 'three';
import { SkinBuilder } from './skinBuilder';
import { buildArmature, makeClip, positionTrack, rotationTrack } from './rig';
import type { JointSpec, RotationKey } from './rig';
import type { CharacterAsset } from './types';

/**
 * The player: "Страж Теней" (Shadow Warden).
 *
 * Authored entirely from primitives in rest-pose model space; every part is
 * weighted to one bone (armour plates) or split across a joint (limbs). The
 * model faces −Z, which is the engine's forward convention
 * (`directionToYaw` in `src/input/movement.ts`), and its feet sit at y = 0 so the
 * scene can place it directly on the player capsule's feet position.
 */

const HIP_HEIGHT = 0.95;
const KNEE = 0.5;
const ANKLE = 0.09;
const ELBOW = 1.12;
const WRIST = 0.86;
const SHOULDER_Y = 1.4;
const SHOULDER_X = 0.3;

const JOINTS: readonly JointSpec[] = [
  { name: 'hips', parent: null, position: [0, HIP_HEIGHT, 0] },
  { name: 'spine', parent: 'hips', position: [0, 1.12, 0] },
  { name: 'chest', parent: 'spine', position: [0, 1.3, 0] },
  { name: 'neck', parent: 'chest', position: [0, 1.47, 0] },
  { name: 'head', parent: 'neck', position: [0, 1.58, 0] },

  { name: 'shoulder_L', parent: 'chest', position: [0.19, 1.44, 0] },
  { name: 'upperArm_L', parent: 'shoulder_L', position: [SHOULDER_X, SHOULDER_Y, 0] },
  { name: 'lowerArm_L', parent: 'upperArm_L', position: [SHOULDER_X, ELBOW, 0] },
  { name: 'hand_L', parent: 'lowerArm_L', position: [SHOULDER_X, WRIST, 0] },

  { name: 'shoulder_R', parent: 'chest', position: [-0.19, 1.44, 0] },
  { name: 'upperArm_R', parent: 'shoulder_R', position: [-SHOULDER_X, SHOULDER_Y, 0] },
  { name: 'lowerArm_R', parent: 'upperArm_R', position: [-SHOULDER_X, ELBOW, 0] },
  { name: 'hand_R', parent: 'lowerArm_R', position: [-SHOULDER_X, WRIST, 0] },

  { name: 'thigh_L', parent: 'hips', position: [0.11, 0.92, 0] },
  { name: 'shin_L', parent: 'thigh_L', position: [0.11, KNEE, 0] },
  { name: 'foot_L', parent: 'shin_L', position: [0.11, ANKLE, 0] },

  { name: 'thigh_R', parent: 'hips', position: [-0.11, 0.92, 0] },
  { name: 'shin_R', parent: 'thigh_R', position: [-0.11, KNEE, 0] },
  { name: 'foot_R', parent: 'shin_R', position: [-0.11, ANKLE, 0] },
];

/** Bone names, exported so the runtime can sanity-check the rig it loaded. */
export const HERO_BONES = JOINTS.map((joint) => joint.name);

export const HERO_CLIPS = ['idle', 'walk', 'run', 'attack', 'dodge', 'hit', 'death'] as const;

/** Dark leather + iron plates + cold rune light: the stage-5 art direction. */
export function heroMaterials(): Record<string, MeshStandardMaterial> {
  return {
    cloth: new MeshStandardMaterial({ color: 0x232b38, roughness: 0.92, metalness: 0.02 }),
    armor: new MeshStandardMaterial({ color: 0x3a4553, roughness: 0.42, metalness: 0.85 }),
    steel: new MeshStandardMaterial({ color: 0xc3ccd8, roughness: 0.22, metalness: 0.95 }),
    rune: new MeshStandardMaterial({
      color: 0x4a7c8c,
      emissive: 0x4a7c8c,
      emissiveIntensity: 2.2,
      roughness: 0.35,
      metalness: 0.3,
    }),
  };
}

/**
 * Builds the hero rig: four skinned meshes (one per material), a skeleton and
 * seven clips. Returned group is what gets exported to `hero.glb`.
 */
export function buildHero(): CharacterAsset {
  const armature = buildArmature(JOINTS);
  const group = new Group();
  group.name = 'Hero';

  const builders = {
    cloth: new SkinBuilder(),
    armor: new SkinBuilder(),
    steel: new SkinBuilder(),
    rune: new SkinBuilder(),
  };
  buildParts(builders);

  const materials = heroMaterials();
  (Object.keys(builders) as (keyof typeof builders)[]).forEach((key) => {
    const material = materials[key];
    if (!material) throw new Error(`missing hero material ${key}`);
    group.add(builders[key].build(armature, material, `Hero_${key}`));
  });
  // Bones must live in the scene graph exactly once (SkinBuilder attaches them
  // to the last mesh); the group owns them so the exporter sees one hierarchy.
  group.add(armature.root);

  const clips = buildClips();
  return { group, clips, bones: HERO_BONES, metrics: { triangles: totalTriangles(builders) } };
}

function buildParts(builders: {
  cloth: SkinBuilder;
  armor: SkinBuilder;
  steel: SkinBuilder;
  rune: SkinBuilder;
}): void {
  const { cloth, armor, steel, rune } = builders;

  // --- torso -----------------------------------------------------------
  cloth.addBox([0, 1.2, 0], [0.32, 0.34, 0.22], 'spine');
  cloth.addBox([0, 0.93, 0], [0.3, 0.2, 0.22], 'hips');
  cloth.addBox([0, 0.78, -0.11], [0.22, 0.36, 0.02], 'hips', [0.06, 0, 0]);
  cloth.addBox([0, 1.12, 0.14], [0.36, 0.46, 0.03], 'chest', [0.12, 0, 0]);

  armor.addBox([0, 1.32, 0], [0.36, 0.26, 0.25], 'chest');
  armor.addBox([0, 1.45, 0.02], [0.3, 0.06, 0.22], 'chest');
  armor.addBox([0, 1.03, 0], [0.3, 0.08, 0.23], 'hips');

  // --- head ------------------------------------------------------------
  cloth.addSphere([0, 1.62, 0], 0.105, 'head', [1, 1.08, 1]);
  armor.addBox([0, 1.645, 0.01], [0.24, 0.15, 0.23], 'head');
  armor.addBox([0, 1.58, -0.1], [0.16, 0.06, 0.03], 'head');
  rune.addBox([0, 1.615, -0.115], [0.15, 0.025, 0.015], 'head');
  rune.addSphere([0, 1.35, -0.135], 0.035, 'chest');

  // --- arms ------------------------------------------------------------
  for (const side of ['L', 'R'] as const) {
    const sign = side === 'L' ? 1 : -1;
    const shoulderX = sign * SHOULDER_X;
    armor.addSphere([sign * 0.235, 1.43, 0], 0.115, `shoulder_${side}`, [1.1, 0.8, 1.05]);
    armor.addLimb([shoulderX, SHOULDER_Y, 0], [shoulderX, ELBOW, 0], 0.062, 0.05, `upperArm_${side}`, `shoulder_${side}`);
    armor.addLimb([shoulderX, ELBOW, 0], [shoulderX, WRIST + 0.06, 0], 0.052, 0.042, `lowerArm_${side}`, `upperArm_${side}`);
    cloth.addSphere([shoulderX, WRIST, 0], 0.048, `hand_${side}`);
  }

  // --- legs ------------------------------------------------------------
  for (const side of ['L', 'R'] as const) {
    const x = side === 'L' ? 0.11 : -0.11;
    cloth.addLimb([x, 0.92, 0], [x, KNEE, 0], 0.082, 0.062, `thigh_${side}`, 'hips');
    armor.addLimb([x, KNEE, 0], [x, ANKLE + 0.02, 0], 0.062, 0.045, `shin_${side}`, `thigh_${side}`);
    armor.addBox([x, 0.055, -0.03], [0.13, 0.11, 0.25], `foot_${side}`);
  }

  // --- sword (right hand) ---------------------------------------------
  steel.addBox([-SHOULDER_X, 1.2, -0.03], [0.045, 0.62, 0.1], 'hand_R');
  steel.addBox([-SHOULDER_X, 0.88, -0.02], [0.17, 0.03, 0.06], 'hand_R');
  cloth.addLimb([-SHOULDER_X, 0.9, 0], [-SHOULDER_X, 0.82, 0], 0.026, 0.024, 'hand_R', 'lowerArm_R', 6);
  rune.addBox([-SHOULDER_X, 1.2, -0.082], [0.012, 0.56, 0.008], 'hand_R');
}

function totalTriangles(builders: { cloth: SkinBuilder; armor: SkinBuilder; steel: SkinBuilder; rune: SkinBuilder }): number {
  return (
    builders.cloth.triangles + builders.armor.triangles + builders.steel.triangles + builders.rune.triangles
  );
}

// ---------------------------------------------------------------- animation

const LEG_SWING = 0.62;
const ARM_SWING = 0.42;

function legs(phase: number): { thighL: RotationKey[]; thighR: RotationKey[]; shinL: RotationKey[]; shinR: RotationKey[] } {
  const swing = (offset: number): RotationKey[] => [
    { time: offset, euler: [LEG_SWING * 0.5, 0, 0] },
    { time: offset + 0.25, euler: [LEG_SWING, 0, 0] },
    { time: offset + 0.5, euler: [-LEG_SWING * 0.5, 0, 0] },
    { time: offset + 0.75, euler: [-LEG_SWING, 0, 0] },
  ];
  const bend = (offset: number): RotationKey[] => [
    { time: offset, euler: [-0.15, 0, 0] },
    { time: offset + 0.25, euler: [-0.6, 0, 0] },
    { time: offset + 0.5, euler: [-0.1, 0, 0] },
    { time: offset + 0.75, euler: [-0.35, 0, 0] },
  ];
  return { thighL: swing(phase), thighR: swing(phase + 0.5), shinL: bend(phase), shinR: bend(phase + 0.5) };
}

function buildClips(): AnimationClip[] {
  const clips: AnimationClip[] = [];

  // --- idle ------------------------------------------------------------
  clips.push(
    makeClip(
      'idle',
      [
        positionTrack('hips', [
          { time: 0, value: [0, HIP_HEIGHT, 0] },
          { time: 1, value: [0, HIP_HEIGHT + 0.012, 0] },
          { time: 2, value: [0, HIP_HEIGHT, 0] },
        ]),
        rotationTrack('chest', [
          { time: 0, euler: [0.02, 0, 0] },
          { time: 1, euler: [0.05, 0, 0] },
          { time: 2, euler: [0.02, 0, 0] },
        ]),
        rotationTrack('head', [
          { time: 0, euler: [0, 0.05, 0] },
          { time: 1.4, euler: [0, -0.05, 0] },
          { time: 2, euler: [0, 0.05, 0] },
        ]),
        rotationTrack('upperArm_L', [
          { time: 0, euler: [0.06, 0, -0.1] },
          { time: 1, euler: [0.02, 0, -0.14] },
          { time: 2, euler: [0.06, 0, -0.1] },
        ]),
        rotationTrack('upperArm_R', [
          { time: 0, euler: [0.06, 0, 0.1] },
          { time: 1, euler: [0.02, 0, 0.14] },
          { time: 2, euler: [0.06, 0, 0.1] },
        ]),
      ],
      2,
    ),
  );

  // --- walk ------------------------------------------------------------
  {
    const { thighL, thighR, shinL, shinR } = legs(0);
    clips.push(
      makeClip(
        'walk',
        [
          positionTrack('hips', [
            { time: 0, value: [0, HIP_HEIGHT, 0] },
            { time: 0.25, value: [0, HIP_HEIGHT - 0.02, 0] },
            { time: 0.5, value: [0, HIP_HEIGHT, 0] },
            { time: 0.75, value: [0, HIP_HEIGHT - 0.02, 0] },
            { time: 1, value: [0, HIP_HEIGHT, 0] },
          ]),
          rotationTrack('thigh_L', [...thighL, { time: 1, euler: [LEG_SWING * 0.5, 0, 0] }]),
          rotationTrack('thigh_R', [...thighR, { time: 1, euler: [-LEG_SWING * 0.5, 0, 0] }]),
          rotationTrack('shin_L', [...shinL, { time: 1, euler: [-0.15, 0, 0] }]),
          rotationTrack('shin_R', [...shinR, { time: 1, euler: [-0.35, 0, 0] }]),
          rotationTrack('upperArm_L', [
            { time: 0, euler: [-ARM_SWING, 0, -0.1] },
            { time: 0.5, euler: [ARM_SWING, 0, -0.1] },
            { time: 1, euler: [-ARM_SWING, 0, -0.1] },
          ]),
          rotationTrack('upperArm_R', [
            { time: 0, euler: [ARM_SWING, 0, 0.1] },
            { time: 0.5, euler: [-ARM_SWING, 0, 0.1] },
            { time: 1, euler: [ARM_SWING, 0, 0.1] },
          ]),
          rotationTrack('chest', [
            { time: 0, euler: [0.05, 0.08, 0] },
            { time: 0.5, euler: [0.05, -0.08, 0] },
            { time: 1, euler: [0.05, 0.08, 0] },
          ]),
        ],
        1,
      ),
    );
  }

  // --- run -------------------------------------------------------------
  {
    const { thighL, thighR, shinL, shinR } = legs(0);
    const scaled = (keys: RotationKey[], factor: number): RotationKey[] =>
      keys.map((key) => ({
        time: key.time * 0.72,
        euler: [key.euler[0] * factor, key.euler[1], key.euler[2]] as const,
      }));
    clips.push(
      makeClip(
        'run',
        [
          positionTrack('hips', [
            { time: 0, value: [0, HIP_HEIGHT - 0.03, 0] },
            { time: 0.18, value: [0, HIP_HEIGHT + 0.02, 0] },
            { time: 0.36, value: [0, HIP_HEIGHT - 0.03, 0] },
            { time: 0.54, value: [0, HIP_HEIGHT + 0.02, 0] },
            { time: 0.72, value: [0, HIP_HEIGHT - 0.03, 0] },
          ]),
          rotationTrack('hips', [
            { time: 0, euler: [0, 0.08, 0] },
            { time: 0.36, euler: [0, -0.08, 0] },
            { time: 0.72, euler: [0, 0.08, 0] },
          ]),
          rotationTrack('spine', [
            { time: 0, euler: [0.16, 0, 0] },
            { time: 0.72, euler: [0.16, 0, 0] },
          ]),
          rotationTrack('thigh_L', scaled(thighL, 1.45)),
          rotationTrack('thigh_R', scaled(thighR, 1.45)),
          rotationTrack('shin_L', scaled(shinL, 1.5)),
          rotationTrack('shin_R', scaled(shinR, 1.5)),
          rotationTrack('upperArm_L', [
            { time: 0, euler: [-0.9, 0, -0.16] },
            { time: 0.36, euler: [0.75, 0, -0.16] },
            { time: 0.72, euler: [-0.9, 0, -0.16] },
          ]),
          rotationTrack('lowerArm_L', [
            { time: 0, euler: [-1.1, 0, 0] },
            { time: 0.72, euler: [-1.1, 0, 0] },
          ]),
          rotationTrack('upperArm_R', [
            { time: 0, euler: [0.75, 0, 0.16] },
            { time: 0.36, euler: [-0.9, 0, 0.16] },
            { time: 0.72, euler: [0.75, 0, 0.16] },
          ]),
        ],
        0.72,
      ),
    );
  }

  // --- attack ----------------------------------------------------------
  clips.push(
    makeClip(
      'attack',
      [
        rotationTrack('hips', [
          { time: 0, euler: [0, 0, 0] },
          { time: 0.14, euler: [0, -0.25, 0] },
          { time: 0.3, euler: [0, 0.3, 0] },
          { time: 0.55, euler: [0, 0, 0] },
        ]),
        rotationTrack('chest', [
          { time: 0, euler: [0.05, 0.1, 0] },
          { time: 0.14, euler: [-0.1, -0.5, 0] },
          { time: 0.3, euler: [0.28, 0.45, 0] },
          { time: 0.55, euler: [0.05, 0.1, 0] },
        ]),
        rotationTrack('upperArm_R', [
          { time: 0, euler: [0.1, 0, 0.1] },
          { time: 0.14, euler: [-2.1, 0.3, 0.5] },
          { time: 0.3, euler: [0.9, -0.4, -0.2] },
          { time: 0.55, euler: [0.1, 0, 0.1] },
        ]),
        rotationTrack('lowerArm_R', [
          { time: 0, euler: [-0.2, 0, 0] },
          { time: 0.14, euler: [-1.1, 0, 0] },
          { time: 0.3, euler: [-0.1, 0, 0] },
          { time: 0.55, euler: [-0.2, 0, 0] },
        ]),
        rotationTrack('upperArm_L', [
          { time: 0, euler: [0.05, 0, -0.1] },
          { time: 0.14, euler: [-0.5, 0, -0.5] },
          { time: 0.3, euler: [0.4, 0, -0.2] },
          { time: 0.55, euler: [0.05, 0, -0.1] },
        ]),
        positionTrack('hips', [
          { time: 0, value: [0, HIP_HEIGHT, 0] },
          { time: 0.3, value: [0, HIP_HEIGHT - 0.05, -0.06] },
          { time: 0.55, value: [0, HIP_HEIGHT, 0] },
        ]),
      ],
      0.55,
    ),
  );

  // --- dodge -----------------------------------------------------------
  clips.push(
    makeClip(
      'dodge',
      [
        positionTrack('hips', [
          { time: 0, value: [0, HIP_HEIGHT, 0] },
          { time: 0.14, value: [0, HIP_HEIGHT - 0.34, -0.04] },
          { time: 0.32, value: [0, HIP_HEIGHT - 0.26, -0.1] },
          { time: 0.5, value: [0, HIP_HEIGHT, 0] },
        ]),
        rotationTrack('hips', [
          { time: 0, euler: [0, 0, 0] },
          { time: 0.14, euler: [0.5, 0, 0] },
          { time: 0.5, euler: [0, 0, 0] },
        ]),
        rotationTrack('thigh_L', [
          { time: 0, euler: [0, 0, 0] },
          { time: 0.14, euler: [-1.2, 0, 0] },
          { time: 0.32, euler: [-0.8, 0, 0] },
          { time: 0.5, euler: [0, 0, 0] },
        ]),
        rotationTrack('thigh_R', [
          { time: 0, euler: [0, 0, 0] },
          { time: 0.14, euler: [-1.2, 0, 0] },
          { time: 0.32, euler: [-0.8, 0, 0] },
          { time: 0.5, euler: [0, 0, 0] },
        ]),
        rotationTrack('shin_L', [
          { time: 0, euler: [0, 0, 0] },
          { time: 0.14, euler: [-1.6, 0, 0] },
          { time: 0.5, euler: [0, 0, 0] },
        ]),
        rotationTrack('shin_R', [
          { time: 0, euler: [0, 0, 0] },
          { time: 0.14, euler: [-1.6, 0, 0] },
          { time: 0.5, euler: [0, 0, 0] },
        ]),
      ],
      0.5,
    ),
  );

  // --- hit -------------------------------------------------------------
  clips.push(
    makeClip(
      'hit',
      [
        rotationTrack('chest', [
          { time: 0, euler: [0.05, 0, 0] },
          { time: 0.08, euler: [-0.35, 0.12, 0] },
          { time: 0.35, euler: [0.05, 0, 0] },
        ]),
        rotationTrack('head', [
          { time: 0, euler: [0, 0, 0] },
          { time: 0.08, euler: [-0.3, 0, 0] },
          { time: 0.35, euler: [0, 0, 0] },
        ]),
        rotationTrack('upperArm_L', [
          { time: 0, euler: [0.06, 0, -0.1] },
          { time: 0.08, euler: [0.5, 0, -0.6] },
          { time: 0.35, euler: [0.06, 0, -0.1] },
        ]),
        positionTrack('hips', [
          { time: 0, value: [0, HIP_HEIGHT, 0] },
          { time: 0.08, value: [0, HIP_HEIGHT - 0.04, 0.05] },
          { time: 0.35, value: [0, HIP_HEIGHT, 0] },
        ]),
      ],
      0.35,
    ),
  );

  // --- death -----------------------------------------------------------
  clips.push(
    makeClip(
      'death',
      [
        positionTrack('hips', [
          { time: 0, value: [0, HIP_HEIGHT, 0] },
          { time: 0.45, value: [0, 0.5, 0.12] },
          { time: 0.9, value: [0, 0.16, 0.3] },
        ]),
        rotationTrack('hips', [
          { time: 0, euler: [0, 0, 0] },
          { time: 0.35, euler: [-0.7, 0.1, 0] },
          { time: 0.9, euler: [-1.45, 0.2, 0.05] },
        ]),
        rotationTrack('chest', [
          { time: 0, euler: [0.05, 0, 0] },
          { time: 0.9, euler: [-0.2, 0, 0.1] },
        ]),
        rotationTrack('thigh_L', [
          { time: 0, euler: [0, 0, 0] },
          { time: 0.9, euler: [0.45, 0, 0] },
        ]),
        rotationTrack('thigh_R', [
          { time: 0, euler: [0, 0, 0] },
          { time: 0.9, euler: [0.25, 0, 0] },
        ]),
        rotationTrack('upperArm_L', [
          { time: 0, euler: [0.06, 0, -0.1] },
          { time: 0.9, euler: [0.9, 0, -0.7] },
        ]),
        rotationTrack('upperArm_R', [
          { time: 0, euler: [0.06, 0, 0.1] },
          { time: 0.9, euler: [0.7, 0, 0.8] },
        ]),
      ],
      0.9,
    ),
  );

  return clips;
}
