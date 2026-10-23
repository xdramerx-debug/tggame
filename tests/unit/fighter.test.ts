import { describe, expect, it } from 'vitest';
import { Fighter } from '@/fight/fighter';
import { ARENA_HALF_WIDTH, NEUTRAL_INPUT, WAKEUP_INVULN_TICKS } from '@/fight/types';
import type { FrameInput, MoveData } from '@/fight/types';
import { GRIZLO, OKO, PECH, SHVEYA } from '@/characters/roster';

const input = (overrides: Partial<FrameInput> = {}): FrameInput => ({ ...NEUTRAL_INPUT, ...overrides });

function newFighter(): Fighter {
  const fighter = new Fighter(GRIZLO, 0);
  fighter.x = 0;
  // One neutral tick settles facing and the input edge tracking.
  fighter.step(input(), 1.4);
  return fighter;
}

const PUNCH = GRIZLO.moves.punch;

describe('Fighter movement', () => {
  it('walks forward at the character speed and stays inside the arena', () => {
    const fighter = newFighter();
    const startX = fighter.x;
    for (let i = 0; i < 10; i += 1) fighter.step(input({ horizontal: 1 }), 3);
    expect(fighter.x).toBeGreaterThan(startX);
    expect(fighter.state).toBe('walk');

    for (let i = 0; i < 600; i += 1) fighter.step(input({ horizontal: 1 }), 3);
    expect(fighter.x).toBeLessThanOrEqual(ARENA_HALF_WIDTH);
  });

  it('turns around to face the opponent only while able to act', () => {
    const fighter = newFighter();
    expect(fighter.facing).toBe(1);
    fighter.step(input(), -2);
    expect(fighter.facing).toBe(-1);
  });

  it('jumps on the rising edge only', () => {
    const fighter = newFighter();
    fighter.step(input({ vertical: 1 }), 2);
    expect(fighter.y).toBeGreaterThan(0);
    const height = fighter.y;
    // Holding up must not add another jump.
    for (let i = 0; i < 5; i += 1) fighter.step(input({ vertical: 1 }), 2);
    expect(fighter.y).toBeGreaterThan(height);
    for (let i = 0; i < 120; i += 1) fighter.step(input({ vertical: 1 }), 2);
    expect(fighter.y).toBe(0);
    expect(fighter.grounded).toBe(true);
  });

  it('crouches and stops moving', () => {
    const fighter = newFighter();
    fighter.step(input({ horizontal: 1, vertical: -1 }), 2);
    expect(fighter.crouching).toBe(true);
    expect(fighter.state).toBe('crouch');
    expect(fighter.vx).toBe(0);
  });
});

describe('Fighter frame data', () => {
  it('only exposes a hitbox between startup and the end of active frames', () => {
    const fighter = newFighter();
    fighter.step(input({ punch: true }), 1.4);
    expect(fighter.state).toBe('attack');
    expect(fighter.move?.id).toBe('punch');

    for (let tick = 1; tick <= PUNCH.startup; tick += 1) {
      expect(fighter.wantsToHit()).toBe(false);
      fighter.step(input({ punch: true }), 1.4);
    }
    expect(fighter.wantsToHit()).toBe(true);

    let liveTicks = 0;
    const activeEnd = PUNCH.startup + PUNCH.active;
    for (let tick = PUNCH.startup; tick < activeEnd; tick += 1) {
      if (fighter.wantsToHit()) liveTicks += 1;
      fighter.step(input({ punch: true }), 1.4);
    }
    expect(liveTicks).toBe(PUNCH.active);

    // Recovery: no hitbox, but the fighter cannot act yet.
    expect(fighter.wantsToHit()).toBe(false);
    expect(fighter.state).toBe('attack');
    expect(fighter.canAct).toBe(false);

    for (let tick = activeEnd; tick < activeEnd + PUNCH.recovery; tick += 1) {
      expect(fighter.wantsToHit()).toBe(false);
      fighter.step(input({ punch: true }), 1.4);
    }
    expect(fighter.state).toBe('idle');
  });

  it('returns to neutral after startup + active + recovery ticks', () => {
    const fighter = newFighter();
    fighter.step(input({ kick: true }), 1.4);
    const move = GRIZLO.moves.kick;
    for (let tick = 0; tick < move.startup + move.active + move.recovery + 2; tick += 1) {
      fighter.step(input(), 1.4);
    }
    expect(fighter.state).not.toBe('attack');
    expect(fighter.move).toBeNull();
  });

  it('gives one air attack per jump', () => {
    const fighter = newFighter();
    fighter.step(input({ vertical: 1 }), 1.4);
    fighter.step(input({ kick: true }), 1.4);
    expect(fighter.state).toBe('attack');
    expect(fighter.move?.id).toBe('airkick');
    for (let i = 0; i < 200; i += 1) fighter.step(input({ kick: i % 2 === 0 }), 1.4);
    expect(fighter.grounded).toBe(true);
  });
});

