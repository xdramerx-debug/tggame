import { Fighter } from './fighter';
import {
  ARENA_HALF_WIDTH,
  MIN_SEPARATION,
  ROUNDS_TO_WIN,
  ROUND_SECONDS,
  TICK_RATE,
  TICK_SECONDS,
} from './types';
import type {
  BattleEvent,
  BattleSnapshot,
  CharacterDef,
  FrameInput,
  MoveData,
  Projectile,
  RoundPhase,
} from './types';

/** Ticks of the round intro (fighters idle, READY? banner). */
export const INTRO_TICKS = 96;
/** Ticks the KO pose plays before the round result is decided. */
export const KO_TICKS = 132;
/** Ticks the round-end banner holds before the next round starts. */
export const ROUND_OVER_TICKS = 84;

/** Pseudo move used for projectile collisions so all hit rules stay in one place. */
function projectileMove(projectile: Projectile): MoveData {
  return {
    id: 'special',
    label: 'Снаряд',
    startup: 0,
    active: 1,
    recovery: 0,
    damage: projectile.spec.damage,
    chip: 0.12,
    hitstun: projectile.spec.hitstun,
    blockstun: 14,
    knockback: projectile.spec.knockback,
    height: 'mid',
    range: 0,
    meterGain: 0,
  };
}

/**
 * One match: two fighters, projectiles, rounds, timer and the event stream.
 *
 * The battle is the only place where the two fighters interact, so all the
 * asymmetry (who hit whom, combo scaling, trades) lives here and the fighters
 * stay independently testable.
 */
export class Battle {
  readonly fighters: readonly [Fighter, Fighter];
  private readonly eventsOut: BattleEvent[] = [];
  private projectileList: Projectile[] = [];
  private comboCounts: [number, number] = [0, 0];
  private phaseValue: RoundPhase = 'intro';
  private phaseTicksValue = 0;
  private roundValue = 1;
  private ticksLeft = ROUND_SECONDS * TICK_RATE;
  private winnerValue: 0 | 1 | null = null;
  private roundWinner: 0 | 1 | null = null;
  private pendingAdvance = false;

  constructor(player: CharacterDef, opponent: CharacterDef) {
    this.fighters = [new Fighter(player, 0), new Fighter(opponent, 1)];
    this.beginMatch();
  }

  get phase(): RoundPhase {
    return this.phaseValue;
  }

  get round(): number {
    return this.roundValue;
  }

  get winner(): 0 | 1 | null {
    return this.winnerValue;
  }

  get currentProjectiles(): readonly Projectile[] {
    return this.projectileList;
  }

  /** Starts a brand new match (both fighters at full health, no rounds won). */
  beginMatch(): void {
    this.fighters[0].roundsWon = 0;
    this.fighters[1].roundsWon = 0;
    this.roundValue = 1;
    this.winnerValue = null;
    this.beginRound();
  }

  private beginRound(): void {
    const [a, b] = this.fighters;
    a.resetForRound(-2.1, 1);
    b.resetForRound(2.1, -1);
    // Meter carries over between rounds: comebacks are the point of a super bar.
    this.projectileList = [];
    this.comboCounts = [0, 0];
    this.ticksLeft = ROUND_SECONDS * TICK_RATE;
    this.phaseValue = 'intro';
    this.phaseTicksValue = 0;
    this.roundWinner = null;
    this.pendingAdvance = false;
    this.eventsOut.push({ type: 'roundStart', round: this.roundValue });
  }

  /** Advances the whole match by one fixed tick. */
  step(inputs: readonly [FrameInput, FrameInput]): void {
    this.phaseTicksValue += 1;

    switch (this.phaseValue) {
      case 'intro':
        this.stepIdle();
        if (this.phaseTicksValue >= INTRO_TICKS) {
          this.phaseValue = 'fight';
          this.phaseTicksValue = 0;
          this.eventsOut.push({ type: 'fight' });
        }
        return;
      case 'fight':
        this.stepFight(inputs);
        return;
      case 'ko':
        this.stepIdle();
        if (this.phaseTicksValue >= KO_TICKS) this.finishRound();
        return;
      case 'roundOver':
        this.stepIdle();
        if (this.phaseTicksValue >= ROUND_OVER_TICKS) {
          if (this.pendingAdvance) {
            this.roundValue += 1;
            this.beginRound();
          }
        }
        return;
      case 'matchOver':
        this.stepIdle();
        return;
    }
  }

