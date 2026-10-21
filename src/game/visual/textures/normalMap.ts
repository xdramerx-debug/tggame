import { clamp01 } from './noise';

/**
 * Converts a height field (0..1, row-major) into a tangent-space normal map.
 * Pure function so it can be validated in Vitest without a canvas.
 *
 * @param height normalized height samples, length = size * size
 * @param size edge length in pixels
 * @param strength bump strength (typical 1..4 for stone)
 * @returns RGBA8 data ready for ImageData, length = size * size * 4
 */
export function heightToNormalData(height: Float32Array, size: number, strength = 2): Uint8ClampedArray {
  const out = new Uint8ClampedArray(size * size * 4);
  const at = (x: number, y: number): number => {
    const xi = ((x % size) + size) % size;
    const yi = ((y % size) + size) % size;
    return height[yi * size + xi] ?? 0;
  };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      // Normal of the height field, normalized to 0..1 in tangent space.
      let nx = -dx;
      let ny = -dy;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len;
      ny /= len;
      nz /= len;

      const i = (y * size + x) * 4;
      out[i] = Math.round(clamp01(nx * 0.5 + 0.5) * 255);
      out[i + 1] = Math.round(clamp01(ny * 0.5 + 0.5) * 255);
      out[i + 2] = Math.round(clamp01(nz * 0.5 + 0.5) * 255);
      out[i + 3] = 255;
    }
  }
  return out;
}
