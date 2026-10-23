import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PhysicsWorld } from '@/game/physics';
import { DungeonScene } from '@/game/scenes/DungeonScene';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { LoadedCharacter } from '@/game/assets/AssetLoader';

/**
 * Whole-floor smoke test: generator + mesh + colliders + doors + props + lights
 * + player, driven without WebGL.
 *
 * The only browser dependency of the scene is the 2D canvas used to paint the
 * procedural stone textures, so a minimal canvas stub is enough to exercise the
 * real construction path in Node. Rendering itself is covered by Playwright.
 */
function installCanvasStub(): () => void {
  const previous = (globalThis as { document?: unknown }).document;
  const fakeDocument = {
    createElement(tag: string): unknown {
      if (tag !== 'canvas') throw new Error(`unexpected element ${tag}`);
      return {
        width: 1,
        height: 1,
        getContext: (): unknown => ({
          createImageData: (width: number, height: number) => ({
            width,
            height,
            data: new Uint8ClampedArray(width * height * 4),
          }),
          putImageData: (): void => undefined,
          // Damage numbers paint text into their own canvas each hit.
          clearRect: (): void => undefined,
          fillText: (): void => undefined,
          strokeText: (): void => undefined,
          measureText: (): { width: number } => ({ width: 0 }),
        }),
      };
    },
  };
  (globalThis as { document?: unknown }).document = fakeDocument;
  return () => {
    (globalThis as { document?: unknown }).document = previous;
  };
}

/** Loads the generated hero GLB from disk, if the asset pipeline ran. */
async function loadHero(): Promise<LoadedCharacter | null> {
  const path = join(process.cwd(), 'public', 'assets', 'models', 'hero.glb');
  try {
    const buffer = readFileSync(path);
    const array = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const gltf = await new GLTFLoader().parseAsync(array, '');
    return { scene: gltf.scene, animations: gltf.animations };
  } catch {
    return null;
  }
}

