import { clamp } from './types';
import type { Vec2 } from './types';

export interface JoystickOptions {
  /** Base ring radius in CSS pixels (spec: 80). */
  readonly radius: number;
  /** Knob diameter in CSS pixels (spec: 36). */
  readonly knobRadius: number;
  /** Fraction of the radius that is ignored (spec: 15%). */
  readonly deadZone: number;
  /** Maximum distance the base may jump from its rest anchor (spec: 120 px). */
  readonly stickRadius: number;
}

export const DEFAULT_JOYSTICK_OPTIONS: JoystickOptions = {
  radius: 80,
  knobRadius: 18,
  deadZone: 0.15,
  stickRadius: 120,
};

export interface JoystickSnapshot {
  readonly active: boolean;
  /** Base centre in screen coordinates (CSS px, viewport space). */
  readonly base: Vec2;
  /** Knob centre in screen coordinates. */
  readonly knob: Vec2;
  /** Knob offset from the base, clamped to the ring. */
  readonly offset: Vec2;
  /** Analog output: x right, y forward, magnitude after dead zone. */
  readonly value: { x: number; y: number; magnitude: number };
}

/**
 * Applies a radial dead zone and rescales the remainder so the output stays
 * continuous: just outside the dead zone the magnitude is ~0, at the rim it is 1.
 */
export function applyDeadZone(x: number, y: number, deadZone: number): { x: number; y: number; magnitude: number } {
  const length = Math.hypot(x, y);
  if (length === 0) return { x: 0, y: 0, magnitude: 0 };
  const dz = clamp(deadZone, 0, 0.95);
  if (length <= dz) return { x: 0, y: 0, magnitude: 0 };
  const magnitude = clamp((length - dz) / (1 - dz), 0, 1);
  return { x: (x / length) * magnitude, y: (y / length) * magnitude, magnitude };
}

/**
 * Virtual joystick with a "sticky" base.
 *
 * The base rest position comes from the HUD layout; on touch-down the base moves
 * toward the finger but never further than `stickRadius` from its anchor, so the
 * stick always appears where the thumb lands without drifting across the screen.
 *
 * Pure logic (no DOM): the React view only reads snapshots.
 */
export class VirtualJoystick {
  private readonly options: JoystickOptions;
  private anchor: Vec2 = { x: 0, y: 0 };
  private base: Vec2 = { x: 0, y: 0 };
  private offset: Vec2 = { x: 0, y: 0 };
  private value = { x: 0, y: 0, magnitude: 0 };
  private active = false;
  private pointerId: number | null = null;

  constructor(options: Partial<JoystickOptions> = {}) {
    this.options = { ...DEFAULT_JOYSTICK_OPTIONS, ...options };
  }

  get isActive(): boolean {
    return this.active;
  }

  get activePointerId(): number | null {
    return this.pointerId;
  }

  get config(): JoystickOptions {
    return this.options;
  }

  /** Sets the HUD rest position of the base (called on layout/resize). */
  setAnchor(anchor: Vec2): void {
    this.anchor = anchor;
    if (!this.active) this.base = { ...anchor };
  }

  /** Starts tracking a pointer that went down at `point` (viewport coordinates). */
  begin(pointerId: number, point: Vec2): void {
    if (this.active) return;
    this.active = true;
    this.pointerId = pointerId;
    const dx = point.x - this.anchor.x;
    const dy = point.y - this.anchor.y;
    const distance = Math.hypot(dx, dy);
    const maxJump = this.options.stickRadius;
    if (distance > maxJump) {
      const k = maxJump / distance;
      this.base = { x: this.anchor.x + dx * k, y: this.anchor.y + dy * k };
    } else {
      this.base = { x: point.x, y: point.y };
    }
    this.move(point);
  }

  /** Updates the stick for the active pointer; ignores other pointers. */
  move(point: Vec2): void {
    if (!this.active) return;
    const maxOffset = this.options.radius - this.options.knobRadius;
    const dx = point.x - this.base.x;
    const dy = point.y - this.base.y;
    const distance = Math.hypot(dx, dy);
    const k = distance > maxOffset && distance > 0 ? maxOffset / distance : 1;
    this.offset = { x: dx * k, y: dy * k };
    // Screen y grows downwards; game "forward" means the thumb moved up.
    this.value = applyDeadZone(
      this.offset.x / maxOffset,
      -this.offset.y / maxOffset,
      this.options.deadZone,
    );
  }

  /** Releases the stick; the view animates the knob back with a 150 ms spring. */
  end(pointerId?: number): void {
    if (!this.active) return;
    if (pointerId !== undefined && this.pointerId !== null && pointerId !== this.pointerId) return;
    this.active = false;
    this.pointerId = null;
    this.offset = { x: 0, y: 0 };
    this.value = { x: 0, y: 0, magnitude: 0 };
    this.base = { ...this.anchor };
  }

  /** Drops the current gesture (used on visibility change / pointercancel). */
  cancel(): void {
    this.end();
  }

  snapshot(): JoystickSnapshot {
    return {
      active: this.active,
      base: { ...this.base },
      knob: { x: this.base.x + this.offset.x, y: this.base.y + this.offset.y },
      offset: { ...this.offset },
      value: { ...this.value },
    };
  }
}
