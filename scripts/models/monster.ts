import { Group, MeshStandardMaterial } from 'three';
import type { AnimationClip } from 'three';
import { SkinBuilder } from './skinBuilder';
import { buildArmature, makeClip, positionTrack, rotationTrack } from './rig';
import type { JointSpec, RotationKey } from './rig';
import type { CharacterAsset } from './types';

/**
 * "Костяной страж" — the stage-6 melee enemy.
 *
 * Hunched skeleton: long arms, heavy rib cage, no lower jaw to speak of, glowing
 * eye sockets. Same rig conventions as the hero (identity rest rotations, −Z
 * forward, feet at y = 0), so the scene can share placement and animation code.
 */

const HIP_HEIGHT = 1.0;

const JOINTS: readonly JointSpec[] = [
  { name: 'root', parent: null, position: [0, HIP_HEIGHT, 0] },
  { name: 'spine', parent: 'root', position: [0, 1.22, 0.04] },
  { name: 'chest', parent: 'spine', position: [0, 1.44, 0.1] },
  { name: 'head', parent: 'chest', position: [0, 1.62, 0.12] },

  { name: 'arm_L', parent: 'chest', position: [0.22, 1.5, 0.08] },
  { name: 'forearm_L', parent: 'arm_L', position: [0.34, 1.16, 0.02] },
  { name: 'claw_L', parent: 'forearm_L', position: [0.4, 0.86, -0.04] },

  { name: 'arm_R', parent: 'chest', position: [-0.22, 1.5, 0.08] },
  { name: 'forearm_R', parent: 'arm_R', position: [-0.34, 1.16, 0.02] },
  { name: 'claw_R', parent: 'forearm_R', position: [-0.4, 0.86, -0.04] },

  { name: 'thigh_L', parent: 'root', position: [0.13, 0.98, 0] },
  { name: 'shin_L', parent: 'thigh_L', position: [0.15, 0.52, -0.04] },
  { name: 'foot_L', parent: 'shin_L', position: [0.15, 0.08, -0.06] },

  { name: 'thigh_R', parent: 'root', position: [-0.13, 0.98, 0] },
  { name: 'shin_R', parent: 'thigh_R', position: [-0.15, 0.52, -0.04] },
  { name: 'foot_R', parent: 'shin_R', position: [-0.15, 0.08, -0.06] },
];

export const MONSTER_BONES = JOINTS.map((joint) => joint.name);
export const MONSTER_CLIPS = ['idle', 'walk', 'attack', 'hit', 'death'] as const;

export function monsterMaterials(): Record<string, MeshStandardMaterial> {
  return {
    bone: new MeshStandardMaterial({ color: 0xd8d0bd, roughness: 0.78, metalness: 0.02 }),
    rust: new MeshStandardMaterial({ color: 0x5b4a3a, roughness: 0.85, metalness: 0.55 }),
    glow: new MeshStandardMaterial({
      color: 0x7de2c9,
      emissive: 0x4fe0be,
      emissiveIntensity: 3,
      roughness: 0.3,
    }),
  };
}

