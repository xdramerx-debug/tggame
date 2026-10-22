import { describe, expect, it } from 'vitest';
import { EnemyBrain } from '@/game/ai/EnemyBrain';

const CONFIG = {
  aggroRange: 10,
  leashRange: 18,
  attackRange: 2,
  windup: 0.4,
  recover: 0.8,
  staggerTime: 0.3,
} as const;

function step(brain: EnemyBrain, distance: number, dt = 1 / 60, hasLineOfSight = true) {
  return brain.update({ distance, hasLineOfSight, dt });
}

/** Runs the brain until the given state is reached, at most `maxSteps`. */
function advance(brain: EnemyBrain, distance: number, dt: number, seconds: number) {
  const steps = Math.round(seconds / dt);
  let last = step(brain, distance, 0);
  for (let i = 0; i < steps; i += 1) last = step(brain, distance, dt);
  return last;
}

describe('EnemyBrain', () => {
  it('stays idle until the player is inside the aggro range', () => {
    const brain = new EnemyBrain(CONFIG);
    expect(step(brain, 30).state).toBe('idle');
    const noticed = step(brain, 8);
    expect(noticed.state).toBe('chase');
    expect(noticed.moveTowardTarget).toBe(true);
  });

  it('needs line of sight to notice the player', () => {
    const brain = new EnemyBrain(CONFIG);
    expect(step(brain, 5, 1 / 60, false).state).toBe('idle');
    expect(step(brain, 5).state).toBe('chase');
  });

  it('telegraphs before striking and strikes exactly once', () => {
    const brain = new EnemyBrain(CONFIG);
    step(brain, 8); // chase
    expect(step(brain, 1.5).state).toBe('windup');

    let strikes = 0;
    for (let i = 0; i < 30; i += 1) {
      if (step(brain, 1.5).strike) strikes += 1;
    }
    expect(strikes).toBe(1);
    expect(brain.state).toBe('recover');
  });

  it('cannot be interrupted mid-windup by walking out of reach — the swing misses instead', () => {
    const brain = new EnemyBrain(CONFIG);
    step(brain, 8);
    step(brain, 1.5);
    const far = advance(brain, 6, 1 / 60, 0.5);
    expect(far.state).toBe('recover');
    expect(far.strike).toBe(false);
  });

  it('returns to idle when the player runs past the leash', () => {
    const brain = new EnemyBrain(CONFIG);
    step(brain, 8);
    const away = step(brain, 25);
    expect(away.state).toBe('idle');
    expect(away.moveTowardTarget).toBe(false);
  });

  it('does not move while recovering', () => {
    const brain = new EnemyBrain(CONFIG);
    step(brain, 8);
    step(brain, 1.5);
    expect(step(brain, 1.5).moveTowardTarget).toBe(false);
  });

  it('resumes the chase after recovery', () => {
    const brain = new EnemyBrain(CONFIG);
    step(brain, 8);
    const after = advance(brain, 5, 1 / 60, 1.4);
    expect(after.state).toBe('chase');
  });

  it('stagger interrupts a windup and then re-engages', () => {
    const brain = new EnemyBrain(CONFIG);
    step(brain, 8);
    step(brain, 1.5);
    expect(brain.state).toBe('windup');
    brain.stagger();
    expect(brain.state).toBe('stagger');
    expect(brain.isBusy).toBe(true);
    // Out of reach after the stagger: it walks back in instead of swinging.
    const after = advance(brain, 5, 1 / 60, 0.4);
    expect(after.state).toBe('chase');
    expect(after.moveTowardTarget).toBe(true);
  });

  it('kill is terminal', () => {
    const brain = new EnemyBrain(CONFIG);
    step(brain, 8);
    brain.kill();
    expect(brain.state).toBe('dead');
    expect(step(brain, 1).state).toBe('dead');
    brain.stagger();
    expect(brain.state).toBe('dead');
    expect(brain.isHostile).toBe(false);
  });
});
