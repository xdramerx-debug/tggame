import * as THREE from 'three';
import { GEAR, PLAYER, WEAPONS, type PerkId, type WeaponId } from '../game/types';
import { effectiveWeapon, type EffectiveWeapon } from '../game/economy';
import { perkEffects, type PerkEffects } from '../game/perks';
import { resolveCircle, supportHeight, type Collider } from './collide';
import type { InputSnapshot } from './input';

/**
 * FPS-контроллер: движение/спринт/присед/прыжок/рывок, стрельба с
 * накоплением разброса и отдачей в камеру, перезарядка, гранаты, аптечки.
 * Хитскан-разрешение — в weapons.ts, оркестрация — в game.ts.
 */

export type PlayerEvent =
  | { type: 'step' }
  | { type: 'jump' }
  | { type: 'land'; hard: boolean }
  | { type: 'dash' }
  | { type: 'reloadStart'; weapon: WeaponId }
  | { type: 'reloadEnd' }
  | { type: 'dryFire' }
  | { type: 'switch'; weapon: WeaponId }
  | { type: 'grenadeThrow' }
  | { type: 'medkit' };

export interface QueuedActions {
  jump: boolean;
  reload: boolean;
  grenade: boolean;
  medkit: boolean;
  dash: boolean;
  crouchToggle: boolean;
}

export interface ShotRequest {
  ox: number; oy: number; oz: number;
  dx: number; dy: number; dz: number;
  spread: number;
  pellets: number;
  dmg: number;
  headMult: number;
  critChance: number;
  critMult: number;
  weapon: WeaponId;
  range: number;
}

/** визуальная отдача ствола (радианы за выстрел) */
const RECOIL: Record<WeaponId, { kick: number; side: number }> = {
  pistol: { kick: 0.017, side: 0.006 },
  smg: { kick: 0.012, side: 0.008 },
  rifle: { kick: 0.02, side: 0.006 },
  shotgun: { kick: 0.05, side: 0.014 },
  sniper: { kick: 0.075, side: 0.004 },
};

const GRAVITY = 22;
const DASH_T = 0.34;
const DASH_SPEED = 11.5;

export class Player {
  pos = new THREE.Vector3(0, 0, 32);
  vel = new THREE.Vector3();
  yaw = Math.PI; // смотрим на север (−Z), спиной к базе
  pitch = 0;
  crouched = false;
  sprinting = false;
  onGround = true;
  moving = false;
  dead = false;

  hp: number;
  maxHp: number;
  armor: number;
  armorMax: number;
  effects: PerkEffects;

  owned: WeaponId[] = ['pistol'];
  curIdx = 0;
  mags = {} as Record<WeaponId, number>;
  reserve = {} as Record<WeaponId, number>;
  tuning = {} as Record<WeaponId, number>;
  grenades: number;
  medkits: number;

  fireCd = 0;
  reloading = false;
  reloadT = 0;
  reloadDur = 0;
  drawT = 0;
  throwLock = 0;
  healLock = 0;
  dashCd = 0;
  private dashT = 0;
  private dashDX = 0;
  private dashDZ = 0;

  pitchKick = 0;
  yawKick = 0;
  private kickRecoverT = 0;
  shotSpread = 0;
  shotsFired = 0;
  vmKick = 0; // пружина вьюмодели 0..1

  stepPhase = 0;
  bobPhase = 0;
  private lastStep = 0;
  lastHurtT = -99;
  eyeCur = PLAYER.eye;
  landVel = 0;

  constructor(perks: readonly PerkId[], spawn: { x: number; z: number }) {
    this.effects = perkEffects(perks);
    this.maxHp = PLAYER.maxHp + this.effects.maxHpBonus;
    this.hp = this.maxHp;
    this.armorMax = PLAYER.armorMax + this.effects.armorBonus;
    this.armor = 0;
    this.medkits = this.effects.startMedkit ? 1 : 0;
    this.grenades = 1 + this.effects.grenadeBonus;
    this.pos.set(spawn.x, 0, spawn.z);
    for (const id of Object.keys(WEAPONS) as WeaponId[]) {
      this.mags[id] = WEAPONS[id].mag;
      this.reserve[id] = WEAPONS[id].reserveMax;
      this.tuning[id] = 0;
    }
  }

  get weapon(): WeaponId {
    return this.owned[this.curIdx] ?? 'pistol';
  }

