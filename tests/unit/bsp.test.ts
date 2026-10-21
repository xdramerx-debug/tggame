import { describe, expect, it } from 'vitest';
import {
  buildRoomGraph,
  carveRoom,
  collectLeaves,
  createRng,
  minimumSpanningEdges,
  pick,
  randomInt,
  rectArea,
  rectsOverlap,
  roomDistance,
  selectRooms,
  splitBsp,
} from '@/game/world/bsp';
import type { BspNode, Rect, Room, Rng } from '@/game/world/bsp';
import { greedyRectangles } from '@/game/world/gridRects';

const GRID: Rect = { x: 2, y: 2, w: 52, h: 52 };
const BSP_OPTIONS = { minLeaf: 13, maxDepth: 5, irregularity: 0.2 } as const;

function makeRooms(count: number, seed = 7): Room[] {
  const rng = createRng(seed);
  const rooms: Room[] = [];
  for (let i = 0; i < count; i += 1) {
    const leaf: Rect = { x: 2 + i * 12, y: 2 + (i % 3) * 12, w: 12, h: 12 };
    const room = carveRoom(leaf, rng, {
      padding: 2,
      minSize: 5,
      maxSize: 10,
      minCeiling: 3,
      maxCeiling: 5,
    }, i);
    if (room) rooms.push(room);
  }
  return rooms;
}

function flatten(node: BspNode, out: BspNode[] = []): BspNode[] {
  out.push(node);
  if (node.left) flatten(node.left, out);
  if (node.right) flatten(node.right, out);
  return out;
}

