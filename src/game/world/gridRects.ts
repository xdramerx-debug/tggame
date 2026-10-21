/** Simple integer grid used for greedy rectangle merging. */
export interface GridRect {
  readonly x: number;
  readonly z: number;
  readonly w: number;
  readonly h: number;
}

/**
 * Greedy rectangle cover of a boolean mask.
 *
 * Walls and ceilings are generated per tile, but physics bodies are not free:
 * one collider per tile would mean ~2000 bodies for a floor. This merge turns
 * the same mask into a few dozen rectangles, which is also why the camera
 * raycast and the character controller stay cheap.
 *
 * @param mask row-major booleans, `width × height`
 * @returns disjoint rectangles covering exactly the set cells
 */
export function greedyRectangles(mask: readonly boolean[], width: number, height: number): GridRect[] {
  const used = new Uint8Array(width * height);
  const rects: GridRect[] = [];

  for (let z = 0; z < height; z += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = z * width + x;
      if (!mask[index] || used[index]) continue;

      // Extend along X while cells are set and unused.
      let w = 0;
      while (x + w < width && mask[z * width + x + w] && !used[z * width + x + w]) w += 1;

      // Extend along Z while the whole row of width `w` matches.
      let h = 1;
      const canExtend = (row: number): boolean => {
        if (row >= height) return false;
        for (let i = 0; i < w; i += 1) {
          const cursor = row * width + x + i;
          if (!mask[cursor] || used[cursor]) return false;
        }
        return true;
      };
      while (canExtend(z + h)) h += 1;

      for (let dz = 0; dz < h; dz += 1) {
        for (let dx = 0; dx < w; dx += 1) {
          used[(z + dz) * width + x + dx] = 1;
        }
      }
      rects.push({ x, z, w, h });
    }
  }
  return rects;
}
