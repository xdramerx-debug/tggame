import * as THREE from 'three';
import { PLAYER } from '../game/types';
import type { Enemy } from './enemy';
import type { Collider } from './collide';

/**
 * Хитскан-разрешение выстрелов: луч против голов/тел врагов,
 * 3D-боксов, цилиндров и земли; трассеры и пулевые следы.
 */

export interface EnemyHitInfo {
  enemy: Enemy;
  head: boolean;
  t: number;
}

export interface EnvHitInfo {
  t: number;
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
}

export interface PelletResult {
  enemy: EnemyHitInfo | null;
  env: EnvHitInfo | null;
  ex: number;
  ey: number;
  ez: number;
}

const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);
const tmpC = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const tmpU = new THREE.Vector3();
const tmpV = new THREE.Vector3();

export function raySphere(
  ox: number, oy: number, oz: number, dx: number, dy: number, dz: number,
  cx: number, cy: number, cz: number, r: number,
): number | null {
  const ex = cx - ox;
  const ey = cy - oy;
  const ez = cz - oz;
  const b = ex * dx + ey * dy + ez * dz;
  const c = ex * ex + ey * ey + ez * ez - r * r;
  if (c > 0 && b < 0) return null;
  const disc = b * b - c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const t = b - sq;
  if (t >= 0) return t;
  const t2 = b + sq;
  return t2 >= 0 ? t2 : null;
}

export function rayCylY(
  ox: number, oy: number, oz: number, dx: number, dy: number, dz: number,
  cx: number, cz: number, r: number, y0: number, y1: number,
): number | null {
  const ex = ox - cx;
  const ez = oz - cz;
  const a = dx * dx + dz * dz;
  if (a < 1e-9) return null;
  const b = 2 * (ex * dx + ez * dz);
  const c = ex * ex + ez * ez - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const t1 = (-b - sq) / (2 * a);
  if (t1 >= 0) {
    const y = oy + dy * t1;
    if (y >= y0 && y <= y1) return t1;
  }
  const t2 = (-b + sq) / (2 * a);
  if (t2 >= 0) {
    const y = oy + dy * t2;
    if (y >= y0 && y <= y1) return t2;
  }
  return null;
}

interface SlabResult { t0: number; t1: number; n0: number; }

function slab(o: number, d: number, mn: number, mx: number, maxT: number): SlabResult | null {
  if (Math.abs(d) < 1e-9) {
    if (o < mn || o > mx) return null;
    return { t0: 0, t1: maxT, n0: 0 };
  }
  const inv = 1 / d;
  let ta = (mn - o) * inv;
  let tb = (mx - o) * inv;
  let na = -1;
  if (ta > tb) {
    const s = ta; ta = tb; tb = s;
    na = 1;
  }
  return { t0: ta, t1: tb, n0: na };
}

/** 3D-луч против окружения (боксы, цилиндры, земля) */
export function rayEnv(
  ox: number, oy: number, oz: number, dx: number, dy: number, dz: number,
  col: Collider, maxT: number,
): EnvHitInfo | null {
  let best: EnvHitInfo | null = null;
  for (const b of col.boxes) {
    const sx = slab(ox, dx, b.x - b.hw, b.x + b.hw, maxT);
    if (!sx) continue;
    const sy = slab(oy, dy, 0, b.h, maxT);
    if (!sy) continue;
    const sz = slab(oz, dz, b.z - b.hd, b.z + b.hd, maxT);
    if (!sz) continue;
    let t0 = sx.t0;
    let axis = 0;
    let sign = sx.n0;
    if (sy.t0 > t0) { t0 = sy.t0; axis = 1; sign = sy.n0; }
    if (sz.t0 > t0) { t0 = sz.t0; axis = 2; sign = sz.n0; }
    const t1 = Math.min(sx.t1, sy.t1, sz.t1);
    if (t0 > t1 || t0 < 0 || t0 > maxT) continue;
    if (best && best.t <= t0) continue;
    let nx = 0;
    let ny = 0;
    let nz = 0;
    if (sign !== 0) {
      if (axis === 0) nx = sign;
      else if (axis === 1) ny = sign;
      else nz = sign;
    } else {
      nx = -dx; ny = -dy; nz = -dz;
    }
    best = { t: t0, x: ox + dx * t0, y: oy + dy * t0, z: oz + dz * t0, nx, ny, nz };
  }
  for (const c of col.cyls) {
    const ex = ox - c.x;
    const ez = oz - c.z;
    const a = dx * dx + dz * dz;
    if (a > 1e-9) {
      const bq = 2 * (ex * dx + ez * dz);
      const cq = ex * ex + ez * ez - c.r * c.r;
      const disc = bq * bq - 4 * a * cq;
      if (disc >= 0) {
        const sq = Math.sqrt(disc);
        for (const t of [(-bq - sq) / (2 * a), (-bq + sq) / (2 * a)]) {
          if (t < 0 || t > maxT) continue;
          const y = oy + dy * t;
          if (y < 0 || y > c.h) continue;
          if (best && best.t <= t) continue;
          const hx = ox + dx * t;
          const hz = oz + dz * t;
          const rl = Math.hypot(hx - c.x, hz - c.z) || 1;
          best = { t, x: hx, y, z: hz, nx: (hx - c.x) / rl, ny: 0, nz: (hz - c.z) / rl };
          break;
        }
      }
    }
    // верхняя крышка
    if (Math.abs(dy) > 1e-9) {
      const t = (c.h - oy) / dy;
      if (t >= 0 && t <= maxT && (!best || t < best.t)) {
        const hx = ox + dx * t;
        const hz = oz + dz * t;
        const dd = (hx - c.x) ** 2 + (hz - c.z) ** 2;
        if (dd <= c.r * c.r) best = { t, x: hx, y: c.h, z: hz, nx: 0, ny: 1, nz: 0 };
      }
    }
  }
  // земля
  if (dy < -1e-9) {
    const t = -oy / dy;
    if (t >= 0 && t <= maxT && (!best || t < best.t)) {
      best = { t, x: ox + dx * t, y: 0, z: oz + dz * t, nx: 0, ny: 1, nz: 0 };
    }
  }
  return best;
}

