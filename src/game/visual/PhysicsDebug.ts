import { BufferAttribute, BufferGeometry, LineBasicMaterial, LineSegments } from 'three';
import type { Object3D } from 'three';
import type { PhysicsWorld } from '@/game/physics';

/**
 * Wireframe view of every Rapier collider.
 *
 * Dev-only (`?physics=1`): rebuilds a line buffer from `world.debugRender()`.
 * Typical cost for a stage-3 arena is ~40 line segments — negligible, but the
 * whole component is skipped in production builds.
 */
export class PhysicsDebugView {
  readonly object: LineSegments;
  private readonly geometry: BufferGeometry;
  private readonly material: LineBasicMaterial;
  private enabled: boolean;

  constructor(private readonly physics: PhysicsWorld, enabled = false) {
    this.geometry = new BufferGeometry();
    this.geometry.setAttribute('position', new BufferAttribute(new Float32Array(0), 3));
    this.geometry.setAttribute('color', new BufferAttribute(new Float32Array(0), 3));
    this.material = new LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.9 });
    this.object = new LineSegments(this.geometry, this.material);
    this.object.frustumCulled = false;
    this.object.renderOrder = 999;
    this.enabled = enabled;
    this.object.visible = enabled;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.object.visible = enabled;
  }

  /** Refresh the vertex buffers; call after the physics step. */
  update(): void {
    if (!this.enabled) return;
    const { vertices, colors } = this.physics.debugLines();
    this.geometry.setAttribute('position', new BufferAttribute(vertices, 3));
    this.geometry.setAttribute('color', new BufferAttribute(colors, 3));
  }

  attachTo(parent: Object3D): void {
    parent.add(this.object);
  }

  dispose(): void {
    this.object.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}
