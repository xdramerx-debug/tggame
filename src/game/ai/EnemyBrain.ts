/** Enemy behaviour states. `windup` is the telegraph, `strike` the damage frame. */
export type EnemyState = 'idle' | 'chase' | 'windup' | 'recover' | 'stagger' | 'dead';

export interface EnemyBrainConfig {
  readonly aggroRange: number;
  readonly leashRange: number;
  readonly attackRange: number;
  /** Telegraph length; the player can dodge out of it. */
  readonly windup: number;
  /** Cooldown after a swing before the next one. */
  readonly recover: number;
  readonly staggerTime: number;
}

export interface BrainInput {
  readonly distance: number;
  /** False when a wall or a closed door is between the enemy and the player. */
  readonly hasLineOfSight: boolean;
  readonly dt: number;
}

export interface BrainOutput {
  readonly state: EnemyState;
  /** True when the enemy should step towards the player this tick. */
  readonly moveTowardTarget: boolean;
  /** True exactly once, on the frame the swing lands. */
  readonly strike: boolean;
}

/**
 * Deterministic melee AI, one instance per enemy.
 *
 * Deliberately simple and readable: notice → chase → telegraph → strike →
 * recover, with line-of-sight gating so enemies do not claw through walls, and a
 * leash that sends them home if the player runs away. Every timer is advanced by
 * the fixed step, so behaviour is identical on 60 and 120 Hz devices — the only
 * thing the renderer does is ask for the current state.
 */
export class EnemyBrain {
  private stateValue: EnemyState = 'idle';
  private timer = 0;
  private hasAggro = false;

  constructor(private readonly config: EnemyBrainConfig) {}

  get state(): EnemyState {
    return this.stateValue;
  }

  get isHostile(): boolean {
    return this.stateValue !== 'idle' && this.stateValue !== 'dead';
  }

  /** True while the enemy must stand still (telegraph, swing, stagger). */
  get isBusy(): boolean {
    return this.stateValue === 'windup' || this.stateValue === 'recover' || this.stateValue === 'stagger';
  }

  /** Interrupts the current action; used when the enemy takes damage. */
  stagger(): void {
    if (this.stateValue === 'dead') return;
    this.stateValue = 'stagger';
    this.timer = this.config.staggerTime;
  }

  kill(): void {
    this.stateValue = 'dead';
    this.timer = 0;
    this.hasAggro = false;
  }

  update(input: BrainInput): BrainOutput {
    const { dt } = input;
    const out = (state: EnemyState, moveTowardTarget = false, strike = false): BrainOutput => ({
      state,
      moveTowardTarget,
      strike,
    });

    switch (this.stateValue) {
      case 'dead':
        return out('dead');

      case 'idle': {
        if (input.distance <= this.config.aggroRange && input.hasLineOfSight) {
          this.hasAggro = true;
          this.stateValue = 'chase';
          return out('chase', true);
        }
        return out('idle');
      }

      case 'chase': {
        // Leash: the player left the room and the enemy is far away.
        if (input.distance > this.config.leashRange) {
          this.hasAggro = false;
          this.stateValue = 'idle';
          return out('idle');
        }
        if (!input.hasLineOfSight) return out('chase', true);
        if (input.distance <= this.config.attackRange) {
          this.stateValue = 'windup';
          this.timer = this.config.windup;
          return out('windup');
        }
        return out('chase', true);
      }

      case 'windup': {
        this.timer -= dt;
        if (this.timer > 0) return out('windup');
        // The swing only lands if the player is still in reach: dodging works.
        const connects = input.distance <= this.config.attackRange + 0.35;
        this.stateValue = 'recover';
        this.timer = this.config.recover;
        return out('recover', false, connects);
      }

      case 'recover': {
        this.timer -= dt;
        if (this.timer > 0) return out('recover');
        this.stateValue = 'chase';
        return out('chase', true);
      }

      case 'stagger': {
        this.timer -= dt;
        if (this.timer > 0) return out('stagger');
        this.stateValue = this.hasAggro ? 'chase' : 'idle';
        return out(this.stateValue, this.hasAggro);
      }

      default:
        return out('idle');
    }
  }
}
