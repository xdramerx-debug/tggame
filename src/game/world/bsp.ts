import { mulberry32 } from '@/game/visual/textures/noise';

/** Integer rectangle in tile coordinates (1 tile = 1 metre). */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Binary space partition node; leaves carry candidate room space. */
export interface BspNode {
  readonly rect: Rect;
  readonly depth: number;
  left: BspNode | null;
  right: BspNode | null;
}

export interface BspOptions {
  /** Stop splitting below this leaf size (tiles). */
  readonly minLeaf: number;
  readonly maxDepth: number;
  /** Chance to split vertically instead of following the longer side. */
  readonly irregularity?: number;
}

export interface Room extends Rect {
  readonly id: number;
  /** Room ceiling height in metres (3–5 per spec). */
  readonly ceiling: number;
}

/**
 * Deterministic RNG wrapper. Not a class hierarchy: a single function with
 * helpers keeps generation functions pure and easy to test.
 */
export type Rng = () => number;

export function createRng(seed: number): Rng {
  return mulberry32(seed);
}

export function randomInt(rng: Rng, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick() from an empty list');
  const index = Math.min(items.length - 1, Math.floor(rng() * items.length));
  const value = items[index];
  if (value === undefined) throw new Error('pick() index out of range');
  return value;
}

export function clampInt(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Axis-aligned intersection test (exclusive edges are considered disjoint). */
export function rectsOverlap(a: Rect, b: Rect, padding = 0): boolean {
  return (
    a.x - padding < b.x + b.w &&
    a.x + a.w + padding > b.x &&
    a.y - padding < b.y + b.h &&
    a.y + a.h + padding > b.y
  );
}

export function rectCenter(rect: Rect): { x: number; y: number } {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

export function rectArea(rect: Rect): number {
  return rect.w * rect.h;
}

/** Manhattan distance between rectangle centres (corridor length proxy). */
export function roomDistance(a: Rect, b: Rect): number {
  const ca = rectCenter(a);
  const cb = rectCenter(b);
  return Math.abs(ca.x - cb.x) + Math.abs(ca.y - cb.y);
}

/**
 * Recursively splits a rectangle.
 * Split orientation follows the longer side, with `irregularity` chance to flip,
 * so dungeons do not look like a perfect grid of tiles.
 */
export function splitBsp(rect: Rect, options: BspOptions, rng: Rng): BspNode {
  const node: BspNode = { rect, depth: 0, left: null, right: null };
  splitNode(node, options, rng);
  return node;
}

function splitNode(node: BspNode, options: BspOptions, rng: Rng): void {
  const { minLeaf, maxDepth } = options;
  const { rect, depth } = node;
  if (depth >= maxDepth) return;
  const canSplitW = rect.w >= minLeaf * 2;
  const canSplitH = rect.h >= minLeaf * 2;
  if (!canSplitW && !canSplitH) return;

  let horizontal: boolean;
  if (canSplitW && canSplitH) {
    horizontal = rect.w > rect.h * 1.15;
    if (rect.h > rect.w * 1.15) horizontal = false;
    if (Math.abs(rect.w - rect.h) <= Math.max(rect.w, rect.h) * 0.15) {
      horizontal = rng() < 0.5;
    }
    if (rng() < (options.irregularity ?? 0.18)) horizontal = !horizontal;
    if (horizontal && !canSplitW) horizontal = false;
    if (!horizontal && !canSplitH) horizontal = true;
  } else {
    horizontal = canSplitW;
  }

  // The chosen axis must allow a cut that leaves both halves ≥ minLeaf;
  // otherwise fall back to the other axis instead of giving up early.
  const canCut = (alongWidth: boolean): boolean => (alongWidth ? rect.w : rect.h) > minLeaf * 2;
  if (!canCut(horizontal) && canCut(!horizontal)) horizontal = !horizontal;
  if (!canCut(horizontal)) return;

  const size = horizontal ? rect.w : rect.h;
  const min = minLeaf;
  const max = size - minLeaf;
  const cut = randomInt(rng, min, max);

  const a: Rect = horizontal
    ? { x: rect.x, y: rect.y, w: cut, h: rect.h }
    : { x: rect.x, y: rect.y, w: rect.w, h: cut };
  const b: Rect = horizontal
    ? { x: rect.x + cut, y: rect.y, w: rect.w - cut, h: rect.h }
    : { x: rect.x, y: rect.y + cut, w: rect.w, h: rect.h - cut };

  node.left = { rect: a, depth: depth + 1, left: null, right: null };
  node.right = { rect: b, depth: depth + 1, left: null, right: null };
  splitNode(node.left, options, rng);
  splitNode(node.right, options, rng);
}

/** Collects all leaves of a BSP tree (left-to-right, deterministic). */
export function collectLeaves(node: BspNode, out: Rect[] = []): Rect[] {
  if (!node.left && !node.right) {
    out.push(node.rect);
    return out;
  }
  if (node.left) collectLeaves(node.left, out);
  if (node.right) collectLeaves(node.right, out);
  return out;
}

export interface RoomCarveOptions {
  /** Border kept between a room and its leaf edge (tiles). */
  readonly padding: number;
  readonly minSize: number;
  readonly maxSize: number;
  readonly minCeiling: number;
  readonly maxCeiling: number;
}

/**
 * Turns a BSP leaf into a room by insetting the leaf and shrinking it randomly.
 * @returns null when the leaf is too small for the minimum room size
 */
export function carveRoom(leaf: Rect, rng: Rng, options: RoomCarveOptions, id: number): Room | null {
  const availableW = leaf.w - options.padding * 2;
  const availableH = leaf.h - options.padding * 2;
  if (availableW < options.minSize || availableH < options.minSize) return null;

  const w = randomInt(rng, options.minSize, Math.min(options.maxSize, availableW));
  const h = randomInt(rng, options.minSize, Math.min(options.maxSize, availableH));
  const slackX = availableW - w;
  const slackY = availableH - h;
  const x = leaf.x + options.padding + randomInt(rng, 0, Math.max(0, slackX));
  const y = leaf.y + options.padding + randomInt(rng, 0, Math.max(0, slackY));
  const ceiling = Math.round((options.minCeiling + rng() * (options.maxCeiling - options.minCeiling)) * 10) / 10;
  return { x, y, w, h, id, ceiling };
}

/**
 * Chooses `count` rooms out of candidates, biased towards larger rooms but
 * enforcing spatial spread with farthest-point sampling: the entrance room is
 * the one closest to the grid centre, the next rooms are the farthest remaining.
 */
export function selectRooms(candidates: readonly Room[], count: number, gridCenter: { x: number; y: number }): Room[] {
  if (candidates.length <= count) return [...candidates];
  const remaining = [...candidates];
  const chosen: Room[] = [];

  // First pick: the most central large room.
  remaining.sort((a, b) => {
    const scoreA = rectArea(a) - Math.hypot(rectCenter(a).x - gridCenter.x, rectCenter(a).y - gridCenter.y) * 3;
    const scoreB = rectArea(b) - Math.hypot(rectCenter(b).x - gridCenter.x, rectCenter(b).y - gridCenter.y) * 3;
    return scoreB - scoreA;
  });
  const first = remaining.shift();
  if (first) chosen.push(first);

  while (chosen.length < count && remaining.length > 0) {
    let bestIndex = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i += 1) {
      const candidate = remaining[i];
      if (!candidate) continue;
      let nearest = Infinity;
      for (const room of chosen) nearest = Math.min(nearest, roomDistance(room, candidate));
      // Distance dominates; area breaks ties so the spread does not pick slivers.
      const score = nearest * 10 + rectArea(candidate) * 0.05;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    const [next] = remaining.splice(bestIndex, 1);
    if (next) chosen.push(next);
  }
  return chosen;
}

export interface GraphEdge {
  readonly a: number;
  readonly b: number;
  readonly cost: number;
}

/** Complete graph over rooms, used as the input of the MST. */
export function buildRoomGraph(rooms: readonly Room[]): GraphEdge[] {
  const edges: GraphEdge[] = [];
  for (let i = 0; i < rooms.length; i += 1) {
    for (let j = i + 1; j < rooms.length; j += 1) {
      const a = rooms[i];
      const b = rooms[j];
      if (!a || !b) continue;
      edges.push({ a: i, b: j, cost: roomDistance(a, b) });
    }
  }
  return edges;
}

/**
 * Prim's MST: guarantees every room is reachable with the fewest corridor tiles.
 * Additional loop edges (spec: dungeons should not be pure trees) are added
 * afterwards as the cheapest edges that are not already in the tree.
 */
export function minimumSpanningEdges(
  rooms: readonly Room[],
  extraLoops = 1,
  rng: Rng = Math.random,
): GraphEdge[] {
  if (rooms.length <= 1) return [];
  const edges = buildRoomGraph(rooms).sort((a, b) => a.cost - b.cost);
  const parent = rooms.map((_, index) => index);
  const find = (index: number): number => {
    let current = index;
    while (parent[current] !== current) {
      const next = parent[current];
      if (next === undefined) break;
      parent[current] = parent[next] ?? next;
      current = parent[current] ?? current;
      if (current === index) break;
    }
    return current;
  };
  const union = (a: number, b: number): boolean => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return false;
    parent[rb] = ra;
    return true;
  };

  const tree: GraphEdge[] = [];
  const used = new Set<GraphEdge>();
  for (const edge of edges) {
    if (tree.length >= rooms.length - 1) break;
    if (union(edge.a, edge.b)) {
      tree.push(edge);
      used.add(edge);
    }
  }

  const leftovers = edges.filter((edge) => !used.has(edge));
  const extras: GraphEdge[] = [];
  for (let i = 0; i < extraLoops && leftovers.length > 0; i += 1) {
    const index = Math.floor(rng() * leftovers.length);
    const [edge] = leftovers.splice(index, 1);
    if (edge) extras.push(edge);
  }
  return [...tree, ...extras];
}
