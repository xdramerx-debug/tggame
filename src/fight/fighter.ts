import {
  ARENA_HALF_WIDTH,
  GRAVITY,
  METER_MAX,
  TICK_SECONDS,
  WALL_BOUNCE,
  WAKEUP_INVULN_TICKS,
  WAKEUP_TICKS,
} from './types';
import type {
  CharacterDef,
  FrameInput,
  MoveData,
  MoveId,
  FighterSnapshot,
  FighterState,
} from './types';

/** What a hit did to the defender; the battle uses it for combo and feedback. */
export type HitOutcome = 'hit' | 'block' | 'armor' | 'evade';

/** Per-fighter cooldown table: one tick counter per move id. */
const MOVE_IDS: readonly MoveId[] = ['punch', 'kick', 'sweep', 'airkick', 'special', 'super'];

/**
 * One fighter: movement, attack frames, stun and health.
 *
 * The class knows nothing about the opponent beyond its x position and the
 * incoming hits the battle feeds it. That keeps the frame data testable in
 * isolation — `Fighter` can be stepped with a fake opponent in a unit test.
 */
export class Fighter {
  readonly def: CharacterDef;
  readonly index: 0 | 1;

  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  facing: 1 | -1 = 1;

  hp: number;
  meter = 0;
  roundsWon = 0;

  state: FighterState = 'idle';
  stateTicks = 0;

  /** Remaining ticks of hitstun or blockstun. */
  private stunTicks = 0;
  /** Remaining ticks lying on the floor. */
  private downTicks = 0;
  private invulnTicks = 0;

  move: MoveData | null = null;
  moveTicks = 0;
  moveHitIndex = 0;
  private nextHitAt = 0;
  private hitThisWindow = false;
  /** True once the current move has connected (enables cancels). */
  hasConnected = false;
  /** Set for one tick when a projectile should be spawned. */
  projectileReady = false;

  crouching = false;
  blocking = false;
  /** Block intent captured every tick; used when a hit actually arrives. */
  private blockIntent = false;
  hitFlash = 0;

  private readonly cooldowns = new Map<MoveId, number>();
  private previous = { punch: false, kick: false, special: false, super: false, vertical: 0 as -1 | 0 | 1 };

  constructor(def: CharacterDef, index: 0 | 1) {
    this.def = def;
    this.index = index;
    this.hp = def.stats.maxHealth;
  }

  get maxHp(): number {
    return this.def.stats.maxHealth;
  }

  get grounded(): boolean {
    return this.y <= 0.001;
  }

  get isKo(): boolean {
    return this.hp <= 0;
  }

  get canAct(): boolean {
    return this.state === 'idle' || this.state === 'walk' || this.state === 'crouch' || this.state === 'block' || this.state === 'jump';
  }

  get isAttacking(): boolean {
    return this.state === 'attack';
  }

  /** True while the fighter is in any kind of recovery and cannot be interrupted. */
  get isBusy(): boolean {
    return this.state === 'attack' || this.state === 'hitstun' || this.state === 'blockstun' || this.state === 'knockdown' || this.state === 'wakeup';
  }

  /** Puts the fighter back on its mark for a new round. */
  resetForRound(x: number, facing: 1 | -1, keepRounds = true): void {
    if (!keepRounds) this.roundsWon = 0;
    this.x = x;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.facing = facing;
    this.hp = this.maxHp;
    this.meter = Math.min(this.meter, METER_MAX);
    this.state = 'idle';
    this.stateTicks = 0;
    this.stunTicks = 0;
    this.downTicks = 0;
    this.invulnTicks = 0;
    this.move = null;
    this.moveTicks = 0;
    this.crouching = false;
    this.blocking = false;
    this.blockIntent = false;
    this.hitFlash = 0;
    this.cooldowns.clear();
  }

  /** Freezes the winner in a pose; used while the round-end banner plays. */
  celebrate(): void {
    if (this.isKo) return;
    this.state = 'victory';
    this.stateTicks = 0;
    this.move = null;
    this.vx = 0;
  }

  /** Marks the fighter as knocked out (the battle calls this once). */
  knockOut(): void {
    this.hp = 0;
    this.state = 'ko';
    this.stateTicks = 0;
    this.move = null;
    this.vx = 0;
    this.vy = Math.min(this.vy, -2);
  }