export function buildMonster(): CharacterAsset {
  const armature = buildArmature(JOINTS);
  const group = new Group();
  group.name = 'BoneWarden';

  const bone = new SkinBuilder();
  const rust = new SkinBuilder();
  const glow = new SkinBuilder();

  // --- spine and ribs --------------------------------------------------
  for (let i = 0; i < 4; i += 1) {
    const y = 1.12 + i * 0.12;
    bone.addSphere([0, y, 0.02 + i * 0.02], 0.045, i < 2 ? 'spine' : 'chest');
  }
  for (let i = 0; i < 5; i += 1) {
    const y = 1.32 + i * 0.07;
    const width = 0.2 - i * 0.012;
    const joint = i < 2 ? 'spine' : 'chest';
    bone.addLimb([-width, y, 0.04], [width, y, 0.04], 0.018, 0.018, joint, undefined, 5);
  }
  // Sternum and collarbones.
  bone.addBox([0, 1.5, -0.06], [0.06, 0.26, 0.05], 'chest');
  bone.addLimb([-0.2, 1.52, 0.04], [0.2, 1.52, 0.04], 0.02, 0.02, 'chest', undefined, 5);

  // --- skull -----------------------------------------------------------
  bone.addSphere([0, 1.66, 0.1], 0.11, 'head');
  bone.addBox([0, 1.6, 0.02], [0.14, 0.06, 0.1], 'head'); // jaw
  glow.addSphere([0.045, 1.68, 0.0], 0.024, 'head');
  glow.addSphere([-0.045, 1.68, 0.0], 0.024, 'head');

  // --- arms ------------------------------------------------------------
  for (const side of ['L', 'R'] as const) {
    const sign = side === 'L' ? 1 : -1;
    const x = sign * 0.26;
    bone.addLimb([x, 1.5, 0.08], [sign * 0.34, 1.16, 0.02], 0.045, 0.032, `arm_${side}`, 'chest');
    bone.addLimb([sign * 0.34, 1.16, 0.02], [sign * 0.4, 0.86, -0.04], 0.03, 0.024, `forearm_${side}`, `arm_${side}`);
    for (let i = -1; i <= 1; i += 1) {
      bone.addLimb(
        [sign * 0.4, 0.86, -0.04],
        [sign * 0.4 + i * 0.03, 0.73, -0.12],
        0.012,
        0.004,
        `claw_${side}`,
        `forearm_${side}`,
        4,
      );
    }
    rust.addSphere([sign * 0.22, 1.5, 0.08], 0.085, `arm_${side}`, [1, 0.7, 1]);
  }

  // --- legs ------------------------------------------------------------
  for (const side of ['L', 'R'] as const) {
    const sign = side === 'L' ? 1 : -1;
    bone.addLimb([sign * 0.13, 0.98, 0], [sign * 0.15, 0.52, -0.04], 0.055, 0.04, `thigh_${side}`, 'root');
    bone.addLimb([sign * 0.15, 0.52, -0.04], [sign * 0.15, 0.1, -0.04], 0.038, 0.028, `shin_${side}`, `thigh_${side}`);
    bone.addBox([sign * 0.15, 0.05, -0.1], [0.1, 0.07, 0.22], `foot_${side}`);
  }

  // Loincloth of rusted mail: the only metal on the model.
  rust.addBox([0, 1.02, 0.02], [0.34, 0.16, 0.26], 'root');

  const materials = monsterMaterials();
  const builders = { bone, rust, glow };
  for (const key of Object.keys(builders) as (keyof typeof builders)[]) {
    const material = materials[key];
    if (!material) throw new Error(`missing monster material ${key}`);
    group.add(builders[key].build(armature, material, `Monster_${key}`));
  }
  group.add(armature.root);

  const clips = buildClips();
  const triangles = bone.triangles + rust.triangles + glow.triangles;
  return { group, clips, bones: MONSTER_BONES, metrics: { triangles } };
}

