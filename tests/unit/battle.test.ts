import { describe, expect, it } from 'vitest';
import { Battle, INTRO_TICKS, KO_TICKS, ROUND_OVER_TICKS } from '@/fight/battle';
import { NEUTRAL_INPUT, ROUND_SECONDS, TICK_RATE } from '@/fight/types';
import type { BattleEvent, FrameInput } from '@/fight/types';
import { GRIZLO, OKO, PECH, SHVEYA } from '@/characters/roster';

const input = (overrides: Partial<FrameInput> = {}): FrameInput => ({ ...NEUTRAL_INPUT, ...overrides });
const IDLE: readonly [FrameInput, FrameInput] = [input(), input()];

function started(player = GRIZLO, opponent = SHVEYA): Battle {
  const battle = new Battle(player, opponent);
  for (let i = 0; i < INTRO_TICKS; i += 1) battle.step(IDLE);
  return battle;
}

function run(battle: Battle, ticks: number, inputs: readonly [FrameInput, FrameInput] = IDLE): BattleEvent[] {
  const events: BattleEvent[] = [];
  for (let i = 0; i < ticks; i += 1) {
    battle.step(inputs);
    events.push(...battle.drainEvents());
  }
  return events;
}

describe('Battle flow', () => {
  it('runs the round intro before the fight starts', () => {
    const battle = new Battle(GRIZLO, SHVEYA);
    expect(battle.phase).toBe('intro');
    expect(battle.snapshot().timer).toBe(ROUND_SECONDS);

    for (let i = 0; i < INTRO_TICKS - 1; i += 1) battle.step(IDLE);
    expect(battle.phase).toBe('intro');
    const events = run(battle, 1);
    expect(battle.phase).toBe('fight');
    expect(events.some((event) => event.type === 'fight')).toBe(true);
    expect(battle.snapshot().fighters[0].hp).toBe(GRIZLO.stats.maxHealth);
  });

  it('counts down the round timer and ends the round on time', () => {
    const battle = started();
    run(battle, ROUND_SECONDS * TICK_RATE - 2);
    expect(battle.phase).toBe('fight');
    expect(battle.snapshot().timer).toBe(1);
    run(battle, 3);
    expect(battle.phase).toBe('ko');
    // Equal health on time out means a draw round: nobody scores.
    run(battle, KO_TICKS + 1);
    expect(battle.fighters[0].roundsWon).toBe(0);
    expect(battle.phase).toBe('roundOver');
  });

  it('keeps the fighters apart with a pushbox', () => {
    const battle = started();
    battle.fighters[0].x = 0;
    battle.fighters[1].x = 0.1;
    battle.step(IDLE);
    const gap = Math.abs(battle.fighters[1].x - battle.fighters[0].x);
    expect(gap).toBeGreaterThan(0.8);
  });
});

describe('Battle damage', () => {
  it('connects a punch and reports a hit event', () => {
    const battle = started();
    battle.fighters[0].x = 0;
    battle.fighters[1].x = 1;
    const before = battle.fighters[1].hp;

    battle.step([input({ punch: true }), input()]);
    const events = run(battle, 20);
    expect(battle.fighters[1].hp).toBeLessThan(before);
    const hit = events.find((event) => event.type === 'hit');
    expect(hit).toBeDefined();
    expect(hit?.type === 'hit' && hit.damage).toBeGreaterThan(0);
    expect(battle.snapshot().fighters[0].combo).toBe(1);
  });

  it('chips a blocked attack without a clean hit', () => {
    const battle = started();
    battle.fighters[0].x = 0;
    battle.fighters[1].x = 1;
    const before = battle.fighters[1].hp;

    battle.step([input({ punch: true }), input({ block: true })]);
    const events = run(battle, 20, [input({ block: true }), input({ block: true })]);
    expect(battle.fighters[1].hp).toBeLessThan(before);
    expect(events.some((event) => event.type === 'block')).toBe(true);
    expect(events.some((event) => event.type === 'hit')).toBe(false);
  });

  it('counts a combo when a landed hit is cancelled into a special', () => {
    const battle = started(SHVEYA, GRIZLO);
    battle.fighters[0].meter = 100;
    battle.fighters[0].x = 0;
    battle.fighters[1].x = 1;

    battle.step([input({ punch: true }), input()]);
    let combo = 0;
    for (let tick = 0; tick < 30 && combo === 0; tick += 1) {
      run(battle, 1);
      combo = battle.snapshot().fighters[0].combo;
    }
    expect(combo).toBe(1);

    // Cancel the connected punch into the special: the victim is still in hitstun.
    battle.step([input({ special: true }), input()]);
    let peak = 0;
    for (let tick = 0; tick < 40; tick += 1) {
      run(battle, 1);
      peak = Math.max(peak, battle.snapshot().fighters[0].combo);
    }
    expect(peak).toBe(2);
  });

  it('spawns a projectile and damages a distant opponent', () => {
    const battle = started(GRIZLO, SHVEYA);
    battle.fighters[0].meter = 100;
    battle.fighters[0].x = -3.6;
    battle.fighters[1].x = 3.2;
    const before = battle.fighters[1].hp;

    battle.step([input({ special: true }), input()]);
    run(battle, GRIZLO.moves.special.startup + 1);
    expect(battle.snapshot().projectiles.length).toBe(1);
    run(battle, 90);
    expect(battle.fighters[1].hp).toBeLessThan(before);
  });
});

describe('Battle rounds', () => {
  it('scores a knockout and starts the next round', () => {
    const battle = started();
    battle.fighters[0].x = 0;
    battle.fighters[1].x = 1;
    battle.fighters[1].hp = 20;

    battle.step([input({ punch: true }), input()]);
    const events = run(battle, 30);
    expect(battle.phase).toBe('ko');
    expect(events.some((event) => event.type === 'ko' && event.loser === 1)).toBe(true);

    run(battle, KO_TICKS);
    expect(battle.phase).toBe('roundOver');
    expect(battle.fighters[0].roundsWon).toBe(1);
    expect(battle.snapshot().round).toBe(1);

    run(battle, ROUND_OVER_TICKS);
    expect(battle.phase).toBe('intro');
    expect(battle.snapshot().round).toBe(2);
    expect(battle.fighters[1].hp).toBe(SHVEYA.stats.maxHealth);
  });

  it('ends the match after two round wins', () => {
    const battle = started(GRIZLO, PECH);

    for (let round = 0; round < 2; round += 1) {
      battle.fighters[0].x = 0;
      battle.fighters[1].x = 1;
      battle.fighters[1].hp = 10;
      battle.step([input({ punch: true }), input()]);
      run(battle, 40);
      expect(battle.phase).toBe('ko');
      run(battle, KO_TICKS);
      if (round === 0) {
        run(battle, ROUND_OVER_TICKS);
        for (let i = 0; i < INTRO_TICKS; i += 1) battle.step(IDLE);
      }
    }

    expect(battle.phase).toBe('matchOver');
    expect(battle.winner).toBe(0);
    expect(battle.fighters[0].state).toBe('victory');
  });

  it('awards the round on time to the fighter with more health', () => {
    const battle = started(GRIZLO, OKO);
    battle.fighters[1].hp = 100;
    run(battle, ROUND_SECONDS * TICK_RATE);
    expect(battle.phase).toBe('ko');
    run(battle, KO_TICKS);
    expect(battle.fighters[0].roundsWon).toBe(1);
  });
});