describe('DungeonScene (headless)', () => {
  let physics: PhysicsWorld;
  let restoreDocument: () => void;

  beforeAll(() => {
    restoreDocument = installCanvasStub();
  });

  afterAll(() => {
    restoreDocument();
  });

  beforeEach(async () => {
    physics = await PhysicsWorld.create();
  });

  afterEach(() => {
    physics.dispose();
  });

  it('builds a playable floor with a bounded light budget', () => {
    const scene = new DungeonScene({ physics, seed: 4242 });
    const snapshot = scene.getDebugSnapshot();
    expect(snapshot.floor).toBe(1);
    expect(snapshot.rooms).toBe(7);
    expect(snapshot.doors).toBeGreaterThan(0);
    expect(snapshot.activeLights).toBeGreaterThan(0);
    expect(snapshot.activeLights).toBeLessThanOrEqual(4);
    expect(snapshot.roomId).not.toBeNull();
    expect(snapshot.canInteract).toBe(false);
    expect(scene.stats.triangles).toBeGreaterThan(100);
    // Contact is resolved by the controller, not by construction.
    for (let i = 0; i < 10; i += 1) physics.step(1 / 60);
    expect(scene.getDebugSnapshot().grounded).toBe(true);
    scene.dispose();
    expect(scene.root.children.length).toBe(0);
  });

  it('uses the generated GLB hero when one is provided', async () => {
    const hero = await loadHero();
    if (!hero) {
      // Without `npm run assets` the scene must stay playable on the placeholder.
      const scene = new DungeonScene({ physics, seed: 5 });
      expect(scene.getDebugSnapshot().heroAsset).toBe('placeholder');
      scene.dispose();
      return;
    }
    const scene = new DungeonScene({ physics, seed: 5, hero });
    expect(scene.getDebugSnapshot().heroAsset).toBe('gltf');
    expect(scene.getDebugSnapshot().heroState).toBe('idle');

    scene.setMoveInput({ x: 0, z: -1, magnitude: 1 });
    for (let i = 0; i < 20; i += 1) {
      physics.step(1 / 60);
      scene.update(1 / 60, i / 60);
    }
    expect(['walk', 'run']).toContain(scene.getDebugSnapshot().heroState);

    scene.triggerAction('attack');
    scene.update(1 / 60, 0.5);
    expect(scene.getDebugSnapshot().heroState).toBe('attack');
    scene.dispose();
  });

  it('applies run levels to the live stat block and refills the new HP', () => {
    const scene = new DungeonScene({ physics, seed: 909 });
    const before = scene.getDebugSnapshot();
    expect(before.level).toBe(1);
    expect(before.maxHp).toBe(100);

    scene.debugGrantXp(200);
    const after = scene.getDebugSnapshot();
    expect(after.level).toBeGreaterThan(1);
    // Levels are additive on top of base stats, and the gained max HP arrives
    // filled so a level-up in the middle of a fight is real relief.
    expect(after.maxHp ?? 0).toBeGreaterThan(before.maxHp ?? 0);
    expect(after.hp).toBe(after.maxHp);
    expect(after.xpToNext ?? 0).toBeGreaterThan(after.xpInLevel ?? 0);
    scene.dispose();
  });

  it('reports a hit-stop request when a strike lands, and nothing when it misses', () => {
    const scene = new DungeonScene({ physics, seed: 910 });
    expect(scene.consumeHitStop()).toBeNull();
    scene.triggerAction('attack');
    // The swing resolves after the wind-up fraction of the attack duration.
    for (let i = 0; i < 40; i += 1) scene.update(1 / 60, i / 60);
    // No enemy in range: a miss must not freeze the world.
    expect(scene.consumeHitStop()).toBeNull();
    scene.dispose();
  });

  it('simulates the player through the fixed step and keeps them grounded', () => {
    const scene = new DungeonScene({ physics, seed: 99 });
    const start = scene.getDebugSnapshot().hero;
    const forward = { x: 0, z: -1 };
    scene.setMoveInput({ x: forward.x, z: forward.z, magnitude: 1 });
    for (let i = 0; i < 90; i += 1) {
      physics.step(1 / 60);
      scene.update(1 / 60, i / 60);
    }
    const moved = scene.getDebugSnapshot();
    const distance = Math.hypot(moved.hero.x - start.x, moved.hero.z - start.z);
    expect(distance).toBeGreaterThan(0.5);
    expect(moved.grounded).toBe(true);
    expect(Math.abs(moved.hero.y)).toBeLessThan(0.2);
    scene.dispose();
  });

  it('offers the stairs interaction only inside its range', () => {
    const scene = new DungeonScene({ physics, seed: 808 });
    expect(scene.getInteractionHint()).toBeNull();

    const exit = scene.exitPosition;
    scene.teleportTo({ x: exit.x + 5, z: exit.z });
    expect(scene.getInteractionHint()).toBeNull();

    scene.teleportTo({ x: exit.x + 1, z: exit.z });
    const hint = scene.getInteractionHint();
    expect(hint?.available).toBe(true);
    expect(hint?.label).toBe('Спуститься ниже');
    expect(scene.getDebugSnapshot().canInteract).toBe(true);

    scene.triggerAction('interact');
    expect(scene.floorNumber).toBe(2);
    scene.dispose();
  });

  it('reports combat vitals and spends stamina on attacks', () => {
    const scene = new DungeonScene({ physics, seed: 11 });
    const start = scene.getDebugSnapshot();
    expect(start.hp).toBe(100);
    expect(start.maxHp).toBe(100);
    expect(start.stamina).toBe(100);
    expect(start.kills).toBe(0);
    expect(start.enemies).toBe(0);

    scene.triggerAction('attack');
    expect(scene.getDebugSnapshot().stamina).toBe(90);

    // Stamina regenerates only after the lockout, through the fixed step.
    // `physics.step` already drives the scene callback registered in the constructor.
    for (let i = 0; i < 120; i += 1) physics.step(1 / 60);
    expect(scene.getDebugSnapshot().stamina).toBeGreaterThan(90);
    scene.dispose();
  });

  it('spawns enemies near the player and removes them on death', () => {
    const scene = new DungeonScene({ physics, seed: 11 });
    for (let i = 0; i < 90; i += 1) {
      physics.step(1 / 60);
      scene.update(1 / 60, i / 60);
    }
    expect(scene.getDebugSnapshot().enemies).toBeGreaterThan(0);

    // Killing the whole wave clears them from the snapshot without leaks.
    const collidersBefore = physics.world.colliders.len();
    scene.clearAllEnemiesForTest();
    expect(scene.getDebugSnapshot().enemies).toBe(0);
    expect(physics.world.colliders.len()).toBeLessThan(collidersBefore);
    scene.dispose();
  });

  it('kills a dummy in front of the player: arc, armour, xp and cleanup', () => {
    const scene = new DungeonScene({ physics, seed: 2024 });
    scene.debugSpawnDummy(1.6);
    // Swing until the dummy dies; the 58 hp skeleton takes three clean hits.
    let killed = false;
    for (let swing = 0; swing < 12 && !killed; swing += 1) {
      scene.triggerAction('attack');
      for (let i = 0; i < 40; i += 1) {
        physics.step(1 / 60);
        scene.update(1 / 60, i / 60);
      }
      killed = (scene.getDebugSnapshot().kills ?? 0) > 0;
      // Let stamina recover between swings, like a real fight.
      for (let i = 0; i < 60; i += 1) physics.step(1 / 60);
    }
    const after = scene.getDebugSnapshot();
    expect(after.kills).toBe(1);
    expect(after.xp).toBeGreaterThan(0);
    expect(after.enemies).toBe(0);
    scene.dispose();
  });

  it('opens a chest once: gold, loot, toast and no double dip', () => {
    const messages: string[] = [];
    const scene = new DungeonScene({ physics, seed: 4242, onNotify: (text) => messages.push(text) });
    expect(scene.getDebugSnapshot().chests).toBeGreaterThan(0);

    const chests = scene.debugChestPositions();
    const chest = chests[0];
    expect(chest).toBeDefined();
    if (!chest) return;

    // Out of reach: no chest offer.
    scene.teleportTo({ x: chest.x + 6, z: chest.z });
    expect(scene.getInteractionHint()).toBeNull();

    scene.teleportTo({ x: chest.x + 0.8, z: chest.z });
    expect(scene.getInteractionHint()?.label).toBe('Открыть сундук');

    scene.triggerAction('interact');
    const opened = scene.getDebugSnapshot();
    expect(opened.chestsOpened).toBe(1);
    expect(opened.gold).toBeGreaterThan(0);
    expect(opened.items).toBeGreaterThan(0);
    // The chest is spent: the offer disappears and a second interact is a no-op.
    expect(scene.getInteractionHint()).toBeNull();
    scene.triggerAction('interact');
    expect(scene.getDebugSnapshot().chestsOpened).toBe(1);
    expect(messages.some((message) => message.startsWith('Сундук:'))).toBe(true);
    scene.dispose();
  });

  it('equips and unequips loot, and the stats follow', () => {
    const scene = new DungeonScene({ physics, seed: 4242 });
    // Seed the bag through a chest, then equip the strongest item.
    const chest = scene.debugChestPositions()[0];
    if (!chest) return;
    scene.teleportTo({ x: chest.x + 0.7, z: chest.z });
    scene.triggerAction('interact');

    const before = scene.getInventorySnapshot();
    expect(before.bag.length).toBeGreaterThan(0);
    const candidate = before.bag[0];
    expect(candidate).toBeDefined();
    if (!candidate) return;

    const baseDamage = scene.vitals.attack.damage;
    expect(scene.equipItem(candidate.uid)).toBe(true);
    const equipped = scene.getInventorySnapshot();
    expect(equipped.equipped[candidate.slot]?.uid).toBe(candidate.uid);
    if (candidate.slot === 'weapon') {
      expect(scene.getDebugSnapshot().weapon).toBe(candidate.defId);
    }

    const bonus = equipped.totals.damage;
    expect(scene.vitals.attack.damage).toBeCloseTo(baseDamage + bonus, 5);

    expect(scene.unequipItem(candidate.slot)).toBe(true);
    expect(scene.vitals.attack.damage).toBeCloseTo(baseDamage, 5);
    // A stale uid (e.g. after a refresh) is rejected, not thrown on.
    expect(scene.equipItem(999_999)).toBe(false);
    scene.dispose();
  });

  it('drains hunger in the fixed step and reports the tier', () => {
    const scene = new DungeonScene({ physics, seed: 4242 });
    const start = scene.getDebugSnapshot();
    expect(start.satiety).toBe(80);
    expect(start.hunger).toBe('fed');

    for (let i = 0; i < 600; i += 1) {
      physics.step(1 / 60);
      scene.update(1 / 60, i / 60);
    }
    const later = scene.getDebugSnapshot();
    expect(later.satiety).toBeLessThan(80);
    expect(later.runSeconds).toBeGreaterThanOrEqual(9);

    // Starving slows regeneration and eventually costs health.
    scene.debugStarve(100);
    expect(scene.getDebugSnapshot().hunger).toBe('starving');
    const hpBefore = scene.getDebugSnapshot().hp ?? 0;
    for (let i = 0; i < 180; i += 1) physics.step(1 / 60);
    expect(scene.getDebugSnapshot().hp).toBeLessThan(hpBefore);
    expect(scene.vitals.regenMultiplier).toBeLessThan(1);
    scene.dispose();
  });

  it('eats a ration to fight starvation', () => {
    const messages: string[] = [];
    const scene = new DungeonScene({ physics, seed: 4242, onNotify: (text) => messages.push(text) });
    expect(scene.getDebugSnapshot().rations).toBeGreaterThan(0);

    scene.debugStarve(100);
    expect(scene.getDebugSnapshot().satiety).toBe(0);
    expect(scene.eatRation()).toBe(true);

    const after = scene.getDebugSnapshot();
    expect(after.satiety).toBeGreaterThan(0);
    expect(after.rations).toBeGreaterThanOrEqual(0);
    expect(after.hunger).not.toBe('starving');

    // Emptying the food bag is reported, not silently ignored.
    scene.run.addRations(-50);
    expect(scene.eatRation()).toBe(false);
    expect(messages.some((text) => text.includes('Пайков'))).toBe(true);
    scene.dispose();
  });

  it('rests at a campfire once, and refuses next to enemies', () => {
    const scene = new DungeonScene({ physics, seed: 4242 });
    const fire = scene.debugCampfirePositions()[0];
    expect(fire).toBeDefined();
    if (!fire) return;

    scene.debugHurt(40);
    scene.teleportTo({ x: fire.x + 0.9, z: fire.z });
    expect(scene.getInteractionHint()?.label).toBe('Отдохнуть у костра');

    scene.triggerAction('interact');
    expect(scene.getDebugSnapshot().hp).toBeGreaterThan(60);
    expect(scene.getDebugSnapshot().restCount).toBe(1);
    // The fire is spent: the offer stays but names the state, and no second heal.
    const healed = scene.getDebugSnapshot().hp ?? 0;
    scene.triggerAction('interact');
    expect(scene.getDebugSnapshot().restCount).toBe(1);
    expect(scene.getDebugSnapshot().hp ?? 0).toBe(healed);
    scene.dispose();
  });

  it('ends the run on death and can start a fresh one', () => {
    const summaries: { floor: number; kills: number; gold: number; cause: string }[] = [];
    const scene = new DungeonScene({
      physics,
      seed: 4242,
      onDeath: (summary) => summaries.push({ ...summary }),
    });

    scene.debugHurt(10_000);
    physics.step(1 / 60);
    expect(scene.isDead).toBe(true);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.floor).toBe(1);
    expect(summaries[0]?.cause).toBe('combat');
    expect(scene.getDebugSnapshot().dead).toBe(true);

    // Frozen: further steps do not tick hunger or re-fire the callback.
    const frozen = scene.getDebugSnapshot().runSeconds;
    for (let i = 0; i < 120; i += 1) physics.step(1 / 60);
    expect(scene.getDebugSnapshot().runSeconds).toBe(frozen);
    expect(summaries).toHaveLength(1);

    scene.restartRun(777);
    const fresh = scene.getDebugSnapshot();
    expect(fresh.dead).toBe(false);
    expect(fresh.hp).toBe(100);
    expect(fresh.kills).toBe(0);
    expect(fresh.gold).toBe(0);
    expect(fresh.satiety).toBe(80);
    expect(scene.getSummary()).toBeNull();
    scene.dispose();
  });

  it('folds meta upgrades into the stat block and the starting rations', () => {
    const base = new DungeonScene({ physics, seed: 7 });
    const baseSnapshot = base.getDebugSnapshot();
    base.dispose();

    const scene = new DungeonScene({
      physics,
      seed: 7,
      metaBonuses: { damage: 6, armor: 6, maxHp: 30, stamina: 24, critChance: 0.06, critMultiplier: 0 },
      startingRations: 2,
    });
    const snapshot = scene.getDebugSnapshot();
    expect(snapshot.maxHp).toBe((baseSnapshot.maxHp ?? 0) + 30);
    expect(snapshot.maxStamina).toBe((baseSnapshot.maxStamina ?? 0) + 24);
    expect(snapshot.rations).toBe((baseSnapshot.rations ?? 0) + 2);
    scene.dispose();
  });

  it('applies upgrades bought between runs via setMetaBonuses', () => {
    const scene = new DungeonScene({ physics, seed: 7 });
    const before = scene.getDebugSnapshot().maxHp ?? 0;
    scene.setMetaBonuses(
      { damage: 0, armor: 0, maxHp: 20, stamina: 0, critChance: 0, critMultiplier: 0 },
      2,
    );
    expect(scene.getDebugSnapshot().maxHp).toBe(before + 20);
    // Starting rations apply to the *next* run, not the one in progress.
    scene.restartRun(99);
    expect(scene.getDebugSnapshot().rations).toBe(3);
    scene.dispose();
  });

  it('spawns the warden on floor 3 and ends the run in victory when it dies', () => {
    const summaries: { cause: string; floor: number; chestsOpened: number }[] = [];
    const messages: string[] = [];
    const scene = new DungeonScene({
      physics,
      seed: 31,
      floor: 3,
      onDeath: (summary) => summaries.push({ ...summary }),
      onNotify: (message) => messages.push(message),
    });
    const arena = scene.debugBossPosition();
    expect(arena).not.toBeNull();
    if (!arena) return;

    // Walk into the arena so the boss spawns within the activation range.
    scene.teleportTo({ x: arena.x + 6, z: arena.z });
    for (let i = 0; i < 120; i += 1) {
      physics.step(1 / 60);
      scene.update(1 / 60, i / 60);
    }

    const boss = scene.getBossState();
    expect(boss?.name).toBe('Смотритель глубин');
    expect(boss?.ratio).toBe(1);
    expect(boss?.phase).toBe(0);

    expect(scene.debugKillBoss()).toBe(true);
    for (let i = 0; i < 30; i += 1) {
      physics.step(1 / 60);
      scene.update(1 / 60, i / 60);
    }

    expect(scene.isDead).toBe(true);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.cause).toBe('victory');
    expect(summaries[0]?.floor).toBe(3);
    // Victory is not a death: the summary must still carry the chest count.
    expect(summaries[0]?.chestsOpened).toBe(0);
    expect(scene.getBossState()).toBeNull();
    scene.dispose();
  });

  it('has no boss on the first two floors', () => {
    const scene = new DungeonScene({ physics, seed: 5, floor: 1 });
    expect(scene.debugBossPosition()).toBeNull();
    expect(scene.getBossState()).toBeNull();
    scene.dispose();
  });

  it('counts attacks and dashes triggered by the HUD', () => {
    const scene = new DungeonScene({ physics, seed: 7 });
    scene.triggerAction('attack');
    scene.triggerAction('dodge');
    const duringDash = scene.getDebugSnapshot();
    expect(duringDash.attacks).toBe(1);
    expect(duringDash.dodging).toBe(true);
    // Skills are inert until stage 7 — pressing them must not throw.
    scene.triggerAction('skill1');
    scene.triggerAction('skill2');
    scene.dispose();
  });

  it('descends to a new floor and rebuilds geometry, doors and lights', () => {
    const floors: number[] = [];
    const scene = new DungeonScene({
      physics,
      seed: 555,
      onFloorChange: (floor) => floors.push(floor),
    });
    const first = scene.stats;
    scene.descend();
    const second = scene.stats;
    expect(floors).toEqual([2]);
    expect(second.floor).toBe(2);
    expect(second.rooms).toBeGreaterThanOrEqual(5);
    expect(second.doors).toBeGreaterThan(0);
    expect(second.activeLights).toBeLessThanOrEqual(4);
    // The player is teleported to the new entrance, inside a room.
    expect(scene.getDebugSnapshot().roomId).not.toBeNull();
    // The old floor must not survive: collider count stays in the same order.
    expect(physics.world.colliders.len()).toBeLessThan(500);
    expect(first.triangles).toBeGreaterThan(0);
    scene.dispose();
    // Everything the scene created (walls, doors, props, floor slab, capsule) is gone.
    expect(physics.world.colliders.len()).toBe(0);
  });

  it('stops on the last floor instead of wrapping (the boss seals the stairs)', () => {
    const messages: string[] = [];
    const scene = new DungeonScene({
      physics,
      seed: 3,
      maxFloors: 2,
      onNotify: (message) => messages.push(message),
    });
    scene.descend();
    expect(scene.floorNumber).toBe(2);
    // A second descent must not silently loop back to floor 1: the run ends
    // with the boss, so the deep floor stays reachable only by winning.
    scene.descend();
    expect(scene.floorNumber).toBe(2);
    expect(messages).toEqual(['Этаж 2']);
    scene.dispose();
  });
});