  /**
   * Advances one fixed tick.
   * @param input held buttons for this tick
   * @param opponentX horizontal position of the other fighter
   */
  step(input: FrameInput, opponentX: number): void {
    this.stateTicks += 1;
    this.hitFlash = Math.max(0, this.hitFlash - 1);
    this.invulnTicks = Math.max(0, this.invulnTicks - 1);
    this.projectileReady = false;
    for (const id of MOVE_IDS) {
      const value = this.cooldowns.get(id);
      if (value !== undefined && value > 0) this.cooldowns.set(id, value - 1);
    }

    // Block intent is sampled every tick, before any state transition: a hit
    // that lands this frame must know whether the player was holding back.
    this.blockIntent = input.block || input.horizontal === -this.facing;

    if (this.state === 'ko') {
      this.physics();
      return;
    }
    if (this.state === 'victory') {
      this.stateTicks += 0;
      return;
    }

    switch (this.state) {
      case 'hitstun':
      case 'blockstun':
        this.stunTicks -= 1;
        this.blocking = this.state === 'blockstun';
        if (this.stunTicks <= 0) {
          this.blocking = false;
          this.toNeutral();
        }
        break;
      case 'knockdown':
        this.physics();
        if (this.grounded) {
          this.downTicks -= 1;
          if (this.downTicks <= 0) {
            this.state = 'wakeup';
            this.stateTicks = 0;
            this.downTicks = WAKEUP_TICKS;
          }
        }
        break;
      case 'wakeup':
        this.downTicks -= 1;
        if (this.downTicks <= 0) {
          this.invulnTicks = WAKEUP_INVULN_TICKS;
          this.toNeutral();
        }
        break;
      case 'attack':
        this.advanceAttack(input);
        break;
      default:
        this.actionable(input, opponentX);
        break;
    }

    this.physics();
  }

  /** Neutral-state movement and attack selection. */
  private actionable(input: FrameInput, opponentX: number): void {
    // Turn to face the opponent only while able to act: never mid-move.
    if (Math.abs(opponentX - this.x) > 0.05) this.facing = opponentX >= this.x ? 1 : -1;
    this.blocking = false;
    this.crouching = false;

    if (input.super && this.tryStart('super', input)) return;
    if (input.special && this.tryStart('special', input)) return;

    if (this.grounded) {
      // Jump on the rising edge only: holding up must not bunny-hop.
      if (input.vertical === 1 && this.previous.vertical !== 1) {
        this.vy = this.def.stats.jumpSpeed;
        this.vx = input.horizontal * this.def.stats.walkSpeed * 0.9;
        this.state = 'jump';
        this.stateTicks = 0;
        this.remember(input);
        return;
      }

      if (input.vertical === -1) {
        this.crouching = true;
        this.vx = 0;
        this.state = 'crouch';
        if (input.kick && !this.previous.kick) {
          if (this.tryStart('sweep', input)) return;
        }
        if (input.punch && !this.previous.punch) {
          if (this.tryStart('punch', input)) return;
        }
        this.remember(input);
        return;
      }

      if (input.kick && !this.previous.kick) {
        if (this.tryStart('kick', input)) return;
      }
      if (input.punch && !this.previous.punch) {
        if (this.tryStart('punch', input)) return;
      }

      if (input.horizontal !== 0) {
        const forward = input.horizontal === this.facing;
        this.vx = input.horizontal * (forward ? this.def.stats.walkSpeed : this.def.stats.backSpeed);
        this.state = 'walk';
      } else {
        this.vx = 0;
        this.state = 'idle';
      }
      // Blocking is a stance, but it still counts as "walking back".
      if (this.blockIntent) this.state = 'block';
    } else {
      // Airborne: one air attack per jump, no direction changes beyond drift.
      if ((input.punch || input.kick) && !this.previous.punch && !this.previous.kick) {
        if (this.tryStart('airkick', input)) return;
      }
      this.state = 'jump';
    }

    this.remember(input);
  }

  private remember(input: FrameInput): void {
    this.previous = {
      punch: input.punch,
      kick: input.kick,
      special: input.special,
      super: input.super,
      vertical: input.vertical,
    };
  }

