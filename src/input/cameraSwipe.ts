import type { Vec2 } from './types';

export interface CameraSwipeOptions {
  /** Pointer travel below this (px) on release counts as a tap (spec: quick attack). */
  readonly tapMaxDistancePx?: number;
  /** Tap longer than this (ms) is a drag/hold, not a tap. */
  readonly tapMaxDurationMs?: number;
  /** Inertia is capped to this window after release (spec: 100 ms). */
  readonly inertiaMs?: number;
  /** Exponential time constant of the inertia decay (ms). */
  readonly inertiaTauMs?: number;
  /** Velocity sampling window (ms) used to compute release velocity. */
  readonly velocityWindowMs?: number;
}

export interface SwipeDelta {
  readonly dx: number;
  readonly dy: number;
}

export interface SwipeEndResult {
  readonly tap: boolean;
  /** Release velocity in px/ms (already smoothed over the last moves). */
  readonly velocity: Vec2;
}

interface Sample {
  readonly x: number;
  readonly y: number;
  readonly t: number;
}

const NO_DELTA: SwipeDelta = { dx: 0, dy: 0 };

/**
 * Single-finger camera swipe with a short inertial tail.
 *
 * Returns raw pixel deltas; degrees-per-pixel conversion lives in the camera rig
 * so the in-game sensitivity slider applies to swipes and inertia consistently.
 *
 * Only one pointer drives the camera. A second pointer is handled by the pinch
 * helper below (see {@link pinchScale}).
 */
export class CameraSwipe {
  private readonly options: Required<CameraSwipeOptions>;
  private pointerId: number | null = null;
  private last: Sample | null = null;
  private start: Sample | null = null;
  private samples: Sample[] = [];
  private travel = 0;
  private velocity: Vec2 = { x: 0, y: 0 };
  private inertiaRemainingMs = 0;

  constructor(options: CameraSwipeOptions = {}) {
    this.options = {
      tapMaxDistancePx: options.tapMaxDistancePx ?? 8,
      tapMaxDurationMs: options.tapMaxDurationMs ?? 250,
      inertiaMs: options.inertiaMs ?? 100,
      inertiaTauMs: options.inertiaTauMs ?? 40,
      velocityWindowMs: options.velocityWindowMs ?? 60,
    };
  }

  get isActive(): boolean {
    return this.pointerId !== null;
  }

  get activePointerId(): number | null {
    return this.pointerId;
  }

  /** True while the inertial tail is being applied. */
  get isGliding(): boolean {
    return this.inertiaRemainingMs > 0;
  }

  begin(pointerId: number, point: Vec2, nowMs: number): void {
    this.pointerId = pointerId;
    const sample: Sample = { x: point.x, y: point.y, t: nowMs };
    this.last = sample;
    this.start = sample;
    this.samples = [sample];
    this.travel = 0;
    this.velocity = { x: 0, y: 0 };
    this.inertiaRemainingMs = 0;
  }

  move(point: Vec2, nowMs: number): SwipeDelta {
    if (!this.last) return NO_DELTA;
    const dx = point.x - this.last.x;
    const dy = point.y - this.last.y;
    this.travel += Math.hypot(dx, dy);
    const sample: Sample = { x: point.x, y: point.y, t: nowMs };
    this.samples.push(sample);
    // Keep the sampling window bounded.
    const cutoff = nowMs - this.options.velocityWindowMs;
    while (this.samples.length > 1 && (this.samples[0]?.t ?? 0) < cutoff) this.samples.shift();
    this.last = sample;
    return { dx, dy };
  }

  /** Ends the gesture, returning tap classification and the release velocity. */
  end(nowMs: number): SwipeEndResult {
    const start = this.start;
    const last = this.last;
    this.pointerId = null;
    this.start = null;
    this.last = null;

    if (!start || !last) return { tap: false, velocity: { x: 0, y: 0 } };

    const duration = nowMs - start.t;
    const tap = this.travel <= this.options.tapMaxDistancePx && duration <= this.options.tapMaxDurationMs;

    const first = this.samples[0] ?? start;
    const span = Math.max(1, last.t - first.t);
    const velocity = {
      x: (last.x - first.x) / span,
      y: (last.y - first.y) / span,
    };
    this.velocity = velocity;
    this.samples = [];
    this.inertiaRemainingMs = tap ? 0 : this.options.inertiaMs;

    return { tap, velocity };
  }

  /**
   * Consumes the inertial tail.
   * @returns pixel delta to apply this frame
   */
  applyInertia(dtMs: number): SwipeDelta {
    if (this.inertiaRemainingMs <= 0 || dtMs <= 0) return NO_DELTA;
    const step = Math.min(dtMs, this.inertiaRemainingMs);
    const decay = Math.exp(-step / this.options.inertiaTauMs);
    const dx = this.velocity.x * step;
    const dy = this.velocity.y * step;
    this.velocity = { x: this.velocity.x * decay, y: this.velocity.y * decay };
    this.inertiaRemainingMs -= step;
    // Stop early once the motion is imperceptible (saves frames).
    if (Math.hypot(this.velocity.x, this.velocity.y) < 0.002) this.inertiaRemainingMs = 0;
    return { dx, dy };
  }

  /** Aborts without inertia (system gesture, pause, pointercancel). */
  cancel(): void {
    this.pointerId = null;
    this.start = null;
    this.last = null;
    this.samples = [];
    this.inertiaRemainingMs = 0;
    this.velocity = { x: 0, y: 0 };
  }
}

/**
 * Pinch-to-zoom factor for the camera.
 * @param previousDistance finger distance before the move, px
 * @param nextDistance finger distance after the move, px
 * @returns multiplier > 1 zooms out, < 1 zooms in; invalid input returns 1
 */
export function pinchScale(previousDistance: number, nextDistance: number): number {
  if (previousDistance <= 0 || nextDistance <= 0) return 1;
  if (!Number.isFinite(previousDistance) || !Number.isFinite(nextDistance)) return 1;
  const scale = previousDistance / nextDistance;
  // Clamp per-event to avoid a single 10× jump after a dropped frame.
  return Math.min(1.35, Math.max(0.74, scale));
}

/** Euclidean distance between two pointers (pinch measurement). */
export function pointerDistance(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