  get spec(): EffectiveWeapon {
    return effectiveWeapon(this.weapon, this.tuning[this.weapon]);
  }

  get reserveCur(): number {
    return this.reserve[this.weapon];
  }

  get dashReady(): boolean {
    return this.effects.dashCd > 0 && this.dashCd <= 0;
  }

  ownWeapon(id: WeaponId): void {
    if (!this.owned.includes(id)) {
      this.owned.push(id);
      this.mags[id] = effectiveWeapon(id, this.tuning[id]).mag;
      this.reserve[id] = WEAPONS[id].reserveMax;
    }
    this.switchTo(id);
  }

  switchTo(id: WeaponId): void {
    const idx = this.owned.indexOf(id);
    if (idx < 0 || idx === this.curIdx) return;
    this.curIdx = idx;
    this.reloading = false;
    this.drawT = 0.55 * this.effects.switchMult;
    this.shotSpread = 0;
    this.fireCd = Math.max(this.fireCd, this.drawT);
  }

  setTuning(id: WeaponId, tier: number): void {
    this.tuning[id] = tier;
    this.mags[id] = effectiveWeapon(id, tier).mag;
  }

  eyePos(out: THREE.Vector3): THREE.Vector3 {
    return out.set(this.pos.x, this.pos.y + this.eyeCur, this.pos.z);
  }

  /** направление взгляда с учётом отдачи */
  lookDir(out: THREE.Vector3): THREE.Vector3 {
    const p = this.pitch + this.pitchKick;
    const y = this.yaw + this.yawKick;
    const cp = Math.cos(p);
    return out.set(Math.sin(y) * cp, Math.sin(p), Math.cos(y) * cp).normalize();
  }

  forwardFlat(out: THREE.Vector3): THREE.Vector3 {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  currentSpread(): number {
    let s = this.spec.spreadRad;
    if (this.crouched) s *= this.effects.crouchSpreadMult;
    if (!this.onGround) s *= 2.2;
    else if (this.sprinting) s *= 2.4;
    else if (this.moving) s *= 1.5;
    return s + this.shotSpread;
  }

  update(
    dt: number,
    time: number,
    input: InputSnapshot,
    look: { dx: number; dy: number },
    queued: QueuedActions,
    collider: Collider,
    bound: number,
    events: PlayerEvent[],
  ): void {
    // взгляд
    this.yaw -= look.dx;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - look.dy));

    // отдача: отдаём назад через паузу
    this.kickRecoverT -= dt;
    if (this.kickRecoverT <= 0) {
      const rec = Math.min(1, dt * 7);
      this.pitchKick *= 1 - rec;
      this.yawKick *= 1 - rec;
      if (Math.abs(this.pitchKick) < 1e-4) this.pitchKick = 0;
      if (Math.abs(this.yawKick) < 1e-4) this.yawKick = 0;
    }
    this.shotSpread = Math.max(0, this.shotSpread - dt * 0.05);
    this.vmKick = Math.max(0, this.vmKick - dt * 6);

    if (queued.crouchToggle) this.crouched = !this.crouched;
    if (queued.reload) this.startReload(events);
    if (queued.grenade) this.throwGrenade(events);
    if (queued.medkit) this.useMedkit(events);

    // таймеры
    this.fireCd -= dt;
    this.drawT -= dt;
    this.throwLock -= dt;
    this.healLock -= dt;
    this.dashCd -= dt;
    if (this.reloading) {
      this.reloadT += dt;
      if (this.reloadT >= this.reloadDur) {
        this.finishReload();
        events.push({ type: 'reloadEnd' });
      }
    }

