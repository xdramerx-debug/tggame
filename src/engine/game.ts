import * as THREE from 'three';
import {
  PLAYER, WEAPON,
  type GamePhase, type GameSnapshot, type PowerUpKind, type WaveState, type ZombieKind,
} from '../game/types';
import { BANNER_S, INTERMISSION_S, MAX_ZOMBIES_ALIVE, waveComposition } from '../game/waves';
import { COMBO_WINDOW_S, comboMult, killScore, waveBonus } from '../game/scoring';
import { POWERUP_LABEL, rollDrop } from '../game/powerups';
import { createRng, pick, randRange, seedFromTime } from '../game/rng';
import { buildWorld, type World } from './world';
import { InputManager } from './input';
import { ParticleSystem } from './particles';
import { Player } from './player';
import { WeaponSystem } from './weapons';
import { Zombie } from './zombie';
import { disposeRig } from './rig';
import { playSfx, resumeAudio, suspendAudio } from './audio';

export type GameEvent =
  | { type: 'wave'; wave: number }
  | { type: 'bonus'; amount: number }
  | { type: 'hurt' }
  | { type: 'kill'; headshot: boolean; gained: number; combo: number }
  | { type: 'powerup'; label: string }
  | { type: 'gameover'; newBest: boolean };

export interface GameCallbacks {
  onSnapshot: (s: GameSnapshot) => void;
  onEvent: (e: GameEvent) => void;
}

export const BEST_KEY = 'deadzone-best';

const NO_INPUT = { moveX: 0, moveY: 0, fireHeld: false, dashQueued: false, reloadQueued: false };

const DROP_COLORS: Record<PowerUpKind, number> = {
  health: 0xff2d55,
  ammo: 0xffb020,
  rapid: 0x38bdf8,
};

interface Drop {
  kind: PowerUpKind;
  mesh: THREE.Group;
  coreGeo: THREE.BoxGeometry;
  coreMat: THREE.MeshBasicMaterial;
  glowMat: THREE.SpriteMaterial;
  t: number;
  ttl: number;
  phase: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Game orchestrator: owns renderer/scene/loop, the wave director, camera,
 * and publishes HUD snapshots ~10Hz + immediate events. Engine stays free of
 * React/zustand — App wires callbacks into the store.
 */
export class Game {
  readonly input = new InputManager();
  readonly player: Player;

  private readonly container: HTMLElement;
  private readonly cb: GameCallbacks;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly world: World;
  private readonly particles = new ParticleSystem();
  private readonly weapon: WeaponSystem;
  private readonly rng = createRng(seedFromTime());
  private readonly glowTex: THREE.Texture;

  private zombies: Zombie[] = [];
  private drops: Drop[] = [];

  phase: GamePhase = 'menu';
  private wave = 0;
  private waveState: WaveState = 'intermission';
  private stateT = 1.6;
  private comp = waveComposition(1);
  private queue: ZombieKind[] = [];
  private spawnT = 0;

  private score = 0;
  private kills = 0;
  private combo = 0;
  private comboT = 0;
  private best = 0;

  private camYaw = 0;
  private camPitch = 0.18;
  private readonly camPos = new THREE.Vector3(0, 2.4, -4.6);
  private shakeAmt = 0;
  private fovCur = 62;
  private menuYaw = 0;
  private overT = 0;
  private elapsed = 0;
  private moanT = 4;

  private raf = 0;
  private lastT = 0;
  private snapAcc = 0;
  private running = true;
  private resizeObs: ResizeObserver | null = null;

