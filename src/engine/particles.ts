import * as THREE from 'three';

/**
 * Пул партиклов на THREE.Points: кровь, искры, песчаная пыль, дым,
 * гильзы, кислотные брызги. Один буфер на всё, zero-allocation в бою.
 */

type Flavor = 'blood' | 'spark' | 'sand' | 'smoke' | 'shell' | 'acid';

interface Particle {
  alive: boolean;
  age: number;
  life: number;
  size: number;
  drag: number;
  gravity: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  color: THREE.Color;
}

const MAX = 380;
const FLAVOR_COLOR: Record<Flavor, [number, number]> = {
  blood: [0x8c1f14, 0xb03222],
  spark: [0xffd27a, 0xff9a3d],
  sand: [0xd9c08a, 0xc2a76e],
  smoke: [0x4a443c, 0x6b6357],
  shell: [0xc9a24a, 0xe0bc63],
  acid: [0x9fd93a, 0xc7f05f],
};

export class Particles {
  readonly points: THREE.Points;
  private pool: Particle[] = [];
  private positions: Float32Array;
  private colors: Float32Array;
  private cursor = 0;
  private material: THREE.PointsMaterial;
  private geometry: THREE.BufferGeometry;

  constructor() {
    this.positions = new Float32Array(MAX * 3);
    this.colors = new Float32Array(MAX * 3);
    for (let i = 0; i < MAX; i++) {
      this.pool.push({
        alive: false, age: 0, life: 1, size: 0.1, drag: 2, gravity: 9,
        pos: new THREE.Vector3(), vel: new THREE.Vector3(), color: new THREE.Color(1, 1, 1),
      });
      this.positions[i * 3 + 1] = -50;
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.material = new THREE.PointsMaterial({
      size: 0.14,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
  }

  spawn(flavor: Flavor, pos: THREE.Vector3, dir: THREE.Vector3 | null, speed: number, count: number, lifeScale = 1): void {
    const [c0, c1] = FLAVOR_COLOR[flavor];
    for (let i = 0; i < count; i++) {
      const p = this.next();
      const life = {
        blood: 0.55, spark: 0.3, sand: 0.7, smoke: 1.1, shell: 0.9, acid: 0.5,
      }[flavor] * lifeScale * (0.7 + Math.random() * 0.6);
      p.alive = true;
      p.age = 0;
      p.life = life;
      p.pos.copy(pos);
      const spread = flavor === 'smoke' ? 1.4 : flavor === 'shell' ? 0.9 : 0.55;
      if (dir) {
        p.vel.copy(dir).multiplyScalar(speed * (0.5 + Math.random() * 0.7));
        p.vel.x += (Math.random() - 0.5) * spread * speed;
        p.vel.y += (Math.random() - 0.5) * spread * speed;
        p.vel.z += (Math.random() - 0.5) * spread * speed;
      } else {
        p.vel.set(
          (Math.random() - 0.5) * speed,
          Math.random() * speed * 0.7,
          (Math.random() - 0.5) * speed,
        );
      }
      if (flavor === 'smoke') {
        p.vel.multiplyScalar(0.35);
        p.gravity = -1.1;
        p.drag = 1.6;
      } else if (flavor === 'spark') {
        p.gravity = 14;
        p.drag = 1.2;
      } else if (flavor === 'sand') {
        p.gravity = 5.5;
        p.drag = 3.2;
      } else if (flavor === 'shell') {
        p.gravity = 16;
        p.drag = 0.4;
        p.vel.y = Math.abs(p.vel.y) * 0.6 + 1.4;
      } else if (flavor === 'acid') {
        p.gravity = 10;
        p.drag = 1.8;
      } else {
        p.gravity = 9.5;
        p.drag = 2.4;
      }
      const c = Math.random() < 0.5 ? c0 : c1;
      p.color.setHex(c);
      p.size = flavor === 'smoke' ? 0.3 : flavor === 'shell' ? 0.07 : 0.12;
    }
  }

  update(dt: number): void {
    const pos = this.positions;
    const col = this.colors;
    for (let i = 0; i < MAX; i++) {
      const p = this.pool[i];
      if (!p?.alive) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.alive = false;
        pos[i * 3 + 1] = -50;
        continue;
      }
      const decay = Math.max(0, 1 - p.drag * dt);
      p.vel.multiplyScalar(decay);
      p.vel.y -= p.gravity * dt;
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < 0.03 && p.vel.y < 0) {
        p.pos.y = 0.03;
        p.vel.y *= -0.25;
        p.vel.x *= 0.6;
        p.vel.z *= 0.6;
      }
      const k = 1 - p.age / p.life;
      pos[i * 3] = p.pos.x;
      pos[i * 3 + 1] = p.pos.y;
      pos[i * 3 + 2] = p.pos.z;
      col[i * 3] = p.color.r * k;
      col[i * 3 + 1] = p.color.g * k;
      col[i * 3 + 2] = p.color.b * k;
    }
    (this.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  private next(): Particle {
    for (let i = 0; i < MAX; i++) {
      const idx = (this.cursor + i) % MAX;
      const p = this.pool[idx];
      if (p && !p.alive) {
        this.cursor = (idx + 1) % MAX;
        return p;
      }
    }
    const first = this.pool[0];
    if (!first) throw new Error('particle pool is empty');
    const p = this.pool[this.cursor] ?? first;
    this.cursor = (this.cursor + 1) % MAX;
    return p;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
