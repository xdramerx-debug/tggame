import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  Quaternion,
  SkinnedMesh,
  SphereGeometry,
  Uint16BufferAttribute,
  Vector3,
} from 'three';
import type { MeshStandardMaterial } from 'three';
import type { Armature } from './rig';

/** Weight blend band (metres) around a proximal joint. */
const BLEND_DISTANCE = 0.09;

interface Part {
  readonly geometry: BufferGeometry;
  readonly bone: string;
  /** Parent bone blended in near `blendCentre` (smooth joint). */
  readonly parentBone?: string;
  readonly blendCentre?: Vector3;
}

/**
 * Collects rigid body parts in rest-pose model space and bakes them into one
 * skinned geometry per material.
 *
 * Deliberately not smooth-skinned: each plate/limb is rigidly weighted to one
 * bone with a narrow blend band at the joint. That is how stylised armour reads,
 * keeps the model at a few thousand triangles, and makes the skinning data
 * trivial to verify in tests (weights sum to 1 everywhere).
 */
export class SkinBuilder {
  private readonly parts: Part[] = [];

  /** Axis-aligned box; `rotation` (XYZ radians) is applied around the centre. */
  addBox(
    centre: readonly [number, number, number],
    size: readonly [number, number, number],
    bone: string,
    rotation?: readonly [number, number, number],
  ): this {
    const geometry = new BoxGeometry(size[0], size[1], size[2]);
    if (rotation) {
      const quaternion = new Quaternion().setFromEuler(new Euler(rotation[0], rotation[1], rotation[2], 'XYZ'));
      geometry.applyQuaternion(quaternion);
    }
    geometry.translate(centre[0], centre[1], centre[2]);
    this.parts.push({ geometry, bone });
    return this;
  }

  addSphere(
    centre: readonly [number, number, number],
    radius: number,
    bone: string,
    scale?: readonly [number, number, number],
  ): this {
    const geometry = new SphereGeometry(radius, 10, 8);
    if (scale) geometry.scale(scale[0], scale[1], scale[2]);
    geometry.translate(centre[0], centre[1], centre[2]);
    this.parts.push({ geometry, bone });
    return this;
  }

  /**
   * Tapered tube from one joint to another (limbs, blades, ribs).
   * Vertices near `from` blend into `parentBone`, removing the visible crack when
   * the joint bends.
   */
  addLimb(
    from: readonly [number, number, number],
    to: readonly [number, number, number],
    radiusFrom: number,
    radiusTo: number,
    bone: string,
    parentBone?: string,
    radialSegments = 8,
  ): this {
    const start = new Vector3(from[0], from[1], from[2]);
    const end = new Vector3(to[0], to[1], to[2]);
    const direction = new Vector3().subVectors(end, start);
    const length = direction.length();
    if (length < 1e-5) throw new Error(`degenerate limb for bone "${bone}"`);

    // Cylinder is built along +Y, centred on its origin.
    const geometry = new CylinderGeometry(radiusTo, radiusFrom, length, radialSegments, 1, false);
    const align = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), direction.clone().normalize());
    geometry.applyQuaternion(align);
    geometry.translate((start.x + end.x) / 2, (start.y + end.y) / 2, (start.z + end.z) / 2);
    this.parts.push({
      geometry,
      bone,
      ...(parentBone ? { parentBone, blendCentre: start } : {}),
    });
    return this;
  }

  /** Triangle count collected so far (asset budget checks). */
  get triangles(): number {
    return this.parts.reduce((sum, part) => {
      const index = part.geometry.getIndex();
      const count = index ? index.count : part.geometry.getAttribute('position').count;
      return sum + count / 3;
    }, 0);
  }

  /**
   * Bakes every part into a single skinned mesh weighted to `armature`.
   * The armature must still be in its rest pose.
   */
  build(armature: Armature, material: MeshStandardMaterial, name: string): SkinnedMesh {
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const skinIndices: number[] = [];
    const skinWeights: number[] = [];
    const indices: number[] = [];

    for (const part of this.parts) {
      const source = part.geometry;
      const positionAttr = source.getAttribute('position');
      const normalAttr = source.getAttribute('normal');
      const uvAttr = source.getAttribute('uv');
      const index = source.getIndex();
      const base = positions.length / 3;
      const primary = armature.indexOf(part.bone);
      const secondary = part.parentBone ? armature.indexOf(part.parentBone) : primary;

      for (let i = 0; i < positionAttr.count; i += 1) {
        const x = positionAttr.getX(i);
        const y = positionAttr.getY(i);
        const z = positionAttr.getZ(i);
        positions.push(x, y, z);
        normals.push(
          normalAttr ? normalAttr.getX(i) : 0,
          normalAttr ? normalAttr.getY(i) : 1,
          normalAttr ? normalAttr.getZ(i) : 0,
        );
        uvs.push(uvAttr ? uvAttr.getX(i) : 0, uvAttr ? uvAttr.getY(i) : 0);

        let secondaryWeight = 0;
        if (part.parentBone && part.blendCentre) {
          const distance = part.blendCentre.distanceTo(new Vector3(x, y, z));
          secondaryWeight = Math.max(0, Math.min(1, (BLEND_DISTANCE - distance) / BLEND_DISTANCE)) * 0.5;
        }
        skinIndices.push(primary, secondary, 0, 0);
        skinWeights.push(1 - secondaryWeight, secondaryWeight, 0, 0);
      }

      if (index) {
        for (let i = 0; i < index.count; i += 1) indices.push(base + (index.getX(i) ?? 0));
      } else {
        for (let i = 0; i < positionAttr.count; i += 1) indices.push(base + i);
      }
      source.dispose();
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('skinIndex', new Uint16BufferAttribute(skinIndices, 4));
    geometry.setAttribute('skinWeight', new Float32BufferAttribute(skinWeights, 4));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();

    const mesh = new SkinnedMesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.add(armature.root);
    mesh.bind(armature.skeleton);

    return mesh;
  }
}