  /** Idle ticking for the fighters during intros and end-of-round poses. */
  private stepIdle(): void {
    const neutral: FrameInput = { horizontal: 0, vertical: 0, punch: false, kick: false, special: false, super: false, block: false };
    const [a, b] = this.fighters;
    a.step(neutral, b.x);
    b.step(neutral, a.x);
    this.separate();
  }

  private stepFight(inputs: readonly [FrameInput, FrameInput]): void {
    const [a, b] = this.fighters;
    const beforeA = { attacking: a.isAttacking, connected: a.hasConnected };
    const beforeB = { attacking: b.isAttacking, connected: b.hasConnected };

    a.step(inputs[0], b.x);
    b.step(inputs[1], a.x);

    if (a.projectileReady) this.spawnProjectile(0);
    if (b.projectileReady) this.spawnProjectile(1);

    this.resolveAttack(0);
    this.resolveAttack(1);
    this.stepProjectiles();

    // A swing that ended without touching anything is a whiff (audio: air swoosh).
    if (beforeA.attacking && !a.isAttacking && !beforeA.connected) this.eventsOut.push({ type: 'whiff', x: a.x, y: 1.1 });
    if (beforeB.attacking && !b.isAttacking && !beforeB.connected) this.eventsOut.push({ type: 'whiff', x: b.x, y: 1.1 });

    this.separate();

    // Combo counters decay as soon as the victim can act again.
    if (!a.isBusy) this.comboCounts[1] = 0;
    if (!b.isBusy) this.comboCounts[0] = 0;

    this.ticksLeft -= 1;
    if (this.ticksLeft <= 0) this.resolveTimeout();
  }

  private resolveAttack(attackerIndex: 0 | 1): void {
    const attacker = this.fighters[attackerIndex];
    const defender = this.fighters[attackerIndex === 0 ? 1 : 0];
    const move = attacker.move;
    if (!move || !attacker.wantsToHit()) return;

    // Height rules: overheads are ducked, lows are jumped over.
    if (move.height === 'high' && defender.crouching && defender.grounded) {
      attacker.markWhiff();
      return;
    }
    if (move.height === 'low' && !defender.grounded) {
      attacker.markWhiff();
      return;
    }
    if (defender.state === 'knockdown' || defender.state === 'wakeup') return;

    const dx = defender.x - attacker.x;
    const distance = Math.abs(dx);
    // The defender must be in front of the attacker and inside the reach.
    if (dx * attacker.facing < -0.2) return;
    if (distance > move.range + 0.45) return;

    const comboBefore = this.comboCounts[attackerIndex];
    const wasStunned = defender.state === 'hitstun' || defender.state === 'blockstun';
    const combo = wasStunned && comboBefore > 0 ? comboBefore + 1 : 1;
    const scaling = Math.max(0.35, 1 - 0.09 * (combo - 1));
    const damage = Math.round(move.damage * scaling);

    const result = defender.takeHit(damage, move, attacker.x);
    if (result.outcome === 'evade') return;

    attacker.markHitLanded(result.outcome === 'block');
    this.comboCounts[attackerIndex] = result.outcome === 'block' ? 0 : combo;

    if (result.outcome === 'block') {
      this.eventsOut.push({ type: 'block', x: defender.x, y: 1.2 });
    } else {
      this.eventsOut.push({
        type: 'hit',
        attacker: attackerIndex,
        damage: result.damage,
        x: defender.x,
        y: 1.15 + defender.y,
        heavy: (move.damage >= 95 || (move.hits ?? 1) > 1) && combo <= 1,
      });
    }

    if (defender.isKo) this.knockOut(attackerIndex);
  }

  private spawnProjectile(owner: 0 | 1): void {
    const fighter = this.fighters[owner];
    const move = fighter.move;
    const spec = move?.projectile;
    if (!spec) return;
    this.projectileList.push({
      owner,
      x: fighter.x + fighter.facing * 0.7,
      y: spec.height,
      vx: fighter.facing * spec.speed,
      ticks: spec.lifetimeTicks,
      spec,
    });
    this.eventsOut.push({ type: 'projectile', who: owner });
  }

