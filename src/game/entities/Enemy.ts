import { Group, Vector3 } from 'three';
import { CharacterBody, MONSTER_CAPSULE } from '@/game/physics';
import type { Collider } from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from '@/game/physics';
import type { MonsterDefinition } from '@/game/combat/monsterTable';
import { Health } from '@/game/combat/Health';
import type { DamageResult } from '@/game/combat/Health';
import { EnemyBrain } from '@/game/ai/EnemyBrain';
import { CharacterModel, placeCharacter } from './CharacterModel';
import type { LoadedCharacter } from '@/game/assets/AssetLoader';
import { directionToYaw, shortestAngleDelta } from '@/input/movement';

export interface EnemyOptions {
  readonly definition: MonsterDefinition;
  readonly model: LoadedCharacter | null;
  readonly physics: PhysicsWorld;
  readonly spawn: { x: number; z: number };
  readonly index: number;
}

const DESPAWN_DELAY = 1.6;

/**
 * One dungeon enemy: capsule body + skinned model + brain + health.
 *
 * Runs inside the scene's fixed step so its movement is frame-rate independent,
 * and exposes only integers/flags the scene needs: `state`, `hp`, `isDead`,
 * `strikePending`. The brain decides, this class executes: it walks toward the
 * player, turns to face them, applies knockback and reports a landed swing once.
 */
export class Enemy {
  readonly definition: MonsterDefinition;
  readonly health: Health;
  readonly group: Group;
  readonly id: number;
  brain: EnemyBrain;

  private readonly body: CharacterBody;
  private readonly model: CharacterModel | null;
  private readonly knockback = new Vector3();
  private facing = 0;
  private deathTimer = 0;
  private strikePending = false;
  private hitFlash = 0;

  constructor(options: EnemyOptions) {
    this.definition = options.definition;
    this.id = options.index;
    this.health = new Health(options.definition.maxHp, options.definition.armor);
    this.brain = new EnemyBrain({
      aggroRange: options.definition.aggroRange,
      leashRange: options.definition.leashRange,
      attackRange: options.definition.attackRange,
      windup: options.definition.windup,
      recover: options.definition.windup + options.definition.attackCooldown,
      staggerTime: options.definition.staggerTime,
    });

    this.body = new CharacterBody(options.physics, {
      dimensions: MONSTER_CAPSULE,
      position: { x: options.spawn.x, y: 0.1, z: options.spawn.z },
    });

    this.model = options.model
      ? new CharacterModel(options.model, {
          eyeHeight: 1.2,
          runThreshold: 2.4,
          moveThreshold: 0.05,
        })
      : null;
    this.group = this.model?.group ?? new Group();
    this.group.name = `enemy-${options.definition.id}-${options.index}`;
    this.group.position.set(options.spawn.x, 0.1, options.spawn.z);
  }

  get position(): { x: number; y: number; z: number } {
    return this.body.feet;
  }

  get isDead(): boolean {
    return this.health.isDead;
  }

  /** True on the tick the swing lands (consumed by the scene). */
  takeStrike(): boolean {
    if (!this.strikePending) return false;
    this.strikePending = false;
    return true;
  }

  get state(): string {
    if (this.model) return this.brain.state === 'dead' ? 'death' : this.model.state;
    return this.brain.state;
  }

  /** Animation/visual update, called once per rendered frame. */
  update(dt: number, elapsed: number, speed: number): void {
    placeCharacter(this.group, this.position, this.facing);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.model?.update(dt, speed);
    if (this.hitFlash > 0) {
      this.group.position.y += Math.sin(elapsed * 60) * 0.01;
    }
    if (this.isDead) this.deathTimer += dt;
  }

  /** Simulation step: AI, locomotion, timers. */
  fixedUpdate(dt: number, target: { x: number; z: number }, hasLineOfSight: boolean): void {
    this.health.tick(dt);
    if (this.isDead) {
      this.applyKnockback(dt);
      return;
    }

    const dx = target.x - this.position.x;
    const dz = target.z - this.position.z;
    const distance = Math.hypot(dx, dz);
    const decision = this.brain.update({ distance, hasLineOfSight, dt });
    if (decision.strike) this.strikePending = true;

    let moveX = 0;
    let moveZ = 0;
    if (decision.moveTowardTarget && distance > this.definition.attackRange * 0.85) {
      moveX = (dx / distance) * this.definition.speed;
      moveZ = (dz / distance) * this.definition.speed;
    }

    const knockbackSpeed = this.knockback.length();
    if (knockbackSpeed > 0.05) {
      moveX += this.knockback.x;
      moveZ += this.knockback.z;
      const decay = Math.max(0, 1 - dt * 6);
      this.knockback.multiplyScalar(decay);
    }

    if (moveX !== 0 || moveZ !== 0) {
      this.body.moveBy({ x: moveX * dt, y: 0, z: moveZ * dt });
      const targetYaw = directionToYaw({ x: moveX, y: moveZ });
      this.facing += shortestAngleDelta(this.facing, targetYaw) * Math.min(1, dt * 10);
    } else if (decision.state !== 'idle' && distance > 0.001) {
      // Always face the player while attacking, even standing still.
      const targetYaw = directionToYaw({ x: dx, y: dz });
      this.facing += shortestAngleDelta(this.facing, targetYaw) * Math.min(1, dt * 8);
    }
  }

  /**
   * Applies a hit. Knockback is scaled by the hit direction, stagger interrupts
   * a telegraph, and death plays the death clip before the body is removed.
   */
  takeDamage(amount: number, from: { x: number; z: number }, critical: boolean): DamageResult {
    const result = this.health.damage(amount, critical);
    if (result.applied <= 0) return result;

    this.hitFlash = 0.12;
    const dx = this.position.x - from.x;
    const dz = this.position.z - from.z;
    const length = Math.hypot(dx, dz) || 1;
    const strength = this.definition.knockback * (critical ? 1.6 : 1);
    this.knockback.set((dx / length) * strength, 0, (dz / length) * strength);

    if (result.killed) {
      this.brain.kill();
      this.model?.playDeath();
    } else {
      this.brain.stagger();
      this.model?.playHit();
    }
    return result;
  }

  /** Rapier collider, excluded from line-of-sight raycasts to this enemy. */
  get collider(): Collider {
    return this.body.capsule;
  }

  /** Distance from the enemy's axis to the player, for AI and combat checks. */
  get radius(): number {
    return MONSTER_CAPSULE.radius;
  }

  get canBeRemoved(): boolean {
    return this.isDead && this.deathTimer > DESPAWN_DELAY;
  }

  dispose(): void {
    this.model?.dispose();
    this.body.dispose();
    this.group.removeFromParent();
  }

  private applyKnockback(dt: number): void {
    if (this.knockback.lengthSq() < 0.01) return;
    this.body.moveBy({ x: this.knockback.x * dt, y: 0, z: this.knockback.z * dt });
    this.knockback.multiplyScalar(Math.max(0, 1 - dt * 8));
  }
}
