import type { BattleSnapshot, FrameInput } from './types';

export type Difficulty = 'easy' | 'normal' | 'hard';

interface Behaviour {
  /** Ticks between decisions. Lower = sharper reactions. */
  readonly reaction: number;
  /** 0…1 chance to block an incoming attack. */
  readonly blockChance: number;
  /** Chance to start a special when the spacing allows it. */
  readonly specialChance: number;
  /** Chance to jump in from mid range. */
  readonly jumpChance: number;
  /** Multiplier on how often the AI simply walks forward. */
  readonly aggression: number;
}

export const DIFFICULTY: Readonly<Record<Difficulty, Behaviour>> = {
  easy: { reaction: 22, blockChance: 0.25, specialChance: 0.12, jumpChance: 0.05, aggression: 0.55 },
  normal: { reaction: 12, blockChance: 0.55, specialChance: 0.28, jumpChance: 0.12, aggression: 0.8 },
  hard: { reaction: 6, blockChance: 0.82, specialChance: 0.45, jumpChance: 0.2, aggression: 1 },
};

type Plan = 'approach' | 'retreat' | 'strike' | 'block' | 'jump' | 'special' | 'wait' | 'super';

/**
 * The opponent's brain.
 *
 * Deliberately a timing-aware state machine instead of a learning agent: a
 * fighting-game AI has to be *readable*, otherwise the player cannot learn from
 * a loss. Decisions are re-evaluated every `reaction` ticks, buttons are pulsed
 * for a single tick (the fighter needs an edge to fire), and everything is
 * driven by an injected RNG so tests can pin a seed.
 */
export class AiController {
  private readonly difficulty: Difficulty;
  private readonly random: () => number;
  private plan: Plan = 'wait';
  private planTicks = 0;
  private decisionIn = 0;
  private held = { punch: false, kick: false, special: false, super: false, block: false, vertical: 0 as -1 | 0 | 1 };
  private pulse = 0;

  constructor(difficulty: Difficulty = 'normal', random: () => number = Math.random) {
    this.difficulty = difficulty;
    this.random = random;
  }

  /** Drops all buttons (round transitions, pauses). */
  release(): FrameInput {
    this.held = { punch: false, kick: false, special: false, super: false, block: false, vertical: 0 };
    return this.toInput(0);
  }

  /**
   * Produces the input for the next tick.
   * @param view current battle snapshot
   * @param self index of the AI fighter
   */
  step(view: BattleSnapshot, self: 0 | 1): FrameInput {
    const me = view.fighters[self];
    const foe = view.fighters[self === 0 ? 1 : 0];
    const distance = Math.abs(foe.x - me.x);
    const behaviour = DIFFICULTY[this.difficulty];
    const towards = (foe.x >= me.x ? 1 : -1);

    // The AI only acts during a live round and while it can act.
    if (view.phase !== 'fight' || me.state === 'ko' || me.state === 'victory') {
      return this.release();
    }

    this.decisionIn -= 1;
    this.pulse = Math.max(0, this.pulse - 1);
    this.planTicks += 1;

    const threatened =
      foe.state === 'attack' &&
      foe.move !== null &&
      distance < 2.6 &&
      !me.airborne;

    if (this.decisionIn <= 0 && !this.isAttacking(me.state)) {
      this.decisionIn = behaviour.reaction;
      this.plan = this.decide(behaviour, distance, me.meter, threatened, view.timer);
      this.planTicks = 0;
    }

    this.held.punch = false;
    this.held.kick = false;
    this.held.special = false;
    this.held.super = false;
    this.held.block = false;
    this.held.vertical = 0;

    let horizontal: -1 | 0 | 1 = 0;

    switch (this.plan) {
      case 'block':
        this.held.block = true;
        // Crouch-block against lows: the AI should not eat sweeps for free.
        if (foe.move === 'sweep' && distance < 2) this.held.vertical = -1;
        break;
      case 'approach':
        horizontal = towards;
        if (distance > 1.2 && this.planTicks > 8 && this.random() < behaviour.jumpChance) {
          this.plan = 'jump';
        }
        break;
      case 'retreat':
        horizontal = (-towards) as -1 | 1;
        break;
      case 'jump':
        if (me.airborne) {
          horizontal = towards;
          if (this.pulse === 0 && distance < 1.9) {
            this.held.kick = true;
            this.pulse = 6;
          }
        } else if (this.planTicks <= 2) {
          this.held.vertical = 1;
        }
        break;
      case 'strike':
        if (distance > 2) {
          horizontal = towards;
        } else if (this.pulse === 0) {
          // Prefer a sweep against a crouching opponent, a kick otherwise.
          if (foe.crouching && this.random() < 0.5) {
            this.held.kick = true;
            this.held.vertical = -1;
          } else if (this.random() < 0.45) {
            this.held.kick = true;
          } else {
            this.held.punch = true;
          }
          this.pulse = 8;
        }
        break;
      case 'special':
        if (this.pulse === 0) {
          this.held.special = true;
          this.pulse = 20;
        }
        break;
      case 'super':
        if (this.pulse === 0) {
          this.held.super = true;
          this.pulse = 30;
        }
        break;
      default:
        break;
    }

    // Looking away from the opponent would break auto-facing on the next step;
    // the simulation always turns the fighter, so horizontal only drives movement.
    return this.toInput(horizontal);
  }

  private decide(
    behaviour: Behaviour,
    distance: number,
    meter: number,
    threatened: boolean,
    timer: number,
  ): Plan {
    const roll = this.random();

    if (threatened && roll < behaviour.blockChance) return 'block';
    if (meter >= 300 && distance < 2.2 && roll > 0.55) return 'super';
    if (distance < 1.9 && roll < behaviour.aggression) return 'strike';
    if (meter >= 100 && distance > 1.9 && distance < 3.4 && roll < behaviour.specialChance) return 'special';
    if (distance > 2.4 && roll < behaviour.jumpChance) return 'jump';
    if (distance > 1.6) return 'approach';
    // Losing on the clock makes a passive AI walk forward instead of stalling.
    if (timer < 15) return 'approach';
    return roll < 0.4 ? 'retreat' : 'wait';
  }

  private isAttacking(state: string): boolean {
    return state === 'attack' || state === 'hitstun' || state === 'blockstun' || state === 'knockdown' || state === 'wakeup';
  }

  private toInput(horizontal: -1 | 0 | 1): FrameInput {
    return {
      horizontal,
      vertical: this.held.vertical,
      punch: this.held.punch,
      kick: this.held.kick,
      special: this.held.special,
      super: this.held.super,
      block: this.held.block,
    };
  }
}
