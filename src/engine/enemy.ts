import * as THREE from 'three';
import { ENEMIES, type EnemyKind, type EnemySpec } from '../game/types';
import {
  animDeath, animFireKick, animIdle, animSpawnRise, animWalk,
  buildEnemyRig, disposeRig, rigFlash, type EnemyRig,
} from './rig';
import { hasLOS, rayBlock, resolveCircle, type Collider } from './collide';

/**
 * AI врагов: солдаты держат дистанцию и стреляют очередями с телеграфом,
 * снайпер светит лазером перед выстрелом, дробовик и титан идут в ближний,
 * титан таранит, плевун плюёт кислотой по дуге.
 */

export type EnemyEvent =
  | {
    type: 'shot';
    ox: number; oy: number; oz: number;
    dx: number; dy: number; dz: number;
    dmg: number; kind: EnemyKind;
  }
  | { type: 'melee'; dmg: number; kind: EnemyKind; knock: number }
  | {
    type: 'spit';
    ox: number; oy: number; oz: number;
    tx: number; ty: number; tz: number;
    dmg: number;
  }
  | { type: 'sfx'; name: 'roar' | 'hiss' | 'swing' | 'shot'; dist: number; kind: EnemyKind };

export interface EnemyCtx {
  dt: number;
  time: number;
  playerFeet: THREE.Vector3;
  playerEye: THREE.Vector3;
  playerVel: THREE.Vector3;
  collider: Collider;
  others: readonly Enemy[];
  rng: () => number;
  dmgMult: number;
  spreadMult: number;
  bound: number;
  events: EnemyEvent[];
}

type State = 'spawn' | 'advance' | 'combat' | 'aim' | 'dying';
type ChargePhase = 'none' | 'telegraph' | 'dash' | 'stun';
type MeleePhase = 'none' | 'wind' | 'strike';

const SPAWN_T = 0.6;
const DEATH_T = 0.95;
const UP = new THREE.Vector3(0, 1, 0);
const RIGHT = new THREE.Vector3(1, 0, 0);

const tV1 = new THREE.Vector3();
const tV2 = new THREE.Vector3();
const tV3 = new THREE.Vector3();
const tV4 = new THREE.Vector3();

function clamp(v: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, v));
}

export class Enemy {
  readonly id: number;
  readonly kind: EnemyKind;
  readonly spec: EnemySpec;
  readonly rig: EnemyRig;
  hp: number;
  maxHp: number;
  pos = new THREE.Vector3();
  yaw = 0;
  state: State = 'spawn';
  remove = false;

  private t = 0;
  private time = 0;
  private kick = 0;
  private flashT = 0;
  private staggerT = 0;
  private deathT = 0;
  private headKilled = false;
  private fireTimer = 1;
  private volleyLeft = 0;
  private volleyT = 0;
  private aimT = 0;
  private strafeDir = 1;
  private strafeTimer = 1.5;
  private meleePhase: MeleePhase = 'none';
  private meleeT = 0;
  private meleeCd = 1;
  private chargePhase: ChargePhase = 'none';
  private chargeT = 0;
  private chargeCd = 3;
  private chargeDX = 0;
  private chargeDZ = 0;
  private chargeHit = false;

  constructor(id: number, kind: EnemyKind, spawn: THREE.Vector3, hpMult: number, rng: () => number) {
    this.id = id;
    this.kind = kind;
    this.spec = ENEMIES[kind];
    this.hp = this.maxHp = Math.round(this.spec.hp * hpMult);
    this.rig = buildEnemyRig(kind, {
      skin: this.spec.skin, cloth: this.spec.cloth, gear: 0x3a332a, eye: this.spec.eye,
    });
    this.rig.parts.root.scale.setScalar(this.spec.scale);
    this.pos.copy(spawn);
    this.yaw = rng() * Math.PI * 2;
    this.strafeDir = rng() < 0.5 ? -1 : 1;
    this.sync();
  }

  get solid(): boolean {
    return this.state !== 'dying';
  }

  get elite(): boolean {
    return this.spec.elite;
  }

  get killedByHead(): boolean {
    return this.headKilled;
  }

  sync(): void {
    this.rig.parts.root.position.copy(this.pos);
    this.rig.parts.root.rotation.y = this.yaw;
  }

