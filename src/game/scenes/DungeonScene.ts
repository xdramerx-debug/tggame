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
import { PlayerController, PLAYER_TUNING } from '@/game/entities/PlayerController';
import { createHeroView, placeHeroView } from '@/game/entities/HeroView';
import type { HeroView } from '@/game/entities/HeroView';
import type { AssetLoader, LoadedCharacter } from '@/game/assets/AssetLoader';
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
import { Enemy } from '@/game/entities/Enemy';
import { EnemyDirector } from '@/game/world/EnemyDirector';
import type { PlannedSpawn } from '@/game/world/EnemyDirector';
import { monsterById } from '@/game/combat/monsterTable';
import { Chest } from '@/game/entities/Chest';
import { RunState } from '@/game/loot/RunState';
import type { InventorySnapshot, LootGain } from '@/game/loot/RunState';
import type { ItemSlotId } from '@/game/loot/itemTable';
import { HitEffects } from '@/game/visual/HitEffects';
import { DamageNumbers } from '@/game/visual/DamageNumbers';
import { PlayerStats, PLAYER_BASE } from '@/game/player/PlayerStats';
import { PLAYER_ARC, targetsInArc } from '@/game/combat/meleeArc';
import { rollDamage } from '@/game/combat/damage';

export interface DungeonSceneOptions {
  readonly physics: PhysicsWorld;
  readonly seed?: number;
  readonly floor?: number;
  readonly maxFloors?: number;
  /** Toasts (floor changes, blocked stairs). */
  readonly onNotify?: (message: string) => void;
  readonly onFloorChange?: (floor: number) => void;
  /** Generated hero model; the primitive placeholder is used when absent. */
  readonly hero?: LoadedCharacter | null;
  /** Asset cache used to instance enemy models (skipped when absent). */
  readonly assets?: AssetLoader | null;
  /** Haptics hook; the engine maps it to Telegram HapticFeedback. */
  readonly onHaptic?: (kind: 'light' | 'medium' | 'heavy') => void;
}

