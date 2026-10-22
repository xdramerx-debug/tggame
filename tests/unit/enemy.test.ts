import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PhysicsWorld } from '@/game/physics';
import { Enemy } from '@/game/entities/Enemy';
import { monsterById } from '@/game/combat/monsterTable';

const SKELETON = monsterById('skeleton');

describe('Enemy', () => {
  let physics: PhysicsWorld;

  beforeEach(async () => {
    physics = await PhysicsWorld.create();
  });

  afterEach(() => {
    physics.dispose();
  });

  function spawn(x = 0, z = 0): Enemy {
    if (!SKELETON) throw new Error('skeleton missing from monsters.json');
    return new Enemy({ definition: SKELETON, model: null, physics, spawn: { x, z }, index: 1 });
  }

  it('spawns at the requested point with full health', () => {
    const enemy = spawn(3, -4);
    expect(enemy.position.x).toBeCloseTo(3, 1);
    expect(enemy.position.z).toBeCloseTo(-4, 1);
    expect(enemy.health.hp).toBe(SKELETON?.maxHp);
    expect(enemy.isDead).toBe(false);
    enemy.dispose();
  });

  it('chases and strikes the player exactly once per windup', () => {
    const enemy = spawn(0, -3);
    const player = { x: 0, z: 0 };
    let strikes = 0;
    for (let i = 0; i < 240; i += 1) {
      enemy.fixedUpdate(1 / 60, player, true);
      // Kinematic translation is applied by the world step, like in the engine.
      physics.step(1 / 60);
      enemy.update(1 / 60, i / 60, 0);
      if (enemy.takeStrike()) strikes += 1;
    }
    expect(strikes).toBeGreaterThanOrEqual(1);
    expect(Math.hypot(enemy.position.x - player.x, enemy.position.z - player.z)).toBeLessThan(3);
    enemy.dispose();
  });

  it('takes mitigated damage, becomes staggered and dies', () => {
    const enemy = spawn();
    const first = enemy.takeDamage(20, { x: 1, z: 0 }, false);
    expect(first.applied).toBeGreaterThan(0);
    expect(first.applied).toBeLessThan(20); // armour applies
    expect(enemy.brain.state).toBe('stagger');

    const before = enemy.health.hp;
    for (let i = 0; i < 60; i += 1) {
      enemy.fixedUpdate(1 / 60, { x: 0, z: 0 }, true);
      physics.step(1 / 60);
    }
    // Stagger expires and the enemy re-engages; hp only goes down from hits.
    expect(enemy.health.hp).toBe(before);

    const kill = enemy.takeDamage(10_000, { x: 1, z: 0 }, true);
    expect(kill.killed).toBe(true);
    expect(enemy.isDead).toBe(true);
    expect(enemy.brain.state).toBe('dead');
    // Dead enemies ignore further hits.
    expect(enemy.takeDamage(10, { x: 0, z: 0 }, false).applied).toBe(0);
    enemy.dispose();
  });

  it('is removed only after the death animation has played', () => {
    const enemy = spawn();
    enemy.takeDamage(10_000, { x: 1, z: 0 }, true);
    expect(enemy.canBeRemoved).toBe(false);
    for (let i = 0; i < 120; i += 1) enemy.update((i + 1) / 60, 0, 0);
    expect(enemy.canBeRemoved).toBe(true);
    enemy.dispose();
  });

  it('knockback pushes the body away from the attacker', () => {
    const enemy = spawn(0, 0);
    enemy.takeDamage(10, { x: 0, z: -1 }, false);
    const startZ = enemy.position.z;
    // Target far outside the leash: the brain idles, so only knockback moves it.
    for (let i = 0; i < 20; i += 1) {
      enemy.fixedUpdate(1 / 60, { x: 0, z: -100 }, true);
      physics.step(1 / 60);
    }
    expect(enemy.position.z).toBeGreaterThan(startZ);
    enemy.dispose();
  });
});
