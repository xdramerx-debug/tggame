import { describe, expect, it } from 'vitest';
import { AiController, DIFFICULTY } from '@/fight/ai';
import type { Difficulty } from '@/fight/ai';
import { Battle } from '@/fight/battle';
import { GRIZLO, OKO, PECH, SHVEYA } from '@/characters/roster';
import { INTRO_TICKS } from '@/fight/battle';
import { NEUTRAL_INPUT } from '@/fight/types';
import type { FrameInput } from '@/fight/types';

function seeded(seed: number): () => number {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 0x100000000;
    return value / 0x100000000;
  };
}

const neutral: FrameInput = { ...NEUTRAL_INPUT };

describe('AiController', () => {
  it('is easier on easy and sharper on hard', () => {
    expect(DIFFICULTY.easy.reaction).toBeGreaterThan(DIFFICULTY.hard.reaction);
    expect(DIFFICULTY.hard.blockChance).toBeGreaterThan(DIFFICULTY.easy.blockChance);
    expect(DIFFICULTY.hard.aggression).toBeGreaterThan(DIFFICULTY.easy.aggression);
  });

  it('does nothing during the round intro', () => {
    const battle = new Battle(GRIZLO, SHVEYA);
    const ai = new AiController('hard', seeded(7));
    const input = ai.step(battle.snapshot(), 1);
    expect(input).toEqual(neutral);
  });

  it('produces only legal inputs and eventually attacks', () => {
    const battle = new Battle(SHVEYA, GRIZLO);
    for (let i = 0; i < INTRO_TICKS; i += 1) battle.step([neutral, neutral]);
    battle.fighters[0].x = 0;
    battle.fighters[1].x = 1.2;

    const ai = new AiController('hard', seeded(11));
    let attacks = 0;
    for (let tick = 0; tick < 240; tick += 1) {
      const input = ai.step(battle.snapshot(), 1);
      expect([-1, 0, 1]).toContain(input.horizontal);
      expect([-1, 0, 1]).toContain(input.vertical);
      if (input.punch || input.kick || input.special || input.super) attacks += 1;
      battle.step([neutral, input]);
    }
    expect(attacks).toBeGreaterThan(0);
  });

  it('blocks at least sometimes when the opponent is swinging', () => {
    const battle = new Battle(GRIZLO, PECH);
    for (let i = 0; i < INTRO_TICKS; i += 1) battle.step([neutral, neutral]);
    battle.fighters[0].x = 0;
    battle.fighters[1].x = 1.2;
    // Start a slow kick, then let the hard AI react to it.
    battle.step([{ ...neutral, kick: true }, neutral]);
    const ai = new AiController('hard', seeded(3));
    let blocked = 0;
    for (let tick = 0; tick < 30; tick += 1) {
      const input = ai.step(battle.snapshot(), 1);
      if (input.block) blocked += 1;
      battle.step([neutral, input]);
    }
    expect(blocked).toBeGreaterThan(0);
  });

  it('remembers to release its buttons', () => {
    const ai = new AiController('normal', seeded(5));
    const battle = new Battle(GRIZLO, OKO);
    for (let i = 0; i < INTRO_TICKS; i += 1) battle.step([neutral, neutral]);
    battle.fighters[0].x = 0;
    battle.fighters[1].x = 1;
    for (let i = 0; i < 90; i += 1) ai.step(battle.snapshot(), 1);
    const released = ai.release();
    expect(released.punch).toBe(false);
    expect(released.kick).toBe(false);
    expect(released.block).toBe(false);
  });

  it('plays a full round without empty input for a whole minute', () => {
    const battle = new Battle(GRIZLO, OKO);
    const difficulties: readonly Difficulty[] = ['easy', 'normal', 'hard'];
    const brains = difficulties.map((difficulty) => new AiController(difficulty, seeded(21)));
    for (let tick = 0; tick < 60 * 40; tick += 1) {
      const snapshot = battle.snapshot();
      battle.step([brains[0]?.step(snapshot, 0) ?? neutral, brains[2]?.step(snapshot, 1) ?? neutral]);
    }
    const snapshot = battle.snapshot();
    // Someone must have taken damage in 40 seconds of AI brawling.
    expect(snapshot.fighters[0].hp + snapshot.fighters[1].hp).toBeLessThan(
      GRIZLO.stats.maxHealth + OKO.stats.maxHealth,
    );
  });
});