/** попадание луча в капсулу игрока; px/py/pz — ступни */
export function playerHit(
  ox: number, oy: number, oz: number, dx: number, dy: number, dz: number,
  px: number, py: number, pz: number, crouched: boolean,
): number | null {
  const y0 = py + 0.15;
  const y1 = py + (crouched ? PLAYER.crouchEye + 0.22 : PLAYER.eye + 0.1);
  return rayCylY(ox, oy, oz, dx, dy, dz, px, pz, PLAYER.radius * 0.92, y0, y1);
}

/** сэмплировать направление внутри конуса разброса */
export function sampleCone(
  dx: number, dy: number, dz: number, spread: number, rng: () => number, out: THREE.Vector3,
): THREE.Vector3 {
  out.set(dx, dy, dz);
  if (spread <= 1e-6) return out;
  const phi = Math.sqrt(rng()) * spread;
  const theta = rng() * Math.PI * 2;
  const ref = Math.abs(out.y) < 0.95 ? UP : RIGHT;
  tmpU.crossVectors(out, ref).normalize();
  tmpV.crossVectors(out, tmpU);
  out.multiplyScalar(Math.cos(phi))
    .addScaledVector(tmpU, Math.sin(phi) * Math.cos(theta))
    .addScaledVector(tmpV, Math.sin(phi) * Math.sin(theta))
    .normalize();
  return out;
}

/** разрешить одну пулю: враги против окружения, ближайшее побеждает */
export function resolvePellet(
  ox: number, oy: number, oz: number, dx: number, dy: number, dz: number,
  spread: number, rng: () => number, enemies: readonly Enemy[], col: Collider, maxT: number,
): PelletResult {
  const dir = sampleCone(dx, dy, dz, spread, rng, tmpD);
  const env = rayEnv(ox, oy, oz, dir.x, dir.y, dir.z, col, maxT);
  let bestE: EnemyHitInfo | null = null;
  const cap = { y0: 0, y1: 0, r: 0 };
  for (const e of enemies) {
    if (!e.solid) continue;
    e.headCenter(tmpC);
    const th = raySphere(ox, oy, oz, dir.x, dir.y, dir.z, tmpC.x, tmpC.y, tmpC.z, e.headRadius);
    e.bodyCapsule(cap);
    const tb = rayCylY(ox, oy, oz, dir.x, dir.y, dir.z, e.pos.x, e.pos.z, cap.r, cap.y0, cap.y1);
    let tc: number | null = null;
    let head = false;
    if (th !== null && tb !== null) {
      head = th <= tb;
      tc = head ? th : tb;
    } else if (th !== null) {
      head = true;
      tc = th;
    } else if (tb !== null) {
      tc = tb;
    }
    if (tc !== null && (!bestE || tc < bestE.t)) bestE = { enemy: e, head, t: tc };
  }
  if (bestE && (!env || bestE.t < env.t)) {
    return {
      enemy: bestE, env: null,
      ex: ox + dir.x * bestE.t, ey: oy + dir.y * bestE.t, ez: oz + dir.z * bestE.t,
    };
  }
  if (env) {
    return { enemy: null, env, ex: env.x, ey: env.y, ez: env.z };
  }
  return {
    enemy: null, env: null,
    ex: ox + dir.x * maxT, ey: oy + dir.y * maxT, ez: oz + dir.z * maxT,
  };
}

