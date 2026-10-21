import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import type { BufferGeometry } from 'three';
import type { Collider } from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '@/game/physics';
import type { DungeonDoor } from './dungeonTypes';

const DOOR_HEIGHT = 2.5;
const PANEL_THICKNESS = 0.09;
const OPEN_DISTANCE = 3.2;
const CLOSE_DISTANCE = 4.4;

export interface DoorAssets {
  readonly wood: MeshStandardMaterial;
  readonly metal: MeshStandardMaterial;
  /** Panel geometry per panel width (shared by every door of that width). */
  panelFor(width: number): BufferGeometry;
  readonly jamb: BufferGeometry;
  readonly lintel: BufferGeometry;
  readonly band: BufferGeometry;
  dispose(): void;
}

/**
 * Creates the shared door geometry set once per dungeon.
 * Doors are numerous (10–16 per floor); sharing geometry keeps VRAM flat and
 * lets each door dispose nothing but its meshes.
 */
export function createDoorAssets(maxWidth: number): DoorAssets {
  const wood = new MeshStandardMaterial({ color: 0x6b4e2e, roughness: 0.82, metalness: 0.05 });
  const metal = new MeshStandardMaterial({ color: 0x3a3f47, roughness: 0.45, metalness: 0.85 });
  const panelCache = new Map<number, BufferGeometry>();
  const jamb = new BoxGeometry(0.16, DOOR_HEIGHT, 0.26);
  const lintel = new BoxGeometry(maxWidth + 0.32, 0.2, 0.3);
  const band = new BoxGeometry(1, 0.06, PANEL_THICKNESS + 0.03);

  return {
    wood,
    metal,
    jamb,
    lintel,
    band,
    panelFor(width: number): BufferGeometry {
      const key = Math.round(width * 100) / 100;
      const existing = panelCache.get(key);
      if (existing) return existing;
      const geometry = new BoxGeometry(Math.max(0.3, width - 0.04), DOOR_HEIGHT - 0.22, PANEL_THICKNESS);
      panelCache.set(key, geometry);
      return geometry;
    },
    dispose(): void {
      wood.dispose();
      metal.dispose();
      jamb.dispose();
      lintel.dispose();
      band.dispose();
      for (const geometry of panelCache.values()) geometry.dispose();
      panelCache.clear();
    },
  };
}

/**
 * Animated 90° swinging door.
 *
 * Opens when the player is within 3.2 m and closes beyond 4.4 m (hysteresis, so
 * it does not flap at the threshold). The blocking collider is enabled only when
 * the door is nearly closed *and* the player is not standing in the opening —
 * otherwise a closing door could trap the player's capsule.
 */
export class Doorway {
  readonly group = new Group();
  readonly door: DungeonDoor;
  private readonly panels: { pivot: Group; sign: 1 | -1 }[] = [];
  private readonly collider: Collider;
  private readonly physics: PhysicsWorld;
  private open = 0;
  private targetOpen = 0;

  constructor(door: DungeonDoor, physics: PhysicsWorld, assets: DoorAssets) {
    this.physics = physics;
    this.door = door;
    this.group.name = `door-${door.roomId}`;
    this.group.position.set(door.x, 0, door.z);
    // A door "along x" stretches along X; its wall plane faces ±Z.
    this.group.rotation.y = door.along === 'x' ? 0 : Math.PI / 2;

    const panelCount = door.width > 1.5 ? 2 : 1;
    const panelWidth = door.width / panelCount;
    const panelGeometry = assets.panelFor(panelWidth);

    for (let i = 0; i < panelCount; i += 1) {
      const sign: 1 | -1 = i === 0 ? -1 : 1;
      const pivot = new Group();
      pivot.position.set((sign * door.width) / 2, 0, 0);

      const panel = new Mesh(panelGeometry, assets.wood);
      panel.position.set((-sign * panelWidth) / 2, (DOOR_HEIGHT - 0.22) / 2, 0);
      panel.castShadow = true;
      panel.receiveShadow = true;
      pivot.add(panel);

      for (const y of [0.5, DOOR_HEIGHT - 0.55]) {
        const clamp = new Mesh(assets.band, assets.metal);
        clamp.scale.x = panelWidth - 0.1;
        clamp.position.set((-sign * panelWidth) / 2, y, 0);
        pivot.add(clamp);
      }

      this.group.add(pivot);
      this.panels.push({ pivot, sign });
    }

    for (const side of [-1, 1] as const) {
      const jamb = new Mesh(assets.jamb, assets.wood);
      jamb.position.set((side * door.width) / 2, DOOR_HEIGHT / 2, 0);
      jamb.castShadow = true;
      this.group.add(jamb);
    }
    const lintel = new Mesh(assets.lintel, assets.wood);
    lintel.position.set(0, DOOR_HEIGHT + 0.1, 0);
    lintel.castShadow = true;
    this.group.add(lintel);

    const halfX = door.along === 'x' ? door.width / 2 : PANEL_THICKNESS;
    const halfZ = door.along === 'x' ? PANEL_THICKNESS : door.width / 2;
    this.collider = physics.addStaticBox(
      { x: door.x, y: DOOR_HEIGHT / 2, z: door.z },
      { x: halfX, y: DOOR_HEIGHT / 2, z: halfZ },
    );
  }

  get openness(): number {
    return this.open;
  }

  get isOpen(): boolean {
    return this.open > 0.75;
  }

  /** True while the closed panel physically blocks movement. */
  get blocksMovement(): boolean {
    return this.collider.isEnabled();
  }

  update(dt: number, player: { x: number; z: number }): void {
    const distance = Math.hypot(player.x - this.door.x, player.z - this.door.z);
    if (distance < OPEN_DISTANCE) this.targetOpen = 1;
    else if (distance > CLOSE_DISTANCE) this.targetOpen = 0;

    const speed = this.targetOpen > this.open ? 4.4 : 2.8;
    const gap = this.targetOpen - this.open;
    if (Math.abs(gap) > 0.001) this.open += Math.sign(gap) * Math.min(Math.abs(gap), dt * speed);

    // Panels swing towards −Z; signs alternate so double doors part in the middle.
    for (const panel of this.panels) panel.pivot.rotation.y = -panel.sign * this.open * (Math.PI / 2);

    const nearPlayer = distance < 1.4;
    const shouldBlock = this.open < 0.12 && !nearPlayer;
    if (this.collider.isEnabled() !== shouldBlock) this.collider.setEnabled(shouldBlock);
  }

  /** Detaches visuals and removes the static collider (floor unload). */
  dispose(): void {
    this.group.removeFromParent();
    this.collider.setEnabled(false);
    this.physics.removeCollider(this.collider);
  }
}
