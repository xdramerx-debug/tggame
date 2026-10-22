import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PhysicsWorld } from '@/game/physics';
import { Enemy } from '@/game/entities/Enemy';
import { monsterById } from '@/game/combat/monsterTable';

const SKELETON = monsterById('skeleton');
const WARDEN = monsterById('warden');

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

  describe('boss', () => {
    function boss(): Enemy {
      if (!WARDEN) throw new Error('warden missing from monsters.json');
      return new Enemy({ definition: WARDEN, model: null, physics, spawn: { x: 0, z: 0 }, index: 77 });
    }

    it('identifies itself and starts without a phase', () => {
      const enemy = boss();
      expect(enemy.isBoss).toBe(true);
      expect(enemy.phase).toBe(-1);
      expect(enemy.hpRatio).toBe(1);
      expect(enemy.name).toBe(WARDEN?.label);
      enemy.dispose();
    });

    it('announces each enrage step exactly once, in order', () => {
      const enemy = boss();
      const seen: { index: number; taunt: string }[] = [];
      enemy.onPhaseChange = (phase) => seen.push(phase);

      const total = WARDEN?.maxHp ?? 1;
      // Chip damage down to ~50 %: the first threshold (66 %) must fire once.
      for (let i = 0; i < 300 && enemy.hpRatio > 0.5; i += 1) {
        enemy.takeDamage(total * 0.02, { x: 0, z: -1 }, false);
      }
      expect(seen).toHaveLength(1);
      expect(seen[0]?.index).toBe(0);
      expect(seen[0]?.taunt).toBe(WARDEN?.phases?.[0]?.taunt);
      expect(enemy.phase).toBe(0);

      for (let i = 0; i < 300 && enemy.hpRatio > 0.2; i += 1) {
        enemy.takeDamage(total * 0.02, { x: 0, z: -1 }, false);
      }
      expect(seen).toHaveLength(2);
      expect(seen[1]?.index).toBe(1);
      expect(enemy.phase).toBe(1);
      enemy.dispose();
    });

    it('hits harder and shrugs off stagger in the last phase', () => {
      const enemy = boss();
      const base = WARDEN?.damage ?? 0;
      expect(enemy.strikeDamage).toBe(base);

      const total = WARDEN?.maxHp ?? 1;
      for (let i = 0; i < 300 && enemy.hpRatio > 0.3; i += 1) {
        enemy.takeDamage(total * 0.02, { x: 0, z: -1 }, false);
      }
      expect(enemy.strikeDamage).toBeGreaterThan(base);
      expect(enemy.strikeDamage).toBeCloseTo(base * (WARDEN?.phases?.[1]?.damageMul ?? 1), 5);
      // A boss is not interruptible: chip damage must not cancel its telegraph.
      expect(enemy.brain.state).not.toBe('stagger');
      enemy.dispose();
    });

    it('still staggers ordinary monsters', () => {
      const enemy = spawn();
      enemy.takeDamage(5, { x: 1, z: 0 }, false);
      expect(enemy.brain.state).toBe('stagger');
      enemy.dispose();
    });
  });
});
