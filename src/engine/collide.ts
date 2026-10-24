import type { BoxObstacle, CylObstacle, Obstacle } from '../game/map';

/**
 * Чистая математика столкновений и линии видимости (2D, XZ-плоскость).
 * Никакого three.js — покрыта unit-тестами.
 */

export interface Collider {
  boxes: BoxObstacle[];
  cyls: CylObstacle[];
}

export function buildCollider(obstacles: readonly Obstacle[]): Collider {
  const boxes: BoxObstacle[] = [];
  const cyls: CylObstacle[] = [];
  for (const o of obstacles) {
    if (o.kind === 'box') boxes.push(o);
    else cyls.push(o);
  }
  return { boxes, cyls };
}

/** выталкивает круг (x,z,r) из препятствий; итерации для углов */
export function resolveCircle(x: number, z: number, r: number, col: Collider, bound: number): { x: number; z: number } {
  let px = x;
  let pz = z;
  for (let iter = 0; iter < 2; iter++) {
    for (const b of col.boxes) {
      const cx = Math.max(b.x - b.hw, Math.min(px, b.x + b.hw));
      const cz = Math.max(b.z - b.hd, Math.min(pz, b.z + b.hd));
      const dx = px - cx;
      const dz = pz - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-9) {
        const d = Math.sqrt(d2);
        px = cx + (dx / d) * r;
        pz = cz + (dz / d) * r;
      } else {
        // центр внутри бокса — выталкиваем по кратчайшей оси
        const overL = px - (b.x - b.hw);
        const overR = b.x + b.hw - px;
        const overN = pz - (b.z - b.hd);
        const overS = b.z + b.hd - pz;
        const minOver = Math.min(overL, overR, overN, overS);
        if (minOver === overL) px = b.x - b.hw - r;
        else if (minOver === overR) px = b.x + b.hw + r;
        else if (minOver === overN) pz = b.z - b.hd - r;
        else pz = b.z + b.hd + r;
      }
    }
    for (const c of col.cyls) {
      const dx = px - c.x;
      const dz = pz - c.z;
      const rr = r + c.r;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr) continue;
      const d = Math.sqrt(d2) || 1e-6;
      px = c.x + (dx / d) * rr;
      pz = c.z + (dz / d) * rr;
    }
  }
  const lim = bound - r;
  return {
    x: Math.max(-lim, Math.min(lim, px)),
    z: Math.max(-lim, Math.min(lim, pz)),
  };
}

/**
 * 2D-луч (ax,az)→(dx,dz единичный): t первого пересечения с блокером
 * высотой > minHeight, либо null. maxT ограничивает дальность.
 */
export function rayBlock(
  ax: number, az: number, dx: number, dz: number,
  maxT: number, col: Collider, minHeight = 1.2,
): number | null {
  let best: number | null = null;
  for (const b of col.boxes) {
    if (b.h <= minHeight) continue;
    const minX = b.x - b.hw;
    const maxX = b.x + b.hw;
    const minZ = b.z - b.hd;
    const maxZ = b.z + b.hd;
    let t0 = 0;
    let t1 = maxT;
    let ok = true;
    if (Math.abs(dx) < 1e-9) {
      if (ax < minX || ax > maxX) ok = false;
    } else {
      const inv = 1 / dx;
      let ta = (minX - ax) * inv;
      let tb = (maxX - ax) * inv;
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      t0 = Math.max(t0, ta);
      t1 = Math.min(t1, tb);
      if (t0 > t1) ok = false;
    }
    if (ok) {
      if (Math.abs(dz) < 1e-9) {
        if (az < minZ || az > maxZ) ok = false;
      } else {
        const inv = 1 / dz;
        let ta = (minZ - az) * inv;
        let tb = (maxZ - az) * inv;
        if (ta > tb) { const s = ta; ta = tb; tb = s; }
        t0 = Math.max(t0, ta);
        t1 = Math.min(t1, tb);
        if (t0 > t1) ok = false;
      }
    }
    if (ok && t0 <= t1 && (best === null || t0 < best)) best = t0;
  }
  for (const c of col.cyls) {
    if (c.h <= minHeight) continue;
    const ox = ax - c.x;
    const oz = az - c.z;
    const bQ = 2 * (ox * dx + oz * dz);
    const cQ = ox * ox + oz * oz - c.r * c.r;
    const disc = bQ * bQ - 4 * cQ;
    if (disc < 0) continue;
    const sq = Math.sqrt(disc);
    const t = (-bQ - sq) / 2;
    const tHit = t >= 0 ? t : (-bQ + sq) / 2;
    if (tHit >= 0 && tHit <= maxT && (best === null || tHit < best)) best = tHit;
  }
  return best;
}

/** есть ли линия видимости между двумя точками */
export function hasLOS(ax: number, az: number, bx: number, bz: number, col: Collider, minHeight = 1.2): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-6) return true;
  const hit = rayBlock(ax, az, dx / dist, dz / dist, dist - 0.05, col, minHeight);
  return hit === null;
}

/**
 * Высота опоры: верх самого высокого препятствия под точкой (x,z),
 * чей верх ≤ maxY (игрок может стоять на ящиках/бочках).
 */
export function supportHeight(x: number, z: number, col: Collider, maxY: number): number {
  let top = 0;
  for (const b of col.boxes) {
    if (b.h > maxY + 1e-6) continue;
    if (x >= b.x - b.hw && x <= b.x + b.hw && z >= b.z - b.hd && z <= b.z + b.hd) {
      top = Math.max(top, b.h);
    }
  }
  for (const c of col.cyls) {
    if (c.h > maxY + 1e-6) continue;
    const dx = x - c.x;
    const dz = z - c.z;
    if (dx * dx + dz * dz <= c.r * c.r) top = Math.max(top, c.h);
  }
  return top;
}

/** точка внутри любого бокса/цилиндра (с запасом pad) — для проверки спавнов */
export function insideAny(x: number, z: number, col: Collider, pad = 0): boolean {
  for (const b of col.boxes) {
    if (x >= b.x - b.hw - pad && x <= b.x + b.hw + pad && z >= b.z - b.hd - pad && z <= b.z + b.hd + pad) return true;
  }
  for (const c of col.cyls) {
    const dx = x - c.x;
    const dz = z - c.z;
    const rr = c.r + pad;
    if (dx * dx + dz * dz <= rr * rr) return true;
  }
  return false;
}