describe('rng helpers', () => {
  it('is deterministic for the same seed', () => {
    const a = createRng(1234);
    const b = createRng(1234);
    const sequenceA = Array.from({ length: 8 }, () => a());
    const sequenceB = Array.from({ length: 8 }, () => b());
    expect(sequenceA).toEqual(sequenceB);
    expect(new Set(sequenceA).size).toBe(8);
  });

  it('stays inside [0,1) and differs between seeds', () => {
    const a = createRng(1);
    const b = createRng(2);
    for (let i = 0; i < 200; i += 1) {
      const value = a();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
    expect(Array.from({ length: 5 }, () => a())).not.toEqual(Array.from({ length: 5 }, () => b()));
  });

  it('randomInt is inclusive and pick never returns undefined', () => {
    const rng = createRng(9);
    const seen = new Set<number>();
    for (let i = 0; i < 300; i += 1) seen.add(randomInt(rng, 3, 5));
    expect([...seen].sort()).toEqual([3, 4, 5]);
    expect(pick(rng, ['a', 'b'])).toMatch(/[ab]/);
    expect(() => pick(rng, [])).toThrow();
  });
});

describe('splitBsp', () => {
  it('keeps children inside the parent and never overlaps them', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const tree = splitBsp(GRID, BSP_OPTIONS, createRng(seed));
      for (const node of flatten(tree)) {
        if (!node.left || !node.right) continue;
        for (const child of [node.left, node.right]) {
          expect(child.rect.x).toBeGreaterThanOrEqual(node.rect.x);
          expect(child.rect.y).toBeGreaterThanOrEqual(node.rect.y);
          expect(child.rect.x + child.rect.w).toBeLessThanOrEqual(node.rect.x + node.rect.w);
          expect(child.rect.y + child.rect.h).toBeLessThanOrEqual(node.rect.y + node.rect.h);
        }
        expect(rectsOverlap(node.left.rect, node.right.rect)).toBe(false);
        // The two halves must cover the parent's split axis completely.
        const sameX = node.left.rect.x === node.right.rect.x;
        if (sameX) {
          expect(node.left.rect.y + node.left.rect.h).toBe(node.right.rect.y);
          expect(node.left.rect.h + node.right.rect.h).toBe(node.rect.h);
        } else {
          expect(node.left.rect.x + node.left.rect.w).toBe(node.right.rect.x);
          expect(node.left.rect.w + node.right.rect.w).toBe(node.rect.w);
        }
      }
    }
  });

  it('respects minLeaf and maxDepth', () => {
    for (let seed = 1; seed <= 25; seed += 1) {
      const tree = splitBsp(GRID, BSP_OPTIONS, createRng(seed));
      for (const node of flatten(tree)) {
        expect(node.depth).toBeLessThanOrEqual(BSP_OPTIONS.maxDepth);
        if (node.left || node.right) {
          expect(node.rect.w).toBeGreaterThanOrEqual(BSP_OPTIONS.minLeaf);
          expect(node.rect.h).toBeGreaterThanOrEqual(BSP_OPTIONS.minLeaf);
        } else if (node.depth < BSP_OPTIONS.maxDepth) {
          // Below the depth cap a leaf stops only when no axis can be cut again.
          expect(node.rect.w).toBeLessThanOrEqual(BSP_OPTIONS.minLeaf * 2);
          expect(node.rect.h).toBeLessThanOrEqual(BSP_OPTIONS.minLeaf * 2);
        }
      }
    }
  });

  it('is deterministic for one seed and varies across seeds', () => {
    const a = collectLeaves(splitBsp(GRID, BSP_OPTIONS, createRng(77)));
    const b = collectLeaves(splitBsp(GRID, BSP_OPTIONS, createRng(77)));
    const c = collectLeaves(splitBsp(GRID, BSP_OPTIONS, createRng(78)));
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('usually yields enough leaves for a 7-room floor in one pass', () => {
    let withSeven = 0;
    let minimum = Number.POSITIVE_INFINITY;
    for (let seed = 1; seed <= 200; seed += 1) {
      const count = collectLeaves(splitBsp(GRID, BSP_OPTIONS, createRng(seed))).length;
      minimum = Math.min(minimum, count);
      if (count >= 7) withSeven += 1;
    }
    // Generator's 6-attempt retry loop covers the unlucky seeds.
    expect(minimum).toBeGreaterThanOrEqual(3);
    expect(withSeven / 200).toBeGreaterThan(0.9);
  });
});

describe('carveRoom', () => {
  it('insets by the padding and honours size bounds', () => {
    const rng = createRng(4);
    for (let i = 0; i < 50; i += 1) {
      const room = carveRoom({ x: 10, y: 10, w: 16, h: 16 }, rng, {
        padding: 2,
        minSize: 5,
        maxSize: 9,
        minCeiling: 3,
        maxCeiling: 5,
      }, i);
      expect(room).not.toBeNull();
      if (!room) continue;
      expect(room.x).toBeGreaterThanOrEqual(12);
      expect(room.y).toBeGreaterThanOrEqual(12);
      expect(room.x + room.w).toBeLessThanOrEqual(24);
      expect(room.y + room.h).toBeLessThanOrEqual(24);
      expect(room.w).toBeGreaterThanOrEqual(5);
      expect(room.w).toBeLessThanOrEqual(9);
      expect(room.h).toBeGreaterThanOrEqual(5);
      expect(room.h).toBeLessThanOrEqual(9);
      expect(room.ceiling).toBeGreaterThanOrEqual(3);
      expect(room.ceiling).toBeLessThanOrEqual(5);
      expect(Number.isInteger(room.ceiling * 10)).toBe(true);
    }
  });

  it('returns null when the leaf cannot fit a room', () => {
    expect(
      carveRoom({ x: 0, y: 0, w: 8, h: 8 }, createRng(1), {
        padding: 2,
        minSize: 5,
        maxSize: 8,
        minCeiling: 3,
        maxCeiling: 4,
      }, 0),
    ).toBeNull();
  });
});

describe('selectRooms', () => {
  it('returns the requested count without duplicates', () => {
    const rooms = makeRooms(20);
    const selected = selectRooms(rooms, 7, { x: 28, y: 28 });
    expect(selected).toHaveLength(7);
    expect(new Set(selected.map((room) => room.id)).size).toBe(7);
  });

  it('returns all candidates when fewer than requested', () => {
    const rooms = makeRooms(4);
    expect(selectRooms(rooms, 7, { x: 28, y: 28 })).toHaveLength(4);
  });

  it('picks a central first room and then spreads outwards', () => {
    const rooms = makeRooms(20);
    const selected = selectRooms(rooms, 5, { x: 28, y: 28 });
    const first = selected[0];
    expect(first).toBeDefined();
    if (!first) return;
    const distances = selected.slice(1).map((room) => roomDistance(first, room));
    // Farthest-point sampling never picks a room on top of the first one.
    expect(Math.min(...distances)).toBeGreaterThan(0);
    expect(rectArea(first)).toBeGreaterThanOrEqual(25);
  });
});

describe('minimumSpanningEdges', () => {
  function components(count: number, edges: readonly { a: number; b: number }[]): number {
    const parent = Array.from({ length: count }, (_, index) => index);
    const find = (index: number): number => {
      let current = index;
      while (parent[current] !== current) {
        const next = parent[current];
        if (next === undefined) break;
        current = next;
      }
      return current;
    };
    for (const edge of edges) {
      const ra = find(edge.a);
      const rb = find(edge.b);
      if (ra !== rb) parent[rb] = ra;
    }
    return new Set(Array.from({ length: count }, (_, index) => find(index))).size;
  }

  it('connects every room', () => {
    const rooms = makeRooms(9);
    const edges = minimumSpanningEdges(rooms, 0, createRng(3));
    expect(edges).toHaveLength(rooms.length - 1);
    expect(components(rooms.length, edges)).toBe(1);
  });

  it('adds loop edges on request without duplicating them', () => {
    const rooms = makeRooms(8);
    const tree = minimumSpanningEdges(rooms, 0, createRng(5));
    const looped = minimumSpanningEdges(rooms, 2, createRng(5));
    expect(looped.length).toBeGreaterThanOrEqual(tree.length);
    expect(looped.length).toBeLessThanOrEqual(tree.length + 2);
    const keys = looped.map((edge) => `${Math.min(edge.a, edge.b)}-${Math.max(edge.a, edge.b)}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(components(rooms.length, looped)).toBe(1);
  });

  it('ignores rooms that cannot be reached and handles a single room', () => {
    expect(minimumSpanningEdges([], 1, createRng(1))).toEqual([]);
    expect(minimumSpanningEdges(makeRooms(1), 1, createRng(1))).toEqual([]);
  });

  it('costs match room distance', () => {
    const rooms = makeRooms(4);
    const graph = buildRoomGraph(rooms);
    expect(graph).toHaveLength(6);
    for (const edge of graph) {
      const a = rooms[edge.a];
      const b = rooms[edge.b];
      if (!a || !b) throw new Error('bad edge');
      expect(edge.cost).toBeCloseTo(roomDistance(a, b), 10);
    }
  });
});

describe('greedyRectangles', () => {
  const randomMask = (rng: Rng, width: number, height: number): boolean[] =>
    Array.from({ length: width * height }, () => rng() < 0.45);

  it('returns nothing for an empty mask', () => {
    expect(greedyRectangles(new Array<boolean>(16).fill(false), 4, 4)).toEqual([]);
  });

  it('covers exactly the set cells, without overlaps', () => {
    const width = 17;
    const height = 13;
    for (let seed = 1; seed <= 12; seed += 1) {
      const mask = randomMask(createRng(seed), width, height);
      const rects = greedyRectangles(mask, width, height);
      const counts = new Uint8Array(width * height);
      for (const rect of rects) {
        expect(rect.w).toBeGreaterThan(0);
        expect(rect.h).toBeGreaterThan(0);
        expect(rect.x + rect.w).toBeLessThanOrEqual(width);
        expect(rect.z + rect.h).toBeLessThanOrEqual(height);
        for (let dz = 0; dz < rect.h; dz += 1) {
          for (let dx = 0; dx < rect.w; dx += 1) {
            const cell = (rect.z + dz) * width + rect.x + dx;
            counts[cell] = (counts[cell] ?? 0) + 1;
          }
        }
      }
      for (let index = 0; index < mask.length; index += 1) {
        expect(counts[index]).toBe(mask[index] ? 1 : 0);
      }
    }
  });

  it('merges a solid block into a single rectangle', () => {
    const width = 10;
    const height = 10;
    const mask = new Array<boolean>(width * height).fill(false).map((_, index) => {
      const x = index % width;
      const z = Math.floor(index / width);
      return x >= 2 && x < 7 && z >= 3 && z < 8;
    });
    const rects = greedyRectangles(mask, width, height);
    expect(rects).toHaveLength(1);
    expect(rects[0]).toEqual({ x: 2, z: 3, w: 5, h: 5 });
  });
});
