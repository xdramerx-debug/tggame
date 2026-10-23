import { describe, expect, it } from 'vitest';
import { HitStop, HIT_STOP } from '@/game/fx/HitStop';

/**
 * Hit-stop is a *feel* feature, which makes it easy to get subtly wrong: too
 * long and the game stutters, an instant return to 1× reads as a dropped frame,
 * and a nested trigger that overwrites a heavier one makes a critical hit feel
 * lighter than a normal one. These are the rules that prevent that.
 */
describe('HitStop', () => {
  it('is idle by default', () => {
    const stop = new HitStop();
    expect(stop.active).toBe(false);
    expect(stop.scale).toBe(1);
    expect(stop.easedScale).toBe(1);
  });

  it('slows the simulation for the requested window and then restores it', () => {
    const stop = new HitStop();
    stop.trigger(HIT_STOP.light);
    expect(stop.active).toBe(true);
    expect(stop.scale).toBe(HIT_STOP.light.scale);
    stop.update(HIT_STOP.light.durationSec / 2);
    expect(stop.scale).toBe(HIT_STOP.light.scale);
    stop.update(HIT_STOP.light.durationSec);
    expect(stop.active).toBe(false);
    expect(stop.scale).toBe(1);
  });

  it('keeps the stronger of two overlapping requests', () => {
    const stop = new HitStop();
    stop.trigger(HIT_STOP.critical);
    stop.trigger(HIT_STOP.light);
    expect(stop.scale).toBe(HIT_STOP.critical.scale);
    expect(stop.remainingSec).toBe(HIT_STOP.critical.durationSec);
  });

  it('extends the window and keeps the deepest freeze on overlap', () => {
    const stop = new HitStop();
    stop.trigger(HIT_STOP.light);
    stop.update(HIT_STOP.light.durationSec * 0.9);
    stop.trigger(HIT_STOP.phase);
    expect(stop.remainingSec).toBe(HIT_STOP.phase.durationSec);
    expect(stop.scale).toBe(Math.min(HIT_STOP.light.scale, HIT_STOP.phase.scale));
  });

  it('eases back towards real time instead of snapping', () => {
    const stop = new HitStop();
    stop.trigger(HIT_STOP.heavy);
    const frozen = stop.easedScale;
    stop.update(HIT_STOP.heavy.durationSec * 0.9);
    const easing = stop.easedScale;
    expect(easing).toBeGreaterThan(frozen);
    expect(easing).toBeLessThan(1);
    stop.update(HIT_STOP.heavy.durationSec);
    expect(stop.easedScale).toBe(1);
  });

  it('never reports a scale outside (0, 1]', () => {
    const stop = new HitStop();
    for (const strength of Object.values(HIT_STOP)) {
      stop.reset();
      stop.trigger(strength);
      expect(stop.scale).toBeGreaterThan(0);
      expect(stop.scale).toBeLessThanOrEqual(1);
    }
  });

  it('is cleared by reset (new run)', () => {
    const stop = new HitStop();
    stop.trigger(HIT_STOP.phase);
    stop.reset();
    expect(stop.active).toBe(false);
    expect(stop.scale).toBe(1);
  });
});
