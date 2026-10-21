import {
  Color,
  CylinderGeometry,
  DirectionalLight,
  FogExp2,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  RingGeometry,
  Scene,
  TorusGeometry,
  Vector3,
} from 'three';
import type { Object3D } from 'three';
import type { Collider } from '@dimforge/rapier3d-compat';
import type { QualityPreset } from '@/types/engine';
import type { DebugSceneSnapshot, GameScene, MoveCommand } from '@/types/scene';
import type { InputAction, InteractionHint } from '@/input/types';
import type { PhysicsWorld } from '@/game/physics';
import { PlayerController } from '@/game/entities/PlayerController';
import { createPlaceholderHero, placeHero } from '@/game/entities/PlaceholderHero';
import type { PlaceholderHero } from '@/game/entities/PlaceholderHero';
import { QUALITY_PRESETS } from '@/game/core/Quality';
import { createStoneTextures } from '@/game/visual/textures/proceduralTextures';
import { PhysicsDebugView } from '@/game/visual/PhysicsDebug';
import { DungeonGenerator, DUNGEON_CONFIG } from '@/game/world/DungeonGenerator';
import {
  buildDungeonMesh,
  createDungeonMaterials,
  distanceToRoom,
} from '@/game/world/DungeonMesh';
import type { DungeonMaterials, DungeonMeshResult } from '@/game/world/DungeonMesh';
import { createDoorAssets, Doorway } from '@/game/world/Door';
import type { DoorAssets } from '@/game/world/Door';
import { RoomLights } from '@/game/world/RoomLights';
import { buildProps } from '@/game/world/Props';
import type { PropsResult } from '@/game/world/Props';
import { roomAt } from '@/game/world/dungeonTypes';
import type { Dungeon, DungeonRoom } from '@/game/world/dungeonTypes';

export interface DungeonSceneOptions {
  readonly physics: PhysicsWorld;
  readonly seed?: number;
  readonly floor?: number;
  readonly maxFloors?: number;
  /** Toasts (floor changes, blocked stairs). */
  readonly onNotify?: (message: string) => void;
  readonly onFloorChange?: (floor: number) => void;
}

const EXIT_RANGE = 2.4;
const DEFAULT_MAX_FLOORS = 3;

/**
 * Playable procedural dungeon floor.
 *
 * Owns everything that is per-floor (geometry, colliders, doors, props, lights)
 * and everything that survives a descent (player capsule, hero mesh, textures,
 * lights rig). Descending rebuilds the floor in place instead of recreating the
 * engine, so the WebGL context, post-processing chain and UI state stay intact.
 */
export class DungeonScene implements GameScene {
  readonly root = new Scene();
  readonly collisionObjects: Object3D[] = [];
  readonly followTarget = new Vector3();

  private readonly options: DungeonSceneOptions;
  private readonly physics: PhysicsWorld;
  private readonly textures = createStoneTextures({ size: 256, seed: 4242, repeat: 1 });
  private readonly materials: DungeonMaterials;
  private readonly doorAssets: DoorAssets;
  private readonly hero: PlaceholderHero;
  private readonly player: PlayerController;
  private readonly hemisphere: HemisphereLight;
  private readonly keyLight: DirectionalLight;
  private readonly physicsDebug: PhysicsDebugView;
  private readonly floorsGroup = new Group();

  private dungeon: Dungeon;
  private floorGroup = new Group();
  private mesh: DungeonMeshResult | null = null;
  private props: PropsResult | null = null;
  private lights: RoomLights | null = null;
  private doors: Doorway[] = [];
  private colliders: Collider[] = [];
  private exitMesh: Group | null = null;
  private exitGlow: PointLight | null = null;
  private exitDisposables: { dispose(): void }[] = [];
  private triangleCount = 0;
  private quality: QualityPreset | null = null;

