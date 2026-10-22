import {
  AnimationClip,
  Bone,
  Euler,
  Quaternion,
  QuaternionKeyframeTrack,
  Skeleton,
  Vector3,
  VectorKeyframeTrack,
} from 'three';

/**
 * Tiny armature toolkit shared by every generated character.
 *
 * Design rule: bones are created with identity rotation and only a translation
 * offset from their parent, and the geometry is authored in *rest-pose model
 * space*. Because of that a bone's local axes are the world axes, so animation
 * keyframes can be written as plain Euler angles ("thigh swings around X") and
 * stay readable — no axis-conversion tables in the animation data.
 */
export interface JointSpec {
  readonly name: string;
  /** Parent joint name, or null for the root. */
  readonly parent: string | null;
  /** Rest position in model space (metres). */
  readonly position: readonly [number, number, number];
}

export interface Armature {
  readonly root: Bone;
  readonly bones: readonly Bone[];
  readonly skeleton: Skeleton;
  /** Model-space rest position of every joint. */
  byName(name: string): Bone;
  indexOf(name: string): number;
  restPosition(name: string): Vector3;
}

/** Builds a skeleton from joint specs given in parent-before-child order. */
export function buildArmature(joints: readonly JointSpec[]): Armature {
  const bones: Bone[] = [];
  const rest = new Map<string, Vector3>();
  const indexByName = new Map<string, number>();
  const boneByName = new Map<string, Bone>();

  for (const spec of joints) {
    const position = new Vector3(spec.position[0], spec.position[1], spec.position[2]);
    const bone = new Bone();
    bone.name = spec.name;
    rest.set(spec.name, position);
    if (spec.parent === null) {
      bone.position.copy(position);
    } else {
      const parentRest = rest.get(spec.parent);
      const parentBone = boneByName.get(spec.parent);
      if (!parentRest || !parentBone) {
        throw new Error(`joint "${spec.name}" references unknown parent "${spec.parent}"`);
      }
      // Local offset keeps every bone's rotation identity in the rest pose.
      bone.position.copy(position).sub(parentRest);
      parentBone.add(bone);
    }
    if (indexByName.has(spec.name)) throw new Error(`duplicate joint "${spec.name}"`);
    indexByName.set(spec.name, bones.length);
    boneByName.set(spec.name, bone);
    bones.push(bone);
  }

  const root = bones[0];
  if (!root) throw new Error('armature needs at least one joint');
  if (joints[0]?.parent !== null) throw new Error('the first joint must be the root');

  const skeleton = new Skeleton(bones);

  return {
    root,
    bones,
    skeleton,
    byName(name: string): Bone {
      const bone = boneByName.get(name);
      if (!bone) throw new Error(`unknown joint "${name}"`);
      return bone;
    },
    indexOf(name: string): number {
      const index = indexByName.get(name);
      if (index === undefined) throw new Error(`unknown joint "${name}"`);
      return index;
    },
    restPosition(name: string): Vector3 {
      const value = rest.get(name);
      if (!value) throw new Error(`unknown joint "${name}"`);
      return value.clone();
    },
  };
}

/** One keyframe of a bone rotation, in radians around the local (world-aligned) axes. */
export interface RotationKey {
  /** Seconds from the clip start. */
  readonly time: number;
  readonly euler: readonly [number, number, number];
}

/** Builds a quaternion track for a bone; `euler` uses XYZ order. */
export function rotationTrack(boneName: string, keys: readonly RotationKey[]): QuaternionKeyframeTrack {
  const times: number[] = [];
  const values: number[] = [];
  const euler = new Euler();
  const quaternion = new Quaternion();
  for (const key of keys) {
    times.push(key.time);
    euler.set(key.euler[0], key.euler[1], key.euler[2], 'XYZ');
    quaternion.setFromEuler(euler);
    values.push(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
  }
  return new QuaternionKeyframeTrack(`${boneName}.quaternion`, times, values);
}

/** Translation track (root bob, crouches); values are model-space offsets. */
export function positionTrack(
  boneName: string,
  keys: readonly { readonly time: number; readonly value: readonly [number, number, number] }[],
): VectorKeyframeTrack {
  const times: number[] = [];
  const values: number[] = [];
  for (const key of keys) {
    times.push(key.time);
    values.push(key.value[0], key.value[1], key.value[2]);
  }
  return new VectorKeyframeTrack(`${boneName}.position`, times, values);
}

/** Assembles a clip from tracks and normalises its duration. */
export function makeClip(name: string, tracks: AnimationClip['tracks'], duration: number): AnimationClip {
  const clip = new AnimationClip(name, duration, [...tracks]);
  clip.resetDuration();
  return clip;
}

/** Mirrors a rotation key so left/right limbs stay in sync (X flips, Y/Z mirror). */
export function mirrored(keys: readonly RotationKey[], offset = 0): RotationKey[] {
  return keys.map((key) => ({
    time: key.time + offset,
    euler: [key.euler[0], -key.euler[1], -key.euler[2]] as const,
  }));
}

/** Shifts every key of a track by `offset` seconds (for phase-offset pairs). */
export function shifted(keys: readonly RotationKey[], offset: number): RotationKey[] {
  return keys.map((key) => ({ time: key.time + offset, euler: key.euler }));
}
