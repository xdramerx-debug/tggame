import { describe, expect, it } from 'vitest';
import { phaseIndex, phaseMultipliers } from '@/game/ai/BossPhase';
import type { BossPhase } from '@/game/ai/BossPhase';
import { bossForFloor, monstersForFloor, pickMonsterForRoom, SPAWN_RULES } from '@/game/combat/monsterTable';
import { EnemyDirector } from '@/game/world/EnemyDirector';
import type { Dungeon, DungeonRoom, RoomTypeId } from '@/game/world/dungeonTypes';

const PHASES: readonly BossPhase[] = [
  { at: 0.66, speedMul: 1.2, damageMul: 1.15, cooldownMul: 0.9, taunt: 'one' },
  { at: 0.33, speedMul: 1.45, damageMul: 1.35, cooldownMul: 0.72, taunt: 'two' },
];

const LIGHT = { color: '#000000', intensity: 0, distance: 1, flicker: false } as const;

function room(id: number, type: RoomTypeId, centerX: number): DungeonRoom {
  return {
    id,
    type,
    x: centerX - 4,
    y: -4,
    w: 8,
    h: 8,
    ceiling: 3,
    light: LIGHT,
    center: { x: centerX, z: 0 },
    spawnPoints: [
      { x: centerX - 2, z: 0 },
      { x: centerX + 2, z: 0 },
      { x: centerX, z: 2 },
    ],
  };
}

function dungeon(rooms: readonly DungeonRoom[], floor: number): Dungeon {
  return {
    seed: 11,
    floor,
    width: 64,
    height: 64,
    tiles: new Uint8Array(64 * 64),
    roomIds: new Int16Array(64 * 64),
    rooms,
    entrance: rooms[0]?.center ?? { x: 0, z: 0 },
    exit: rooms[rooms.length - 1]?.center ?? { x: 0, z: 0 },
    corridors: [],
  } as unknown as Dungeon;
}

describe('boss phases', () => {
  it('stays neutral while the boss is above every threshold', () => {
    expect(phaseIndex(1, PHASES)).toBe(-1);
    expect(phaseIndex(0.9, PHASES)).toBe(-1);
    expect(phaseMultipliers(0.9, PHASES)).toEqual({ speed: 1, damage: 1, cooldown: 1, index: -1 });
  });

  it('triggers each phase exactly at its threshold', () => {
    expect(phaseIndex(0.66, PHASES)).toBe(0);
    expect(phaseIndex(0.5, PHASES)).toBe(0);
    expect(phaseIndex(0.33, PHASES)).toBe(1);
    expect(phaseIndex(0.05, PHASES)).toBe(1);
  });

  it('scales speed, damage and cooldown together', () => {
    expect(phaseMultipliers(0.2, PHASES)).toEqual({ speed: 1.45, damage: 1.35, cooldown: 0.72, index: 1 });
  });

  it('is neutral when a monster has no phases (every non-boss)', () => {
    expect(phaseMultipliers(0.01, [])).toEqual({ speed: 1, damage: 1, cooldown: 1, index: -1 });
  });
});

describe('boss table', () => {
  it('only spawns the warden on the boss floor', () => {
    expect(bossForFloor(1)).toBeNull();
    expect(bossForFloor(2)).toBeNull();
    expect(bossForFloor(3)?.id).toBe('warden');
  });

  it('never offers the boss to the random room picker', () => {
    const picks = Array.from({ length: 40 }, () => pickMonsterForRoom('boss', 3, Math.random));
    expect(picks.every((monster) => monster?.boss !== true)).toBe(true);
  });

  it('keeps the revenant gated behind floor 2 via data, not a special case', () => {
    expect(monstersForFloor(1).map((monster) => monster.id)).not.toContain('revenant');
    expect(monstersForFloor(2).map((monster) => monster.id)).toContain('revenant');
    expect(monstersForFloor(3).map((monster) => monster.id)).toContain('warden');
  });

  it('buys the boss room one add at most', () => {
    expect(SPAWN_RULES.bossRoomAdds).toBe(1);
  });
});

describe('boss placement', () => {
  const layout = dungeon([room(0, 'entrance', 0), room(1, 'combat', 20), room(2, 'boss', 40)], 3);

  it('puts the boss in the middle of its arena', () => {
    const director = new EnemyDirector({ dungeon: layout, floor: 3, seed: 99 });
    const boss = director.planned.filter((spawn) => spawn.boss === true);
    expect(boss).toHaveLength(1);
    expect(boss[0]?.definition.id).toBe('warden');
    expect(boss[0]).toMatchObject({ x: 40, z: 0, roomId: 2 });
  });

  it('adds at most one minion to the boss room', () => {
    const director = new EnemyDirector({ dungeon: layout, floor: 3, seed: 99 });
    const inBossRoom = director.planned.filter((spawn) => spawn.roomId === 2);
    expect(inBossRoom.length).toBeLessThanOrEqual(2);
    expect(inBossRoom.filter((spawn) => spawn.boss !== true).length).toBeLessThanOrEqual(1);
  });

  it('never lets the boss be culled by distance', () => {
    const director = new EnemyDirector({ dungeon: layout, floor: 3, seed: 99 });
    const boss = director.planned.find((spawn) => spawn.boss === true);
    expect(boss).toBeDefined();
    if (!boss) return;
    const decision = director.reconcile([{ id: boss.id, x: boss.x, z: boss.z, dead: false }], { x: 0, z: 0 });
    expect(decision.despawn).not.toContain(boss.id);
  });

  it('culls ordinary monsters at the deactivate range', () => {
    const director = new EnemyDirector({ dungeon: layout, floor: 3, seed: 99 });
    const minion = director.planned.find((spawn) => spawn.roomId === 1);
    expect(minion).toBeDefined();
    if (!minion) return;
    const decision = director.reconcile([{ id: minion.id, x: minion.x, z: minion.z, dead: false }], {
      x: -120,
      z: -120,
    });
    expect(decision.despawn).toContain(minion.id);
  });
});