  constructor(options: DungeonSceneOptions) {
    this.options = options;
    this.physics = options.physics;
    const seed = options.seed ?? 2024;
    const floor = options.floor ?? 1;

    this.root.background = new Color(0x05070b);
    // Spec: exp2 fog, density 0.04 → visibility ≈ 20 m with torch light.
    this.root.fog = new FogExp2(0x05070b, 0.04);

    this.hemisphere = new HemisphereLight(0x3a4a5c, 0x05070b, 0.32);
    this.root.add(this.hemisphere);

    this.keyLight = new DirectionalLight(0x8fa4c4, 0.55);
    this.keyLight.position.set(6, 14, 4);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.keyLight.shadow.camera.near = 1;
    this.keyLight.shadow.camera.far = 40;
    const span = 14;
    this.keyLight.shadow.camera.left = -span;
    this.keyLight.shadow.camera.right = span;
    this.keyLight.shadow.camera.top = span;
    this.keyLight.shadow.camera.bottom = -span;
    this.keyLight.shadow.bias = -0.0009;
    this.keyLight.shadow.normalBias = 0.035;
    this.root.add(this.keyLight, this.keyLight.target);

    this.materials = createDungeonMaterials({
      map: this.textures.map,
      normalMap: this.textures.normalMap,
      roughnessMap: this.textures.roughnessMap,
    });
    this.doorAssets = createDoorAssets(DUNGEON_CONFIG.corridorWidth);

    this.dungeon = DungeonGenerator.generate({ seed, floor });
    this.player = new PlayerController({ physics: this.physics, spawn: this.dungeon.entrance });
    this.hero = createPlaceholderHero();
    this.root.add(this.hero.group);

    this.root.add(this.floorsGroup);
    this.floorsGroup.add(this.floorGroup);
    this.loadFloor(this.dungeon);
    this.placeHeroAtSpawn();

    // Fixed-rate locomotion runs inside the engine's physics step.
    this.physics.onFixedStep((step) => this.fixedUpdate(step));

    this.physicsDebug = new PhysicsDebugView(this.physics, false);
    this.physicsDebug.attachTo(this.root);
  }

  // ------------------------------------------------------------ lifecycle

  get floorNumber(): number {
    return this.dungeon.floor;
  }

  get seed(): number {
    return this.dungeon.seed;
  }

  get roomCount(): number {
    return this.dungeon.rooms.length;
  }

  get doorCount(): number {
    return this.doors.length;
  }

  getPlayerCollider(): Collider | null {
    return this.player.body.capsule;
  }

  setPhysicsDebug(enabled: boolean): void {
    this.physicsDebug.setEnabled(enabled);
  }

  setMoveInput(command: MoveCommand): void {
    this.player.setMoveInput(command);
  }

  triggerAction(action: InputAction): void {
    switch (action) {
      case 'attack':
        this.player.startAttack();
        break;
      case 'dodge':
        this.player.startDash();
        break;
      case 'interact':
        this.interact();
        break;
      case 'skill1':
      case 'skill2':
      default:
        // Skills arrive in stage 7; the HUD stays inert rather than faking them.
        break;
    }
  }

  getInteractionHint(): InteractionHint | null {
    const feet = this.player.feet;
    const distance = Math.hypot(feet.x - this.dungeon.exit.x, feet.z - this.dungeon.exit.z);
    if (distance > EXIT_RANGE) return null;
    return {
      available: true,
      label: this.isLastFloor ? 'Спуск закрыт' : 'Спуститься ниже',
    };
  }

  getDebugSnapshot(): DebugSceneSnapshot {
    const feet = this.player.feet;
    const room = roomAt(this.dungeon, Math.floor(feet.x), Math.floor(feet.z));
    return {
      ...this.player.debug(),
      collected: 0,
      canInteract: this.getInteractionHint() !== null,
      floor: this.dungeon.floor,
      rooms: this.dungeon.rooms.length,
      doors: this.dungeon.doors.length,
      activeLights: this.lights?.activeCount ?? 0,
      roomId: room?.id ?? null,
    };
  }

  applyQuality(preset: QualityPreset): void {
    this.quality = preset;
    const size = preset.shadowMapSize;
    this.keyLight.castShadow = size > 0;
    this.keyLight.shadow.map?.dispose();
    this.keyLight.shadow.map = null;
    this.keyLight.shadow.mapSize.set(size === 0 ? 512 : size, size === 0 ? 512 : size);
    // One slot is reserved for the exit rune light, which turns on near the stairs.
    this.lights?.setBudget(this.roomLightBudget(preset));
    this.mesh?.setQuality(preset);
  }

  fixedUpdate(step: number): void {
    this.player.fixedUpdate(step);
  }

