import {
  BoxGeometry,
  CapsuleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  FogExp2,
  Group,
  HemisphereLight,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  PointLight,
  Scene,
  SphereGeometry,
  Vector3,
} from 'three';
import type { Object3D } from 'three';
import type { QualityPreset } from '@/types/engine';
import type { GameScene } from '@/types/scene';
import { createStoneTextures } from '@/game/visual/textures/proceduralTextures';

/**
 * Stage-1 validation scene: a lit stone arena that exercises PBR materials,
 * shadowed directional light, emissive props, flickering point lights, fog and
 * the post-processing chain. Replaced by the BSP dungeon in stage 4.
 *
 * Budget: < 10k tris, 4 draw calls for architecture (instanced pillars), 2 point lights.
 */
export class TestScene implements GameScene {
  readonly root = new Scene();
  readonly collisionObjects: Object3D[] = [];
  readonly followTarget = new Vector3(0, 1, 0);

  private readonly textures = createStoneTextures({ size: 256, seed: 2024, repeat: 4 });
  private readonly disposables: { dispose(): void }[] = [];
  private readonly sun: DirectionalLight;
  private readonly torches: { light: PointLight; base: number; phase: number }[] = [];
  private readonly hero: Group;
  private readonly heroMaterial: MeshStandardMaterial;

  constructor() {
    this.root.background = new Color(0x0b0e14);
    this.root.fog = new FogExp2(0x0b0e14, 0.04);

    // --- Lighting -------------------------------------------------------
    const hemi = new HemisphereLight(0x4a7c8c, 0x0b0e14, 0.55);
    this.root.add(hemi);

    this.sun = new DirectionalLight(0x9fb4d8, 1.8);
    this.sun.position.set(6, 11, 5);
    this.sun.castShadow = true;
    this.sun.shadow.camera.near = 0.5;
    this.sun.shadow.camera.far = 44;
    this.sun.shadow.camera.left = -14;
    this.sun.shadow.camera.right = 14;
    this.sun.shadow.camera.top = 14;
    this.sun.shadow.camera.bottom = -14;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.02;
    this.root.add(this.sun);
    this.root.add(this.sun.target);

    // --- Architecture ---------------------------------------------------
    const floorMaterial = new MeshStandardMaterial({
      map: this.textures.map,
      normalMap: this.textures.normalMap,
      roughnessMap: this.textures.roughnessMap,
      roughness: 1,
      metalness: 0.05,
    });
    const wallMaterial = new MeshStandardMaterial({
      map: this.textures.map,
      normalMap: this.textures.normalMap,
      roughness: 0.96,
      metalness: 0.04,
      color: 0x9aa3ae,
    });
    this.disposables.push(floorMaterial, wallMaterial);

    const floorGeometry = new PlaneGeometry(34, 34, 1, 1);
    this.disposables.push(floorGeometry);
    const floor = new Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.root.add(floor);

    // Perimeter walls (4 meshes, shadow receivers only).
    const wallGeometry = new BoxGeometry(34, 5, 0.8);
    this.disposables.push(wallGeometry);
    const wallPlacements: { pos: [number, number, number]; rotY: number }[] = [
      { pos: [0, 2.5, -17], rotY: 0 },
      { pos: [0, 2.5, 17], rotY: 0 },
      { pos: [-17, 2.5, 0], rotY: Math.PI / 2 },
      { pos: [17, 2.5, 0], rotY: Math.PI / 2 },
    ];
    for (const placement of wallPlacements) {
      const wall = new Mesh(wallGeometry, wallMaterial);
      wall.position.set(...placement.pos);
      wall.rotation.y = placement.rotY;
      wall.castShadow = true;
      wall.receiveShadow = true;
      this.root.add(wall);
      this.collisionObjects.push(wall);
    }

    // Instanced pillars: one draw call for the whole ring.
    const pillarGeometry = new CylinderGeometry(0.55, 0.7, 4.4, 8);
    const pillarMaterial = new MeshStandardMaterial({
      map: this.textures.map,
      normalMap: this.textures.normalMap,
      roughness: 0.9,
      metalness: 0.06,
    });
    this.disposables.push(pillarGeometry, pillarMaterial);
    const pillarCount = 10;
    const pillars = new InstancedMesh(pillarGeometry, pillarMaterial, pillarCount);
    pillars.castShadow = true;
    pillars.receiveShadow = true;
    const matrix = new Matrix4();
    const radius = 9;
    for (let i = 0; i < pillarCount; i += 1) {
      const angle = (i / pillarCount) * Math.PI * 2;
      matrix.makeTranslation(Math.cos(angle) * radius, 2.2, Math.sin(angle) * radius);
      pillars.setMatrixAt(i, matrix);
    }
    pillars.instanceMatrix.needsUpdate = true;
    this.root.add(pillars);
    this.collisionObjects.push(pillars);
    // Coarse collision proxy: a low-poly ring keeps the camera probe cheap.
    const pillarProxy = new Mesh(new CylinderGeometry(radius + 0.4, radius + 0.4, 4.4, 12, 1, true), wallMaterial);
    pillarProxy.visible = false;
    this.root.add(pillarProxy);

    // --- Emissive crystals + torches -----------------------------------
    const crystalGeometry = new ConeGeometry(0.28, 1.1, 5);
    const crystalMaterial = new MeshStandardMaterial({
      color: 0xc9a227,
      emissive: new Color(0xc9a227),
      emissiveIntensity: 2.2,
      roughness: 0.35,
      metalness: 0.6,
    });
    this.disposables.push(crystalGeometry, crystalMaterial);
    const crystalPositions: [number, number, number][] = [
      [-6, 0.55, -6],
      [6, 0.55, -6],
      [-6, 0.55, 6],
      [6, 0.55, 6],
    ];
    for (const [x, y, z] of crystalPositions) {
      const crystal = new Mesh(crystalGeometry, crystalMaterial);
      crystal.position.set(x, y, z);
      crystal.rotation.z = 0.08;
      this.root.add(crystal);
    }

    const torchPositions: [number, number, number][] = [
      [-3.2, 2.4, -5],
      [3.2, 2.4, 5],
    ];
    for (const [x, y, z] of torchPositions) {
      const light = new PointLight(0xffa54a, 8, 9, 2);
      light.position.set(x, y, z);
      light.castShadow = false;
      this.root.add(light);
      this.torches.push({ light, base: 8, phase: Math.random() * Math.PI * 2 });
    }

    // --- Hero stand-in (replaced by the rigged player in stage 5) --------
    this.hero = new Group();
    this.heroMaterial = new MeshStandardMaterial({ color: 0x4a7c8c, roughness: 0.55, metalness: 0.25 });
    const bodyGeometry = new CapsuleGeometry(0.35, 0.9, 4, 10);
    const headGeometry = new SphereGeometry(0.24, 12, 8);
    this.disposables.push(bodyGeometry, headGeometry, this.heroMaterial);
    const body = new Mesh(bodyGeometry, this.heroMaterial);
    body.position.y = 0.85;
    body.castShadow = true;
    const head = new Mesh(headGeometry, this.heroMaterial);
    head.position.y = 1.6;
    head.castShadow = true;
    const bladeMaterial = new MeshStandardMaterial({
      color: 0xd6d6d6,
      metalness: 0.9,
      roughness: 0.25,
      emissive: 0x1b2a3a,
    });
    const bladeGeometry = new BoxGeometry(0.07, 1.1, 0.16);
    this.disposables.push(bladeMaterial, bladeGeometry);
    const blade = new Mesh(bladeGeometry, bladeMaterial);
    blade.position.set(0.42, 1.05, 0);
    blade.rotation.z = 0.28;
    blade.castShadow = true;
    this.hero.add(body, head, blade);
    this.hero.position.set(0, 0, 0);
    this.root.add(this.hero);
  }

