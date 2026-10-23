import { Battle } from '@/fight/battle';
import { AiController } from '@/fight/ai';
import type { Difficulty } from '@/fight/ai';
import { TICK_SECONDS } from '@/fight/types';
import type { BattleEvent, BattleSnapshot, CharacterDef, FrameInput } from '@/fight/types';

export interface MatchStats {
  hits: number;
  blocks: number;
  maxCombo: number;
  damageDealt: number;
  damageTaken: number;
}

const EMPTY_STATS: MatchStats = { hits: 0, blocks: 0, maxCombo: 0, damageDealt: 0, damageTaken: 0 };

/**
 * Owns a `Battle`, the CPU brain and the fixed-timestep accumulator.
 *
 * Rendering runs at the display refresh rate; the simulation always runs at
 * exactly 60 Hz. Heavy hits add a couple of ticks of hit-stop, which is the
 * cheapest way to make a punch feel like it has mass.
 */
export class MatchEngine {
  readonly battle: Battle;
  private readonly ai: AiController;
  private readonly aiSide: 0 | 1 = 1;
  private accumulator = 0;
  private hitStop = 0;
  private statsValue: MatchStats = { ...EMPTY_STATS };
  private finished = false;

  constructor(player: CharacterDef, opponent: CharacterDef, difficulty: Difficulty, random?: () => number) {
    this.battle = new Battle(player, opponent);
    this.ai = new AiController(difficulty, random);
  }

  get stats(): MatchStats {
    return this.statsValue;
  }

  get battleSnapshot(): BattleSnapshot {
    return this.battle.snapshot();
  }

  /** Feeds a real time delta and returns every event produced this frame. */
  advance(delta: number, playerInput: FrameInput): BattleEvent[] {
    const events: BattleEvent[] = [];
    if (this.battle.phase === 'matchOver') {
      // Keep the end pose alive for the camera, but stop the simulation.
      if (!this.finished) {
        this.finished = true;
        events.push(...this.battle.drainEvents());
      }
      return events;
    }

    // Clamp large deltas (tab switches, GC pauses) so the fight never teleports.
    this.accumulator += Math.min(delta, 0.1);

    while (this.accumulator >= TICK_SECONDS) {
      this.accumulator -= TICK_SECONDS;

      if (this.hitStop > 0) {
        this.hitStop -= 1;
        continue;
      }

      const view = this.battle.snapshot();
      const aiInput = this.ai.step(view, this.aiSide);
      this.battle.step([playerInput, aiInput]);
      events.push(...this.battle.drainEvents());
    }

    this.trackEvents(events);
    return events;
  }

  private trackEvents(events: readonly BattleEvent[]): void {
    const view = this.battle.snapshot();
    for (const event of events) {
      if (event.type === 'hit' && event.attacker === 0) {
        this.statsValue.hits += 1;
        this.statsValue.damageDealt += event.damage;
        if (event.heavy) this.hitStop = 3;
      }
      if (event.type === 'hit' && event.attacker === 1) {
        this.statsValue.damageTaken += event.damage;
        if (event.heavy) this.hitStop = 2;
      }
      if (event.type === 'block') this.statsValue.blocks += 1;
    }
    this.statsValue.maxCombo = Math.max(this.statsValue.maxCombo, view.fighters[0].combo);
  }

  /** Restarts the whole match on the same characters (rematch). */
  restart(): void {
    this.accumulator = 0;
    this.hitStop = 0;
    this.statsValue = { ...EMPTY_STATS };
    this.finished = false;
    this.battle.beginMatch();
  }

  /** Snapshot for the HUD; safe to call every rendered frame. */
  snapshot(): BattleSnapshot {
    return this.battle.snapshot();
  }
}
