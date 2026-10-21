export interface FixedStepOptions {
  /** Simulation step in seconds (Rapier default is 1/60). */
  readonly stepSeconds?: number;
  /** Upper bound of steps per frame; protects against spiral-of-death. */
  readonly maxSteps?: number;
  /** Longest frame delta accepted, seconds. */
  readonly maxFrameSeconds?: number;
}

/**
 * Fixed-timestep accumulator.
 *
 * Physics and character movement must run at a constant rate: variable-step
 * character controllers tunnel through walls and produce jittery camera follow.
 * Visual/gameplay code keeps using the raw frame delta.
 *
 * Pure and clock-free: `advance(dt)` returns how many fixed steps to run.
 */
export class FixedStepAccumulator {
  readonly stepSeconds: number;
  private readonly maxSteps: number;
  private readonly maxFrameSeconds: number;
  private accumulator = 0;
  private droppedSeconds = 0;

  constructor(options: FixedStepOptions = {}) {
    this.stepSeconds = options.stepSeconds ?? 1 / 60;
    this.maxSteps = options.maxSteps ?? 4;
    this.maxFrameSeconds = options.maxFrameSeconds ?? 0.25;
  }

  /** Seconds left over from the previous frame (for interpolating visuals). */
  get alpha(): number {
    return this.accumulator / this.stepSeconds;
  }

  /** Total time permanently dropped because of the step cap (diagnostics). */
  get droppedTime(): number {
    return this.droppedSeconds;
  }

  /**
   * Adds a frame delta and returns the number of fixed steps to execute now.
   * The result is clamped to `maxSteps`; excess time is discarded, not queued.
   */
  advance(dtSeconds: number): number {
    if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) return 0;
    this.accumulator += Math.min(dtSeconds, this.maxFrameSeconds);
    let steps = Math.floor(this.accumulator / this.stepSeconds);
    if (steps > this.maxSteps) {
      const dropped = (steps - this.maxSteps) * this.stepSeconds;
      this.droppedSeconds += dropped;
      this.accumulator -= dropped;
      steps = this.maxSteps;
    }
    this.accumulator -= steps * this.stepSeconds;
    return steps;
  }

  reset(): void {
    this.accumulator = 0;
    this.droppedSeconds = 0;
  }
}