  applyQuality(preset: QualityPreset): void {
    const size = preset.shadowMapSize || 512;
    this.sun.castShadow = preset.shadowMapSize > 0;
    if (this.sun.shadow.mapSize.width !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    // Point light budget from the preset (≤4 per spec; the test scene owns 2).
    const active = Math.min(this.torches.length, preset.maxPointLights);
    this.torches.forEach((torch, index) => {
      torch.light.visible = index < active;
    });
  }

  update(dt: number, elapsed: number): void {
    const angle = elapsed * 0.35;
    const x = Math.cos(angle) * 3.2;
    const z = Math.sin(angle) * 3.2;
    this.hero.position.set(x, 0, z);
    this.hero.rotation.y = -angle + Math.PI / 2;
    this.followTarget.set(x, 1.05, z);

    for (const torch of this.torches) {
      const flicker = Math.sin(elapsed * 11 + torch.phase) * 0.16 + Math.sin(elapsed * 23 + torch.phase * 2) * 0.08;
      torch.light.intensity = torch.base * (1 + flicker);
    }

    this.sun.target.position.copy(this.hero.position);
    void dt;
  }

  dispose(): void {
    // Every geometry/material/texture is registered at construction time, so
    // disposal is explicit and does not rely on traversal heuristics.
    for (const item of this.disposables) item.dispose();
    this.textures.dispose();
    this.root.clear();
  }
}
