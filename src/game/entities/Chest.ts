import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import type { Object3D } from 'three';

export interface ChestOptions {
  readonly id: number;
  /** Generated GLB chest; a procedural box is used when assets are missing. */
  readonly model: Object3D | null;
  readonly position: { readonly x: number; readonly z: number };
  readonly rotationY?: number;
}

const OPEN_SECONDS = 0.45;

/**
 * An interactable treasure chest.
 *
 * The prop is a static generated model, so "opening" is expressed by motion
 * rather than by a lid bone: the chest kicks back, punches in scale, and its
 * cargo is announced by the scene (gold popup, sparks, HUD toast). A procedural
 * fallback keeps the interaction testable without the asset pipeline.
 */
export class Chest {
  readonly id: number;
  readonly group = new Group();
  readonly position: { x: number; z: number };
  private openedFlag = false;
  private elapsed = 0;
  private readonly baseY: number;
  private readonly fallbackMaterial: MeshStandardMaterial | null;
  private readonly fallbackGeometries: BoxGeometry[] = [];

  constructor(options: ChestOptions) {
    this.id = options.id;
    this.position = options.position;
    this.group.name = `chest-${options.id}`;
    this.group.position.set(options.position.x, 0, options.position.z);
    this.group.rotation.y = options.rotationY ?? 0;

    if (options.model) {
      this.group.add(options.model);
      this.fallbackMaterial = null;
    } else {
      const material = new MeshStandardMaterial({ color: 0x6b4a2a, roughness: 0.8, metalness: 0.1 });
      const bodyGeometry = new BoxGeometry(0.78, 0.42, 0.52);
      const lidGeometry = new BoxGeometry(0.78, 0.16, 0.52);
      const body = new Mesh(bodyGeometry, material);
      body.position.y = 0.21;
      const lid = new Mesh(lidGeometry, material);
      lid.position.set(0, 0.5, -0.04);
      lid.rotation.x = -0.26;
      lid.name = 'lid';
      this.group.add(body, lid);
      this.fallbackGeometries.push(bodyGeometry, lidGeometry);
      this.fallbackMaterial = material;
    }
    this.baseY = this.group.position.y;
  }

  get isOpen(): boolean {
    return this.openedFlag;
  }

  /** @returns true only on the first call, so loot is granted exactly once */
  open(): boolean {
    if (this.openedFlag) return false;
    this.openedFlag = true;
    this.elapsed = 0;
    return true;
  }

  /** Scales the fallback lid open; harmless on the merged GLB prop. */
  update(dt: number): void {
    if (!this.openedFlag) return;
    this.elapsed += dt;
    const t = Math.min(1, this.elapsed / OPEN_SECONDS);
    // Ease-out punch that settles slightly back from the peak.
    const punch = Math.sin(t * Math.PI) * 0.12;
    const scale = 1 + punch;
    this.group.scale.setScalar(scale);
    this.group.rotation.x = -0.12 * Math.sin(t * Math.PI);
    this.group.position.y = this.baseY;

    const lid = this.group.getObjectByName('lid');
    if (lid) lid.rotation.x = -0.26 - t * 1.05;
  }

  dispose(): void {
    // GLB clones share geometry/materials with the asset cache, so only the
    // procedural fallback owns resources it is allowed to free.
    for (const geometry of this.fallbackGeometries) geometry.dispose();
    this.fallbackMaterial?.dispose();
    this.fallbackGeometries.length = 0;
    this.group.removeFromParent();
  }
}
