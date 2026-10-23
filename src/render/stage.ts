import * as THREE from 'three';
import type { BattleSnapshot, CharacterDef, Projectile } from '@/fight/types';
import { ARENA_HALF_WIDTH } from '@/fight/types';
import { createFreak } from './models';
import type { FreakRig } from './models';

export type QualityLevel = 'low' | 'medium' | 'high';
export type QualityChoice = QualityLevel | 'auto';

interface QualityPreset {
  readonly pixelRatio: number;
  readonly shadows: boolean;
  readonly dust: number;
  readonly props: number;
  readonly lamps: number;
}

const PRESETS: Readonly<Record<QualityLevel, QualityPreset>> = {
  low: { pixelRatio: 1, shadows: false, dust: 90, props: 10, lamps: 1 },
  medium: { pixelRatio: 1.5, shadows: true, dust: 200, props: 22, lamps: 2 },
  high: { pixelRatio: 2, shadows: true, dust: 340, props: 34, lamps: 3 },
};

/** Deterministic RNG so every device gets the same pit. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Ember/acid spray used for hits, blocks and projectile impacts. */
class Sparks {
  readonly points: THREE.Points;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly velocities: Float32Array;
  private readonly lives: Float32Array;
  private cursor = 0;
  private readonly capacity: number;

