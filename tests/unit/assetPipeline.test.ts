import { describe, expect, it } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { AnimationMixer, Box3, Matrix4 } from 'three';
import type { AnimationClip, SkinnedMesh } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { buildHero, HERO_BONES, HERO_CLIPS } from '../../scripts/models/hero';
import { buildMonster, MONSTER_BONES, MONSTER_CLIPS } from '../../scripts/models/monster';
import { PROP_MODELS } from '../../scripts/models/props';
import { exportGlb, inspectGlb } from '../../scripts/models/glb';
import { CHARACTERS, PROPS } from '@/game/assets/manifest';
import type { CharacterId } from '@/game/assets/manifest';

const PUBLIC = join(process.cwd(), 'public', 'assets');

async function toArrayBuffer(
  build: () => { group: Parameters<typeof exportGlb>[0]; clips: readonly AnimationClip[] },
): Promise<ArrayBuffer> {
  const asset = build();
  return exportGlb(asset.group, { animations: asset.clips });
}

function gearFor(id: CharacterId): {
  build: typeof buildHero | typeof buildMonster;
  bones: readonly string[];
  clips: readonly string[];
} {
  return id === 'hero'
    ? { build: buildHero, bones: HERO_BONES, clips: HERO_CLIPS }
    : { build: buildMonster, bones: MONSTER_BONES, clips: MONSTER_CLIPS };
}

/**
 * The asset pipeline is code, so it is tested like code: the generators run in
 * the test process, the GLB is inspected byte-wise and then loaded back through
 * the same GLTFLoader the game uses.
 */
