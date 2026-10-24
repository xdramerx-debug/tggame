import * as THREE from 'three';
import { ARENA, WEAPON } from '../game/types';
import type { Zombie } from './zombie';
import type { ParticleSystem } from './particles';

/**
 * Hitscan weapon: pooled tracers, muzzle flash light, ray-sphere hit tests
 * (cheaper than Raycaster), aim assist that snaps to the nearest zombie cone.
 */

const TRACER_COUNT = 12;
const TRACER_TTL = 0.06;

export interface ShotResult {
  zombie: Zombie | null;
  headshot: boolean;
  point: THREE.Vector3;
  killed: boolean;
}

interface Tracer {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  ttl: number;
}

function flashTexture(): THREE.Texture {
  const size = 64;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const g = cv.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,255,235,1)');
    grad.addColorStop(0.25, 'rgba(255,205,110,0.85)');
    grad.addColorStop(1, 'rgba(255,150,50,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Ray vs sphere; returns entry t or null. */
function raySphere(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, c: THREE.Vector3, r: number): number | null {
  const mx = ox - c.x;
  const my = oy - c.y;
  const mz = oz - c.z;
  const b = mx * dx + my * dy + mz * dz;
  const cc = mx * mx + my * my + mz * mz - r * r;
  if (cc > 0 && b > 0) return null;
  const disc = b * b - cc;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  if (t >= 0) return t;
  const t2 = -b + Math.sqrt(disc);
  return t2 >= 0 ? t2 : null;
}

export class WeaponSystem {
  private readonly tracers: Tracer[] = [];
  private tracerCursor = 0;
  private readonly flash: THREE.Sprite;
  private readonly flashLight: THREE.PointLight;
  private flashT = 0;
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    const tracerGeo = new THREE.BoxGeometry(0.035, 0.035, 1);
    tracerGeo.translate(0, 0, 0.5);
    for (let i = 0; i < TRACER_COUNT; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffd27a, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      const mesh = new THREE.Mesh(tracerGeo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.tracers.push({ mesh, mat, ttl: 0 });
    }

    const flashMat = new THREE.SpriteMaterial({
      map: flashTexture(), transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.flash = new THREE.Sprite(flashMat);
    this.flash.scale.setScalar(0.8);
    scene.add(this.flash);

    this.flashLight = new THREE.PointLight(0xffb45e, 0, 14, 2);
    scene.add(this.flashLight);
  }

  /**
   * Fire one shot from the muzzle along camera-forward with aim assist.
   * Applies damage; returns hit info for scoring/SFX.
   */
  fire(
    camera: THREE.PerspectiveCamera,
    muzzle: THREE.Object3D,
    zombies: readonly Zombie[],
    particles: ParticleSystem,
    damage: number,
  ): ShotResult {
    const origin = this.tmpA.set(0, 0, 0);
    muzzle.getWorldPosition(origin);
    const camDir = this.tmpB.set(0, 0, 0);
    camera.getWorldDirection(camDir);

    // aim assist: nearest zombie within the cone
    let target: Zombie | null = null;
    let bestAngle: number = WEAPON.aimAssistRad;
    const head = new THREE.Vector3();
    const chest = new THREE.Vector3();
    for (const z of zombies) {
      if (z.dead || z.state === 'dying') continue;
      z.chestAt(chest);
      const toZ = chest.clone().sub(origin);
      const dist = toZ.length();
      if (dist > WEAPON.range) continue;
      const ang = toZ.normalize().angleTo(camDir);
      if (ang < bestAngle) {
        bestAngle = ang;
        target = z;
      }
    }

    let aimPoint: THREE.Vector3;
    if (target) {
      aimPoint = target.chestAt(new THREE.Vector3());
      // slight head bias when shooting close & centered
      if (bestAngle < 0.08) {
        target.headAt(head);
        aimPoint.lerp(head, 0.35);
      }
    } else {
      aimPoint = origin.clone().addScaledVector(camDir, WEAPON.range);
      // clamp to floor plane so tracers don't fly into the sky forever
      if (aimPoint.y < 0.05 && camDir.y < -0.001) {
        const t = (0.05 - origin.y) / camDir.y;
        aimPoint.copy(origin).addScaledVector(camDir, Math.max(1, t));
      }
    }

    const dir = aimPoint.sub(origin).normalize();
    // spread
    dir.x += (Math.random() - 0.5) * WEAPON.spreadRad * 2;
    dir.y += (Math.random() - 0.5) * WEAPON.spreadRad * 2;
    dir.z += (Math.random() - 0.5) * WEAPON.spreadRad * 2;
    dir.normalize();

    // find nearest hit: zombies (head then chest) vs environment planes
    let bestT: number = WEAPON.range;
    let hitZombie: Zombie | null = null;
    let headshot = false;
    const c = new THREE.Vector3();
    for (const z of zombies) {
      if (z.dead || z.state === 'dying') continue;
      z.headAt(c);
      const th = raySphere(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, c, 0.24 * z.rig.scale);
      z.chestAt(c);
      const tc = raySphere(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, c, 0.46 * z.rig.scale);
      const t = Math.min(th ?? Infinity, tc ?? Infinity);
      if (Number.isFinite(t) && t < bestT) {
        bestT = t;
        hitZombie = z;
        headshot = (th ?? Infinity) <= (tc ?? Infinity);
      }
    }
    // floor / walls
    if (dir.y < -0.0001) {
      const t = -origin.y / dir.y;
      if (t > 0 && t < bestT) {
        bestT = t;
        hitZombie = null;
      }
    }
    const wallLim = ARENA.half + 2.4;
    for (const axis of ['x', 'z'] as const) {
      const d = axis === 'x' ? dir.x : dir.z;
      const o = axis === 'x' ? origin.x : origin.z;
      if (Math.abs(d) > 0.0001) {
        for (const s of [-1, 1]) {
          const t = (s * wallLim - o) / d;
          if (t > 0 && t < bestT) {
            bestT = t;
            hitZombie = null;
          }
        }
      }
    }

    const point = origin.clone().addScaledVector(dir, bestT);
    let killed = false;
    if (hitZombie) {
      const knock = dir.clone().setY(0).normalize();
      const res = hitZombie.takeDamage(headshot ? damage * WEAPON.headshotMult : damage, headshot, knock);
      killed = res === 'killed';
      particles.burst({
        count: killed ? 22 : headshot ? 14 : 8,
        origin: point,
        dir: knock,
        speed: killed ? 4.2 : 3,
        spread: 0.9,
        life: killed ? 0.7 : 0.45,
        colors: [0x8a0f14, 0xb01820, 0x5e0a0e],
      });
    } else {
      particles.burst({
        count: 5, origin: point, dir: dir.clone().negate(), speed: 2.2,
        spread: 0.8, life: 0.35, gravity: 6, colors: [0x9aa0a8, 0x6a7078],
      });
    }

    this.spawnTracer(origin, point);
    // muzzle flash
    this.flashT = TRACER_TTL;
    this.flash.position.copy(origin);
    this.flashLight.position.copy(origin);
    this.flash.material.opacity = 1;
    this.flash.scale.setScalar(0.7 + Math.random() * 0.5);
    this.flashLight.intensity = 9;

    return { zombie: hitZombie, headshot, point, killed };
  }

  private spawnTracer(from: THREE.Vector3, to: THREE.Vector3): void {
    const t = this.tracers[this.tracerCursor];
    this.tracerCursor = (this.tracerCursor + 1) % TRACER_COUNT;
    if (!t) return;
    const len = from.distanceTo(to);
    t.mesh.position.copy(from);
    t.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), to.clone().sub(from).normalize());
    t.mesh.scale.set(1, 1, Math.max(0.2, len));
    t.mesh.visible = true;
    t.mat.opacity = 0.95;
    t.ttl = TRACER_TTL;
  }

  update(dt: number): void {
    for (const t of this.tracers) {
      if (t.ttl <= 0) continue;
      t.ttl -= dt;
      if (t.ttl <= 0) {
        t.mesh.visible = false;
        t.mat.opacity = 0;
      } else {
        t.mat.opacity = (t.ttl / TRACER_TTL) * 0.95;
      }
    }
    if (this.flashT > 0) {
      this.flashT -= dt;
      const k = Math.max(0, this.flashT / TRACER_TTL);
      this.flash.material.opacity = k;
      this.flashLight.intensity = 9 * k;
    }
  }
}
