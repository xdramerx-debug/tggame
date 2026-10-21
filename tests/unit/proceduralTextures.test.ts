import { describe, expect, it } from 'vitest';
import { fbm2D, mulberry32, valueNoise2D } from '@/game/visual/textures/noise';
import { heightToNormalData } from '@/game/visual/textures/normalMap';
import {
  combineInsets,
  ZERO_INSETS,
} from '@/mobile/safeArea';
import { isHexDark } from '@/telegram/theme';

describe('noise', () => {
  it('mulberry32 is deterministic and in [0,1)', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i += 1) {
      const value = a();
      expect(value).toBe(b());
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('value noise stays normalized and is stable across calls', () => {
    for (let i = 0; i < 200; i += 1) {
      const value = valueNoise2D(i * 0.37, i * 0.11, 7, 8);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
      expect(valueNoise2D(i * 0.37, i * 0.11, 7, 8)).toBe(value);
    }
  });

  it('fbm averages toward the middle and respects octave count', () => {
    let sum = 0;
    const samples = 64;
    for (let i = 0; i < samples; i += 1) {
      sum += fbm2D(i * 0.3, i * 0.7, { seed: 3, octaves: 4 });
    }
    const mean = sum / samples;
    expect(mean).toBeGreaterThan(0.2);
    expect(mean).toBeLessThan(0.8);
    expect(fbm2D(1.2, 3.4, { seed: 3, octaves: 1 })).toBe(valueNoise2D(1.2, 3.4, 3, 0));
  });
});

describe('heightToNormalData', () => {
  it('returns RGBA data with normalized normals', () => {
    const size = 8;
    const height = new Float32Array(size * size);
    for (let i = 0; i < height.length; i += 1) height[i] = (i % size) / size;
    const data = heightToNormalData(height, size, 2);
    expect(data.length).toBe(size * size * 4);
    // Flat height field → normals point straight up (0.5, 0.5, 1.0).
    const flat = new Float32Array(size * size).fill(0.5);
    const flatData = heightToNormalData(flat, size, 2);
    expect(flatData[0]).toBe(128);
    expect(flatData[1]).toBe(128);
    expect(flatData[2]).toBe(255);
    expect(flatData[3]).toBe(255);
  });
});

describe('safe-area insets', () => {
  it('combines sources by taking the maximum per edge', () => {
    expect(
      combineInsets({ top: 10, right: 0, bottom: 4, left: 0 }, { top: 24, bottom: 8, left: 12 }),
    ).toEqual({ top: 24, right: 0, bottom: 8, left: 12 });
  });

  it('ignores negative and non-finite values', () => {
    expect(combineInsets({ top: -5, right: Number.NaN, bottom: Number.POSITIVE_INFINITY })).toEqual(ZERO_INSETS);
  });
});

describe('theme helpers', () => {
  it('detects dark backgrounds', () => {
    expect(isHexDark('#0B0E14')).toBe(true);
    expect(isHexDark('#FFFFFF')).toBe(false);
    expect(isHexDark('#1E2A3A')).toBe(true);
  });
});