  update(dt: number, elapsed: number): void {
    const feet = this.player.feet;
    placeHero(this.hero.group, feet, this.player.facing);
    this.hero.update(
      dt,
      elapsed,
      this.player.speedMagnitude > 0.05,
      this.player.isDodging ? 0 : this.player.attackProgress,
    );

    for (const door of this.doors) door.update(dt, feet);

    this.lights?.update(dt, feet, elapsed);
    this.updateExitGlow(feet);
    this.physicsDebug.update();
    this.animateExit(elapsed);

    this.followTarget.set(feet.x, feet.y + this.hero.eyeHeight, feet.z);
    // Shadow frustum follows the player instead of covering the whole floor.
    this.keyLight.target.position.set(feet.x, 0, feet.z);
    this.keyLight.position.set(feet.x + 6, 14, feet.z + 4);
  }

  dispose(): void {
    this.physics.onFixedStep(null);
    this.physicsDebug.dispose();
    this.player.dispose();
    this.hero.dispose();
    this.unloadFloor();
    this.doorAssets.dispose();
    for (const material of [this.materials.floor, this.materials.wall, this.materials.ceiling]) {
      material.dispose();
    }
    this.textures.dispose();
    this.root.clear();
  }

  // -------------------------------------------------------------- floors

  /** Descends one floor (wraps to 1 after the last one until stage 9). */
  descend(): void {
    const maxFloors = this.options.maxFloors ?? DEFAULT_MAX_FLOORS;
    const nextFloor = this.dungeon.floor >= maxFloors ? 1 : this.dungeon.floor + 1;
    // Derived seed keeps runs reproducible from the run seed + floor index.
    const seed = (this.dungeon.seed + nextFloor * 7919) >>> 0;

    this.unloadFloor();
    this.dungeon = DungeonGenerator.generate({ seed, floor: nextFloor });
    this.loadFloor(this.dungeon);
    this.player.teleport(this.dungeon.entrance);
    this.placeHeroAtSpawn();
    // New static colliders are invisible to queries until the world steps.
    this.physics.primeQueries();
    this.options.onFloorChange?.(nextFloor);
    this.options.onNotify?.(`Этаж ${nextFloor}`);
  }

  private get isLastFloor(): boolean {
    return this.dungeon.floor >= (this.options.maxFloors ?? DEFAULT_MAX_FLOORS);
  }

  /** QA/dev hook: drops the player at a given spot (also used by floor saves). */
  teleportTo(position: { x: number; z: number }): void {
    this.player.teleport(position);
    this.physics.primeQueries();
  }

  /** Stairs-down position of the current floor. */
  get exitPosition(): { x: number; z: number } {
    return { x: this.dungeon.exit.x, z: this.dungeon.exit.z };
  }

  private interact(): void {
    const feet = this.player.feet;
    const distance = Math.hypot(feet.x - this.dungeon.exit.x, feet.z - this.dungeon.exit.z);
    if (distance > EXIT_RANGE) return;
    if (this.isLastFloor) {
      this.options.onNotify?.('Врата ведут глубже: босс появится на этапе 9');
      return;
    }
    this.descend();
  }

  private placeHeroAtSpawn(): void {
    const spawn = this.dungeon.entrance;
    placeHero(this.hero.group, { x: spawn.x, y: 0.08, z: spawn.z }, this.player.facing);
    this.followTarget.set(spawn.x, 1.15, spawn.z);
  }

  /** Budget for room lights: the tier's cap minus the reserved exit-rune slot. */
  private roomLightBudget(preset: QualityPreset): number {
    return Math.max(2, preset.maxPointLights - 1);
  }

  private updateExitGlow(feet: { x: number; z: number }): void {
    const glow = this.exitGlow;
    if (!glow || !this.exitMesh) return;
    const distance = Math.hypot(feet.x - this.dungeon.exit.x, feet.z - this.dungeon.exit.z);
    glow.visible = distance < 12;
  }

  private loadFloor(dungeon: Dungeon): void {
    const mesh = buildDungeonMesh(dungeon, this.physics, this.materials);
    this.mesh = mesh;
    this.triangleCount = mesh.triangles;
    this.floorGroup.add(mesh.group);
    this.collisionObjects.push(mesh.group);
    this.colliders.push(...mesh.colliders);
    if (this.quality) mesh.setQuality(this.quality);

    this.doors = dungeon.doors.map((door) => {
      const doorway = new Doorway(door, this.physics, this.doorAssets);
      this.floorGroup.add(doorway.group);
      return doorway;
    });

    const props = buildProps(dungeon, this.physics, dungeon.seed);
    this.props = props;
    this.floorGroup.add(props.group);
    this.colliders.push(...props.colliders);

    const lights = new RoomLights(dungeon, this.roomLightBudget(this.quality ?? QUALITY_PRESETS.medium));
    this.lights = lights;
    for (const light of lights.objects) this.root.add(light);

    this.buildExitMarker(dungeon);
  }