  /**
   * Tries to start a move.
   * @returns true when the move started (the caller must stop processing input)
   */
  private tryStart(id: MoveId, input: FrameInput): boolean {
    const data = this.def.moves[id];
    const cooldown = this.cooldowns.get(id) ?? 0;
    if (cooldown > 0) return false;
    const cost = data.cost ?? 0;
    if (cost > 0 && this.meter < cost) return false;
    if (id === 'airkick' && this.grounded) return false;
    if (id !== 'airkick' && !this.grounded && id !== 'special' && id !== 'super') return false;

    this.meter = Math.max(0, this.meter - cost);
    this.move = data;
    this.moveTicks = 0;
    this.moveHitIndex = 0;
    this.nextHitAt = data.startup;
    this.hitThisWindow = false;
    this.hasConnected = false;
    this.state = 'attack';
    this.stateTicks = 0;
    this.crouching = id === 'sweep';
    this.vx = 0;
    this.remember(input);
    return true;
  }

  /** Frame-by-frame attack progression, including cancels into specials. */
  private advanceAttack(input: FrameInput): void {
    const move = this.move;
    if (!move) {
      this.toNeutral();
      return;
    }
    this.moveTicks += 1;

    const startupEnd = move.startup;
    const activeEnd = move.startup + move.active;

    // Forward drift is spread across the startup so dashes read as movement.
    if (move.advance && move.advance !== 0 && this.moveTicks <= startupEnd) {
      this.vx = (move.advance / Math.max(1, startupEnd)) * this.facing * 60;
    } else if (this.grounded) {
      this.vx *= 0.7;
    }

    if (this.moveTicks === startupEnd && move.projectile) this.projectileReady = true;

    // A landed move can be cancelled into a special or a super during recovery:
    // this is the whole combo system, and it must feel generous on a touch HUD.
    if (this.hasConnected && this.moveTicks > startupEnd) {
      const wantsSuper = input.super && !this.previous.super;
      const wantsSpecial = input.special && !this.previous.special;
      if (wantsSuper && this.tryStart('super', input)) return;
      if (!wantsSuper && wantsSpecial && this.tryStart('special', input)) return;
    }
    this.remember(input);

    if (this.moveTicks >= activeEnd + move.recovery) {
      this.toNeutral();
    }
  }

  /** True while a hitbox should be tested against the opponent right now. */
  wantsToHit(): boolean {
    const move = this.move;
    if (this.state !== 'attack' || !move) return false;
    if (this.moveTicks < move.startup || this.moveTicks >= move.startup + move.active) return false;

    const hits = move.hits ?? 1;
    if (hits <= 1) return !this.hitThisWindow;
    return !this.hitThisWindow && this.moveTicks >= this.nextHitAt;
  }

  /** Registers that the current hit window connected (or was blocked). */
  markHitLanded(blocked: boolean): void {
    const move = this.move;
    if (!move) return;
    this.hitThisWindow = true;
    this.hasConnected = true;
    const hits = move.hits ?? 1;
    if (this.moveHitIndex + 1 < hits) {
      this.moveHitIndex += 1;
      this.nextHitAt = this.moveTicks + (move.hitInterval ?? 4);
      this.hitThisWindow = false;
    }
    if (!blocked) this.meter = Math.min(METER_MAX, this.meter + move.meterGain);
    else this.meter = Math.min(METER_MAX, this.meter + move.meterGain * 0.25);
  }

  /** A whiffed attack still costs meter gain, but nothing else. */
  markWhiff(): void {
    this.hitThisWindow = true;
  }

