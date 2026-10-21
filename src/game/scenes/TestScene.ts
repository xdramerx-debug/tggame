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
import type { Collider } from '@dimforge/rapier3d-compat';
import type { QualityPreset } from '@/types/engine';
import type { DebugSceneSnapshot, GameScene, MoveCommand } from '@/types/scene';
import type { InputAction, InteractionHint } from '@/input/types';
import { directionToYaw, shortestAngleDelta } from '@/input/movement';
import { createStoneTextures } from '@/game/visual/textures/proceduralTextures';
import { CharacterBody, PLAYER_CAPSULE, type PhysicsWorld } from '@/game/physics';
import { ACTION_SPECS } from '@/input/actions';
import { PhysicsDebugView } from '@/game/visual/PhysicsDebug';

interface Crystal {
  readonly mesh: Mesh;
  readonly baseScale: number;
  readonly phase: number;
  collected: boolean;
}

const WALK_SPEED = 3.4;
const DASH_SPEED = 11;
const DASH_DURATION = 0.18;
const GRAVITY = -18;
const INTERACT_RANGE = 2.4;
const ATTACK_DURATION = 0.28;

/** Pillars ring radius and count — shared by meshes and colliders. */
const PILLAR_RADIUS = 9;
const PILLAR_COUNT = 10;
const ARENA_HALF = 17;
const WALL_HEIGHT = 5;