  constructor(capacity: number, size: number) {
    this.capacity = capacity;
    this.positions = new Float32Array(capacity * 3);
    this.colors = new Float32Array(capacity * 3);
    this.velocities = new Float32Array(capacity * 3);
    this.lives = new Float32Array(capacity);
    for (let i = 0; i < capacity; i += 1) this.positions[i * 3 + 1] = -100;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    const material = new THREE.PointsMaterial({
      size,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
  }

  emit(x: number, y: number, z: number, count: number, color: THREE.Color, power = 1): void {
    for (let i = 0; i < count; i += 1) {
      const index = this.cursor;
      this.cursor = (this.cursor + 1) % this.capacity;
      const p = index * 3;
      this.positions[p] = x;
      this.positions[p + 1] = y;
      this.positions[p + 2] = z;
      const angle = Math.random() * Math.PI * 2;
      const speed = (1.2 + Math.random() * 3.4) * power;
      this.velocities[p] = Math.cos(angle) * speed;
      this.velocities[p + 1] = Math.abs(Math.sin(angle)) * speed * 1.3 + 0.8;
      this.velocities[p + 2] = (Math.random() - 0.5) * 1.6;
      this.colors[p] = color.r;
      this.colors[p + 1] = color.g;
      this.colors[p + 2] = color.b;
      this.lives[index] = 0.28 + Math.random() * 0.42;
    }
    const geometry = this.points.geometry;
    const positionAttr = geometry.getAttribute('position');
    const colorAttr = geometry.getAttribute('color');
    positionAttr.needsUpdate = true;
    colorAttr.needsUpdate = true;
  }

  update(delta: number): void {
    let changed = false;
    for (let i = 0; i < this.capacity; i += 1) {
      const remaining = this.lives[i] ?? 0;
      if (remaining <= 0) continue;
      const p = i * 3;
      const life = remaining - delta;
      this.lives[i] = life;
      if (life <= 0) {
        this.positions[p + 1] = -100;
        changed = true;
        continue;
      }
      this.velocities[p + 1] = (this.velocities[p + 1] ?? 0) - 9.8 * delta;
      this.positions[p] = (this.positions[p] ?? 0) + (this.velocities[p] ?? 0) * delta;
      this.positions[p + 1] = (this.positions[p + 1] ?? 0) + (this.velocities[p + 1] ?? 0) * delta;
      this.positions[p + 2] = (this.positions[p + 2] ?? 0) + (this.velocities[p + 2] ?? 0) * delta;
      changed = true;
    }
    if (changed) {
      const geometry = this.points.geometry;
      geometry.getAttribute('position').needsUpdate = true;
    }
  }

  dispose(): void {
    this.points.geometry.dispose();
    if (this.points.material instanceof THREE.Material) this.points.material.dispose();
  }
}

interface ProjectileVisual {
  readonly mesh: THREE.Mesh;
  readonly glow: THREE.PointLight | null;
}

/**
 * The 3D stage: a flooded quarry pit, a scrap-metal fence, hanging lamps and
 * two procedurally built freaks. Owns the renderer and all per-frame visuals,
 * but never touches game rules.
 */
export class FightStage {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private rigs: [FreakRig, FreakRig] | null = null;
  private readonly sparks: Sparks;
  private readonly dust: THREE.Points;
  private readonly dustMaterial: THREE.PointsMaterial;
  private readonly props: THREE.Group;
  private readonly lampLights: THREE.PointLight[] = [];
  private readonly lampMeshes: THREE.Mesh[] = [];
  private readonly projector = new Map<number, ProjectileVisual>();
  private quality: QualityLevel;
  private shake = 0;
  private shakeTime = 0;
  private readonly baseCamera = new THREE.Vector3(0, 3.15, 10.6);
  private readonly lookAt = new THREE.Vector3(0, 1.15, 0);
  private time = 0;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, quality: QualityLevel = 'medium') {
    this.quality = quality;
    const preset = PRESETS[quality];

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: quality !== 'low',
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, preset.pixelRatio));
    this.renderer.shadowMap.enabled = preset.shadows;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x08060a);
    this.scene.fog = new THREE.FogExp2(0x0a070c, 0.055);

    this.camera = new THREE.PerspectiveCamera(46, 16 / 9, 0.1, 80);
    this.camera.position.copy(this.baseCamera);
    this.camera.lookAt(this.lookAt);

    this.rigs = null;

    // ---- lights -----------------------------------------------------------
    const hemi = new THREE.HemisphereLight(0x39404f, 0x120a12, 0.75);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xffd9b0, 2.1);
    key.position.set(4.5, 9, 5.5);
    key.castShadow = preset.shadows;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 30;
    key.shadow.camera.left = -9;
    key.shadow.camera.right = 9;
    key.shadow.camera.top = 8;
    key.shadow.camera.bottom = -4;
    key.shadow.bias = -0.0015;
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0x4a86ff, 0.55);
    rim.position.set(-6, 4, -7);
    this.scene.add(rim);

    // ---- ground -----------------------------------------------------------
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(70, 34),
      new THREE.MeshStandardMaterial({ color: 0x1a161c, roughness: 0.94, metalness: 0.05 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(70, 34),
      new THREE.MeshStandardMaterial({
        color: 0x0b1b20,
        roughness: 0.18,
        metalness: 0.92,
        transparent: true,
        opacity: 0.62,
      }),
    );
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.015;
    this.scene.add(water);

    const grateGeometry = new THREE.BoxGeometry(0.03, 0.03, 12);
    const grateMaterial = new THREE.MeshStandardMaterial({ color: 0x2b2620, roughness: 0.85, metalness: 0.4 });
    for (let i = -5; i <= 5; i += 1) {
      const bar = new THREE.Mesh(grateGeometry, grateMaterial);
      bar.position.set(i * 1.1, 0.02, 0);
      bar.receiveShadow = true;
      this.scene.add(bar);
    }

    // Arena edge markers: two rusted rails keep the play space readable.
    const rail = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.14, 1.4),
      new THREE.MeshStandardMaterial({ color: 0x6b2a1c, roughness: 0.9, metalness: 0.3 }),
    );
    for (const side of [-1, 1]) {
      const marker = rail.clone();
      marker.position.set(side * (ARENA_HALF_WIDTH + 0.15), 0.07, 0);
      this.scene.add(marker);
    }

    // ---- background -------------------------------------------------------
    const backWall = new THREE.Mesh(
      new THREE.BoxGeometry(40, 9, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x14121a, roughness: 0.95, metalness: 0.1 }),
    );
    backWall.position.set(0, 4, -7.2);
    backWall.receiveShadow = true;
    this.scene.add(backWall);

    this.props = new THREE.Group();
    this.scene.add(this.props);
    const random = mulberry32(0x5eed1);
    const scrapMaterial = new THREE.MeshStandardMaterial({ color: 0x2a2422, roughness: 0.88, metalness: 0.42 });
    const rustMaterial = new THREE.MeshStandardMaterial({ color: 0x5a2d20, roughness: 0.92, metalness: 0.25 });

    for (let i = 0; i < PRESETS.high.props; i += 1) {
      const size = 0.4 + random() * 1.4;
      const crate = new THREE.Mesh(
        new THREE.BoxGeometry(size, size * (0.5 + random()), size * (0.6 + random())),
        random() > 0.55 ? rustMaterial : scrapMaterial,
      );
      crate.position.set((random() - 0.5) * 26, size * 0.35, -3.2 - random() * 4.4);
      crate.rotation.y = random() * Math.PI;
      crate.rotation.z = (random() - 0.5) * 0.2;
      crate.castShadow = true;
      crate.receiveShadow = true;
      crate.userData.props = true;
      this.props.add(crate);
    }

    // Hanging chains.
    const chainMaterial = new THREE.MeshStandardMaterial({ color: 0x3a3630, roughness: 0.6, metalness: 0.85 });
    for (let i = 0; i < 7; i += 1) {
      const length = 2 + random() * 3.2;
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, length, 5), chainMaterial);
      chain.position.set((random() - 0.5) * 16, 7.4 - length / 2, -2.6 - random() * 2.2);
      this.props.add(chain);
      const hook = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 5, 9), chainMaterial);
      hook.position.set(chain.position.x, 7.4 - length, chain.position.z);
      hook.rotation.y = Math.PI / 2;
      this.props.add(hook);
    }

    // Lamps: the only warm light in the pit.
    const lampColors = [0xf0a13a, 0xb6e04a, 0xc1372a];
    for (let i = 0; i < 3; i += 1) {
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 10, 8),
        new THREE.MeshStandardMaterial({
          color: lampColors[i],
          emissive: lampColors[i],
          emissiveIntensity: 2.6,
          roughness: 0.3,
        }),
      );
      bulb.position.set((i - 1) * 4.2, 5.4 + (i % 2) * 0.5, -3.6);
      this.scene.add(bulb);
      this.lampMeshes.push(bulb);

      const light = new THREE.PointLight(lampColors[i], 22, 14, 2);
      light.position.copy(bulb.position);
      light.castShadow = false;
      this.scene.add(light);
      this.lampLights.push(light);
    }

    // A row of spectators: faceless silhouettes above the fence.
    const crowdMaterial = new THREE.MeshStandardMaterial({ color: 0x0b0910, roughness: 1, metalness: 0 });
    for (let i = 0; i < 22; i += 1) {
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.18 + random() * 0.06, 7, 5), crowdMaterial);
      head.position.set((random() - 0.5) * 24, 3.4 + random() * 0.7, -6.2 - random() * 1.4);
      this.props.add(head);
    }

    // ---- particles --------------------------------------------------------
    this.sparks = new Sparks(260, 0.075);
    this.scene.add(this.sparks.points);

    const dustGeometry = new THREE.BufferGeometry();
    const dustPositions = new Float32Array(PRESETS.high.dust * 3);
    for (let i = 0; i < PRESETS.high.dust; i += 1) {
      dustPositions[i * 3] = (random() - 0.5) * 22;
      dustPositions[i * 3 + 1] = 0.2 + random() * 6;
      dustPositions[i * 3 + 2] = (random() - 0.5) * 10 - 1;
    }
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    this.dustMaterial = new THREE.PointsMaterial({
      color: 0xb9a888,
      size: 0.035,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    });
    this.dust = new THREE.Points(dustGeometry, this.dustMaterial);
    this.dust.frustumCulled = false;
    this.scene.add(this.dust);

    this.applyQuality(quality);
  }

  /** Builds both fighters; called once per match. */
  setFighters(player: CharacterDef, opponent: CharacterDef): void {
    this.clearFighters();
    const a = createFreak(player, 0, this.quality);
    const b = createFreak(opponent, 1, this.quality);
    this.scene.add(a.group, b.group);
    this.rigs = [a, b];
  }

  private clearFighters(): void {
    if (!this.rigs) return;
    for (const rig of this.rigs) {
      this.scene.remove(rig.group);
      rig.dispose();
    }
    this.rigs = null;
  }

  applyQuality(quality: QualityLevel): void {
    this.quality = quality;
    const preset = PRESETS[quality];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, preset.pixelRatio));
    this.renderer.shadowMap.enabled = preset.shadows;
    this.lampLights.forEach((light, index) => {
      light.visible = index < preset.lamps;
    });
    this.lampMeshes.forEach((mesh, index) => {
      mesh.visible = index < preset.lamps;
    });

    const dustAttribute = this.dust.geometry.getAttribute('position');
    this.dust.geometry.setDrawRange(0, Math.min(preset.dust, dustAttribute.count));

    let index = 0;
    for (const child of this.props.children) {
      if (child.userData.props === true) {
        child.visible = index < preset.props;
        index += 1;
      }
    }
    // Shrinking dust also darkens the scene slightly: compensate.
    this.dustMaterial.opacity = quality === 'low' ? 0.26 : 0.4;
  }

  get currentQuality(): QualityLevel {
    return this.quality;
  }

  resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    // Portrait fallback: pull the camera back so both fighters stay visible.
    this.camera.fov = this.camera.aspect < 1 ? 62 : 46;
    this.camera.updateProjectionMatrix();
  }

  shakeCamera(power: number): void {
    this.shake = Math.min(1.2, this.shake + power);
    this.shakeTime = 0.34;
  }

  /** Spark burst at a world position. */
  burst(x: number, y: number, color: number, count = 14, power = 1): void {
    this.sparks.emit(x, y, 0.35, count, new THREE.Color(color), power);
  }

  /** One rendered frame. */
  render(snapshot: BattleSnapshot, delta: number): void {
    this.time += delta;
    const rigs = this.rigs;

    if (rigs) {
      snapshot.fighters.forEach((fighter, index) => {
        const rig = rigs[index === 0 ? 0 : 1];
        rig.group.position.set(fighter.x, fighter.y, index === 0 ? 0.18 : -0.18);
        rig.group.rotation.y = fighter.facing === 1 ? Math.PI / 2 : -Math.PI / 2;
        rig.update(fighter, this.time, delta);
      });
    }

    this.syncProjectiles(snapshot.projectiles);

    // Camera follows the midpoint of the fight, but keeps the arena framing.
    const midpoint = snapshot.fighters[0].x + snapshot.fighters[1].x;
    const targetX = THREE.MathUtils.clamp(midpoint * 0.22, -1.6, 1.6);
    this.camera.position.x += (this.baseCamera.x + targetX - this.camera.position.x) * Math.min(1, delta * 2.4);
    this.camera.position.y += (this.baseCamera.y - this.camera.position.y) * Math.min(1, delta * 3);
    this.camera.position.z += (this.baseCamera.z - this.camera.position.z) * Math.min(1, delta * 3);

    if (this.shake > 0.001) {
      this.shakeTime -= delta;
      const decay = Math.max(0, this.shakeTime / 0.34);
      const amount = this.shake * decay;
      this.camera.position.x += (Math.random() - 0.5) * amount * 0.45;
      this.camera.position.y += (Math.random() - 0.5) * amount * 0.3;
      this.camera.rotation.z = (Math.random() - 0.5) * amount * 0.02;
      if (this.shakeTime <= 0) {
        this.shake = 0;
        this.camera.rotation.z = 0;
      }
    }

    this.camera.lookAt(this.lookAt);
    this.sparks.update(delta);

    // Dust drifts upward and loops, cheaply suggesting a damp, hot pit.
    const positions = this.dust.geometry.getAttribute('position');
    for (let i = 0; i < positions.count; i += 1) {
      const y = positions.getY(i) + delta * 0.12;
      positions.setY(i, y > 6.4 ? 0.2 : y);
    }
    positions.needsUpdate = true;

    for (const light of this.lampLights) {
      light.intensity = 18 + Math.sin(this.time * 6 + light.position.x) * 5;
    }

    if (!this.disposed) this.renderer.render(this.scene, this.camera);
  }

  private syncProjectiles(projectiles: readonly Projectile[]): void {
    const seen = new Set<number>();
    projectiles.forEach((projectile, index) => {
      seen.add(index);
      let visual = this.projector.get(index);
      if (!visual) {
        const color = projectile.spec.kind === 'acid' ? 0xb6e04a : projectile.spec.kind === 'beam' ? 0x6fe3ff : 0xf0a13a;
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(projectile.spec.radius, 14, 10),
          new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.4, roughness: 0.25 }),
        );
        this.scene.add(mesh);
        const glow = this.quality === 'low' ? null : new THREE.PointLight(color, 8, 4, 2);
        if (glow) {
          this.scene.add(glow);
          glow.position.copy(mesh.position);
        }
        visual = { mesh, glow };
        this.projector.set(index, visual);
      }
      visual.mesh.position.set(projectile.x, projectile.y, 0.1);
      if (visual.glow) visual.glow.position.set(projectile.x, projectile.y, 0.4);
      this.sparks.emit(projectile.x, projectile.y, 0.2, 1, new THREE.Color(0xb6e04a), 0.25);
    });

    for (const [index, visual] of this.projector) {
      if (seen.has(index)) continue;
      this.scene.remove(visual.mesh);
      visual.mesh.geometry.dispose();
      if (visual.mesh.material instanceof THREE.Material) visual.mesh.material.dispose();
      if (visual.glow) this.scene.remove(visual.glow);
      this.projector.delete(index);
    }
  }

  /** Clears transient visuals (round transitions, rematches). */
  reset(): void {
    for (const [, visual] of this.projector) {
      this.scene.remove(visual.mesh);
      visual.mesh.geometry.dispose();
      if (visual.mesh.material instanceof THREE.Material) visual.mesh.material.dispose();
      if (visual.glow) this.scene.remove(visual.glow);
    }
    this.projector.clear();
    this.shake = 0;
    this.camera.rotation.z = 0;
  }

  dispose(): void {
    this.disposed = true;
    this.clearFighters();
    this.reset();
    this.sparks.dispose();
    this.dust.geometry.dispose();
    this.dustMaterial.dispose();
    this.scene.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!(node instanceof THREE.Mesh)) return;
      mesh.geometry.dispose();
      const material = mesh.material;
      if (Array.isArray(material)) {
        material.forEach((entry) => {
          entry.dispose();
        });
      }
      else material.dispose();
    });
    this.renderer.dispose();
  }
}