    // горизонтальное движение
    const f = { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
    const r = { x: -Math.cos(this.yaw), z: Math.sin(this.yaw) };
    let wishX = f.x * input.moveY + r.x * input.moveX;
    let wishZ = f.z * input.moveY + r.z * input.moveX;
    const wishLen = Math.min(1, Math.hypot(input.moveX, input.moveY));
    this.sprinting = input.sprint && !this.crouched && input.moveY > 0.3 && this.dashT <= 0;
    let speed = this.crouched
      ? PLAYER.crouch * this.effects.crouchMult
      : this.sprinting ? PLAYER.sprint : PLAYER.walk;
    speed *= this.effects.speedMult * this.spec.moveMult;

    if (this.dashT > 0) {
      this.dashT -= dt;
      const k = DASH_SPEED * Math.max(0.35, this.dashT / DASH_T + 0.2);
      wishX = this.dashDX;
      wishZ = this.dashDZ;
      speed = k;
    } else {
      const wl = wishLen;
      if (wl > 1e-4) {
        wishX *= wl;
        wishZ *= wl;
      }
    }

    this.moving = Math.hypot(wishX, wishZ) > 0.08 && this.onGround;
    const accel = this.onGround ? 14 : 4;
    this.vel.x += (wishX * speed - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (wishZ * speed - this.vel.z) * Math.min(1, accel * dt);

    // прыжок
    if (queued.jump && this.onGround && this.dashT <= 0) {
      this.vel.y = PLAYER.jumpVel;
      this.onGround = false;
      this.crouched = false;
      events.push({ type: 'jump' });
    }

    // рывок
    if (queued.dash && this.dashReadyF() && this.onGround) {
      this.dashT = DASH_T;
      this.dashCd = this.effects.dashCd;
      const dLen = Math.hypot(wishX, wishZ);
      if (dLen > 0.1) {
        this.dashDX = wishX / dLen;
        this.dashDZ = wishZ / dLen;
      } else {
        this.dashDX = f.x;
        this.dashDZ = f.z;
      }
      events.push({ type: 'dash' });
    }

    // интеграция + столкновения + step-up
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    const stepRoom = this.onGround ? PLAYER.stepUp : 0.28;
    const gy = supportHeight(this.pos.x, this.pos.z, collider, this.pos.y + stepRoom);
    if (gy > this.pos.y && gy - this.pos.y <= stepRoom + 1e-3) {
      this.pos.y = gy;
      if (this.vel.y < 0) this.vel.y = 0;
      this.onGround = true;
    }
    const res = resolveCircle(this.pos.x, this.pos.z, PLAYER.radius, collider, bound);
    this.pos.x = res.x;
    this.pos.z = res.z;

    // гравитация
    this.vel.y -= GRAVITY * dt;
    const prevY = this.pos.y;
    this.pos.y += this.vel.y * dt;
    const groundY = supportHeight(this.pos.x, this.pos.z, collider, prevY + 0.3);
    if (this.pos.y <= groundY && this.vel.y <= 0) {
      const fall = this.landVel;
      this.pos.y = groundY;
      this.vel.y = 0;
      this.landVel = 0;
      if (!this.onGround) {
        events.push({ type: 'land', hard: fall > 8 });
      }
      this.onGround = true;
    } else if (this.pos.y > groundY + 1e-3) {
      this.onGround = false;
      this.landVel = Math.max(this.landVel, -this.vel.y);
    }

    // высота глаз
    const eyeTarget = this.crouched ? PLAYER.crouchEye : PLAYER.eye;
    this.eyeCur += (eyeTarget - this.eyeCur) * Math.min(1, dt * 11);

    // шаги и покачивание
    const hspeed = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && hspeed > 0.6) {
      this.stepPhase += dt * hspeed * 0.85;
      this.bobPhase += dt * hspeed * 1.7;
      if (Math.floor(this.stepPhase) > this.lastStep) {
        this.lastStep = Math.floor(this.stepPhase);
        events.push({ type: 'step' });
      }
    } else {
      this.lastStep = Math.floor(this.stepPhase);
      this.bobPhase += dt * 1.2;
    }

    // регенерация (перк)
    if (this.effects.regenPerSec > 0 && !this.dead
      && time - this.lastHurtT > this.effects.regenDelay && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + this.effects.regenPerSec * dt);
    }
  }

  private dashReadyF(): boolean {
    return this.effects.dashCd > 0 && this.dashCd <= 0 && this.dashT <= 0;
  }

  /** @returns запрос выстрела либо null; отдачу/разброс применяет сам */
  tryFire(rng: () => number, events: PlayerEvent[]): ShotRequest | null {
    if (this.dead || this.reloading || this.drawT > 0 || this.fireCd > 0 || this.dashT > 0) return null;
    const spec = this.spec;
    const mag = this.mags[this.weapon];
    if (mag <= 0) {
      events.push({ type: 'dryFire' });
      this.fireCd = 0.35;
      if (this.reserve[this.weapon] !== 0) this.startReload(events);
      return null;
    }
    this.mags[this.weapon] = mag - 1;
    this.fireCd = 60 / spec.rpm;
    this.shotsFired += 1;
    const spread = this.currentSpread();
    this.shotSpread = Math.min(0.03, this.shotSpread + spread * 0.4);

    // отдача в камеру + пружина вьюмодели
    const rec = RECOIL[this.weapon];
    this.pitchKick += rec.kick;
    this.yawKick += (rng() - 0.5) * rec.side * 2;
    this.kickRecoverT = 0.07;
    this.vmKick = 1;

    // происхождение: глаз + вперёд + чуть вправо-вниз (ствол)
    const dir = this.lookDir(new THREE.Vector3());
    const right = new THREE.Vector3(-dir.z, 0, dir.x).normalize();
    const ox = this.pos.x + dir.x * 0.25 + right.x * 0.09;
    const oy = this.pos.y + this.eyeCur - 0.07 + dir.y * 0.25;
    const oz = this.pos.z + dir.z * 0.25 + right.z * 0.09;

    if (mag - 1 === 0) this.fireCd = Math.max(this.fireCd, 0.25);
    return {
      ox, oy, oz,
      dx: dir.x, dy: dir.y, dz: dir.z,
      spread,
      pellets: spec.pellets,
      dmg: spec.dmg * this.effects.dmgMult,
      headMult: spec.headMult + this.effects.headBonus,
      critChance: this.effects.critChance,
      critMult: this.effects.critMult,
      weapon: this.weapon,
      range: spec.range,
    };
  }

  startReload(events: PlayerEvent[]): void {
    if (this.reloading || this.dead) return;
    const spec = this.spec;
    const mag = this.mags[this.weapon];
    const res = this.reserve[this.weapon];
    if (mag >= spec.mag) return;
    if (res === 0) return;
    this.reloading = true;
    this.reloadT = 0;
    this.reloadDur = spec.reloadTime * this.effects.reloadMult;
    events.push({ type: 'reloadStart', weapon: this.weapon });
  }

  private finishReload(): void {
    const spec = this.spec;
    const id = this.weapon;
    const mag = this.mags[id];
    const need = spec.mag - mag;
    const res = this.reserve[id];
    if (res < 0) {
      this.mags[id] = spec.mag;
    } else {
      const take = Math.min(need, res);
      this.mags[id] = mag + take;
      this.reserve[id] = res - take;
    }
    this.reloading = false;
    this.shotSpread = 0;
  }

  /** @returns вектор скорости броска либо null */
  throwGrenade(events: PlayerEvent[]): { ox: number; oy: number; oz: number; vx: number; vy: number; vz: number } | null {
    if (this.grenades <= 0 || this.throwLock > 0 || this.dead) return null;
    this.grenades -= 1;
    this.throwLock = 0.85 * this.effects.switchMult;
    const dir = this.lookDir(new THREE.Vector3());
    const speed = 13.5;
    const out = {
      ox: this.pos.x + dir.x * 0.4,
      oy: this.pos.y + this.eyeCur - 0.12,
      oz: this.pos.z + dir.z * 0.4,
      vx: dir.x * speed,
      vy: dir.y * speed + 3.2,
      vz: dir.z * speed,
    };
    events.push({ type: 'grenadeThrow' });
    return out;
  }

  useMedkit(events: PlayerEvent[]): boolean {
    if (this.medkits <= 0 || this.healLock > 0 || this.dead || this.hp >= this.maxHp) return false;
    this.medkits -= 1;
    this.healLock = 1.05 * this.effects.switchMult;
    this.hp = Math.min(this.maxHp, this.hp + GEAR.medkitHeal * this.effects.medkitMult);
    events.push({ type: 'medkit' });
    return true;
  }

  /** @returns угол источника урона относительно взгляда (для индикатора) */
  damage(amount: number, fromX: number, fromZ: number, time: number): { killed: boolean; relAngle: number } {
    if (this.dead) return { killed: false, relAngle: 0 };
    let dmg = amount;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, dmg * this.effects.armorAbsorb);
      this.armor -= absorbed;
      dmg -= absorbed;
    }
    this.hp -= dmg;
    this.lastHurtT = time;
    const angTo = Math.atan2(fromX - this.pos.x, fromZ - this.pos.z);
    let rel = angTo - this.yaw;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      return { killed: true, relAngle: rel };
    }
    return { killed: false, relAngle: rel };
  }

  addReserve(id: WeaponId, amount: number): void {
    const cur = this.reserve[id];
    if (cur < 0) return; // бесконечный
    const max = WEAPONS[id].reserveMax;
    this.reserve[id] = Math.min(max, cur + amount);
  }
}
