import { describe, expect, it } from 'vitest';
import { applyDeadZone, DEFAULT_JOYSTICK_OPTIONS, VirtualJoystick } from '@/input/joystick';

function createJoystick(): VirtualJoystick {
  const joystick = new VirtualJoystick();
  joystick.setAnchor({ x: 300, y: 800 });
  return joystick;
}

describe('applyDeadZone', () => {
  it('returns zero inside the dead zone', () => {
    expect(applyDeadZone(0, 0, 0.15)).toEqual({ x: 0, y: 0, magnitude: 0 });
    expect(applyDeadZone(0.1, 0.05, 0.15).magnitude).toBe(0);
  });

  it('rescales continuously right after the dead zone', () => {
    const justOutside = applyDeadZone(0.16, 0, 0.15);
    expect(justOutside.magnitude).toBeGreaterThan(0);
    expect(justOutside.magnitude).toBeLessThan(0.02);
    expect(justOutside.x).toBeCloseTo(0.0118, 3);
  });

  it('reaches full magnitude at the rim and clamps beyond it', () => {
    expect(applyDeadZone(1, 0, 0.15).magnitude).toBeCloseTo(1, 6);
    expect(applyDeadZone(4, 0, 0.15).magnitude).toBe(1);
    expect(applyDeadZone(4, 0, 0.15).x).toBe(1);
  });

  it('keeps direction for diagonal input', () => {
    const diagonal = applyDeadZone(0.7071, 0.7071, 0.15);
    expect(diagonal.x).toBeCloseTo(diagonal.y, 5);
  });
});

describe('VirtualJoystick', () => {
  it('has the spec dimensions', () => {
    expect(DEFAULT_JOYSTICK_OPTIONS.radius).toBe(80);
    expect(DEFAULT_JOYSTICK_OPTIONS.knobRadius).toBe(18); // 36 px knob
    expect(DEFAULT_JOYSTICK_OPTIONS.deadZone).toBe(0.15);
    expect(DEFAULT_JOYSTICK_OPTIONS.stickRadius).toBe(120);
  });

  it('sticks the base to the touch point', () => {
    const joystick = createJoystick();
    joystick.begin(1, { x: 330, y: 770 });
    const snapshot = joystick.snapshot();
    expect(snapshot.active).toBe(true);
    expect(snapshot.base).toEqual({ x: 330, y: 770 });
  });

  it('never moves the base further than the stick radius from the anchor', () => {
    const joystick = createJoystick();
    joystick.begin(1, { x: 900, y: 300 });
    const snapshot = joystick.snapshot();
    const distance = Math.hypot(snapshot.base.x - 300, snapshot.base.y - 800);
    expect(distance).toBeLessThanOrEqual(120.0001);
  });

  it('moves the knob only after the pointer leaves the base', () => {
    const joystick = createJoystick();
    joystick.begin(1, { x: 300, y: 800 });
    let snapshot = joystick.snapshot();
    expect(snapshot.value.magnitude).toBe(0);

    joystick.move({ x: 300, y: 760 }); // 40 px up
    snapshot = joystick.snapshot();
    expect(snapshot.value.magnitude).toBeGreaterThan(0);
    expect(snapshot.value.y).toBeGreaterThan(0); // forward is +y in game space
    expect(snapshot.value.x).toBe(0);
  });

  it('clamps the knob offset to the ring', () => {
    const joystick = createJoystick();
    joystick.begin(1, { x: 300, y: 800 });
    joystick.move({ x: 300, y: 400 });
    const snapshot = joystick.snapshot();
    const maxOffset = DEFAULT_JOYSTICK_OPTIONS.radius - DEFAULT_JOYSTICK_OPTIONS.knobRadius;
    expect(Math.hypot(snapshot.offset.x, snapshot.offset.y)).toBeCloseTo(maxOffset, 5);
    expect(snapshot.value.magnitude).toBeCloseTo(1, 5);
  });

  it('is analog: half deflection gives roughly half output', () => {
    const joystick = createJoystick();
    joystick.begin(1, { x: 300, y: 800 });
    joystick.move({ x: 300 + 31, y: 800 });
    expect(joystick.snapshot().value.magnitude).toBeGreaterThan(0.3);
    expect(joystick.snapshot().value.magnitude).toBeLessThan(0.65);
  });

  it('ignores a second pointer while active', () => {
    const joystick = createJoystick();
    joystick.begin(1, { x: 300, y: 800 });
    joystick.begin(2, { x: 500, y: 600 });
    expect(joystick.snapshot().base).toEqual({ x: 300, y: 800 });
    expect(joystick.activePointerId).toBe(1);
  });

  it('returns to rest on release (spring is visual only)', () => {
    const joystick = createJoystick();
    joystick.begin(1, { x: 300, y: 800 });
    joystick.move({ x: 350, y: 760 });
    joystick.end(1);
    const snapshot = joystick.snapshot();
    expect(snapshot.active).toBe(false);
    expect(snapshot.value).toEqual({ x: 0, y: 0, magnitude: 0 });
    expect(snapshot.base).toEqual({ x: 300, y: 800 });
  });

  it('ignores end() from a foreign pointer', () => {
    const joystick = createJoystick();
    joystick.begin(1, { x: 300, y: 800 });
    joystick.end(99);
    expect(joystick.isActive).toBe(true);
  });

  it('keeps the rest base in sync with the anchor when idle', () => {
    const joystick = createJoystick();
    joystick.setAnchor({ x: 100, y: 700 });
    expect(joystick.snapshot().base).toEqual({ x: 100, y: 700 });
  });
});