/**
 * Stage-3 arena: the same stone hall, now with a Rapier world behind it.
 *
 * - Every wall, the floor and each pillar has a matching static collider.
 * - The hero is a kinematic capsule driven by Rapier's character controller
 *   (slide along walls, autostep, snap to ground), moved at a fixed 60 Hz.
 * - The camera boom raycasts against the physics world instead of Three meshes.
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
  private readonly player: CharacterBody;
  private readonly physicsDebug: PhysicsDebugView;

  private move: MoveCommand = { x: 0, z: 0, magnitude: 0 };
  private lastDirection = { x: 0, z: -1 };
  private facing = Math.PI;
  private verticalVelocity = 0;
  private dashRemaining = 0;
  private dashCooldownRemaining = 0;
  private dashDirection = { x: 0, z: -1 };
  private attackRemaining = 0;
  private attacks = 0;
  private collected = 0;

  constructor(private readonly physics: PhysicsWorld) {
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

    // --- Architecture (meshes + colliders) ------------------------------
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

    const floorGeometry = new PlaneGeometry(ARENA_HALF * 2, ARENA_HALF * 2, 1, 1);
    this.disposables.push(floorGeometry);
    const floor = new Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.root.add(floor);

    // Floor collider: a thin slab whose top surface is exactly y = 0.
    this.physics.addStaticBox(
      { x: 0, y: -0.25, z: 0 },
      { x: ARENA_HALF, y: 0.25, z: ARENA_HALF },
      0,
      0.9,
    );

    const wallGeometry = new BoxGeometry(ARENA_HALF * 2, WALL_HEIGHT, 0.8);
    this.disposables.push(wallGeometry);
    const wallPlacements: { pos: [number, number, number]; rotY: number }[] = [
      { pos: [0, WALL_HEIGHT / 2, -ARENA_HALF], rotY: 0 },
      { pos: [0, WALL_HEIGHT / 2, ARENA_HALF], rotY: 0 },
      { pos: [-ARENA_HALF, WALL_HEIGHT / 2, 0], rotY: Math.PI / 2 },
      { pos: [ARENA_HALF, WALL_HEIGHT / 2, 0], rotY: Math.PI / 2 },
    ];
    for (const placement of wallPlacements) {
      const wall = new Mesh(wallGeometry, wallMaterial);
      wall.position.set(...placement.pos);
      wall.rotation.y = placement.rotY;
      wall.castShadow = true;
      wall.receiveShadow = true;
      this.root.add(wall);
      this.collisionObjects.push(wall);
      this.physics.addStaticBox(
        { x: placement.pos[0], y: placement.pos[1], z: placement.pos[2] },
        { x: ARENA_HALF, y: WALL_HEIGHT / 2, z: 0.4 },
        placement.rotY,
      );
    }

    // Instanced pillars: one draw call for the ring, one collider per pillar.
    const pillarGeometry = new CylinderGeometry(0.55, 0.7, 4.4, 8);
    const pillarMaterial = new MeshStandardMaterial({
      map: this.textures.map,
      normalMap: this.textures.normalMap,
      roughness: 0.9,
      metalness: 0.06,
    });
    this.disposables.push(pillarGeometry, pillarMaterial);
    const pillars = new InstancedMesh(pillarGeometry, pillarMaterial, PILLAR_COUNT);
    pillars.castShadow = true;
    pillars.receiveShadow = true;
    const matrix = new Matrix4();
    for (let i = 0; i < PILLAR_COUNT; i += 1) {
      const angle = (i / PILLAR_COUNT) * Math.PI * 2;
      const x = Math.cos(angle) * PILLAR_RADIUS;
      const z = Math.sin(angle) * PILLAR_RADIUS;
      matrix.makeTranslation(x, 2.2, z);
      pillars.setMatrixAt(i, matrix);
      // Slightly wider than the visual cone so the capsule never clips visually.
      this.physics.addStaticCylinder({ x, y: 2.2, z }, 2.2, 0.68);
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
    const bodyGeometry = new CapsuleGeometry(PLAYER_CAPSULE.radius, PLAYER_CAPSULE.halfHeight * 2, 4, 10);
    const headGeometry = new SphereGeometry(0.24, 12, 8);
    this.disposables.push(bodyGeometry, headGeometry, heroMaterial);
    const body = new Mesh(bodyGeometry, heroMaterial);
    body.position.y = PLAYER_CAPSULE.halfHeight + PLAYER_CAPSULE.radius;
    body.castShadow = true;
    const head = new Mesh(headGeometry, heroMaterial);
    head.position.y = 1.62;
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
    this.hero.rotation.y = this.facing;
    this.root.add(this.hero);

    this.player = new CharacterBody(this.physics, {
      dimensions: PLAYER_CAPSULE,
      position: { x: 0, y: 0.05, z: 2 },
    });
    this.syncHeroToBody();

    this.physics.onFixedStep((step) => this.fixedUpdate(step));

    this.physicsDebug = new PhysicsDebugView(this.physics, false);
    this.physicsDebug.attachTo(this.root);
  }

  /** Dev toggle for collider wireframes. */
  setPhysicsDebug(enabled: boolean): void {
    this.physicsDebug.setEnabled(enabled);
  }

  get isPhysicsDebugEnabled(): boolean {
    return this.physicsDebug.isEnabled;
  }

  getPlayerCollider(): Collider | null {
    return this.player.capsule;
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
      default:
        break;
    }
  }

  getInteractionHint(): InteractionHint | null {
    return this.nearestCrystal() ? { available: true, label: 'Собрать эссенцию' } : null;
  }

  getDebugSnapshot(): DebugSceneSnapshot {
    const feet = this.player.feet;
    return {
      hero: { x: feet.x, y: feet.y, z: feet.z },
      attacks: this.attacks,
      dodging: this.dashRemaining > 0,
      collected: this.collected,
      canInteract: this.nearestCrystal() !== null,
      grounded: this.player.isGrounded,
    };
  }

  /** Fixed 60 Hz simulation: locomotion through the character controller. */
  fixedUpdate(step: number): void {
    this.dashCooldownRemaining = Math.max(0, this.dashCooldownRemaining - step);

    let vx = 0;
    let vz = 0;
    if (this.dashRemaining > 0) {
      vx = this.dashDirection.x * DASH_SPEED;
      vz = this.dashDirection.z * DASH_SPEED;
      this.dashRemaining = Math.max(0, this.dashRemaining - step);
    } else if (this.move.magnitude > 0.01) {
      const speed = WALK_SPEED * this.move.magnitude;
      vx = this.move.x * speed;
      vz = this.move.z * speed;
    }

    // Gravity keeps the capsule glued to floors and lets it drop off ledges.
    if (this.player.isGrounded && this.verticalVelocity <= 0) {
      this.verticalVelocity = 0;
    } else {
      this.verticalVelocity += GRAVITY * step;
    }

    const delta = { x: vx * step, y: this.verticalVelocity * step, z: vz * step };
    this.player.moveBy(delta);

    if (Math.abs(vx) > 0.01 || Math.abs(vz) > 0.01) {
      const targetYaw = directionToYaw({ x: vx, y: vz });
      this.facing += shortestAngleDelta(this.facing, targetYaw) * Math.min(1, step * 14);
    }
  }

  /** Per-frame visuals. */
  update(dt: number, elapsed: number): void {
    this.syncHeroToBody();
    this.animateHero(dt, elapsed);
    this.animateCrystals(elapsed);
    this.physicsDebug.update();

    for (const torch of this.torches) {
      const flicker = Math.sin(elapsed * 11 + torch.phase) * 0.16 + Math.sin(elapsed * 23 + torch.phase * 2) * 0.08;
      torch.light.intensity = torch.base * (1 + flicker);
    }

    this.sun.target.position.set(this.hero.position.x, 0, this.hero.position.z);
    this.followTarget.set(this.hero.position.x, 1.05, this.hero.position.z);
  }

  dispose(): void {
    this.physics.onFixedStep(null);
    this.physicsDebug.dispose();
    this.player.dispose();
    for (const item of this.disposables) item.dispose();
    this.textures.dispose();
    this.root.clear();
  }

  // ---------------------------------------------------------------- internals

  private syncHeroToBody(): void {
    const feet = this.player.feet;
    this.hero.position.set(feet.x, feet.y, feet.z);
    this.hero.rotation.y = this.facing;
  }

  private animateHero(dt: number, elapsed: number): void {
    const moving = this.move.magnitude > 0 || this.dashRemaining > 0;
    // Visual bob is additive on top of the physics height, never replacing it.
    const bob = Math.sin(elapsed * (moving ? 9 : 2.2)) * (moving ? 0.04 : 0.012);
    this.hero.children[0]?.position.setY(PLAYER_CAPSULE.halfHeight + PLAYER_CAPSULE.radius + bob);

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
    if (this.dashRemaining > 0 || this.dashCooldownRemaining > 0) return;
    // Single source of truth: the same spec the HUD button cools down from.
    this.dashCooldownRemaining = ACTION_SPECS.dodge.cooldownMs / 1000;
    this.dashDirection = this.move.magnitude > 0.01 ? { x: this.move.x, z: this.move.z } : this.lastDirection;
    this.dashRemaining = DASH_DURATION;
  }

  private nearestCrystal(): Crystal | null {
    let best: Crystal | null = null;
    let bestDistance = INTERACT_RANGE;
    const feet = this.player.feet;
    for (const crystal of this.crystals) {
      if (crystal.collected) continue;
      const distance = Math.hypot(crystal.mesh.position.x - feet.x, crystal.mesh.position.z - feet.z);
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