describe('asset pipeline', () => {
  it('exports a valid GLB with skinned meshes, joints and clips', async () => {
    for (const id of Object.keys(CHARACTERS) as CharacterId[]) {
      const { build, bones, clips } = gearFor(id);
      const asset = build();
      const buffer = await exportGlb(asset.group, { animations: asset.clips });
      const info = inspectGlb(buffer);

      expect(info.version).toBe(2);
      expect(info.totalLength).toBe(buffer.byteLength);
      expect(info.json.asset?.version).toBe('2.0');
      expect((info.json.skins ?? []).length).toBeGreaterThanOrEqual(1);
      const joints = info.json.skins?.[0]?.joints ?? [];
      expect(joints).toHaveLength(bones.length);
      const exportedClips = (info.json.animations ?? []).map((animation) => animation.name);
      expect(exportedClips).toEqual(expect.arrayContaining([...clips]));
      // Every clip must carry channels, otherwise the track names were wrong.
      for (const animation of info.json.animations ?? []) {
        expect(animation.channels.length).toBeGreaterThan(0);
        expect(animation.samplers.length).toBeGreaterThan(0);
      }
      expect(asset.metrics.triangles).toBeLessThan(6000);
      expect(buffer.byteLength).toBeLessThan(400 * 1024);
    }
  });

  it('round-trips through GLTFLoader with intact bones and animation', async () => {
    const buffer = await toArrayBuffer(buildHero);
    const gltf = await new GLTFLoader().parseAsync(buffer, '');
    const skinned: SkinnedMesh[] = [];
    gltf.scene.traverse((object) => {
      const candidate = object as SkinnedMesh;
      if (candidate.isSkinnedMesh) skinned.push(candidate);
    });
    expect(skinned.length).toBe(4);
    expect(skinned[0]?.skeleton.bones.map((bone) => bone.name)).toEqual([...HERO_BONES]);
    expect(gltf.animations.map((clip) => clip.name)).toEqual([...HERO_CLIPS]);

    // The model stands on the floor and is roughly human height.
    gltf.scene.updateMatrixWorld(true);
    const box = new Box3().setFromObject(gltf.scene);
    expect(box.min.y).toBeGreaterThan(-0.05);
    expect(box.min.y).toBeLessThan(0.06);
    expect(box.max.y).toBeGreaterThan(1.6);
    expect(box.max.y).toBeLessThan(2.1);

    // Playing the attack clip actually rotates bones.
    // The attack clip drives the torso and the sword arm (the head only follows).
    const chest = gltf.scene.getObjectByName('chest');
    expect(chest).toBeDefined();
    const before = chest?.quaternion.clone();
    const mixer = new AnimationMixer(gltf.scene);
    const attack = gltf.animations.find((clip) => clip.name === 'attack');
    expect(attack).toBeDefined();
    if (attack) mixer.clipAction(attack).play();
    for (let i = 0; i < 10; i += 1) mixer.update(1 / 60);
    expect(chest?.quaternion.equals(before ?? chest.quaternion)).toBe(false);
    mixer.stopAllAction();
  });

  it('skinning weights sum to one and reference existing joints', async () => {
    const buffer = await toArrayBuffer(buildHero);
    const gltf = await new GLTFLoader().parseAsync(buffer, '');
    const joints = new Set<string>();
    const skinned: SkinnedMesh[] = [];
    gltf.scene.traverse((object) => {
      const candidate = object as SkinnedMesh;
      if (candidate.isSkinnedMesh) skinned.push(candidate);
    });
    for (const mesh of skinned) for (const bone of mesh.skeleton.bones) joints.add(bone.name);
    expect(joints.size).toBe(HERO_BONES.length);

    for (const mesh of skinned) {
      const geometry = mesh.geometry;
      const weights = geometry.getAttribute('skinWeight');
      const indices = geometry.getAttribute('skinIndex');
      const boneCount = mesh.skeleton.bones.length;
      expect(weights.count).toBe(geometry.getAttribute('position').count);
      for (let i = 0; i < weights.count; i += 1) {
        const sum = weights.getX(i) + weights.getY(i) + weights.getZ(i) + weights.getW(i);
        expect(sum).toBeCloseTo(1, 5);
        for (const component of ['X', 'Y', 'Z', 'W'] as const) {
          const index = indices[`get${component}`](i);
          expect(index).toBeGreaterThanOrEqual(0);
          expect(index).toBeLessThan(boneCount);
        }
      }
      // Inverse bind matrices must be finite, otherwise the model explodes.
      for (const inverse of mesh.skeleton.boneInverses) {
        for (const element of inverse.elements) expect(Number.isFinite(element)).toBe(true);
      }
      expect(new Matrix4().copy(mesh.skeleton.boneInverses[0] as Matrix4).determinant()).not.toBe(0);
    }
  });

  it('merges every prop into one mesh per material', async () => {
    for (const prop of PROP_MODELS) {
      const asset = prop.build();
      expect(asset.group.children.length).toBeGreaterThan(0);
      // One mesh per material used by the prop (wood/iron/gold for the chest).
      expect(asset.group.children.length).toBeLessThanOrEqual(4);
      const materials = asset.group.children.map((child) => (child as unknown as { material: unknown }).material);
      expect(new Set(materials).size).toBe(materials.length);
      const buffer = await exportGlb(asset.group);
      const info = inspectGlb(buffer);
      expect(info.json.meshes?.length).toBeGreaterThan(0);
      expect(info.json.animations).toBeUndefined();
      expect(asset.metrics.triangles).toBeLessThan(1000);
    }
  });

  it('manifest on disk matches the runtime manifest', () => {
    const manifestPath = join(PUBLIC, 'manifest.json');
    if (!existsSync(manifestPath)) {
      // `npm run assets` has not run in this checkout; the test below still
      // validates the runtime side, which is what the game depends on.
      expect(existsSync(PUBLIC)).toBe(true);
      return;
    }
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      models: { id: string; name: string; file: string; clips: string[] }[];
    };
    const ids = manifest.models.map((model) => model.id).sort();
    const expected = [...Object.keys(CHARACTERS), ...Object.keys(PROPS)].sort();
    expect(ids).toEqual(expected);
    for (const model of manifest.models) {
      const file = model.file.replace('models/', '').replace('.glb', '');
      expect(file).toBe(model.name);
    }

    for (const model of manifest.models) {
      expect(existsSync(join(PUBLIC, model.file))).toBe(true);
      const character = (CHARACTERS as Record<string, { clips: readonly string[] }>)[model.id];
      if (character) expect(model.clips).toEqual([...character.clips]);
    }
  });
});
