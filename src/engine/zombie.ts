import type * as THREE from 'three';
import { ARENA, ZOMBIE_STATS, type ZombieKind } from '../game/types';
import {
  animateAttack, animateDeath, animateWalk, buildHumanoid, chestPoint, headPoint,
  setHitFlash, type HumanoidRig,
} from './rig';
import type { PropCollider } from './world';

/** Zombie: state machine + procedural animation. Pure engine, no UI imports. */

type ZState = 'spawn' | 'walk' | 'attack' | 'hit' | 'dying' | 'dead';

const LOOKS: Record<ZombieKind, { skin: number; clothes: number; eye: number }> = {
  walker: { skin: 0x7a9464, clothes: 0x39404d, eye: 0xffdd55 },
  runner: { skin: 0x9a7a5c, clothes: 0x4d2f2f, eye: 0xff5533 },
  brute: { skin: 0x5f7a52, clothes: 0x2b3136, eye: 0xff2222 },
};

const ATTACK_DUR = 0.55;
const SPAWN_DUR = 0.8;
const HIT_STAGGER = 0.16;
const DEATH_DUR = 1.5;

export class Zombie {
  readonly rig: HumanoidRig;
  readonly kind: ZombieKind;
  readonly maxHp: number;
  hp: number;
  readonly speed: number;
  readonly damage: number;
  readonly radius: number;
  readonly attackRange: number;
  readonly attackCooldown: number;
  state: ZState = 'spawn';
  stateT = 0;
  walkT: number;
  flashT = 0;
  private attackHasHit = false;
  private fallSign = 1;

  constructor(kind: ZombieKind, pos: THREE.Vector3, hpMult: number, speedMult: number, shadowTex: THREE.Texture) {
    const st = ZOMBIE_STATS[kind];
    const look = LOOKS[kind];
    this.kind = kind;
    this.maxHp = Math.round(st.hp * hpMult);
    this.hp = this.maxHp;
    this.speed = st.speed * speedMult * (0.92 + Math.random() * 0.16);
    this.damage = st.damage;
    this.radius = st.radius;
    this.attackRange = st.attackRange;
    this.attackCooldown = st.attackCooldown;
    this.walkT = Math.random() * 10;
    this.rig = buildHumanoid({
      skin: look.skin, clothes: look.clothes, eye: look.eye,
      scale: st.scale, zombie: true, shadowTexture: shadowTex,
    });
    this.rig.root.position.copy(pos);
  }

  get pos(): THREE.Vector3 {
    return this.rig.root.position;
  }

  get dead(): boolean {
    return this.state === 'dead';
  }

  get removable(): boolean {
    return this.state === 'dead';
  }

  headAt(out: THREE.Vector3): THREE.Vector3 {
    return headPoint(this.rig, out);
  }

  chestAt(out: THREE.Vector3): THREE.Vector3 {
    return chestPoint(this.rig, out);
  }