/* ---------- трассеры ---------- */

const TRACER_MAX = 30;

export class Tracers {
  readonly mesh: THREE.LineSegments;
  private pos: Float32Array;
  private ttl: Float32Array;
  private cursor = 0;
  private geometry: THREE.BufferGeometry;
  private material: THREE.LineBasicMaterial;

  constructor() {
    this.pos = new Float32Array(TRACER_MAX * 6);
    this.ttl = new Float32Array(TRACER_MAX);
    for (let i = 0; i < TRACER_MAX; i++) {
      this.pos[i * 6 + 1] = -90;
      this.pos[i * 6 + 4] = -90;
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.material = new THREE.LineBasicMaterial({
      color: 0xffd9a0, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.mesh = new THREE.LineSegments(this.geometry, this.material);
    this.mesh.frustumCulled = false;
  }

  spawn(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): void {
    const i = this.cursor;
    this.cursor = (i + 1) % TRACER_MAX;
    // короткий светящийся штрих у конца траектории
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dz = z2 - z1;
    const len = Math.hypot(dx, dy, dz);
    const tail = Math.min(len, 5.5);
    const k = len > 1e-4 ? (len - tail) / len : 0;
    const o = i * 6;
    this.pos[o] = x1 + dx * k;
    this.pos[o + 1] = y1 + dy * k;
    this.pos[o + 2] = z1 + dz * k;
    this.pos[o + 3] = x2;
    this.pos[o + 4] = y2;
    this.pos[o + 5] = z2;
    this.ttl[i] = 0.055;
  }

  update(dt: number): void {
    for (let i = 0; i < TRACER_MAX; i++) {
      const t = this.ttl[i] ?? 0;
      if (t <= 0) continue;
      const nt = t - dt;
      this.ttl[i] = nt;
      if (nt <= 0) {
        this.pos[i * 6 + 1] = -90;
        this.pos[i * 6 + 4] = -90;
      }
    }
    (this.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

/* ---------- следы (декали) ---------- */

const DECAL_MAX = 44;
const SCORCH_MAX = 10;

export class Decals {
  readonly group: THREE.Group;
  private pool: THREE.Mesh[] = [];
  private scorchPool: THREE.Mesh[] = [];
  private cursor = 0;
  private scorchCursor = 0;
  private geo: THREE.CircleGeometry;
  private mat: THREE.MeshBasicMaterial;
  private scorchGeo: THREE.CircleGeometry;
  private scorchMat: THREE.MeshBasicMaterial;

  constructor() {
    this.group = new THREE.Group();
    this.geo = new THREE.CircleGeometry(0.055, 8);
    this.mat = new THREE.MeshBasicMaterial({
      color: 0x1c130a, transparent: true, opacity: 0.55,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    });
    for (let i = 0; i < DECAL_MAX; i++) {
      const m = new THREE.Mesh(this.geo, this.mat);
      m.visible = false;
      this.pool.push(m);
      this.group.add(m);
    }
    this.scorchGeo = new THREE.CircleGeometry(1.15, 14);
    this.scorchMat = new THREE.MeshBasicMaterial({
      color: 0x241a10, transparent: true, opacity: 0.38,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3,
    });
    for (let i = 0; i < SCORCH_MAX; i++) {
      const m = new THREE.Mesh(this.scorchGeo, this.scorchMat);
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      this.scorchPool.push(m);
      this.group.add(m);
    }
  }

  add(x: number, y: number, z: number, nx: number, ny: number, nz: number): void {
    const m = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % DECAL_MAX;
    if (!m) return;
    m.position.set(x + nx * 0.012, y + ny * 0.012, z + nz * 0.012);
    m.lookAt(x + nx, y + ny, z + nz);
    m.visible = true;
  }

  addScorch(x: number, z: number): void {
    const m = this.scorchPool[this.scorchCursor];
    this.scorchCursor = (this.scorchCursor + 1) % SCORCH_MAX;
    if (!m) return;
    m.position.set(x, 0.02, z);
    m.rotation.z = Math.random() * Math.PI;
    m.visible = true;
  }

  clear(): void {
    for (const m of this.pool) m.visible = false;
    for (const m of this.scorchPool) m.visible = false;
  }

  dispose(): void {
    this.geo.dispose();
    this.mat.dispose();
    this.scorchGeo.dispose();
    this.scorchMat.dispose();
  }
}