const EXIT_RANGE = 2.4;
/** Interaction reach for chests, slightly larger than the stairs. */
const CHEST_RANGE = 2.1;
const DEFAULT_MAX_FLOORS = 3;
/** Fraction of the attack window after which the blade actually connects. */
const STRIKE_FRACTION = 0.42;
/** Enemies never act before the floor has been running for a moment. */
const SPAWN_GRACE_SECONDS = 0.6;

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
  private readonly hero: HeroView;
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
  private lastAttackCount = 0;
  private lastDodging = false;

  /** Player vitals (hp/stamina); separate from the `stats` diagnostics getter. */
  readonly vitals = new PlayerStats();
  private director: EnemyDirector | null = null;
  private enemies: Enemy[] = [];
  private readonly hitEffects: HitEffects;
  private readonly damageNumbers: DamageNumbers;
  private pendingStrike = -1;
  private kills = 0;
  private deaths = 0;
  private floorTime = 0;
  private shakeStrength = 0;

  /** Run economy: gold, XP and the inventory (stage 7). */
  readonly run = new RunState();
  private chests: Chest[] = [];
  private chestsOpened = 0;

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
    this.hero = createHeroView(options.hero ?? null);
    this.root.add(this.hero.group);
    this.hitEffects = new HitEffects(this.root, 40);
    this.damageNumbers = new DamageNumbers(this.root);

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
        // Stamina gates the swing; an exhausted player still sees the animation
        // but deals no damage, which reads better than a silently dead button.
        this.player.startAttack();
        if (this.vitals.spendStamina(PLAYER_BASE.attackStamina)) {
          this.pendingStrike = PLAYER_TUNING.attackDuration * STRIKE_FRACTION;
        }
        break;
      case 'dodge':
        if (!this.vitals.spendStamina(PLAYER_BASE.dodgeStamina)) break;
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
    const chest = this.nearestChest();
    if (chest) return { available: true, label: 'Открыть сундук' };
    const feet = this.player.feet;
    const distance = Math.hypot(feet.x - this.dungeon.exit.x, feet.z - this.dungeon.exit.z);
    if (distance > EXIT_RANGE) return null;
    return {
      available: true,
      label: this.isLastFloor ? 'Спуск закрыт' : 'Спуститься ниже',
    };
  }

  /** Closest unopened chest inside interaction reach, if any. */
  private nearestChest(): Chest | null {
    const feet = this.player.feet;
    let best: Chest | null = null;
    let bestDistance = CHEST_RANGE;
    for (const chest of this.chests) {
      if (chest.isOpen) continue;
      const distance = Math.hypot(feet.x - chest.position.x, feet.z - chest.position.z);
      if (distance <= bestDistance) {
        best = chest;
        bestDistance = distance;
      }
    }
    return best;
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
      heroAsset: this.hero.kind,
      heroState: this.hero.state,
      hp: Math.round(this.vitals.hp),
      maxHp: this.vitals.maxHp,
      stamina: Math.round(this.vitals.stamina),
      kills: this.kills,
      xp: this.run.xp,
      gold: this.run.gold,
      items: this.run.inventory.size,
      weapon: this.run.inventory.equipped.weapon?.defId ?? null,
      chestsOpened: this.chestsOpened,
      chests: this.chests.length,
      deaths: this.deaths,
      enemies: this.enemies.filter((enemy) => !enemy.isDead).length,
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
    this.vitals.tick(step);
    this.floorTime += step;

    if (this.pendingStrike >= 0) {
      this.pendingStrike -= step;
      if (this.pendingStrike <= 0) {
        this.pendingStrike = -1;
        this.resolvePlayerStrike();
      }
    }

    this.updateEnemies(step);
    if (this.vitals.isDead) this.handlePlayerDeath();
  }

  update(dt: number, elapsed: number): void {
    const feet = this.player.feet;
    placeHeroView(this.hero, feet, this.player.facing);

    // Drive the animation from edges in the controller state: the model plays a
    // full swing/roll clip, while the controller keeps its own short timers.
    if (this.player.attacks !== this.lastAttackCount) {
      this.lastAttackCount = this.player.attacks;
      this.hero.attack();
    }
    if (this.player.isDodging && !this.lastDodging) this.hero.dodge();
    this.lastDodging = this.player.isDodging;

    this.hero.update(dt, elapsed, this.player.speed, this.player.isDodging || this.player.isAttacking);

    for (const door of this.doors) door.update(dt, feet);
    for (const enemy of this.enemies) {
      const speed = enemy.brain.state === 'chase' ? enemy.definition.speed : 0;
      enemy.update(dt, elapsed, speed);
    }
    this.hitEffects.update(dt);
    this.damageNumbers.update(dt);
    for (const chest of this.chests) chest.update(dt);

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
    this.clearEnemies();
    this.hitEffects.dispose();
    this.damageNumbers.dispose();
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
    const chest = this.nearestChest();
    if (chest) {
      this.openChest(chest);
      return;
    }
    const feet = this.player.feet;
    const distance = Math.hypot(feet.x - this.dungeon.exit.x, feet.z - this.dungeon.exit.z);
    if (distance > EXIT_RANGE) return;
    if (this.isLastFloor) {
      this.options.onNotify?.('Врата ведут глубже: босс появится на этапе 9');
      return;
    }
    this.descend();
  }

  /**
   * Opens a chest, grants its loot and applies equipment if something was
   * equipped earlier. Loot goes straight into the bag: on a phone, walking over
   * every coin is a chore, and the toast already names what was found.
   */
  private openChest(chest: Chest): void {
    if (!chest.open()) return;
    this.chestsOpened += 1;
    const gain = this.run.lootChest(this.dungeon.floor, Math.random);
    const position = { x: chest.position.x, y: 1.0, z: chest.position.z };
    this.hitEffects.burst(position, 1.8, 'spark');
    this.damageNumbers.show({ x: position.x, y: 1.3, z: position.z }, gain.gold);
    this.options.onHaptic?.('medium');
    this.options.onNotify?.(describeLoot('Сундук', gain));
  }

  /** Inventory snapshot for the HUD panel (plain data, no three.js). */
  getInventorySnapshot(): InventorySnapshot {
    return this.run.snapshot();
  }

  /**
   * Equips a bag item and re-derives combat stats.
   * @returns false when the item is unknown (stale UI after a refresh)
   */
  equipItem(uid: number): boolean {
    const result = this.run.inventory.equip(uid);
    if (!result.ok) return false;
    this.applyEquipment();
    return true;
  }

  /** Returns an equipped item to the bag. */
  unequipItem(slot: ItemSlotId): boolean {
    const item = this.run.inventory.unequip(slot);
    if (!item) return false;
    this.applyEquipment();
    return true;
  }

  /** Single place where equipment is folded into `PlayerStats`. */
  private applyEquipment(): void {
    this.vitals.applyBonuses(this.run.inventory.totals());
  }

  private placeHeroAtSpawn(): void {
    const spawn = this.dungeon.entrance;
    placeHeroView(this.hero, { x: spawn.x, y: 0.08, z: spawn.z }, this.player.facing);
    this.followTarget.set(spawn.x, 1.15, spawn.z);
  }

  /** Budget for room lights: the tier's cap minus the reserved exit-rune slot. */
  private roomLightBudget(preset: QualityPreset): number {
    return Math.max(1, preset.maxPointLights - 1);
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

    this.chests = props.anchors
      .filter((anchor) => anchor.type === 'chest')
      .map((anchor, index) => {
        const chest = new Chest({
          id: index,
          model: this.options.assets?.cloneProp('chest') ?? null,
          position: { x: anchor.x, z: anchor.z },
          rotationY: anchor.rotY ?? 0,
        });
        this.floorGroup.add(chest.group);
        return chest;
      });

    const lights = new RoomLights(dungeon, this.roomLightBudget(this.quality ?? QUALITY_PRESETS.medium));
    this.lights = lights;
    for (const light of lights.objects) this.root.add(light);

    this.director = new EnemyDirector({ dungeon, floor: dungeon.floor, seed: dungeon.seed });
    this.floorTime = 0;
    this.buildExitMarker(dungeon);
  }

  private unloadFloor(): void {
    this.clearEnemies();
    this.director = null;
    for (const chest of this.chests) chest.dispose();
    this.chests = [];
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

  // ---------------------------------------------------------------- combat

  /** Applies the player's swing to every enemy inside the melee cone. */
  private resolvePlayerStrike(): void {
    const feet = this.player.feet;
    const origin = { x: feet.x, z: feet.z };
    const targets = this.enemies
      .filter((enemy) => !enemy.isDead)
      .map((enemy) => ({
        id: enemy.id,
        x: enemy.position.x,
        z: enemy.position.z,
        radius: enemy.radius,
      }));
    // A swing must not reach through a wall even when the cone covers the enemy.
    const visible = this.enemies
      .filter((enemy) => !enemy.isDead)
      .filter((enemy) => this.hasLineOfSight(this.player.feet, enemy.position, enemy.collider));
    const visibleIds = new Set(visible.map((enemy) => enemy.id));
    const hits = targetsInArc(origin, this.player.facing, targets, PLAYER_ARC).filter((hit) =>
      visibleIds.has(hit.id),
    );
    if (hits.length === 0) return;

    for (const hit of hits) {
      const enemy = this.enemies.find((candidate) => candidate.id === hit.id);
      if (!enemy) continue;
      const roll = rollDamage(this.vitals.attack, Math.random);
      const result = enemy.takeDamage(roll.raw, origin, roll.critical);
      if (result.applied <= 0) continue;

      this.damageNumbers.show(
        { x: enemy.position.x, y: 1.75, z: enemy.position.z },
        Math.round(result.applied),
        roll.critical,
      );
      this.hitEffects.burst(
        { x: enemy.position.x, y: 1.1, z: enemy.position.z },
        roll.critical ? 1.6 : 1,
        result.killed ? 'blood' : 'spark',
      );
      this.options.onHaptic?.(roll.critical ? 'medium' : 'light');

      if (result.killed) {
        this.kills += 1;
        this.run.addXp(enemy.definition.xp);
        this.director?.markKilled(enemy.id);
        const gain = this.run.lootMonster(this.dungeon.floor, Math.random);
        if (gain.items.length > 0) {
          this.options.onNotify?.(describeLoot(enemy.definition.label, gain));
        }
        if (gain.gold > 0) {
          this.damageNumbers.show(
            { x: enemy.position.x, y: 1.4, z: enemy.position.z },
            gain.gold,
          );
        }
      }
    }
    this.shake(0.12);
  }

  private updateEnemies(step: number): void {
    const director = this.director;
    if (!director) return;
    const feet = this.player.feet;

    // Corpses are removed once their death animation has played out.
    for (let i = this.enemies.length - 1; i >= 0; i -= 1) {
      const enemy = this.enemies[i];
      if (!enemy) continue;
      if (enemy.canBeRemoved) {
        enemy.dispose();
        this.enemies.splice(i, 1);
      }
    }

    if (this.floorTime > SPAWN_GRACE_SECONDS) {
      const decision = director.reconcile(
        this.enemies.map((enemy) => ({
          id: enemy.id,
          x: enemy.position.x,
          z: enemy.position.z,
          dead: enemy.isDead,
        })),
        feet,
      );
      for (const id of decision.despawn) {
        const index = this.enemies.findIndex((enemy) => enemy.id === id);
        const [removed] = this.enemies.splice(index, 1);
        removed?.dispose();
      }
      for (const planned of decision.spawn) this.spawnEnemy(planned);
    }

    for (const enemy of this.enemies) {
      if (enemy.isDead) {
        enemy.fixedUpdate(step, feet, false);
        continue;
      }
      const distance = Math.hypot(enemy.position.x - feet.x, enemy.position.z - feet.z);
      const los = distance < 2 ? true : this.hasLineOfSight(enemy.position, feet, enemy.collider);
      enemy.fixedUpdate(step, feet, los);

      if (enemy.takeStrike()) this.resolveEnemyStrike(enemy);
    }
  }

  private spawnEnemy(planned: PlannedSpawn): void {
    const assets = this.options.assets ?? null;
    const definition = planned.definition;
    const model = assets?.cloneCharacter(definition.model) ?? null;
    const enemy = new Enemy({
      definition,
      model,
      physics: this.physics,
      spawn: { x: planned.x, z: planned.z },
      index: planned.id,
    });
    this.root.add(enemy.group);
    this.enemies.push(enemy);
  }

  private resolveEnemyStrike(enemy: Enemy): void {
    const feet = this.player.feet;
    const distance = Math.hypot(enemy.position.x - feet.x, enemy.position.z - feet.z);
    if (distance > enemy.definition.attackRange + 0.5) return;
    // Dash i-frames are absolute: dodging through a swing takes no damage.
    if (this.player.isInvulnerable) return;

    const result = this.vitals.takeDamage(enemy.definition.damage);
    if (result.applied <= 0) return;
    this.damageNumbers.show({ x: feet.x, y: 1.9, z: feet.z }, Math.round(result.applied));
    this.hitEffects.burst({ x: feet.x, y: 1.1, z: feet.z }, 1.2, 'blood');
    this.shake(0.28);
    this.options.onHaptic?.('heavy');
  }

  private hasLineOfSight(
    from: { x: number; y: number; z: number },
    to: { x: number; z: number },
    exclude?: Collider,
  ): boolean {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.001) return true;
    const dirX = dx / distance;
    const dirZ = dz / distance;
    // Start outside both capsules: a ray cast from the centre of a character
    // hits its own collider at t = 0 and would report every target as hidden.
    const margin = 0.45;
    const length = distance - margin - 0.3;
    if (length <= 0) return true;
    const hit = this.physics.raycast(
      { x: from.x + dirX * margin, y: from.y + 1.0, z: from.z + dirZ * margin },
      { x: dirX, y: 0, z: dirZ },
      length,
      exclude,
    );
    return hit === null;
  }

  private handlePlayerDeath(): void {
    this.deaths += 1;
    this.pendingStrike = -1;
    this.vitals.reset();
    this.clearEnemies();
    this.director?.reset();
    this.player.teleport(this.dungeon.entrance);
    this.placeHeroAtSpawn();
    this.vitals.health.grantIFrames(2);
    this.options.onNotify?.('Тьма забрала вас. Алтарь вернул вас к входу');
    this.shake(0.5);
    this.options.onHaptic?.('heavy');
  }

  private shake(strength: number): void {
    this.shakeStrength = Math.min(1, this.shakeStrength + strength);
  }

  /** Dev/test helper: world positions of this floor's chests. */
  debugChestPositions(): { x: number; z: number }[] {
    return this.chests.map((chest) => ({ x: chest.position.x, z: chest.position.z }));
  }

  /**
   * Dev/test helper: puts one skeleton in front of the player.
   *
   * Used by `?dummy=1` for manual combat QA and by the headless scene test, so
   * the full attack path (stamina → arc → armour → death → XP) is exercised
   * without waiting for the spawn director to reach a combat room.
   */
  debugSpawnDummy(distance = 1.6): void {
    const definition = monsterById('skeleton');
    if (!definition) return;
    const facing = this.player.facing;
    const feet = this.player.feet;
    const enemy = new Enemy({
      definition,
      model: this.options.assets?.cloneCharacter(definition.model) ?? null,
      physics: this.physics,
      spawn: { x: feet.x - Math.sin(facing) * distance, z: feet.z - Math.cos(facing) * distance },
      index: 10_000 + this.enemies.length,
    });
    this.root.add(enemy.group);
    this.enemies.push(enemy);
  }

  /** Dev/test helper: wipes the current wave (also used by respawn). */
  clearAllEnemiesForTest(): void {
    this.clearEnemies();
  }

  private clearEnemies(): void {
    for (const enemy of this.enemies) enemy.dispose();
    this.enemies = [];
  }

  /** Current camera shake amplitude, consumed by the engine's rig. */
  get shakeAmount(): number {
    return this.shakeStrength;
  }

  /** Called by the engine after the shake has been consumed. */
  consumeShake(): void {
    this.shakeStrength = 0;
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

/** "Сундук: 14 золота · Железный меч (редкое)" for the HUD toast. */
function describeLoot(source: string, gain: LootGain): string {
  const parts: string[] = [];
  if (gain.gold > 0) parts.push(`${gain.gold} золота`);
  for (const item of gain.items) parts.push(`${item.label} (${item.rarityLabel.toLowerCase()})`);
  if (gain.dropped > 0) parts.push(`сумка полна — ${gain.dropped} потеряно`);
  return `${source}: ${parts.join(' · ')}`;
}