  private stepProjectiles(): void {
    const alive: Projectile[] = [];
    for (const projectile of this.projectileList) {
      projectile.x += projectile.vx * TICK_SECONDS;
      projectile.ticks -= 1;
      const defender = this.fighters[projectile.owner === 0 ? 1 : 0];
      const hitX = Math.abs(defender.x - projectile.x) < projectile.spec.radius + 0.4;
      const bodyTop = defender.y + 1.75;
      const hitY = projectile.y >= defender.y - 0.15 && projectile.y <= bodyTop;
      const canHit = defender.state !== 'knockdown' && defender.state !== 'wakeup' && defender.state !== 'ko';

      if (hitX && hitY && canHit) {
        const move = projectileMove(projectile);
        const result = defender.takeHit(projectile.spec.damage, move, projectile.x - projectile.vx * 0.01);
        if (result.outcome !== 'evade') {
          this.eventsOut.push(
            result.outcome === 'block'
              ? { type: 'block', x: defender.x, y: 1.3 }
              : {
                  type: 'hit',
                  attacker: projectile.owner,
                  damage: result.damage,
                  x: defender.x,
                  y: 1.3 + defender.y,
                  heavy: true,
                },
          );
          if (defender.isKo) this.knockOut(projectile.owner);
          continue;
        }
      }

      const outOfBounds = Math.abs(projectile.x) > ARENA_HALF_WIDTH + 1.2;
      if (projectile.ticks > 0 && !outOfBounds) alive.push(projectile);
    }
    this.projectileList = alive;
  }

  private knockOut(winner: 0 | 1): void {
    if (this.phaseValue !== 'fight') return;
    const loser = winner === 0 ? 1 : 0;
    this.fighters[loser].knockOut();
    this.phaseValue = 'ko';
    this.phaseTicksValue = 0;
    this.roundWinner = winner;
    this.eventsOut.push({ type: 'ko', loser });
  }

  private resolveTimeout(): void {
    const [a, b] = this.fighters;
    this.phaseValue = 'ko';
    this.phaseTicksValue = 0;
    // Health is compared as a ratio: heavy fighters must not win on brute HP alone.
    const shareA = a.hp / a.maxHp;
    const shareB = b.hp / b.maxHp;
    if (Math.abs(shareA - shareB) < 0.001) {
      this.roundWinner = null;
    } else {
      this.roundWinner = shareA > shareB ? 0 : 1;
    }
    this.eventsOut.push({ type: 'ko', loser: this.roundWinner === 1 ? 0 : 1 });
  }

  /** Awards the round and decides whether the match is over. */
  private finishRound(): void {
    const winner = this.roundWinner;
    if (winner !== null) {
      const champion = this.fighters[winner];
      champion.roundsWon += 1;
      if (champion.roundsWon >= ROUNDS_TO_WIN) {
        this.phaseValue = 'matchOver';
        this.phaseTicksValue = 0;
        this.winnerValue = winner;
        champion.celebrate();
        this.eventsOut.push({ type: 'matchEnd', winner });
        return;
      }
      champion.celebrate();
    }
    this.phaseValue = 'roundOver';
    this.phaseTicksValue = 0;
    this.pendingAdvance = true;
    this.eventsOut.push({ type: 'roundEnd', winner });
  }

  /** Keeps the two bodies from overlapping (the classic pushbox). */
  private separate(): void {
    const [a, b] = this.fighters;
    const dx = b.x - a.x;
    const distance = Math.abs(dx);
    if (distance >= MIN_SEPARATION || distance === 0) return;
    // Only grounded bodies push each other; a jump-in may cross over.
    if (a.y > 0.9 || b.y > 0.9) return;
    const overlap = (MIN_SEPARATION - distance) / 2;
    const direction = dx >= 0 ? 1 : -1;
    a.x -= direction * overlap;
    b.x += direction * overlap;
    a.x = Math.max(-ARENA_HALF_WIDTH, Math.min(ARENA_HALF_WIDTH, a.x));
    b.x = Math.max(-ARENA_HALF_WIDTH, Math.min(ARENA_HALF_WIDTH, b.x));
  }

  /** Drains queued events for audio and effects. */
  drainEvents(): BattleEvent[] {
    const events = this.eventsOut.slice();
    this.eventsOut.length = 0;
    return events;
  }

  snapshot(): BattleSnapshot {
    const [a, b] = this.fighters;
    return {
      phase: this.phaseValue,
      round: this.roundValue,
      timer: Math.max(0, Math.ceil(this.ticksLeft / TICK_RATE)),
      fighters: [a.snapshot(this.comboCounts[0]), b.snapshot(this.comboCounts[1])],
      projectiles: this.projectileList.slice(),
      phaseTicks: this.phaseTicksValue,
      winner: this.winnerValue,
    };
  }
}
