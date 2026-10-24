import * as THREE from 'three';
import { ARENA, PLAYER, WEAPON, type PowerUpKind } from '../game/types';
import { POWERUP_EFFECT } from '../game/powerups';
import {
  animateDeath, animateIdle, animateRecoil, animateReload, animateWalk, buildHumanoid,
  setHitFlash, type HumanoidRig,
} from './rig';
import { playSfx } from './audio';
import { buzz } from './haptics';
import type { PropCollider } from './world';
import type { InputSnapshot } from './input';

/** Player soldier: movement, dash, weapon state, procedural animation. */

export class Player {
  readonly rig: HumanoidRig;
  hp: number = PLAYER.maxHp;
  alive = true;
  mag: number = WEAPON.magSize;
  reloading = false;
  reloadT = 0;
  fireCd = 0;
  dashT = 0;
  dashCd = 0;
  rapidT = 0;
  recoil = 0;
  flashT = 0;
  deathT = 0;
  private runT = 0;
  private elapsed = 0;
  private dashDir = new THREE.Vector3(0, 0, 1);
  private moving = false;

  constructor(shadowTex: THREE.Texture) {
    this.rig = buildHumanoid({
      skin: 0xc79a6b,
      clothes: 0x3d4a33,
      eye: 0xdfe8ff,
      scale: 1,
      zombie: false,
      shadowTexture: shadowTex,
      withGun: true,
    });
  }

  get pos(): THREE.Vector3 {
    return this.rig.root.position;
  }

  get reloadProgress(): number {
    return this.reloading ? Math.min(1, this.reloadT / WEAPON.reloadTime) : 0;
  }

  get dashReadyFrac(): number {
    return this.dashCd <= 0 ? 1 : 1 - Math.min(1, this.dashCd / PLAYER.dashCooldown);
  }

