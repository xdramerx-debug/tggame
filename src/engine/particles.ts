import * as THREE from 'three';

/**
 * Pooled GPU points particles: blood, sparks, dust, gibs.
 * CPU-side pool (positions/colors/lifetimes), one draw call.
 */

const MAX = 700;
const HIDDEN_Y = -100;

export interface BurstOpts {
  count: number;
  origin: THREE.Vector3;
  /** base direction (spread around it) */
  dir?: THREE.Vector3;
  speed: number;
  spread?: number;
  gravity?: number;
  life: number;
  colors: number[];
  size?: number;
}

interface Particle {
  life: number;
  maxLife: number;
  vx: number;
  vy: number;
  vz: number;
  gravity: number;
}

function softDotTexture(): THREE.Texture {
  const size = 64;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const g = cv.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.7)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class ParticleSystem {
  readonly points: THREE.Points;
  private readonly pool: Particle[] = [];
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly baseColors: Float32Array;
  private cursor = 0;
  private readonly geometry: THREE.BufferGeometry;

  constructor() {
    this.positions = new Float32Array(MAX * 3);
    this.colors = new Float32Array(MAX * 3);
    this.baseColors = new Float32Array(MAX * 3);
    for (let i = 0; i < MAX; i++) {
      this.positions[i * 3 + 1] = HIDDEN_Y;
      this.pool.push({ life: 0, maxLife: 1, vx: 0, vy: 0, vz: 0, gravity: 0 });
    }
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    const material = new THREE.PointsMaterial({
      size: 0.13,
      map: softDotTexture(),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(this.geometry, material);
    this.points.frustumCulled = false;
  }

  burst(opts: BurstOpts): void {
    const color = new THREE.Color();
    const dir = opts.dir ?? new THREE.Vector3(0, 1, 0);
    const spread = opts.spread ?? 1;
    for (let n = 0; n < opts.count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX;
      const p = this.pool[i];
      if (!p) continue;
      const speed = opts.speed * (0.4 + Math.random() * 0.8);
      const vx = dir.x + (Math.random() - 0.5) * 2 * spread;
      const vy = dir.y + (Math.random() - 0.5) * 2 * spread;
      const vz = dir.z + (Math.random() - 0.5) * 2 * spread;
      const len = Math.hypot(vx, vy, vz) || 1;
      p.vx = (vx / len) * speed;
      p.vy = (vy / len) * speed;
      p.vz = (vz / len) * speed;
      p.gravity = opts.gravity ?? 9;
      p.maxLife = opts.life * (0.6 + Math.random() * 0.7);
      p.life = p.maxLife;
      this.positions[i * 3] = opts.origin.x + (Math.random() - 0.5) * 0.15;
      this.positions[i * 3 + 1] = opts.origin.y + (Math.random() - 0.5) * 0.15;
      this.positions[i * 3 + 2] = opts.origin.z + (Math.random() - 0.5) * 0.15;
      const hex = opts.colors[Math.floor(Math.random() * opts.colors.length) % opts.colors.length] ?? 0xffffff;
      color.setHex(hex);
      this.baseColors[i * 3] = color.r;
      this.baseColors[i * 3 + 1] = color.g;
      this.baseColors[i * 3 + 2] = color.b;
      this.colors[i * 3] = color.r;
      this.colors[i * 3 + 1] = color.g;
      this.colors[i * 3 + 2] = color.b;
    }
  }

  update(dt: number): void {
    for (let i = 0; i < MAX; i++) {
      const p = this.pool[i];
      if (!p || p.life <= 0) continue;
      p.life -= dt;
      const ci = i * 3;
      if (p.life <= 0) {
        this.positions[ci + 1] = HIDDEN_Y;
        continue;
      }
      p.vy -= p.gravity * dt;
      const y = (this.positions[ci + 1] ?? 0) + p.vy * dt;
      this.positions[ci] = (this.positions[ci] ?? 0) + p.vx * dt;
      this.positions[ci + 2] = (this.positions[ci + 2] ?? 0) + p.vz * dt;
      // floor bounce for heavier bits
      if (y < 0.03 && p.vy < 0) {
        this.positions[ci + 1] = 0.03;
        p.vy *= -0.35;
        p.vx *= 0.7;
        p.vz *= 0.7;
      } else {
        this.positions[ci + 1] = y;
      }
      // fade toward black as life drains (additive blending → fades out)
      const k = p.life / p.maxLife;
      const f = k * k;
      this.colors[ci] = (this.baseColors[ci] ?? 0) * f;
      this.colors[ci + 1] = (this.baseColors[ci + 1] ?? 0) * f;
      this.colors[ci + 2] = (this.baseColors[ci + 2] ?? 0) * f;
    }
    const posAttr = this.geometry.getAttribute('position');
    const colAttr = this.geometry.getAttribute('color');
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    const mat = this.points.material as THREE.PointsMaterial;
    mat.map?.dispose();
    mat.dispose();
  }
}