  constructor(container: HTMLElement, cb: GameCallbacks) {
    this.container = container;
    this.cb = cb;

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'display:block;width:100%;height:100%';
    container.appendChild(canvas);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // throws when WebGL is unavailable — App catches and shows a fallback
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: dpr < 2, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(dpr);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;

    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(62, w / h, 0.1, 140);
    this.camera.position.copy(this.camPos);

    this.world = buildWorld(this.scene);
    this.player = new Player(this.world.blobShadowTexture);
    this.scene.add(this.player.rig.root);
    this.weapon = new WeaponSystem(this.scene);
    this.scene.add(this.particles.points);

    this.glowTex = makeGlowTexture();
    this.input.attach(container);

    try {
      this.best = Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch {
      this.best = 0;
    }

    this.resizeObs = new ResizeObserver(() => { this.resize(); });
    this.resizeObs.observe(container);
    this.resize();

    this.lastT = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    this.publish();
  }

  /* ------------------------------ public API ------------------------------ */

  startRun(): void {
    this.clearEntities();
    this.player.reset(new THREE.Vector3(0, 0, 0));
    this.score = 0;
    this.kills = 0;
    this.combo = 0;
    this.comboT = 0;
    this.wave = 0;
    this.waveState = 'intermission';
    this.stateT = 1.4;
    this.camYaw = 0;
    this.camPitch = 0.18;
    this.camPos.set(0, 2.4, -4.6);
    this.shakeAmt = 0;
    this.overT = 0;
    this.phase = 'playing';
    resumeAudio();
    this.publish();
  }

  pause(): void {
    if (this.phase !== 'playing') return;
    this.phase = 'paused';
    suspendAudio();
    this.publish();
  }

  resume(): void {
    if (this.phase !== 'paused') return;
    this.phase = 'playing';
    this.lastT = performance.now();
    resumeAudio();
    this.publish();
  }

  restart(): void {
    this.startRun();
  }

  toMenu(): void {
    this.clearEntities();
    this.player.reset(new THREE.Vector3(0, 0, 0));
    this.menuYaw = this.camYaw;
    this.phase = 'menu';
    this.publish();
  }

  onVisibility(hidden: boolean): void {
    if (hidden) {
      this.pause();
      suspendAudio();
    } else {
      this.lastT = performance.now();
      if (this.phase === 'playing') resumeAudio();
    }
  }

  getBest(): number {
    return this.best;
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.resizeObs?.disconnect();
    this.input.detach();
    this.clearEntities();
    this.world.dispose();
    this.particles.dispose();
    this.glowTex.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  /* -------------------------------- loop --------------------------------- */

  private readonly frame = (): void => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    const now = performance.now();
    let dt = (now - this.lastT) / 1000;
    this.lastT = now;
    if (!(dt > 0)) dt = 0.016;
    if (dt > 0.05) dt = 0.05;
    this.elapsed += dt;

    this.world.update(this.elapsed);
    this.particles.update(dt);
    this.weapon.update(dt);

    switch (this.phase) {
      case 'menu': this.updateMenu(dt); break;
      case 'playing': this.updatePlaying(dt); break;
      case 'paused': break;
      case 'over': this.updateOver(dt); break;
    }

    this.snapAcc += dt;
    if (this.snapAcc >= 0.1) {
      this.snapAcc = 0;
      this.publish();
    }
    this.renderer.render(this.scene, this.camera);
  };

  private updateMenu(dt: number): void {
    this.input.consumeLook();
    this.player.update(dt, NO_INPUT, this.camYaw, [], false, false);
    this.menuYaw += dt * 0.1;
    const r = 11;
    this.camera.position.set(Math.sin(this.menuYaw) * r, 4.7 + Math.sin(this.menuYaw * 0.7) * 0.7, Math.cos(this.menuYaw) * r);
    this.camera.lookAt(0, 1.25, 0);
    if (this.camera.fov !== 62) {
      this.camera.fov = 62;
      this.camera.updateProjectionMatrix();
    }
  }

  private updateOver(dt: number): void {
    this.overT += dt;
    this.player.update(dt, NO_INPUT, this.camYaw, [], false, false);
    this.camYaw += dt * 0.07;
    this.camPitch = Math.max(0.02, this.camPitch - dt * 0.06);
    this.updateFollowCamera(dt, 3.1);
  }

  private updatePlaying(dt: number): void {
    // camera look from right-half drag
    const look = this.input.consumeLook();
    this.camYaw -= look.x * 0.0048;
    this.camPitch = clamp(this.camPitch + look.y * 0.0032, -0.22, 0.75);

    const inp = this.input.read();
    const dashQ = this.input.consumeDash();
    const relQ = this.input.consumeReload();
    this.player.update(dt, inp, this.camYaw, this.world.colliders, dashQ, relQ);

    // shooting
    if (inp.fireHeld && this.player.alive) {
      if (this.player.canFire()) this.shoot();
      else if (this.player.mag <= 0 && !this.player.reloading) this.player.tryStartReload();
    }

    this.director(dt);
    this.updateZombies(dt);
    this.updateDrops(dt);

    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) this.combo = 0;
    }