  private unloadFloor(): void {
    for (const door of this.doors) door.dispose();
    this.doors = [];

    this.props?.dispose();
    this.props = null;

    if (this.lights) {
      for (const light of this.lights.objects) light.removeFromParent();
      this.lights.dispose();
      this.lights = null;
    }

    this.mesh?.dispose();
    this.mesh = null;

    for (const collider of this.colliders) this.physics.removeCollider(collider);
    this.colliders = [];

    this.collisionObjects.length = 0;
    this.disposeExitMarker();

    this.floorGroup.removeFromParent();
    this.floorGroup = new Group();
    this.floorsGroup.add(this.floorGroup);
    this.triangleCount = 0;
  }

  // ------------------------------------------------------------ exit rune

  private buildExitMarker(dungeon: Dungeon): void {
    const group = new Group();
    group.name = 'exit-rune';
    group.position.set(dungeon.exit.x, 0.02, dungeon.exit.z);

    const rune = new MeshStandardMaterial({
      color: 0x4a7c8c,
      emissive: new Color(0x4a7c8c),
      emissiveIntensity: 2.6,
      roughness: 0.4,
      metalness: 0.4,
    });
    const stone = new MeshStandardMaterial({
      color: 0x1e2a3a,
      emissive: new Color(0x1b3a44),
      emissiveIntensity: 1.2,
      roughness: 0.7,
    });

    const ring = new Mesh(new RingGeometry(0.65, 0.85, 24), rune);
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);

    const arch = new Mesh(new TorusGeometry(0.95, 0.07, 6, 20, Math.PI), rune);
    arch.position.y = 1.0;
    group.add(arch);

    const pillarGeometry = new CylinderGeometry(0.12, 0.16, 1.9, 6);
    for (const side of [-1, 1] as const) {
      const pillar = new Mesh(pillarGeometry, stone);
      pillar.position.set(side * 0.95, 0.95, 0);
      group.add(pillar);
    }

    const glow = new PointLight(0x4a7c8c, 3.5, 5, 2);
    glow.position.set(0, 1.2, 0);
    glow.visible = false;
    group.add(glow);
    this.exitGlow = glow;

    this.exitDisposables.push(rune, stone, ring.geometry, arch.geometry, pillarGeometry);
    this.exitMesh = group;
    this.floorGroup.add(group);
  }

  private animateExit(elapsed: number): void {
    const ring = this.exitMesh?.children[0];
    if (ring) ring.rotation.z = elapsed * 0.6;
  }

  private disposeExitMarker(): void {
    this.exitMesh?.removeFromParent();
    this.exitMesh = null;
    this.exitGlow = null;
    for (const item of this.exitDisposables) item.dispose();
    this.exitDisposables = [];
  }

  // ---------------------------------------------------------- diagnostics

  /** Numbers shown by the dev overlay. */
  get stats(): {
    readonly floor: number;
    readonly rooms: number;
    readonly doors: number;
    readonly triangles: number;
    readonly activeLights: number;
    readonly lootAnchors: number;
  } {
    return {
      floor: this.dungeon.floor,
      rooms: this.dungeon.rooms.length,
      doors: this.doors.length,
      triangles: this.triangleCount,
      activeLights: this.lights?.activeCount ?? 0,
      lootAnchors: this.props?.anchors.length ?? 0,
    };
  }

  /** Nearest room to the player; used by spawning and the stage-8 map. */
  nearestRoom(): DungeonRoom | null {
    const feet = this.player.feet;
    let best: DungeonRoom | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const room of this.dungeon.rooms) {
      const distance = distanceToRoom(room, feet);
      if (distance < bestDistance) {
        best = room;
        bestDistance = distance;
      }
    }
    return best;
  }

  /** Read-only view of the generated floor (tests and debug bridge). */
  get currentDungeon(): Dungeon {
    return this.dungeon;
  }
}
