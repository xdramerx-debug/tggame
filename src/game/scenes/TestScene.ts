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
import type { DebugSceneSnapshot, GameScene, MoveCommand } from '@/types/scene';
import type { InputAction, InteractionHint } from '@/input/types';
import { directionToYaw, shortestAngleDelta } from '@/input/movement';
import { createStoneTextures } from '@/game/visual/textures/proceduralTextures';

interface Crystal {
  readonly mesh: Mesh;
  readonly baseScale: number;
  readonly phase: number;
  collected: boolean;
}

const WALK_SPEED = 2.9;
const DASH_SPEED = 9.5;
const DASH_DURATION = 0.18;
const ARENA_RADIUS = 11.5;
const INTERACT_RANGE = 2.4;
const ATTACK_DURATION = 0.28;

/**
 * Stage-2 playground: the lit stone arena plus a kinematically driven hero.
 *
 * Rapier arrives in stage 3 and replaces the manual locomotion below; everything
 * else (input contract, attack/dodge/interact hooks, debug snapshot) is already
 * the final shape so the migration is contained in this file.
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
  private readonly blade: Mesh;
  private readonly crystals: Crystal[] = [];
  private readonly pointerLights: PointLight[] = [];

  private move: MoveCommand = { x: 0, z: 0, magnitude: 0 };
  private lastDirection = { x: 0, z: -1 };
  private facing = 0;
  private dashRemaining = 0;
  private dashDirection = { x: 0, z: -1 };
  private attackRemaining = 0;
  private attacks = 0;
  private collected = 0;

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
    crystalPositions.forEach(([x, y, z], index) => {
      const crystal = new Mesh(crystalGeometry, crystalMaterial);
      crystal.position.set(x, y, z);
      crystal.rotation.z = 0.08;
      this.root.add(crystal);
      this.crystals.push({ mesh: crystal, baseScale: 1, phase: index * 1.3, collected: false });
    });

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
      this.pointerLights.push(light);
    }

    // --- Hero (placeholder until the rigged player arrives in stage 5) --
    this.hero = new Group();
    const heroMaterial = new MeshStandardMaterial({ color: 0x4a7c8c, roughness: 0.55, metalness: 0.25 });
    const bodyGeometry = new CapsuleGeometry(0.35, 0.9, 4, 10);
    const headGeometry = new SphereGeometry(0.24, 12, 8);
    this.disposables.push(bodyGeometry, headGeometry, heroMaterial);
    const body = new Mesh(bodyGeometry, heroMaterial);
    body.position.y = 0.85;
    body.castShadow = true;
    const head = new Mesh(headGeometry, heroMaterial);
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
    this.blade = new Mesh(bladeGeometry, bladeMaterial);
    this.blade.position.set(0.42, 1.05, 0);
    this.blade.rotation.z = 0.28;
    this.blade.castShadow = true;
    this.hero.add(body, head, this.blade);
    this.hero.position.set(0, 0, 2);
    this.root.add(this.hero);
    this.facing = Math.PI;
    this.hero.rotation.y = this.facing;
  }

  applyQuality(preset: QualityPreset): void {
    const size = preset.shadowMapSize || 512;
    this.sun.castShadow = preset.shadowMapSize > 0;
    if (this.sun.shadow.mapSize.width !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    const active = Math.min(this.pointerLights.length, preset.maxPointLights);
    this.pointerLights.forEach((light, index) => {
      light.visible = index < active;
    });
  }

  setMoveInput(command: MoveCommand): void {
    this.move = command;
    if (command.magnitude > 0) this.lastDirection = { x: command.x, z: command.z };
  }

  triggerAction(action: InputAction): void {
    switch (action) {
      case 'attack':
        this.attacks += 1;
        this.attackRemaining = ATTACK_DURATION;
        break;
      case 'dodge':
        this.startDash();
        break;
      case 'interact':
        this.collectNearestCrystal();
        break;
      case 'skill1':
      case 'skill2':
        // Skills arrive with the combat system (stage 6); the button already
        // plays its cooldown and haptic so the input contract is validated.
        break;
      default:
        break;
    }
  }

  getInteractionHint(): InteractionHint | null {
    const nearest = this.nearestCrystal();
    if (!nearest) return null;
    return { available: true, label: 'Собрать эссенцию' };
  }

  getDebugSnapshot(): DebugSceneSnapshot {
    return {
      hero: { x: this.hero.position.x, y: this.hero.position.y, z: this.hero.position.z },
      attacks: this.attacks,
      dodging: this.dashRemaining > 0,
      collected: this.collected,
      canInteract: this.nearestCrystal() !== null,
    };
  }

  update(dt: number, elapsed: number): void {
    this.applyLocomotion(dt);
    this.animateHero(dt, elapsed);
    this.animateCrystals(elapsed);

    for (const torch of this.torches) {
      const flicker = Math.sin(elapsed * 11 + torch.phase) * 0.16 + Math.sin(elapsed * 23 + torch.phase * 2) * 0.08;
      torch.light.intensity = torch.base * (1 + flicker);
    }

    this.sun.target.position.set(this.hero.position.x, 0, this.hero.position.z);
    this.followTarget.set(this.hero.position.x, 1.05, this.hero.position.z);
  }

  dispose(): void {
    for (const item of this.disposables) item.dispose();
    this.textures.dispose();
    this.root.clear();
  }

  // ---------------------------------------------------------------- internals

  private applyLocomotion(dt: number): void {
    let dx = 0;
    let dz = 0;

    if (this.dashRemaining > 0) {
      dx = this.dashDirection.x * DASH_SPEED * dt;
      dz = this.dashDirection.z * DASH_SPEED * dt;
      this.dashRemaining = Math.max(0, this.dashRemaining - dt);
    } else if (this.move.magnitude > 0.01) {
      const speed = WALK_SPEED * this.move.magnitude;
      dx = this.move.x * speed * dt;
      dz = this.move.z * speed * dt;
    }

    if (dx !== 0 || dz !== 0) {
      const nextX = this.hero.position.x + dx;
      const nextZ = this.hero.position.z + dz;
      const distance = Math.hypot(nextX, nextZ);
      // Keep the hero inside the pillar ring; Rapier will handle walls later.
      if (distance <= ARENA_RADIUS) {
        this.hero.position.x = nextX;
        this.hero.position.z = nextZ;
      } else {
        const k = ARENA_RADIUS / (distance || 1);
        this.hero.position.x = nextX * k;
        this.hero.position.z = nextZ * k;
      }

      const direction = this.dashRemaining > 0 ? this.dashDirection : { x: dx, z: dz };
      const targetYaw = directionToYaw({ x: direction.x, y: direction.z });
      this.facing += shortestAngleDelta(this.facing, targetYaw) * Math.min(1, dt * 14);
    }
    this.hero.rotation.y = this.facing;
  }

  private animateHero(dt: number, elapsed: number): void {
    const moving = this.move.magnitude > 0 || this.dashRemaining > 0;
    const bob = Math.sin(elapsed * (moving ? 9 : 2.2)) * (moving ? 0.05 : 0.015);
    this.hero.position.y = Math.max(0, bob);

    if (this.attackRemaining > 0) {
      this.attackRemaining = Math.max(0, this.attackRemaining - dt);
      const progress = 1 - this.attackRemaining / ATTACK_DURATION;
      this.blade.rotation.z = 0.28 - Math.sin(progress * Math.PI) * 1.9;
    } else {
      this.blade.rotation.z += (0.28 - this.blade.rotation.z) * Math.min(1, dt * 12);
    }
  }

  private animateCrystals(elapsed: number): void {
    for (const crystal of this.crystals) {
      if (crystal.collected) {
        crystal.mesh.visible = false;
        continue;
      }
      const pulse = 1 + Math.sin(elapsed * 2.1 + crystal.phase) * 0.06;
      crystal.mesh.scale.setScalar(crystal.baseScale * pulse);
      crystal.mesh.rotation.y = elapsed * 0.4 + crystal.phase;
    }
  }

  private startDash(): void {
    if (this.dashRemaining > 0) return;
    const hasInput = this.move.magnitude > 0.01;
    this.dashDirection = hasInput
      ? { x: this.move.x, z: this.move.z }
      : this.lastDirection;
    this.dashRemaining = DASH_DURATION;
  }

  private nearestCrystal(): Crystal | null {
    let best: Crystal | null = null;
    let bestDistance = INTERACT_RANGE;
    for (const crystal of this.crystals) {
      if (crystal.collected) continue;
      const distance = Math.hypot(
        crystal.mesh.position.x - this.hero.position.x,
        crystal.mesh.position.z - this.hero.position.z,
      );
      if (distance <= bestDistance) {
        best = crystal;
        bestDistance = distance;
      }
    }
    return best;
  }

  private collectNearestCrystal(): void {
    const crystal = this.nearestCrystal();
    if (!crystal) return;
    crystal.collected = true;
    this.collected += 1;
  }
}