function buildClips(): AnimationClip[] {
  const idle: RotationKey[] = [
    { time: 0, euler: [0.05, 0, 0] },
    { time: 1.2, euler: [0.12, 0, 0] },
    { time: 2.4, euler: [0.05, 0, 0] },
  ];

  const clips: AnimationClip[] = [
    makeClip(
      'idle',
      [
        rotationTrack('spine', idle),
        rotationTrack('chest', [
          { time: 0, euler: [0.18, 0.05, 0] },
          { time: 1.2, euler: [0.24, -0.05, 0] },
          { time: 2.4, euler: [0.18, 0.05, 0] },
        ]),
        rotationTrack('head', [
          { time: 0, euler: [0.1, -0.1, 0] },
          { time: 1.2, euler: [0.05, 0.12, 0] },
          { time: 2.4, euler: [0.1, -0.1, 0] },
        ]),
        rotationTrack('arm_L', [
          { time: 0, euler: [0.2, 0, -0.12] },
          { time: 1.2, euler: [0.28, 0, -0.18] },
          { time: 2.4, euler: [0.2, 0, -0.12] },
        ]),
        rotationTrack('arm_R', [
          { time: 0, euler: [0.2, 0, 0.12] },
          { time: 1.2, euler: [0.28, 0, 0.18] },
          { time: 2.4, euler: [0.2, 0, 0.12] },
        ]),
        positionTrack('root', [
          { time: 0, value: [0, HIP_HEIGHT, 0] },
          { time: 1.2, value: [0, HIP_HEIGHT + 0.02, 0] },
          { time: 2.4, value: [0, HIP_HEIGHT, 0] },
        ]),
      ],
      2.4,
    ),
    makeClip(
      'walk',
      [
        rotationTrack('thigh_L', [
          { time: 0, euler: [0.55, 0, 0] },
          { time: 0.5, euler: [-0.5, 0, 0] },
          { time: 1, euler: [0.55, 0, 0] },
        ]),
        rotationTrack('thigh_R', [
          { time: 0, euler: [-0.5, 0, 0] },
          { time: 0.5, euler: [0.55, 0, 0] },
          { time: 1, euler: [-0.5, 0, 0] },
        ]),
        rotationTrack('shin_L', [
          { time: 0, euler: [-0.25, 0, 0] },
          { time: 0.5, euler: [-0.7, 0, 0] },
          { time: 1, euler: [-0.25, 0, 0] },
        ]),
        rotationTrack('shin_R', [
          { time: 0, euler: [-0.7, 0, 0] },
          { time: 0.5, euler: [-0.25, 0, 0] },
          { time: 1, euler: [-0.7, 0, 0] },
        ]),
        rotationTrack('arm_L', [
          { time: 0, euler: [-0.35, 0, -0.12] },
          { time: 0.5, euler: [0.45, 0, -0.12] },
          { time: 1, euler: [-0.35, 0, -0.12] },
        ]),
        rotationTrack('arm_R', [
          { time: 0, euler: [0.45, 0, 0.12] },
          { time: 0.5, euler: [-0.35, 0, 0.12] },
          { time: 1, euler: [0.45, 0, 0.12] },
        ]),
        rotationTrack('chest', [
          { time: 0, euler: [0.22, 0.1, 0] },
          { time: 0.5, euler: [0.22, -0.1, 0] },
          { time: 1, euler: [0.22, 0.1, 0] },
        ]),
        positionTrack('root', [
          { time: 0, value: [0, HIP_HEIGHT - 0.04, 0] },
          { time: 0.5, value: [0, HIP_HEIGHT, 0] },
          { time: 1, value: [0, HIP_HEIGHT - 0.04, 0] },
        ]),
      ],
      1,
    ),
    makeClip(
      'attack',
      [
        rotationTrack('chest', [
          { time: 0, euler: [0.2, 0, 0] },
          { time: 0.2, euler: [0.05, -0.4, 0] },
          { time: 0.42, euler: [0.42, 0.35, 0] },
          { time: 0.7, euler: [0.2, 0, 0] },
        ]),
        rotationTrack('arm_R', [
          { time: 0, euler: [0.2, 0, 0.12] },
          { time: 0.2, euler: [-2.2, 0, 0.4] },
          { time: 0.42, euler: [1.1, 0, -0.1] },
          { time: 0.7, euler: [0.2, 0, 0.12] },
        ]),
        rotationTrack('forearm_R', [
          { time: 0, euler: [-0.2, 0, 0] },
          { time: 0.2, euler: [-1.3, 0, 0] },
          { time: 0.42, euler: [0.1, 0, 0] },
          { time: 0.7, euler: [-0.2, 0, 0] },
        ]),
        rotationTrack('arm_L', [
          { time: 0, euler: [0.2, 0, -0.12] },
          { time: 0.2, euler: [-0.4, 0, -0.5] },
          { time: 0.42, euler: [0.5, 0, -0.2] },
          { time: 0.7, euler: [0.2, 0, -0.12] },
        ]),
        positionTrack('root', [
          { time: 0, value: [0, HIP_HEIGHT, 0] },
          { time: 0.42, value: [0, HIP_HEIGHT - 0.06, -0.08] },
          { time: 0.7, value: [0, HIP_HEIGHT, 0] },
        ]),
      ],
      0.7,
    ),
    makeClip(
      'hit',
      [
        rotationTrack('chest', [
          { time: 0, euler: [0.2, 0, 0] },
          { time: 0.1, euler: [-0.15, 0.2, 0] },
          { time: 0.4, euler: [0.2, 0, 0] },
        ]),
        rotationTrack('head', [
          { time: 0, euler: [0.1, 0, 0] },
          { time: 0.1, euler: [-0.35, 0, 0] },
          { time: 0.4, euler: [0.1, 0, 0] },
        ]),
      ],
      0.4,
    ),
    makeClip(
      'death',
      [
        rotationTrack('root', [
          { time: 0, euler: [0, 0, 0] },
          { time: 0.5, euler: [-0.8, 0.2, 0] },
          { time: 1, euler: [-1.5, 0.35, 0.1] },
        ]),
        positionTrack('root', [
          { time: 0, value: [0, HIP_HEIGHT, 0] },
          { time: 1, value: [0, 0.18, 0.35] },
        ]),
        rotationTrack('arm_L', [
          { time: 0, euler: [0.2, 0, -0.12] },
          { time: 1, euler: [1.2, 0, -0.8] },
        ]),
        rotationTrack('arm_R', [
          { time: 0, euler: [0.2, 0, 0.12] },
          { time: 1, euler: [1.0, 0, 0.9] },
        ]),
        rotationTrack('head', [
          { time: 0, euler: [0.1, 0, 0] },
          { time: 1, euler: [0.45, 0, 0] },
        ]),
      ],
      1,
    ),
  ];

  return clips;
}
