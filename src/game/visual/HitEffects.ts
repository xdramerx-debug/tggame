import {
  AdditiveBlending,
  BoxGeometry,
  DynamicDrawUsage,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
} from 'three';
import type { Object3D } from 'three';

interface Particle {
  readonly position: Vector3;
  readonly velocity: Vector3;
  life: number;
  readonly maxLife: number;
  readonly size: number;
  readonly tint: 'spark' | 'blood';
}

const SPARK_COLOR = 0xffd9a0;
const BLOOD_COLOR = 0x7de2c9;

/**
 * Pooled hit feedback: sparks on a landed sword hit, cold motes on enemy death.
 *
 * One `InstancedMesh` per tint means the whole effect system costs two draw
 * calls regardless of how many hits are on screen. Particles are simulated on
 * the CPU with a fixed pool (no allocations per hit), which keeps GC pauses out
 * of combat frames on mobile.
 */
export class HitEffects {
  private readonly sparkMesh: InstancedMesh;
  private readonly bloodMesh: InstancedMesh;
  private readonly particles: Particle[] = [];
  private readonly poolSize: number;
  /** Share of the particle budget the current quality tier allows (0…1). */
  private budget = 1;
  private readonly matrix = new Matrix4();
  private readonly quaternion = new Quaternion();
  private readonly scale = new Vector3();
  private readonly geometry = new BoxGeometry(0.06, 0.06, 0.06);
  private readonly sparkMaterial = new MeshBasicMaterial({
    color: SPARK_COLOR,
    transparent: true,
    opacity: 0.95,
    blending: AdditiveBlending,
    depthWrite: false,
  });
  private readonly bloodMaterial = new MeshBasicMaterial({
    color: BLOOD_COLOR,
    transparent: true,
    opacity: 0.9,
    blending: AdditiveBlending,
    depthWrite: false,
  });

  constructor(parent: Object3D, poolSize = 48) {
    this.poolSize = poolSize;
    this.sparkMesh = new InstancedMesh(this.geometry, this.sparkMaterial, poolSize);
    this.bloodMesh = new InstancedMesh(this.geometry, this.bloodMaterial, poolSize);
    for (const mesh of [this.sparkMesh, this.bloodMesh]) {
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      parent.add(mesh);
    }
  }

  /** Number of particles currently alive (diagnostics). */
  get activeCount(): number {
    return this.particles.length;
  }

  /** Applies the tier's particle budget (low tier: ~40 % of the sparks). */
  setBudget(ratio: number): void {
    this.budget = Math.min(1, Math.max(0, ratio));
  }

  /** Sparks for a sword hit; `strength` scales the spread and the count. */
  burst(position: { x: number; y: number; z: number }, strength = 1, tint: 'spark' | 'blood' = 'spark'): void {
    const count = Math.max(1, Math.round(Math.min(10, Math.round(4 + strength * 4)) * this.budget));
    for (let i = 0; i < count; i += 1) {
      if (this.particles.length >= this.poolSize * 2) break;
      const angle = Math.random() * Math.PI * 2;
      const speed = (1.6 + Math.random() * 2.4) * strength;
      const maxLife = 0.28 + Math.random() * 0.32;
      this.particles.push({
        position: new Vector3(position.x, position.y, position.z),
        velocity: new Vector3(Math.cos(angle) * speed, Math.random() * 2.4 + 0.6, Math.sin(angle) * speed),
        life: maxLife,
        maxLife,
        size: 0.6 + Math.random() * 0.8,
        tint,
      });
    }
  }

  update(dt: number): void {
    if (this.particles.length === 0) {
      this.sparkMesh.count = 0;
      this.bloodMesh.count = 0;
      return;
    }

    let sparks = 0;
    let blood = 0;
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const particle = this.particles[i];
      if (!particle) continue;
      particle.life -= dt;
      if (particle.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      particle.velocity.y -= 9.8 * dt;
      particle.position.addScaledVector(particle.velocity, dt);
      const fade = particle.life / particle.maxLife;
      this.scale.setScalar(particle.size * fade);
      this.matrix.compose(particle.position, this.quaternion, this.scale);
      if (particle.tint === 'spark') {
        this.sparkMesh.setMatrixAt(sparks, this.matrix);
        sparks += 1;
      } else {
        this.bloodMesh.setMatrixAt(blood, this.matrix);
        blood += 1;
      }
    }

    this.sparkMesh.count = sparks;
    this.bloodMesh.count = blood;
    if (sparks > 0) this.sparkMesh.instanceMatrix.needsUpdate = true;
    if (blood > 0) this.bloodMesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.sparkMaterial.dispose();
    this.bloodMaterial.dispose();
    this.sparkMesh.removeFromParent();
    this.bloodMesh.removeFromParent();
    this.sparkMesh.dispose();
    this.bloodMesh.dispose();
    this.particles.length = 0;
  }
}