  /**
   * Applies an incoming hit.
   *
   * Height rules are resolved by the battle before this is called (it knows
   * whether the swing whiffed); here we only decide block vs clean hit.
   */
  takeHit(rawDamage: number, move: MoveData | null, attackerX: number, unblockable = false): { outcome: HitOutcome; damage: number } {
    if (this.state === 'ko') return { outcome: 'evade', damage: 0 };
    if (this.invulnTicks > 0) return { outcome: 'evade', damage: 0 };
    // Teleport-style specials (OKO) are fully intangible for their duration.
    if (this.state === 'attack' && (this.move?.invulnerable ?? false)) return { outcome: 'evade', damage: 0 };

    const height = move?.height ?? 'mid';
    const canBlockLow = height !== 'low' || this.crouching;
    const canBlockHigh = height !== 'high' || !this.crouching;
    const wantsBlock = this.blockIntent && !unblockable && !(move?.unblockable ?? false);
    const blockingNow = wantsBlock && canBlockLow && canBlockHigh && this.grounded;

    const scaled = Math.max(1, Math.round(rawDamage * this.def.stats.defense));
    const away = attackerX >= this.x ? -1 : 1;

    if (blockingNow) {
      const chip = Math.round(scaled * (move?.chip ?? 0.1));
      this.hp = Math.max(0, this.hp - chip);
      this.stunTicks = move?.blockstun ?? 12;
      this.state = 'blockstun';
      this.stateTicks = 0;
      this.blocking = true;
      this.vx = away * 2.2;
      this.meter = Math.min(METER_MAX, this.meter + scaled * 0.08);
      if (this.hp <= 0) this.knockOut();
      return { outcome: 'block', damage: chip };
    }

    // Armoured moves eat the damage but keep going.
    const armored = this.state === 'attack' && (this.move?.armor ?? false);
    this.hp = Math.max(0, this.hp - scaled);
    this.hitFlash = 8;
    this.meter = Math.min(METER_MAX, this.meter + scaled * 0.25);
    if (this.hp <= 0) {
      this.knockOut();
      return { outcome: 'hit', damage: scaled };
    }
    if (armored) return { outcome: 'armor', damage: scaled };

    const launch = move?.launch ?? 0;
    const knockback = (move?.knockback ?? 0.3) / this.def.stats.weight;
    this.vx = away * knockback * 10;
    if (move?.knockdown === true || launch > 0) {
      this.vy = launch > 0 ? launch : 5.4;
      this.state = 'knockdown';
      this.stateTicks = 0;
      this.downTicks = WAKEUP_TICKS;
      this.move = null;
      this.blocking = false;
    } else {
      this.stunTicks = move?.hitstun ?? 14;
      this.state = 'hitstun';
      this.stateTicks = 0;
      this.move = null;
      this.blocking = false;
    }
    this.crouching = false;
    return { outcome: 'hit', damage: scaled };
  }

  /** Damage that ignores the state machine (starvation, stage hazards). */
  applyDirectDamage(amount: number): void {
    this.hp = Math.max(0, this.hp - Math.max(0, amount));
    if (this.hp <= 0) this.knockOut();
  }

  /** Turns the fighter around between rounds without touching the state machine. */
  faceOpponent(opponentX: number): void {
    if (Math.abs(opponentX - this.x) > 0.05) this.facing = opponentX >= this.x ? 1 : -1;
  }

  snapshot(combo = 0): FighterSnapshot {
    return {
      id: this.def.id,
      x: this.x,
      y: this.y,
      facing: this.facing,
      hp: this.hp,
      maxHp: this.maxHp,
      meter: this.meter,
      state: this.state,
      stateTicks: this.stateTicks,
      move: this.move?.id ?? null,
      moveTicks: this.moveTicks,
      crouching: this.crouching,
      blocking: this.blocking,
      airborne: !this.grounded,
      combo,
      roundsWon: this.roundsWon,
      hitFlash: this.hitFlash,
    };
  }

  private toNeutral(): void {
    this.state = 'idle';
    this.stateTicks = 0;
    this.move = null;
    this.moveTicks = 0;
    this.stunTicks = 0;
    this.crouching = false;
    this.blocking = false;
  }

  /** Gravity, landing and the arena walls. */
  private physics(): void {
    if (!this.grounded || this.vy > 0) {
      this.vy += GRAVITY * TICK_SECONDS;
      this.y += this.vy * TICK_SECONDS;
      if (this.y <= 0.0001) {
        this.y = 0;
        this.vy = 0;
        if (this.state === 'knockdown') {
          this.downTicks = WAKEUP_TICKS;
          this.vx *= 0.2;
        } else if (this.state === 'jump') {
          this.state = 'idle';
        }
      }
    }

    this.x += this.vx * TICK_SECONDS;
    this.vx *= this.grounded ? 0.72 : 0.995;
    if (Math.abs(this.vx) < 0.02) this.vx = 0;

    if (this.x < -ARENA_HALF_WIDTH) {
      this.x = -ARENA_HALF_WIDTH;
      this.vx = Math.abs(this.vx) * WALL_BOUNCE;
    } else if (this.x > ARENA_HALF_WIDTH) {
      this.x = ARENA_HALF_WIDTH;
      this.vx = -Math.abs(this.vx) * WALL_BOUNCE;
    }
  }
}
