import { describe, expect, it } from 'vitest';
import {
  QUALITY_PRESETS,
  QualityController,
  computeRenderSize,
  decideQuality,
  stepQuality,
} from '@/game/core/Quality';
import type { QualityLevel } from '@/types/engine';

describe('presets match the tech spec', () => {
  it('high: 2048 shadows, SSAO, bloom, scale 1.0, 60 fps', () => {
    const preset = QUALITY_PRESETS.high;
    expect(preset.shadowMapSize).toBe(2048);
    expect(preset.ssao).toBe(true);
    expect(preset.bloom).toBe(true);
    expect(preset.renderScale).toBe(1);
    expect(preset.targetFps).toBe(60);
  });

  it('medium: 1024 shadows, no SSAO, bloom, scale 0.85', () => {
    const preset = QUALITY_PRESETS.medium;
    expect(preset.shadowMapSize).toBe(1024);
    expect(preset.ssao).toBe(false);
    expect(preset.bloom).toBe(true);
    expect(preset.renderScale).toBe(0.85);
  });

  it('low: no shadows, no bloom, scale 0.7', () => {
    const preset = QUALITY_PRESETS.low;
    expect(preset.shadowMapSize).toBe(0);
    expect(preset.bloom).toBe(false);
    expect(preset.renderScale).toBe(0.7);
  });

  it('never exceeds the 4 point-light budget', () => {
    for (const preset of Object.values(QUALITY_PRESETS)) {
      expect(preset.maxPointLights).toBeLessThanOrEqual(4);
    }
  });
});

describe('stepQuality', () => {
  it('walks the tier ladder without leaving it', () => {
    expect(stepQuality('medium', 'up')).toBe('high');
    expect(stepQuality('medium', 'down')).toBe('low');
    expect(stepQuality('high', 'up')).toBeNull();
    expect(stepQuality('low', 'down')).toBeNull();
  });
});

describe('decideQuality', () => {
  const base = { paused: false, cooldownSec: 0 } as const;

  it('downgrades below 45 fps after the settle window', () => {
    expect(decideQuality({ ...base, current: 'high', fps: 38, secondsAtTier: 3 })).toBe('medium');
    expect(decideQuality({ ...base, current: 'high', fps: 44.9, secondsAtTier: 3 })).toBe('medium');
  });

  it('does not downgrade during the first second at a tier', () => {
    expect(decideQuality({ ...base, current: 'high', fps: 20, secondsAtTier: 1 })).toBeNull();
  });

  it('does not downgrade while paused', () => {
    expect(decideQuality({ ...base, paused: true, current: 'high', fps: 10, secondsAtTier: 30 })).toBeNull();
  });

  it('upgrades only after six seconds of headroom', () => {
    expect(decideQuality({ ...base, current: 'medium', fps: 61, secondsAtTier: 3 })).toBeNull();
    expect(decideQuality({ ...base, current: 'medium', fps: 61, secondsAtTier: 7 })).toBe('high');
  });

  it('never goes below low or above high', () => {
    expect(decideQuality({ ...base, current: 'low', fps: 5, secondsAtTier: 60 })).toBeNull();
    expect(decideQuality({ ...base, current: 'high', fps: 120, secondsAtTier: 60 })).toBeNull();
  });
});

describe('computeRenderSize', () => {
  it('caps the pixel ratio and applies render scale', () => {
    const size = computeRenderSize(844, 390, 3, QUALITY_PRESETS.medium);
    // 1.75 cap × 0.85 render scale = 1.4875
    expect(size.pixelRatio).toBeCloseTo(1.4875, 4);
    expect(size.width).toBe(Math.floor(844 * 1.4875));
    expect(size.height).toBe(Math.floor(390 * 1.4875));
  });

  it('never returns a zero-sized buffer', () => {
    const size = computeRenderSize(0, 0, 1, QUALITY_PRESETS.low);
    expect(size.width).toBeGreaterThanOrEqual(1);
    expect(size.height).toBeGreaterThanOrEqual(1);
  });
});

describe('QualityController', () => {
  function createController(fpsRef: { value: number }, changes: QualityLevel[], start: QualityLevel = 'high') {
    let clock = 0;
    const controller = new QualityController({
      initial: start,
      getFps: () => fpsRef.value,
      isPaused: () => false,
      onChange: (level) => changes.push(level),
      now: () => clock,
    });
    return {
      controller,
      advance: (ms: number): void => {
        clock += ms;
        controller.update();
      },
    };
  }

  it('does not oscillate right after a switch', () => {
    const changes: QualityLevel[] = [];
    const fps = { value: 30 };
    const { advance } = createController(fps, changes);
    advance(5000);
    expect(changes).toEqual(['medium']);
    // Even with terrible fps, the 8 s guard blocks an immediate second switch.
    fps.value = 10;
    advance(3000);
    expect(changes).toEqual(['medium']);
    advance(6000);
    expect(changes).toEqual(['medium', 'low']);
  });

  it('ignores forced switches to the current tier', () => {
    const changes: QualityLevel[] = [];
    const { controller } = createController({ value: 60 }, changes);
    controller.setLevel('high');
    expect(changes).toEqual([]);
    controller.setLevel('low');
    expect(changes).toEqual(['low']);
  });
});
