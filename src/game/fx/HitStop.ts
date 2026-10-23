/**
 * Short time-freeze on impact — the cheapest way to make a hit read as heavy.
 *
 * A full freeze (scale 0) looks like a dropped frame on a phone, so the freeze
 * keeps a trickle of simulation running: the world still creeps forward while
 * the camera (driven by unscaled time) keeps its slight shake. Only the last
 * frame of the window eases back, which is enough to avoid a visible snap.
 */
export interface HitStopStrength {
  /** Duration of the slow-down, seconds. */
  readonly durationSec: number;
  /** Simulation scale during the window (0.05…1). */
  readonly scale: number;
}

export const HIT_STOP: Readonly<Record<'light' | 'heavy' | 'critical' | 'phase', HitStopStrength>> = {
  light: { durationSec: 0.04, scale: 0.35 },
  heavy: { durationSec: 0.07, scale: 0.22 },
  critical: { durationSec: 0.1, scale: 0.12 },
  phase: { durationSec: 0.18, scale: 0.15 },
};

export class HitStop {
  private remaining = 0;
  private duration = 0;
  private scaleValue = 1;

  /** True while the simulation is slowed. */
  get active(): boolean {
    return this.remaining > 0;
  }

  get remainingSec(): number {
    return this.remaining;
  }

  /** Raw simulation scale while the window is open (1 once it closes). */
  get scale(): number {
    return this.remaining > 0 ? this.scaleValue : 1;
  }

  /**
   * Requests a slow-down.
   *
   * Overlapping requests take the longest window and the deepest freeze, so a
   * critical hit landing during a boss phase can never be "weaker" than either
   * of them, and a light hit can never cut a heavy freeze short.
   */
  trigger(strength: HitStopStrength): void {
    this.remaining = Math.max(this.remaining, strength.durationSec);
    this.duration = Math.max(this.duration, strength.durationSec);
    this.scaleValue = Math.min(this.scaleValue, strength.scale);
  }

  /** Advances the window by *real* time, not by the slowed delta. */
  update(dtRealSeconds: number): void {
    if (this.remaining <= 0) {
      this.scaleValue = 1;
      return;
    }
    this.remaining = Math.max(0, this.remaining - dtRealSeconds);
    if (this.remaining <= 0) {
      this.scaleValue = 1;
      this.duration = 0;
    }
  }

  /**
   * Scale for this frame after the release curve.
   *
   * The last 30 % of the window blends back to real time: an instant jump from
   * 0.12× to 1× is indistinguishable from a dropped frame, which is the exact
   * artefact hit-stop is supposed to hide. The blend is a fraction of the window,
   * not a fixed duration, so a 40 ms hit and a 180 ms phase both release smoothly.
   */
  get easedScale(): number {
    if (this.remaining <= 0 || this.duration <= 0) return 1;
    const blend = 0.3;
    const ratio = this.remaining / this.duration;
    if (ratio >= blend) return this.scaleValue;
    return this.scaleValue + (1 - this.scaleValue) * (1 - ratio / blend);
  }

  reset(): void {
    this.remaining = 0;
    this.duration = 0;
    this.scaleValue = 1;
  }
}