describe('Fighter damage rules', () => {
  it('chips a blocked hit and puts the defender in blockstun', () => {
    const defender = new Fighter(SHVEYA, 1);
    defender.x = 1;
    defender.step(input({ block: true }), 0);
    expect(defender.state).toBe('block');

    const result = defender.takeHit(100, PUNCH, 0);
    expect(result.outcome).toBe('block');
    expect(result.damage).toBe(Math.round(100 * SHVEYA.stats.defense * PUNCH.chip));
    expect(defender.hp).toBe(SHVEYA.stats.maxHealth - result.damage);
    expect(defender.state).toBe('blockstun');
  });

  it('does not let a standing fighter block a low', () => {
    const defender = new Fighter(SHVEYA, 1);
    defender.x = 1;
    defender.step(input({ block: true }), 0);
    const result = defender.takeHit(80, GRIZLO.moves.sweep, 0);
    expect(result.outcome).toBe('hit');
    expect(defender.state).toBe('knockdown');
  });

  it('lets a crouching fighter block a low but not a high', () => {
    const defender = new Fighter(SHVEYA, 1);
    defender.step(input({ block: true, vertical: -1 }), 0);
    expect(defender.crouching).toBe(true);
    expect(defender.takeHit(80, GRIZLO.moves.sweep, 0).outcome).toBe('block');

    const overhead: MoveData = { ...PUNCH, id: 'kick', height: 'high' };
    expect(defender.takeHit(80, overhead, 0).outcome).not.toBe('block');
  });

  it('ignores damage entirely while an invulnerable special is running', () => {
    const defender = new Fighter(OKO, 1);
    defender.x = 2;
    defender.meter = 100;
    defender.step(input(), 0);
    defender.step(input({ special: true }), 0);
    expect(defender.state).toBe('attack');
    expect(defender.move?.id).toBe('special');
    const result = defender.takeHit(120, PUNCH, 0);
    expect(result.outcome).toBe('evade');
    expect(defender.hp).toBe(OKO.stats.maxHealth);
  });

  it('keeps an armoured move running after eating a hit', () => {
    const fighter = new Fighter(PECH, 0);
    fighter.x = 0;
    fighter.meter = 300;
    fighter.step(input({ super: true }), 1.4);
    expect(fighter.move?.id).toBe('super');
    const hpBefore = fighter.hp;
    // Step into the active frames first: armour is only relevant mid-move.
    for (let i = 0; i < PECH.moves.super.startup; i += 1) fighter.step(input(), 1.4);
    const result = fighter.takeHit(90, PUNCH, 1.4);
    expect(result.outcome).toBe('armor');
    expect(fighter.hp).toBe(hpBefore - Math.round(90 * PECH.stats.defense));
    expect(fighter.state).toBe('attack');
    expect(fighter.move?.id).toBe('super');
  });

  it('grants meter to the attacker on hit, scaled down on block', () => {
    const fighter = newFighter();
    fighter.meter = 0;
    fighter.step(input({ punch: true }), 1.4);
    for (let i = 0; i < PUNCH.startup; i += 1) fighter.step(input(), 1.4);
    expect(fighter.wantsToHit()).toBe(true);
    fighter.markHitLanded(false);
    expect(fighter.meter).toBeCloseTo(PUNCH.meterGain);

    fighter.meter = 0;
    fighter.move = PUNCH;
    fighter.markHitLanded(true);
    expect(fighter.meter).toBeCloseTo(PUNCH.meterGain * 0.25);
  });

  it('can be knocked down, then wakes up with invulnerability', () => {
    const fighter = new Fighter(SHVEYA, 0);
    fighter.step(input(), 1);
    fighter.takeHit(60, GRIZLO.moves.sweep, 1);
    expect(fighter.state).toBe('knockdown');

    let ticks = 0;
    while (fighter.state !== 'wakeup' && ticks < 400) {
      fighter.step(input(), 1);
      ticks += 1;
    }
    expect(fighter.state).toBe('wakeup');

    while (fighter.state === 'wakeup' && ticks < 800) {
      fighter.step(input(), 1);
      ticks += 1;
    }
    expect(fighter.state).toBe('idle');
    // The first frames after standing up cannot be meatied.
    expect(fighter.takeHit(50, PUNCH, 1).outcome).toBe('evade');
    for (let i = 0; i < WAKEUP_INVULN_TICKS + 2; i += 1) fighter.step(input(), 1);
    expect(fighter.takeHit(50, PUNCH, 1).outcome).toBe('hit');
  });

  it('dies at zero health and stops acting', () => {
    const fighter = new Fighter(SHVEYA, 0);
    fighter.step(input(), 1);
    fighter.takeHit(SHVEYA.stats.maxHealth, PUNCH, 1);
    expect(fighter.hp).toBe(0);
    expect(fighter.isKo).toBe(true);
    expect(fighter.state).toBe('ko');
    fighter.step(input({ punch: true }), 1);
    expect(fighter.state).toBe('ko');
  });
});