  headCenter(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.pos.x, this.pos.y + this.rig.headY * this.spec.scale, this.pos.z);
  }

  get headRadius(): number {
    return this.rig.headR * this.spec.scale;
  }

  /** сегмент тела для ray-capsule: низ, верх, радиус */
  bodyCapsule(out: { y0: number; y1: number; r: number }): { y0: number; y1: number; r: number } {
    const s = this.spec.scale;
    out.y0 = this.pos.y + 0.12 * s;
    out.y1 = this.pos.y + this.rig.height * 0.86 * s;
    out.r = 0.34 * s;
    return out;
  }

  muzzleWorld(out: THREE.Vector3): THREE.Vector3 {
    if (this.rig.muzzle) return this.rig.muzzle.getWorldPosition(out);
    return this.headCenter(out);
  }

  /** @returns true, если это добивающее попадание */
  damage(dmg: number, head: boolean, fromX: number, fromZ: number): boolean {
    if (this.state === 'dying') return false;
    this.hp -= dmg;
    this.flashT = 0.14;
    if (this.hp <= 0) {
      this.state = 'dying';
      this.deathT = 0;
      this.headKilled = head;
      if (this.rig.laser) this.rig.laser.visible = false;
      return true;
    }
    if (dmg >= 25 && this.spec.scale < 1.2) this.staggerT = 0.12;
    // маленький отшаг
    const dx = this.pos.x - fromX;
    const dz = this.pos.z - fromZ;
    const d = Math.hypot(dx, dz) || 1;
    this.pos.x += (dx / d) * 0.05;
    this.pos.z += (dz / d) * 0.05;
    return false;
  }

  update(ctx: EnemyCtx): void {
    const dt = ctx.dt;
    this.time += dt;
    this.t += dt;
    if (this.flashT > 0) {
      this.flashT -= dt;
      rigFlash(this.rig, this.flashT > 0 ? 1 : 0);
    }
    if (this.staggerT > 0) this.staggerT -= dt;
    this.kick = Math.max(0, this.kick - dt * 5);
    this.meleeCd -= dt;
    this.chargeCd -= dt;

    switch (this.state) {
      case 'spawn': this.updateSpawn(ctx); break;
      case 'advance': this.updateAdvance(ctx); break;
      case 'combat': this.updateCombat(ctx); break;
      case 'aim': this.updateAim(ctx); break;
      case 'dying': this.updateDying(dt); break;
    }

    this.sync();
    animFireKick(this.rig, this.kick);
  }

  private updateSpawn(ctx: EnemyCtx): void {
    animSpawnRise(this.rig, clamp(this.t / SPAWN_T, 0, 1));
    if (this.t >= SPAWN_T) {
      this.state = 'advance';
      this.t = 0;
      this.fireTimer = 0.5 + ctx.rng() * 0.8;
      this.rig.parts.root.position.y = 0;
    }
  }

  private face(ctx: EnemyCtx, dt: number): void {
    const tx = ctx.playerFeet.x - this.pos.x;
    const tz = ctx.playerFeet.z - this.pos.z;
    const target = Math.atan2(tx, tz);
    let diff = target - this.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.yaw += diff * Math.min(1, dt * 7);
  }

  /** движение к цели с обходом препятствий и расталкиванием */
  private move(ctx: EnemyCtx, dirX: number, dirZ: number, speed: number): void {
    if (this.staggerT > 0 || speed <= 0) return;
    let rx = 0;
    let rz = 0;
    const ax = this.pos.x;
    const az = this.pos.z;
    const clear = 2.6;
    for (const b of ctx.collider.boxes) {
      const cx = clamp(ax, b.x - b.hw, b.x + b.hw);
      const cz = clamp(az, b.z - b.hd, b.z + b.hd);
      const dx = ax - cx;
      const dz = az - cz;
      const d = Math.hypot(dx, dz);
      if (d < clear && d > 1e-4) {
        const w = (1 - d / clear) * 2.6;
        rx += (dx / d) * w;
        rz += (dz / d) * w;
      } else if (d <= 1e-4) {
        rx += (ax - b.x) * 0.6;
        rz += (az - b.z) * 0.6;
      }
    }
    for (const c of ctx.collider.cyls) {
      const dx = ax - c.x;
      const dz = az - c.z;
      const dd = Math.hypot(dx, dz);
      const gap = dd - c.r;
      if (gap < 1.6 && dd > 1e-4) {
        const w = (1 - clamp(gap, 0, 1.6) / 1.6) * 2.4;
        rx += (dx / dd) * w;
        rz += (dz / dd) * w;
      }
    }
    for (const o of ctx.others) {
      if (o === this || !o.solid) continue;
      const dx = ax - o.pos.x;
      const dz = az - o.pos.z;
      const d = Math.hypot(dx, dz);
      const min = (this.spec.scale + o.spec.scale) * 0.62;
      if (d < min && d > 1e-4) {
        const w = (1 - d / min) * 3;
        rx += (dx / d) * w;
        rz += (dz / d) * w;
      }
    }
    let vx = dirX + rx;
    let vz = dirZ + rz;
    const len = Math.hypot(vx, vz);
    if (len < 1e-6) return;
    vx = (vx / len) * speed * ctx.dt;
    vz = (vz / len) * speed * ctx.dt;
    const r = resolveCircle(ax + vx, az + vz, 0.42 * this.spec.scale, ctx.collider, ctx.bound);
    this.pos.x = r.x;
    this.pos.z = r.z;
    animWalk(this.rig, this.time, clamp(speed / this.spec.speed, 0.2, 1.3));
  }

  private dirToPlayer(ctx: EnemyCtx, out: { x: number; z: number; d: number }): void {
    const dx = ctx.playerFeet.x - this.pos.x;
    const dz = ctx.playerFeet.z - this.pos.z;
    out.d = Math.hypot(dx, dz) || 1e-4;
    out.x = dx / out.d;
    out.z = dz / out.d;
  }

  private updateAdvance(ctx: EnemyCtx): void {
    const dir = { x: 0, z: 0, d: 0 };
    this.dirToPlayer(ctx, dir);
    this.face(ctx, ctx.dt);
    const los = hasLOS(this.pos.x, this.pos.z, ctx.playerFeet.x, ctx.playerFeet.z, ctx.collider);
    if (this.kind === 'titan') {
      this.updateTitanCharge(ctx, dir.d, los);
      if (this.chargePhase !== 'none') return;
    }
    if (dir.d <= this.spec.rangeMax && los) {
      this.state = 'combat';
      this.t = 0;
      this.strafeTimer = 0.8 + ctx.rng() * 1.4;
      animIdle(this.rig, this.time);
      return;
    }
    this.move(ctx, dir.x, dir.z, this.spec.speed);
  }

  private updateCombat(ctx: EnemyCtx): void {
    const dt = ctx.dt;
    const dir = { x: 0, z: 0, d: 0 };
    this.dirToPlayer(ctx, dir);
    this.face(ctx, dt);
    const los = hasLOS(this.pos.x, this.pos.z, ctx.playerFeet.x, ctx.playerFeet.z, ctx.collider);

    if (this.kind === 'titan') {
      this.updateTitanCharge(ctx, dir.d, los);
      if (this.chargePhase !== 'none') return;
      this.updateMelee(ctx, dir.d, 3.4, 0.55, this.spec.dmg * 1.2, 7);
      if (this.meleePhase === 'none') {
        this.move(ctx, dir.x, dir.z, dir.d > 3 ? this.spec.speed : 0);
      }
      return;
    }

    if (this.kind === 'spitter') {
      // держим 9..18 м, плюём очередями
      const want = dir.d < 9 ? -1 : dir.d > 18 ? 1 : 0;
      const mx = want !== 0 ? dir.x * want : -dir.z * this.strafeDir;
      const mz = want !== 0 ? dir.z * want : dir.x * this.strafeDir;
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) {
        this.strafeDir *= -1;
        this.strafeTimer = 1.4 + ctx.rng() * 1.6;
      }
      this.move(ctx, mx, mz, this.spec.speed * (want === 0 ? 0.6 : 1));
      this.fireTimer -= dt;
      if (this.fireTimer <= 0 && los && dir.d <= 26) {
        this.volleyLeft = this.spec.volley;
        this.volleyT = 0;
        this.kick = 1;
        this.fireTimer = this.spec.fireInterval * (0.85 + ctx.rng() * 0.3);
        ctx.events.push({ type: 'sfx', name: 'hiss', dist: dir.d, kind: this.kind });
      }
      this.updateVolleySpit(ctx, dir.d);
      return;
    }

    // солдаты: ближний бой у дробовика, иначе держать дистанцию
    if (this.kind === 'shotgunner' && dir.d < 2.6) {
      this.updateMelee(ctx, dir.d, 2.4, 0.32, this.spec.dmg * 0.8, 2.5);
      if (this.meleePhase !== 'none') return;
    }

    const bandLo = this.spec.rangeMin;
    const bandHi = this.spec.rangeMax * 0.88;
    let mx = 0;
    let mz = 0;
    let spd = this.spec.speed;
    if (dir.d > bandHi || !los) {
      mx = dir.x;
      mz = dir.z;
    } else if (dir.d < bandLo) {
      mx = -dir.x;
      mz = -dir.z;
      spd *= 0.7;
    } else {
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) {
        this.strafeDir *= -1;
        this.strafeTimer = 0.9 + ctx.rng() * 1.5;
      }
      mx = -dir.z * this.strafeDir;
      mz = dir.x * this.strafeDir;
      spd *= 0.72;
    }
    this.move(ctx, mx, mz, spd);

    this.fireTimer -= dt;
    if (this.fireTimer <= 0 && los && dir.d <= this.spec.rangeMax) {
      if (this.kind === 'sniper') {
        this.state = 'aim';
        this.aimT = 0;
        this.t = 0;
        if (this.rig.laser) this.rig.laser.visible = true;
        return;
      }
      this.volleyLeft = this.spec.volley;
      this.volleyT = 0;
      this.fireTimer = this.spec.fireInterval * (0.85 + ctx.rng() * 0.3);
    }
    this.updateVolleyShots(ctx);
  }

  private updateVolleyShots(ctx: EnemyCtx): void {
    if (this.volleyLeft <= 0) return;
    this.volleyT -= ctx.dt;
    if (this.volleyT > 0) return;
    this.volleyT = 0.12;
    this.volleyLeft -= 1;
    this.emitShot(ctx);
    this.kick = 1;
  }

  private updateVolleySpit(ctx: EnemyCtx, dist: number): void {
    if (this.volleyLeft <= 0) return;
    this.volleyT -= ctx.dt;
    if (this.volleyT > 0) return;
    this.volleyT = 0.45;
    this.volleyLeft -= 1;
    const m = this.muzzleWorld(tV1);
    const lead = Math.min(1.1, dist / 13);
    ctx.events.push({
      type: 'spit',
      ox: m.x, oy: m.y, oz: m.z,
      tx: ctx.playerFeet.x + ctx.playerVel.x * lead,
      ty: 0.4,
      tz: ctx.playerFeet.z + ctx.playerVel.z * lead,
      dmg: this.spec.dmg * ctx.dmgMult,
    });
    this.kick = 1;
  }

  private emitShot(ctx: EnemyCtx): void {
    const m = this.muzzleWorld(tV1);
    const dir = tV2.copy(ctx.playerEye).sub(m);
    const dist = dir.length() || 1e-4;
    dir.normalize();
    // сэмпл внутри конуса разброса
    const spread = this.spec.spread * ctx.spreadMult * clamp(dist / 12, 0.6, 2.2);
    const phi = Math.sqrt(ctx.rng()) * spread;
    const theta = ctx.rng() * Math.PI * 2;
    const ref = Math.abs(dir.y) < 0.95 ? UP : RIGHT;
    const u = tV3.crossVectors(dir, ref).normalize();
    const v = tV4.crossVectors(dir, u);
    dir.multiplyScalar(Math.cos(phi))
      .addScaledVector(u, Math.sin(phi) * Math.cos(theta))
      .addScaledVector(v, Math.sin(phi) * Math.sin(theta))
      .normalize();
    const pdist = Math.hypot(ctx.playerFeet.x - this.pos.x, ctx.playerFeet.z - this.pos.z);
    ctx.events.push({
      type: 'shot',
      ox: m.x, oy: m.y, oz: m.z,
      dx: dir.x, dy: dir.y, dz: dir.z,
      dmg: this.spec.dmg * ctx.dmgMult,
      kind: this.kind,
    });
    ctx.events.push({ type: 'sfx', name: 'shot', dist: pdist, kind: this.kind });
  }

  private updateAim(ctx: EnemyCtx): void {
    const dt = ctx.dt;
    this.aimT += dt;
    this.face(ctx, dt);
    const dir = { x: 0, z: 0, d: 0 };
    this.dirToPlayer(ctx, dir);
    if (this.rig.laser) {
      const mat = this.rig.laser.material as THREE.MeshLambertMaterial;
      mat.opacity = 0.28 + Math.sin(this.aimT * 22) * 0.14;
    }
    animIdle(this.rig, this.time);
    const los = hasLOS(this.pos.x, this.pos.z, ctx.playerFeet.x, ctx.playerFeet.z, ctx.collider);
    if (this.aimT >= 0.9) {
      if (this.rig.laser) this.rig.laser.visible = false;
      this.state = 'combat';
      this.fireTimer = this.spec.fireInterval * (0.9 + ctx.rng() * 0.35);
      if (los && dir.d <= this.spec.rangeMax * 1.2) {
        this.emitShot(ctx);
        this.kick = 1;
      }
    } else if (!los && this.aimT > 0.35) {
      // цель пропала — отмена выстрела
      if (this.rig.laser) this.rig.laser.visible = false;
      this.state = 'combat';
      this.fireTimer = 0.8;
    }
  }

  private updateMelee(ctx: EnemyCtx, dist: number, reach: number, windT: number, dmg: number, knock: number): void {
    const dt = ctx.dt;
    if (this.meleePhase === 'none') {
      if (dist < reach && this.meleeCd <= 0) {
        this.meleePhase = 'wind';
        this.meleeT = 0;
        this.kick = 1;
        ctx.events.push({ type: 'sfx', name: 'swing', dist, kind: this.kind });
      }
      return;
    }
    this.meleeT += dt;
    if (this.meleePhase === 'wind') {
      this.face(ctx, dt);
      this.kick = clamp(1 - this.meleeT / windT, 0, 1);
      if (this.meleeT >= windT) {
        this.meleePhase = 'strike';
        this.meleeT = 0;
        if (dist < reach + 0.8) {
          ctx.events.push({ type: 'melee', dmg: dmg * ctx.dmgMult, kind: this.kind, knock });
        }
      }
    } else {
      this.kick = this.meleeT * 3;
      if (this.meleeT >= 0.25) {
        this.meleePhase = 'none';
        this.meleeCd = this.kind === 'titan' ? 2.4 : 2.0;
      }
    }
  }

  private updateTitanCharge(ctx: EnemyCtx, dist: number, los: boolean): void {
    const dt = ctx.dt;
    if (this.chargePhase === 'none') {
      if (this.chargeCd <= 0 && los && dist > 5 && dist < 26) {
        this.chargePhase = 'telegraph';
        this.chargeT = 0;
        this.chargeHit = false;
        ctx.events.push({ type: 'sfx', name: 'roar', dist, kind: this.kind });
      }
      return;
    }
    this.chargeT += dt;
    this.face(ctx, dt);
    if (this.chargePhase === 'telegraph') {
      this.kick = clamp(this.chargeT / 0.7, 0, 1);
      if (this.chargeT >= 0.7) {
        const dx = ctx.playerFeet.x - this.pos.x;
        const dz = ctx.playerFeet.z - this.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        this.chargeDX = dx / d;
        this.chargeDZ = dz / d;
        this.chargePhase = 'dash';
        this.chargeT = 0;
        this.kick = 1;
      }
      return;
    }
    if (this.chargePhase === 'dash') {
      this.pos.x += this.chargeDX * 10.5 * dt;
      this.pos.z += this.chargeDZ * 10.5 * dt;
      const r = resolveCircle(this.pos.x, this.pos.z, 0.42 * this.spec.scale, ctx.collider, ctx.bound);
      this.pos.x = r.x;
      this.pos.z = r.z;
      this.yaw = Math.atan2(this.chargeDX, this.chargeDZ);
      animWalk(this.rig, this.time * 2.2, 1.4);
      if (!this.chargeHit && dist < 2.2) {
        this.chargeHit = true;
        ctx.events.push({ type: 'melee', dmg: this.spec.dmg * 1.4 * ctx.dmgMult, kind: this.kind, knock: 9 });
        this.chargePhase = 'stun';
        this.chargeT = 0;
        return;
      }
      const wall = rayBlock(this.pos.x, this.pos.z, this.chargeDX, this.chargeDZ, 1.1, ctx.collider, 0.5);
      if (wall !== null || this.chargeT >= 1.3) {
        this.chargePhase = 'stun';
        this.chargeT = 0;
        ctx.events.push({ type: 'sfx', name: 'swing', dist, kind: this.kind });
      }
      return;
    }
    // stun
    this.kick = 0;
    animIdle(this.rig, this.time);
    if (this.chargeT >= 1.15) {
      this.chargePhase = 'none';
      this.chargeCd = 7.5;
    }
  }

  private updateDying(dt: number): void {
    this.deathT += dt / DEATH_T;
    animDeath(this.rig, clamp(this.deathT, 0, 1));
    if (this.deathT >= 1.35) this.remove = true;
  }

  dispose(): void {
    disposeRig(this.rig);
  }
}
