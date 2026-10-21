/**
 * Deterministic value-noise helpers used by the procedural texture pipeline.
 * Pure math only — no DOM — so the functions are unit-testable in Node.
 */

/** Mulberry32 PRNG: tiny, fast, deterministic. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** 2D value noise with an optional wrap period (for tileable textures). */
export function valueNoise2D(x: number, y: number, seed: number, period = 0): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = fade(x - x0);
  const fy = fade(y - y0);

  const wrap = (v: number): number => (period > 0 ? ((v % period) + period) % period : v);
  const hash = (ix: number, iy: number): number => {
    const wx = wrap(ix);
    const wy = wrap(iy);
    let h = Math.imul(wx, 374761393) + Math.imul(wy, 668265263) + Math.imul(seed, 1442695041);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  const n00 = hash(x0, y0);
  const n10 = hash(x0 + 1, y0);
  const n01 = hash(x0, y0 + 1);
  const n11 = hash(x0 + 1, y0 + 1);

  return lerp(lerp(n00, n10, fx), lerp(n01, n11, fx), fy);
}

/** Fractal Brownian motion; `basePeriod` keeps the result tileable. */
export function fbm2D(
  x: number,
  y: number,
  options: { seed: number; octaves?: number; lacunarity?: number; gain?: number; basePeriod?: number },
): number {
  const { seed } = options;
  const octaves = options.octaves ?? 4;
  const lacunarity = options.lacunarity ?? 2;
  const gain = options.gain ?? 0.5;
  const basePeriod = options.basePeriod ?? 0;

  let amplitude = 1;
  let frequency = 1;
  let sum = 0;
  let norm = 0;

  for (let i = 0; i < octaves; i += 1) {
    const period = basePeriod > 0 ? basePeriod * frequency : 0;
    sum += amplitude * valueNoise2D(x * frequency, y * frequency, seed + i * 1013, period);
    norm += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return norm > 0 ? sum / norm : 0;
}

/** Clamp helper shared by texture builders. */
export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
