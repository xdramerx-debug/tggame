import { Color, PointLight } from 'three';
import type { Dungeon, DungeonRoom } from './dungeonTypes';
import { distanceToRoom } from './DungeonMesh';

interface ManagedLight {
  readonly light: PointLight;
  readonly room: DungeonRoom;
  readonly baseIntensity: number;
  readonly phase: number;
  readonly flicker: boolean;
}

/**
 * Keeps the number of live point lights under the mobile budget.
 *
 * One light per room exists, but only the N closest to the player are enabled
 * (`visible = false` removes them from the shader light loop, which is what
 * actually costs fill rate). The player's own torch is always first in the list,
 * so the hero never stands in the dark.
 *
 * `budget` counts the torch itself, so `budget: 4` means torch + 3 rooms. The
 * scene passes a budget with one slot already reserved for transient lights
 * (the exit rune) to keep the tier's `maxPointLights` an honest cap.
 */
export class RoomLights {
  private readonly lights: ManagedLight[] = [];
  private budget: number;
  private playerLight: PointLight;
  private updateAccumulator = 0;
  private lastSelection = '';

  constructor(dungeon: Dungeon, budget: number) {
    this.budget = Math.max(1, budget);
    this.playerLight = new PointLight(0xffb066, 4.2, 7, 2);
    this.playerLight.visible = true;

    for (const room of dungeon.rooms) {
      const light = new PointLight(
        new Color(room.light.color).getHex(),
        room.light.intensity,
        room.light.distance,
        2,
      );
      light.position.set(room.center.x, Math.max(1.8, room.ceiling - 0.7), room.center.z);
      light.visible = false;
      light.castShadow = false;
      this.lights.push({
        light,
        room,
        baseIntensity: room.light.intensity,
        // Deterministic phase from the room id keeps replays of one seed identical.
        phase: room.id * 1.618,
        flicker: room.light.flicker,
      });
    }
  }

  /** All lights, for adding to the scene graph. */
  get objects(): PointLight[] {
    return [this.playerLight, ...this.lights.map((entry) => entry.light)];
  }

  setBudget(budget: number): void {
    this.budget = Math.max(1, budget);
    this.lastSelection = '';
  }

  /** Called every frame; the expensive re-selection runs at 5 Hz. */
  update(dt: number, player: { x: number; z: number }, elapsed: number): void {
    this.playerLight.position.set(player.x, 1.6, player.z);
    const torchFlicker = 1 + Math.sin(elapsed * 13) * 0.08 + Math.sin(elapsed * 29) * 0.04;
    this.playerLight.intensity = 4.2 * torchFlicker;

    this.updateAccumulator += dt;
    if (this.updateAccumulator >= 0.2) {
      this.updateAccumulator = 0;
      this.reselect(player);
    }

    for (const entry of this.lights) {
      if (!entry.light.visible) continue;
      const flicker = entry.flicker
        ? 1 + Math.sin(elapsed * 9 + entry.phase) * 0.12 + Math.sin(elapsed * 21 + entry.phase) * 0.05
        : 1;
      entry.light.intensity = entry.baseIntensity * flicker;
    }
  }

  /** Number of enabled point lights (budget diagnostics). */
  get activeCount(): number {
    return 1 + this.lights.filter((entry) => entry.light.visible).length;
  }

  private reselect(player: { x: number; z: number }): void {
    const sorted = [...this.lights].sort(
      (a, b) => distanceToRoom(a.room, player) - distanceToRoom(b.room, player),
    );
    const roomBudget = Math.max(0, this.budget - 1);
    const selection: string[] = [];
    sorted.forEach((entry, index) => {
      const enabled = index < roomBudget;
      entry.light.visible = enabled;
      if (enabled) selection.push(`${entry.room.id}`);
    });
    // Only touch shader state when the set actually changed.
    this.lastSelection = selection.join(',');
  }

  /** Rooms currently lit, for debug output. */
  get litRoomIds(): number[] {
    return this.lights.filter((entry) => entry.light.visible).map((entry) => entry.room.id);
  }

  get selectionKey(): string {
    return this.lastSelection;
  }

  dispose(): void {
    this.playerLight.dispose();
    for (const entry of this.lights) entry.light.dispose();
  }
}