    // ambient moans
    this.moanT -= dt;
    if (this.moanT <= 0 && this.zombies.length > 0) {
      playSfx('moan');
      this.moanT = randRange(this.rng, 3.5, 8);
    }

    this.updateFollowCamera(dt, 3.7);
  }

  private updateFollowCamera(dt: number, hDist: number): void {
    const fx = Math.sin(this.camYaw);
    const fz = Math.cos(this.camYaw);
    const rx = Math.cos(this.camYaw);
    const rz = -Math.sin(this.camYaw);
    const p = this.player.pos;
    const hd = hDist * Math.cos(this.camPitch * 0.85);
    const desired = new THREE.Vector3(
      p.x - fx * hd + rx * 0.65,
      clamp(p.y + 0.95 + Math.sin(this.camPitch) * 3.6, 0.4, 8),
      p.z - fz * hd + rz * 0.65,
    );
    const k = 1 - Math.exp(-10 * dt);
    this.camPos.lerp(desired, k);

    this.shakeAmt *= Math.exp(-7 * dt);
    const sh = this.shakeAmt;
    this.camera.position.set(
      this.camPos.x + (Math.random() - 0.5) * sh,
      this.camPos.y + (Math.random() - 0.5) * sh,
      this.camPos.z + (Math.random() - 0.5) * sh,
    );
    this.camera.lookAt(p.x + fx * 2.2, p.y + 1.35 - this.camPitch * 1.1, p.z + fz * 2.2);

    const targetFov = 62 + (this.player.dashT > 0 ? 9 : 0) + sh * 12;
    this.fovCur += (targetFov - this.fovCur) * (1 - Math.exp(-9 * dt));
    if (Math.abs(this.camera.fov - this.fovCur) > 0.01) {
      this.camera.fov = this.fovCur;
      this.camera.updateProjectionMatrix();
    }
  }

  private addShake(v: number): void {
    this.shakeAmt = Math.min(0.9, this.shakeAmt + v);
  }

  /* ------------------------------- combat -------------------------------- */

  private shoot(): void {
    const muzzle = this.player.rig.muzzle;
    if (!muzzle) return;
    const mult = this.player.consumeShot();
    const res = this.weapon.fire(this.camera, muzzle, this.zombies, this.particles, WEAPON.damage * mult);
    playSfx('shot');
    this.addShake(0.07);
    if (res.zombie) {
      if (res.killed) {
        const gained = killScore(res.zombie.kind, this.combo);
        this.score += gained;
        this.kills += 1;
        this.combo += 1;
        this.comboT = COMBO_WINDOW_S;
        playSfx('zombieDie');
        this.addShake(0.12);
        this.maybeDrop(res.zombie.pos);
        this.cb.onEvent({ type: 'kill', headshot: res.headshot, gained, combo: this.combo });
      } else {
        playSfx(res.headshot ? 'headshot' : 'hitmark');
      }
    }
    this.snapAcc = 0.1; // ammo feels tight — push a snapshot now
  }

