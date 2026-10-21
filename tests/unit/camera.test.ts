import { describe, expect, it } from 'vitest';
import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import {
  CAMERA_LIMITS,
  CameraRig,
  clampDistance,
  clampPitch,
  damp,
  pointerDeltaToOrbit,
  wrapAngle,
} from '@/game/core/CameraRig';

describe('camera limits', () => {
  it('clamps pitch to the spec window of −15°…+45°', () => {
    expect(clampPitch(MathUtils.degToRad(-90))).toBeCloseTo(MathUtils.degToRad(-15), 5);
    expect(clampPitch(MathUtils.degToRad(90))).toBeCloseTo(MathUtils.degToRad(45), 5);
    expect(clampPitch(MathUtils.degToRad(20))).toBeCloseTo(MathUtils.degToRad(20), 5);
  });

  it('clamps zoom to 2.5–8 metres', () => {
    expect(clampDistance(0.5)).toBe(CAMERA_LIMITS.minDistance);
    expect(clampDistance(99)).toBe(CAMERA_LIMITS.maxDistance);
    expect(clampDistance(5)).toBe(5);
  });

  it('damp() is frame-rate independent', () => {
    const at60 = damp(0.1, 1 / 60);
    const at30 = damp(0.1, 1 / 30);
    // Two 30 Hz steps should cover roughly the same distance as four 60 Hz steps.
    const twoSteps = 1 - (1 - at30) * (1 - at30);
    const fourSteps = 1 - Math.pow(1 - at60, 4);
    expect(twoSteps).toBeCloseTo(fourSteps, 3);
    expect(damp(0, 0.016)).toBe(1);
  });
});

describe('pointerDeltaToOrbit', () => {
  it('maps horizontal drag to yaw at the configured sensitivity', () => {
    const { yaw } = pointerDeltaToOrbit(100, 0, 0.25);
    expect(yaw).toBeCloseTo(-MathUtils.degToRad(25), 6);
  });

  it('inverts Y when requested', () => {
    const normal = pointerDeltaToOrbit(0, 40, 0.25).pitch;
    const inverted = pointerDeltaToOrbit(0, 40, 0.25, true).pitch;
    expect(normal).toBeCloseTo(-inverted, 6);
  });
});

describe('wrapAngle', () => {
  it('keeps yaw in (-π, π]', () => {
    expect(wrapAngle(0)).toBe(0);
    // Both ±3π fold onto the same edge of the half-open interval (-π, π].
    expect(wrapAngle(Math.PI * 3)).toBeCloseTo(Math.PI, 5);
    expect(wrapAngle(-Math.PI * 3)).toBeCloseTo(Math.PI, 5);
  });
});

function createRig(probe?: (origin: Vector3, direction: Vector3, maxDistance: number) => number): {
  rig: CameraRig;
  camera: PerspectiveCamera;
} {
  const camera = new PerspectiveCamera(58, 16 / 9, 0.1, 70);
  const rig = new CameraRig({ camera, ...(probe ? { probe } : {}) });
  return { rig, camera };
}

describe('CameraRig', () => {
  it('places the camera behind the target at the requested distance', () => {
    const { rig, camera } = createRig();
    rig.setTarget(new Vector3(0, 1, 0), true);
    rig.update(0.016);
    expect(camera.position.distanceTo(new Vector3(0, 1, 0))).toBeCloseTo(5, 1);
    // initial yaw = 0 → camera sits on +Z (behind a hero facing −Z)
    expect(camera.position.z).toBeGreaterThan(0);
  });

  it('shortens the boom instantly when a wall is closer than the distance', () => {
    const { rig, camera } = createRig(() => 2);
    rig.setTarget(new Vector3(0, 1, 0), true);
    rig.update(0.016);
    const distance = camera.position.distanceTo(new Vector3(0, 1, 0));
    expect(distance).toBeLessThanOrEqual(2);
  });

  it('recovers the distance slowly after the obstruction disappears', () => {
    let blocked = true;
    const { rig, camera } = createRig(() => (blocked ? 1.5 : Number.POSITIVE_INFINITY));
    rig.setTarget(new Vector3(0, 1, 0), true);
    rig.update(0.016);
    const blockedDistance = camera.position.distanceTo(new Vector3(0, 1, 0));
    blocked = false;
    rig.update(0.016);
    const oneFrame = camera.position.distanceTo(new Vector3(0, 1, 0));
    // Fast in, slow out: a single frame must not restore the full boom.
    expect(oneFrame).toBeGreaterThan(blockedDistance);
    expect(oneFrame - blockedDistance).toBeLessThan(1);
  });

  it('respects pitch limits when dragging far', () => {
    const { rig } = createRig();
    // Dragging up raises the camera (pitch up) and clamps at +45°.
    rig.applyPointerDelta(0, -10000);
    expect(rig.pitch).toBeCloseTo(MathUtils.degToRad(CAMERA_LIMITS.maxPitchDeg), 5);
    // Dragging down lowers it and clamps at −15°.
    rig.applyPointerDelta(0, 20000);
    expect(rig.pitch).toBeCloseTo(MathUtils.degToRad(CAMERA_LIMITS.minPitchDeg), 5);
  });

  it('clamps pinch zoom into the allowed range', () => {
    const { rig } = createRig();
    rig.applyZoomFactor(0.01);
    expect(rig.distance).toBe(CAMERA_LIMITS.minDistance);
    rig.applyZoomFactor(100);
    expect(rig.distance).toBe(CAMERA_LIMITS.maxDistance);
    rig.applyZoomFactor(Number.NaN);
    expect(rig.distance).toBe(CAMERA_LIMITS.maxDistance);
  });

  it('exposes a forward vector pointing down −Z at yaw 0', () => {
    const { rig } = createRig();
    const forward = rig.getForward();
    expect(forward.x).toBeCloseTo(0, 6);
    expect(forward.z).toBeCloseTo(-1, 6);
  });
});