  update(dt: number, playerPos: THREE.Vector3, others: readonly Zombie[], colliders: readonly PropCollider[]): { strike: boolean } {
    this.stateT += dt;
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) setHitFlash(this.rig, false);
    }
    const root = this.rig.root;

    switch (this.state) {
      case 'spawn': {
        const p = Math.min(1, this.stateT / SPAWN_DUR);
        const eased = 1 - (1 - p) * (1 - p);
        root.position.y = -1.5 * (1 - eased);
        this.rig.body.rotation.x = 0.12 + (1 - eased) * 0.9;
        if (p >= 1) {
          root.position.y = 0;
          this.state = 'walk';
          this.stateT = 0;
        }
        break;
      }
      case 'walk': {
        const dx = playerPos.x - root.position.x;
        const dz = playerPos.z - root.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < this.attackRange && playerPos.y < 2) {
          this.state = 'attack';
          this.stateT = 0;
          this.attackHasHit = false;
          break;
        }
        let mx = dist > 0.001 ? dx / dist : 0;
        let mz = dist > 0.001 ? dz / dist : 0;
        // separation from the horde
        for (const o of others) {
          if (o === this || o.dead || o.state === 'dying') continue;
          const ox = root.position.x - o.pos.x;
          const oz = root.position.z - o.pos.z;
          const d = Math.hypot(ox, oz);
          const min = (this.radius + o.radius) * 0.95;
          if (d > 0.0001 && d < min) {
            const push = (min - d) / min;
            mx += (ox / d) * push * 1.6;
            mz += (oz / d) * push * 1.6;
          }
        }
        // prop avoidance
        for (const c of colliders) {
          const ox = root.position.x - c.x;
          const oz = root.position.z - c.z;
          const d = Math.hypot(ox, oz);
          const min = c.r + this.radius + 0.2;
          if (d > 0.0001 && d < min) {
            const push = (min - d) / min;
            mx += (ox / d) * push * 2;
            mz += (oz / d) * push * 2;
          }
        }
        const len = Math.hypot(mx, mz) || 1;
        root.position.x += (mx / len) * this.speed * dt;
        root.position.z += (mz / len) * this.speed * dt;
        clampToArena(root.position, this.radius);
        // face movement
        const targetYaw = Math.atan2(mx, mz);
        root.rotation.y = lerpAngle(root.rotation.y, targetYaw, 1 - Math.exp(-9 * dt));
        this.walkT += dt * (2.1 + this.speed * 0.9);
        animateWalk(this.rig, this.walkT, Math.min(1, this.speed / 3), true);
        break;
      }
      case 'attack': {
        const p = this.stateT / ATTACK_DUR;
        animateAttack(this.rig, p, true);
        if (p < 0.45) {
          const dx = playerPos.x - root.position.x;
          const dz = playerPos.z - root.position.z;
          const d = Math.hypot(dx, dz) || 1;
          root.position.x += (dx / d) * this.speed * 1.7 * dt;
          root.position.z += (dz / d) * this.speed * 1.7 * dt;
          clampToArena(root.position, this.radius);
        }
        if (p >= 0.4 && !this.attackHasHit) {
          this.attackHasHit = true;
          return { strike: true };
        }
        if (this.stateT > ATTACK_DUR + this.attackCooldown * 0.45) {
          this.state = 'walk';
          this.stateT = 0;
        }
        break;
      }
      case 'hit': {
        this.rig.body.rotation.x = 0.12 - 0.22 * (1 - this.stateT / HIT_STAGGER);
        if (this.stateT >= HIT_STAGGER) {
          this.state = 'walk';
          this.stateT = 0;
        }
        break;
      }
      case 'dying': {
        const p = Math.min(1, this.stateT / DEATH_DUR);
        animateDeath(this.rig, p, this.fallSign);
        if (p >= 1) this.state = 'dead';
        break;
      }
      case 'dead':
        break;
    }
    return { strike: false };
  }

  takeDamage(dmg: number, headshot: boolean, knockDir: THREE.Vector3): 'none' | 'hit' | 'killed' {
    if (this.state === 'dying' || this.state === 'dead') return 'none';
    this.hp -= dmg;
    this.flashT = 0.12;
    setHitFlash(this.rig, true);
    this.rig.root.position.x += knockDir.x * (headshot ? 0.1 : 0.16);
    this.rig.root.position.z += knockDir.z * (headshot ? 0.1 : 0.16);
    if (this.hp <= 0) {
      this.state = 'dying';
      this.stateT = 0;
      this.fallSign = 1;
      return 'killed';
    }
    if (this.state !== 'attack') {
      this.state = 'hit';
      this.stateT = 0;
    }
    return 'hit';
  }
}

function clampToArena(v: THREE.Vector3, r: number): void {
  const lim = ARENA.half - 0.5 - r;
  v.x = Math.max(-lim, Math.min(lim, v.x));
  v.z = Math.max(-lim, Math.min(lim, v.z));
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