  private maybeDrop(pos: THREE.Vector3): void {
    const kind = rollDrop(this.rng);
    if (!kind) return;
    const group = new THREE.Group();
    const coreGeo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    const coreMat = new THREE.MeshBasicMaterial({ color: DROP_COLORS[kind] });
    group.add(new THREE.Mesh(coreGeo, coreMat));
    const glowMat = new THREE.SpriteMaterial({
      map: this.glowTex, color: DROP_COLORS[kind], transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const glow = new THREE.Sprite(glowMat);
    glow.scale.setScalar(1.1);
    group.add(glow);
    group.position.set(pos.x, 0.6, pos.z);
    this.scene.add(group);
    this.drops.push({
      kind, mesh: group, coreGeo, coreMat, glowMat,
      t: 0, ttl: 15, phase: randRange(this.rng, 0, 6.28),
    });
  }

  private updateDrops(dt: number): void {
    const p = this.player.pos;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      if (!d) continue;
      d.t += dt;
      d.mesh.rotation.y += dt * 2.2;
      d.mesh.position.y = 0.55 + Math.sin(d.t * 3 + d.phase) * 0.14;
      const left = d.ttl - d.t;
      d.mesh.visible = left > 3 || Math.floor(left * 6) % 2 === 0;
      const dx = d.mesh.position.x - p.x;
      const dz = d.mesh.position.z - p.z;
      if (this.player.alive && dx * dx + dz * dz < 1.35 * 1.35 && Math.abs(d.mesh.position.y - 0.6) < 2) {
        this.player.applyPowerup(d.kind);
        playSfx('powerup');
        this.cb.onEvent({ type: 'powerup', label: POWERUP_LABEL[d.kind] });
        this.particles.burst({
          count: 16, origin: d.mesh.position, dir: new THREE.Vector3(0, 1, 0),
          speed: 2.6, spread: 1, life: 0.5, gravity: 2, colors: [DROP_COLORS[d.kind], 0xffffff],
        });
        this.removeDrop(i);
        this.snapAcc = 0.1;
        continue;
      }
      if (left <= 0) this.removeDrop(i);
    }
  }

  private removeDrop(i: number): void {
    const d = this.drops[i];
    if (!d) return;
    this.scene.remove(d.mesh);
    d.coreGeo.dispose();
    d.coreMat.dispose();
    d.glowMat.dispose();
    this.drops.splice(i, 1);
  }

  private updateZombies(dt: number): void {
    for (const z of this.zombies) {
      const { strike } = z.update(dt, this.player.pos, this.zombies, this.world.colliders);
      if (strike && this.player.alive) {
        const d = z.pos.distanceTo(this.player.pos);
        if (d < z.attackRange + 0.75) {
          const died = this.player.hurt(z.damage);
          playSfx('playerHurt');
          this.addShake(0.34);
          this.cb.onEvent({ type: 'hurt' });
          this.snapAcc = 0.1;
          if (died) {
            this.gameOver();
            return;
          }
        }
      }
    }
    for (let i = this.zombies.length - 1; i >= 0; i--) {
      const z = this.zombies[i];
      if (z?.removable) {
        this.scene.remove(z.rig.root);
        disposeRig(z.rig);
        this.zombies.splice(i, 1);
      }
    }
  }

  private aliveCount(): number {
    let n = 0;
    for (const z of this.zombies) if (z.state !== 'dying' && z.state !== 'dead') n += 1;
    return n;
  }

  /* ------------------------------- director ------------------------------- */

  private director(dt: number): void {
    switch (this.waveState) {
      case 'intermission':
        this.stateT -= dt;
        if (this.stateT <= 0) this.beginWave(this.wave + 1);
        break;
      case 'banner':
        this.stateT -= dt;
        if (this.stateT <= 0) {
          this.waveState = 'spawning';
          this.spawnT = 0.3;
        }
        break;
      case 'spawning': {
        this.spawnT -= dt;
        if (this.spawnT <= 0 && this.queue.length > 0 && this.aliveCount() < MAX_ZOMBIES_ALIVE) {
          const kind = this.queue.shift();
          if (kind) this.spawnZombie(kind);
          this.spawnT = this.comp.spawnEvery;
        }
        if (this.queue.length === 0) this.waveState = 'clearing';
        break;
      }
      case 'clearing':
        if (this.zombies.length === 0) {
          const bonus = waveBonus(this.wave);
          this.score += bonus;
          this.cb.onEvent({ type: 'bonus', amount: bonus });
          this.waveState = 'intermission';
          this.stateT = INTERMISSION_S;
          this.snapAcc = 0.1;
        }
        break;
    }
  }

  private beginWave(n: number): void {
    this.wave = n;
    this.comp = waveComposition(n);
    const q: ZombieKind[] = [];
    for (let i = 0; i < this.comp.walkers; i++) q.push('walker');
    for (let i = 0; i < this.comp.runners; i++) q.push('runner');
    for (let i = 0; i < this.comp.brutes; i++) q.push('brute');
    // shuffle (Fisher–Yates, seeded)
    for (let i = q.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      const t = q[i];
      const s = q[j];
      if (t !== undefined && s !== undefined) {
        q[i] = s;
        q[j] = t;
      }
    }
    this.queue = q;
    this.waveState = 'banner';
    this.stateT = BANNER_S;
    playSfx('waveStart');
    this.cb.onEvent({ type: 'wave', wave: n });
    this.snapAcc = 0.1;
  }

  private spawnZombie(kind: ZombieKind): void {
    const sp = pick(this.rng, this.world.spawnPoints).clone();
    sp.x += randRange(this.rng, -2.2, 2.2);
    sp.z += randRange(this.rng, -2.2, 2.2);
    const lim = 25.4;
    sp.x = clamp(sp.x, -lim, lim);
    sp.z = clamp(sp.z, -lim, lim);
    const z = new Zombie(kind, sp, this.comp.hpMult, this.comp.speedMult, this.world.blobShadowTexture);
    this.zombies.push(z);
    this.scene.add(z.rig.root);
    this.particles.burst({
      count: 14, origin: new THREE.Vector3(sp.x, 0.12, sp.z), dir: new THREE.Vector3(0, 1, 0),
      speed: 2.4, spread: 1, life: 0.6, gravity: 3, colors: [0x3a3f2a, 0x26291c, 0x50563a],
    });
  }

  /* ------------------------------ lifecycle ------------------------------- */

  private gameOver(): void {
    this.phase = 'over';
    this.overT = 0;
    let newBest = false;
    if (this.score > this.best) {
      this.best = this.score;
      newBest = true;
      try {
        localStorage.setItem(BEST_KEY, String(this.best));
      } catch {
        // private mode — keep in memory
      }
    }
    playSfx('gameOver');
    this.cb.onEvent({ type: 'gameover', newBest });
    this.publish();
  }

  private clearEntities(): void {
    for (const z of this.zombies) {
      this.scene.remove(z.rig.root);
      disposeRig(z.rig);
    }
    this.zombies = [];
    for (let i = this.drops.length - 1; i >= 0; i--) this.removeDrop(i);
    this.queue = [];
  }

  private resize(): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private publish(): void {
    const snap: GameSnapshot = {
      phase: this.phase,
      hp: Math.round(this.player.hp),
      maxHp: PLAYER.maxHp,
      ammo: this.player.mag,
      magSize: WEAPON.magSize,
      reloading: this.player.reloading,
      reloadProgress: Math.round(this.player.reloadProgress * 100) / 100,
      wave: Math.max(1, this.wave),
      waveState: this.waveState,
      intermissionT: this.waveState === 'intermission' ? Math.max(0, Math.ceil(this.stateT)) : 0,
      score: this.score,
      kills: this.kills,
      combo: this.combo,
      comboMult: comboMult(this.combo),
      dashReady: Math.round(this.player.dashReadyFrac * 100) / 100,
      rapidT: Math.round(this.player.rapidT * 10) / 10,
      zombiesLeft: this.queue.length + this.aliveCount(),
    };
    this.cb.onSnapshot(snap);
  }
}

function makeGlowTexture(): THREE.Texture {
  const size = 64;
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const g = cv.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