  update(dt: number, input: InputSnapshot, camYaw: number, colliders: readonly PropCollider[], dashQueued: boolean, reloadQueued: boolean): void {
    this.elapsed += dt;
    this.fireCd -= dt;
    this.dashCd -= dt;
    this.rapidT = Math.max(0, this.rapidT - dt);
    this.recoil = Math.max(0, this.recoil - dt * 7);
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) setHitFlash(this.rig, false);
    }

    if (!this.alive) {
      this.deathT += dt;
      const p = Math.min(1, this.deathT / 1.4);
      // reuse the death topple
      animateDeath(this.rig, p, 1);
      return;
    }

    // reload progress
    if (this.reloading) {
      this.reloadT += dt;
      if (this.reloadT >= WEAPON.reloadTime) {
        this.reloading = false;
        this.mag = WEAPON.magSize;
      }
    }
    if (reloadQueued) this.tryStartReload();

    // dash
    if (this.dashT > 0) this.dashT -= dt;
    if (dashQueued && this.dashCd <= 0 && this.dashT <= 0) {
      this.dashT = PLAYER.dashTime;
      this.dashCd = PLAYER.dashCooldown;
      const fx = Math.sin(camYaw);
      const fz = Math.cos(camYaw);
      const mx = input.moveX;
      const my = input.moveY;
      if (Math.hypot(mx, my) > 0.2) {
        this.dashDir.set(fx * my + Math.cos(camYaw) * mx, 0, fz * my - Math.sin(camYaw) * mx).normalize();
      } else {
        this.dashDir.set(fx, 0, fz);
      }
      playSfx('dash');
      buzz(18);
    }

    // movement
    const fx = Math.sin(camYaw);
    const fz = Math.cos(camYaw);
    let wx = fx * input.moveY + Math.cos(camYaw) * input.moveX;
    let wz = fz * input.moveY - Math.sin(camYaw) * input.moveX;
    const wlen = Math.hypot(wx, wz);
    if (wlen > 1) {
      wx /= wlen;
      wz /= wlen;
    }
    this.moving = wlen > 0.12 || this.dashT > 0;

    const root = this.rig.root;
    if (this.dashT > 0) {
      root.position.x += this.dashDir.x * PLAYER.dashSpeed * dt;
      root.position.z += this.dashDir.z * PLAYER.dashSpeed * dt;
    } else if (wlen > 0.12) {
      root.position.x += wx * PLAYER.speed * dt;
      root.position.z += wz * PLAYER.speed * dt;
    }
    // props push the player out
    for (const c of colliders) {
      const ox = root.position.x - c.x;
      const oz = root.position.z - c.z;
      const d = Math.hypot(ox, oz);
      const min = c.r + PLAYER.radius;
      if (d > 0.0001 && d < min) {
        root.position.x = c.x + (ox / d) * min;
        root.position.z = c.z + (oz / d) * min;
      }
    }
    const lim = ARENA.half - 0.6;
    root.position.x = Math.max(-lim, Math.min(lim, root.position.x));
    root.position.z = Math.max(-lim, Math.min(lim, root.position.z));
    root.position.y = 0;

    // face the camera direction, animations
    root.rotation.y = camYaw;
    if (this.moving) {
      const speedFrac = this.dashT > 0 ? 1.8 : Math.min(1, wlen);
      this.runT += dt * (7 + speedFrac * 5);
      animateWalk(this.rig, this.runT, speedFrac, false);
      if (this.dashT > 0) this.rig.body.rotation.x = 0.32;
    } else {
      animateIdle(this.rig, this.elapsed, false);
    }
    if (this.reloading) {
      animateReload(this.rig, this.reloadT / WEAPON.reloadTime);
    } else {
      animateRecoil(this.rig, this.recoil);
    }
  }

  canFire(): boolean {
    return this.alive && !this.reloading && this.fireCd <= 0 && this.dashT <= 0 && this.mag > 0;
  }

  /** Register a fired shot; returns damage multiplier from the rapid buff. */
  consumeShot(): number {
    this.mag -= 1;
    const rapid = this.rapidT > 0;
    this.fireCd = WEAPON.fireInterval * (rapid ? POWERUP_EFFECT.rapid.fireIntervalMult : 1);
    this.recoil = 1;
    return rapid ? POWERUP_EFFECT.rapid.damageMult : 1;
  }

  tryStartReload(): void {
    if (!this.alive || this.reloading || this.mag >= WEAPON.magSize) return;
    this.reloading = true;
    this.reloadT = 0;
    playSfx('reload');
  }

  hurt(dmg: number): boolean {
    if (!this.alive) return false;
    this.hp = Math.max(0, this.hp - dmg);
    this.flashT = 0.18;
    setHitFlash(this.rig, true);
    buzz(70);
    if (this.hp <= 0) {
      this.alive = false;
      this.deathT = 0;
      return true;
    }
    return false;
  }

  applyPowerup(kind: PowerUpKind): void {
    if (kind === 'health') this.hp = Math.min(PLAYER.maxHp, this.hp + POWERUP_EFFECT.health.hp);
    if (kind === 'ammo') {
      this.mag = WEAPON.magSize;
      this.reloading = false;
    }
    if (kind === 'rapid') this.rapidT = POWERUP_EFFECT.rapid.durationS;
  }

  reset(pos: THREE.Vector3): void {
    this.hp = PLAYER.maxHp;
    this.alive = true;
    this.mag = WEAPON.magSize;
    this.reloading = false;
    this.reloadT = 0;
    this.fireCd = 0;
    this.dashT = 0;
    this.dashCd = 0;
    this.rapidT = 0;
    this.recoil = 0;
    this.flashT = 0;
    this.deathT = 0;
    this.runT = 0;
    this.rig.root.position.copy(pos);
    this.rig.root.rotation.set(0, 0, 0);
    this.rig.body.rotation.set(0, 0, 0);
    this.rig.root.position.y = 0;
    for (const m of this.rig.flashMaterials) {
      m.transparent = false;
      m.opacity = 1;
      m.emissive.setHex(0x000000);
    }
    const sm = this.rig.blobShadow.material as THREE.MeshBasicMaterial;
    sm.opacity = 0.55;
    this.rig.blobShadow.scale.setScalar(1);
    if (this.rig.gun) {
      this.rig.gun.rotation.set(-0.08, 0, 0);
      this.rig.gun.position.set(0.12, 0.52, 0.42);
    }
  }
}
