import { describe, expect, it } from 'vitest';
import { MatchEngine } from '@/game/engine';
import { GRIZLO, SHVEYA } from '@/characters/roster';
import { INTRO_TICKS } from '@/fight/battle';
import { NEUTRAL_INPUT, TICK_SECONDS } from '@/fight/types';
import type { FrameInput } from '@/fight/types';

const idle: FrameInput = { ...NEUTRAL_INPUT };

function seeded(seed: number): () => number {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) % 0x100000000;
    return value / 0x100000000;
  };
}

function advanceTicks(engine: MatchEngine, ticks: number, input: FrameInput = idle): void {
  for (let i = 0; i < ticks; i += 1) engine.advance(TICK_SECONDS, input);
}

describe('MatchEngine', () => {
  it('runs the simulation at a fixed 60 Hz regardless of frame rate', () => {
    const engine = new MatchEngine(GRIZLO, SHVEYA, 'normal', seeded(1));
    // 96 ticks of intro delivered as uneven 19 fps frames.
    for (let i = 0; i < 40; i += 1) engine.advance(0.0533, idle);
    expect(engine.battleSnapshot.phase).toBe('fight');
    expect(engine.battleSnapshot.timer).toBe(60);
  });

  it('clamps huge frame gaps instead of teleporting the fight', () => {
    const engine = new MatchEngine(GRIZLO, SHVEYA, 'normal', seeded(2));
    engine.advance(10, idle);
    // At most 0.1 s of simulation is consumed from a single frame.
    expect(engine.battleSnapshot.phase).toBe('intro');
    expect(engine.battleSnapshot.phaseTicks).toBeLessThanOrEqual(7);
  });

  it('counts player hits and tracks the best combo', () => {
    const engine = new MatchEngine(GRIZLO, SHVEYA, 'easy', seeded(3));
    advanceTicks(engine, INTRO_TICKS);
    engine.battle.fighters[0].x = 0;
    engine.battle.fighters[1].x = 1;

    advanceTicks(engine, 24, { ...idle, punch: true });
    expect(engine.stats.hits).toBeGreaterThanOrEqual(1);
    expect(engine.stats.damageDealt).toBeGreaterThan(0);
    expect(engine.stats.maxCombo).toBeGreaterThanOrEqual(1);
  });

  it('restarts cleanly for a rematch', () => {
    const engine = new MatchEngine(GRIZLO, SHVEYA, 'normal', seeded(4));
    advanceTicks(engine, INTRO_TICKS + 30, { ...idle, kick: true });
    engine.restart();

    const snapshot = engine.battleSnapshot;
    expect(snapshot.round).toBe(1);
    expect(snapshot.phase).toBe('intro');
    expect(snapshot.fighters[0].hp).toBe(GRIZLO.stats.maxHealth);
    expect(snapshot.fighters[1].hp).toBe(SHVEYA.stats.maxHealth);
    expect(engine.stats.hits).toBe(0);
    expect(engine.stats.maxCombo).toBe(0);
  });

  it('never returns events after the match is over', () => {
    const engine = new MatchEngine(GRIZLO, SHVEYA, 'easy', seeded(5));
    advanceTicks(engine, INTRO_TICKS);
    engine.battle.fighters[1].hp = 1;
    engine.battle.fighters[0].x = 0;
    engine.battle.fighters[1].x = 1;

    let guard = 0;
    while (engine.battleSnapshot.phase !== 'matchOver' && guard < 5000) {
      engine.advance(TICK_SECONDS, { ...idle, punch: guard % 40 < 4 });
      guard += 1;
    }
    expect(engine.battleSnapshot.phase).toBe('matchOver');

    // First call flushes the remaining events, the following ones return none.
    engine.advance(TICK_SECONDS, idle);
    const after = engine.advance(TICK_SECONDS, idle);
    expect(after).toHaveLength(0);
  });
});
