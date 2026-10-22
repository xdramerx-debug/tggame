import type { AnimationClip, Group, LoadingManager, Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { CHARACTERS, PROPS, assetUrl } from './manifest';
import type { CharacterId, PropId } from './manifest';

export interface LoadedCharacter {
  readonly scene: Group;
  readonly animations: readonly AnimationClip[];
}

export interface LoadProgress {
  readonly loaded: number;
  readonly total: number;
  readonly label: string;
}

/**
 * Fetches and caches the generated GLB assets.
 *
 * GLTFLoader is used instead of hand-rolled parsing so skinning, clips and
 * material conversion come from three itself. Assets are cached by id and cloned
 * with `SkeletonUtils.clone` on demand — a skinned mesh must be cloned with its
 * bone hierarchy, which a plain `Object3D.clone()` does not do.
 *
 * Loading is sequential with a progress callback: on a 3G Telegram WebView,
 * flooding the network with six parallel GLB requests delays the first usable
 * frame instead of helping it.
 */
export class AssetLoader {
  private readonly gltfLoader: GLTFLoader;
  private readonly characters = new Map<CharacterId, LoadedCharacter>();
  private readonly props = new Map<PropId, Group>();

  constructor(manager?: LoadingManager) {
    this.gltfLoader = new GLTFLoader(manager);
  }

  get isLoaded(): boolean {
    return this.characters.size === Object.keys(CHARACTERS).length;
  }

  /**
   * Loads the characters the run needs (hero + first monsters) and reports
   * progress in the splash stage.
   */
  async preloadRun(onProgress?: (progress: LoadProgress) => void): Promise<void> {
    const ids = Object.keys(CHARACTERS) as CharacterId[];
    let loaded = 0;
    for (const id of ids) {
      onProgress?.({ loaded, total: ids.length, label: id });
      await this.loadCharacter(id);
      loaded += 1;
      onProgress?.({ loaded, total: ids.length, label: id });
    }
  }

  async loadCharacter(id: CharacterId): Promise<LoadedCharacter> {
    const cached = this.characters.get(id);
    if (cached) return cached;
    const spec = CHARACTERS[id];
    const gltf = await this.gltfLoader.loadAsync(assetUrl(spec.file));
    // Scene root of the export is a group named after the character; keep it so
    // the runtime can scale/position one node instead of every mesh.
    const scene = gltf.scene;
    scene.name = id;
    const result: LoadedCharacter = { scene, animations: gltf.animations };
    this.characters.set(id, result);
    return result;
  }

  async loadProp(id: PropId): Promise<Group> {
    const cached = this.props.get(id);
    if (cached) return cached;
    const gltf = await this.gltfLoader.loadAsync(assetUrl(PROPS[id]));
    const group = gltf.scene;
    group.name = id;
    group.traverse((object) => {
      object.castShadow = true;
      object.receiveShadow = true;
    });
    this.props.set(id, group);
    return group;
  }

  /** Instance of a cached character; each instance owns its own skeleton copy. */
  cloneCharacter(id: CharacterId): LoadedCharacter | null {
    const cached = this.characters.get(id);
    if (!cached) return null;
    return { scene: cloneSkinned(cached.scene) as Group, animations: cached.animations };
  }

  /** Instance of a cached prop (plain clone is enough: no skinning). */
  cloneProp(id: PropId): Object3D | null {
    const cached = this.props.get(id);
    return cached ? cached.clone(true) : null;
  }

  dispose(): void {
    for (const character of this.characters.values()) disposeTree(character.scene);
    for (const prop of this.props.values()) disposeTree(prop);
    this.characters.clear();
    this.props.clear();
  }
}

/** Disposes geometries and materials of a subtree (textures are shared/cached). */
export function disposeTree(root: Object3D): void {
  root.traverse((object) => {
    const mesh = object as unknown as { geometry?: { dispose(): void }; material?: unknown };
    mesh.geometry?.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) {
      for (const entry of material) disposeMaterial(entry);
    } else {
      disposeMaterial(material);
    }
  });
}

function disposeMaterial(material: unknown): void {
  if (typeof material !== 'object' || material === null) return;
  const disposable = material as { dispose?: () => void };
  disposable.dispose?.();
}
