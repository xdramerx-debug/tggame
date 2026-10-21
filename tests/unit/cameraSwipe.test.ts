import { describe, expect, it } from 'vitest';
import { CameraSwipe, pinchScale, pointerDistance } from '@/input/cameraSwipe';

describe('CameraSwipe', () => {
  it('returns pixel deltas for rotation', () => {
    const swipe = new CameraSwipe();
    swipe.begin(1, { x: 600, y: 200 }, 0);
    expect(swipe.move({ x: 610, y: 195 }, 16)).toEqual({ dx: 10, dy: -5 });
    expect(swipe.move({ x: 625, y: 190 }, 32)).toEqual({ dx: 15, dy: -5 });
  });

  it('treats a short, small gesture as a tap', () => {
    const swipe = new CameraSwipe();
    swipe.begin(1, { x: 600, y: 200 }, 1000);
    swipe.move({ x: 603, y: 202 }, 1050);
    const result = swipe.end(1090);
    expect(result.tap).toBe(true);
    expect(swipe.isActive).toBe(false);
  });

  it('does not treat a long press as a tap', () => {
    const swipe = new CameraSwipe();
    swipe.begin(1, { x: 600, y: 200 }, 0);
    expect(swipe.end(900).tap).toBe(false);
  });

  it('does not treat a large drag as a tap', () => {
    const swipe = new CameraSwipe();
    swipe.begin(1, { x: 600, y: 200 }, 0);
    swipe.move({ x: 680, y: 240 }, 40);
    expect(swipe.end(80).tap).toBe(false);
  });

  it('carries momentum for at most the inertia window', () => {
    const swipe = new CameraSwipe({ inertiaMs: 100 });
    swipe.begin(1, { x: 0, y: 0 }, 0);
    swipe.move({ x: 30, y: 0 }, 20);
    const result = swipe.end(40);
    expect(result.velocity.x).toBeGreaterThan(0);
    expect(swipe.isGliding).toBe(true);

    let total = 0;
    for (let i = 0; i < 6; i += 1) {
      total += Math.abs(swipe.applyInertia(16).dx);
    }
    expect(total).toBeGreaterThan(0);
    // 6 × 16 ms = 96 ms, still within the window but nearly exhausted.
    swipe.applyInertia(16);
    expect(swipe.isGliding).toBe(false);
  });

  it('does not glide after a tap', () => {
    const swipe = new CameraSwipe();
    swipe.begin(1, { x: 10, y: 10 }, 0);
    swipe.move({ x: 12, y: 10 }, 30);
    swipe.end(60);
    expect(swipe.isGliding).toBe(false);
    expect(swipe.applyInertia(16)).toEqual({ dx: 0, dy: 0 });
  });

  it('cancel() stops everything without inertia', () => {
    const swipe = new CameraSwipe();
    swipe.begin(1, { x: 0, y: 0 }, 0);
    swipe.move({ x: 100, y: 0 }, 16);
    swipe.cancel();
    expect(swipe.isActive).toBe(false);
    expect(swipe.isGliding).toBe(false);
    expect(swipe.applyInertia(16)).toEqual({ dx: 0, dy: 0 });
  });

  it('ignores moves without a begin()', () => {
    const swipe = new CameraSwipe();
    expect(swipe.move({ x: 10, y: 10 }, 0)).toEqual({ dx: 0, dy: 0 });
  });
});

describe('pinch helpers', () => {
  it('computes distance between fingers', () => {
    expect(pointerDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('zooms out when fingers spread and in when they pinch', () => {
    // Spreading fingers (distance grows) must move the camera further away.
    expect(pinchScale(100, 120)).toBeCloseTo(0.8333, 3);
    expect(pinchScale(120, 100)).toBeCloseTo(1.2, 5);
  });

  it('clamps per-event scale to avoid jumps after dropped frames', () => {
    expect(pinchScale(100, 1000)).toBe(0.74);
    expect(pinchScale(1000, 100)).toBe(1.35);
  });

  it('returns 1 for degenerate input', () => {
    expect(pinchScale(0, 100)).toBe(1);
    expect(pinchScale(100, -5)).toBe(1);
    expect(pinchScale(Number.NaN, 10)).toBe(1);
  });
});
