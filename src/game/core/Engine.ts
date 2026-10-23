import { PerspectiveCamera, Raycaster, Scene } from 'three';
import type { Vector3, WebGLRenderer } from 'three';
import type { FrameStats, InitProgress, QualityLevel, QualityPreset } from '@/types/engine';
import type { DebugSceneSnapshot, GameScene } from '@/types/scene';
import type { InputAction, InteractionHint, MoveInput } from '@/input/types';
import { cameraRelativeMove } from '@/input/movement';
import { createRenderer, applyShadowPreset, resizeRenderer } from './Renderer';
import { QualityController } from './Quality';
import { HitStop } from '@/game/fx/HitStop';
import { PerfMonitor } from './PerfMonitor';
import { Loop } from './Loop';
import { CameraRig } from './CameraRig';
import { PostFX } from '@/game/visual/PostFX';
import { DungeonScene } from '@/game/scenes/DungeonScene';
import { PhysicsWorld } from '@/game/physics';
import { AssetLoader } from '@/game/assets/AssetLoader';
import type { InventorySnapshot } from '@/game/loot/RunState';
import type { RunSummary } from '@/game/scenes/DungeonScene';
import type { ItemSlotId } from '@/game/loot/itemTable';
import { hapticImpact } from '@/telegram/haptic';
import { audio, loadAudio } from '@/game/audio';
import type { StatBonuses } from '@/game/player/PlayerStats';

export interface EngineOptions {
  readonly canvas: HTMLCanvasElement;
  readonly initialQuality?: QualityLevel;
  readonly onProgress?: (progress: InitProgress) => void;
  readonly onStats?: (stats: FrameStats) => void;
  readonly onQualityChange?: (level: QualityLevel) => void;
  /** HUD toast from the scene (floor change, blocked stairs). */
  readonly onMessage?: (message: string) => void;
  /** End-of-run summary; the HUD swaps the game for the death screen. */
  readonly onDeath?: (summary: RunSummary) => void;
  /** Overrides the run seed; otherwise `?seed=` or a random one is used. */
  readonly seed?: number;
  /** Permanent meta-progression bonuses, read once at scene creation. */
  readonly metaBonuses?: StatBonuses;
  /** Extra starting rations from meta upgrades. */
  readonly startingRations?: number;
}

/**
 * Dev-only starting floor (`?floor=3` boots straight into the boss arena).
 * Never read in production builds: QA needs the boss without a 10-minute walk.
 */
function resolveStartFloor(): number | undefined {
  if (!import.meta.env.DEV || typeof window === 'undefined') return undefined;
  const param = new URLSearchParams(window.location.search).get('floor');
  if (param === null) return undefined;
  const parsed = Number.parseInt(param, 10);
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 3 ? parsed : undefined;
}

/** Reads the deterministic seed used by QA/Playwright (`?seed=1234`). */
function resolveSeed(explicit?: number): number {
  if (explicit !== undefined) return explicit >>> 0;
  if (typeof window !== 'undefined') {
    const param = new URLSearchParams(window.location.search).get('seed');
    if (param !== null) {
      const parsed = Number.parseInt(param, 10);
      if (Number.isFinite(parsed)) return (parsed >>> 0) || 1;
    }
  }
  return (Date.now() ^ 0x9e3779b9) >>> 0;
}

const yieldToBrowser = (): Promise<void> =>
  new Promise((resolve) => {
    requestAnimationFrame(() => {
      resolve();
    });
  });

/**
 * Owns the WebGL renderer, the scene, the camera rig, the loop and quality control.
 *
 * Lifecycle: `new Engine(...)` → `await init()` → `start()` → `pause()`/`resume()`
 * → `dispose()`. `dispose()` is idempotent and releases every GL resource it owns.
 */
export class Engine {
  readonly renderer: WebGLRenderer;
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly rig: CameraRig;

  private readonly canvas: HTMLCanvasElement;
  private readonly options: EngineOptions;
  private readonly rendererBundle: ReturnType<typeof createRenderer>;
  private readonly loop = new Loop();
  private readonly perf: PerfMonitor;
  private readonly quality: QualityController;
  /** Impact freeze: scales the simulation delta, never the camera delta. */
  private readonly hitStop = new HitStop();
  private readonly raycaster = new Raycaster();
  private gameScene: GameScene | null = null;
  private readonly dungeonSceneSeed: number;
  private physicsWorld: PhysicsWorld | null = null;
  private assetLoader: AssetLoader | null = null;
  private postfx: PostFX | null = null;
  private cleanup: (() => void)[] = [];
  private disposed = false;
  private initialized = false;
  private physicsDebugRequested = false;

  constructor(options: EngineOptions) {
    this.options = options;
    this.canvas = options.canvas;
    this.dungeonSceneSeed = resolveSeed(options.seed);
    this.rendererBundle = createRenderer(options.canvas);
    this.renderer = this.rendererBundle.renderer;
    this.scene = new Scene();
    this.camera = new PerspectiveCamera(58, 1, 0.08, 70);

    const initial = options.initialQuality ?? 'medium';
    this.rig = new CameraRig({
      camera: this.camera,
      degreesPerPx: 0.25,
      probe: (origin, direction, maxDistance) => this.probeCamera(origin, direction, maxDistance),
    });

    this.perf = new PerfMonitor({
      onStats: (stats) => options.onStats?.(stats),
      quality: () => this.quality.current,
    });

    this.quality = new QualityController({
      initial,
      getFps: () => this.perf.fps,
      isPaused: () => this.loop.isPaused,
      onChange: (level, preset) => this.handleQualityChange(level, preset),
    });
  }

  /** Asset cache, shared with later systems (monsters, loot). */
  get assets(): AssetLoader | null {
    return this.assetLoader;
  }

  get qualityLevel(): QualityLevel {
    return this.quality.current;
  }

  /** Current simulation time scale (1 except during a hit-stop window). */
  get timeScale(): number {
    return this.hitStop.scale;
  }

  get isPaused(): boolean {
    return this.loop.isPaused;
  }

  /** Builds renderer-sized state, the scene and the post chain. */
  async init(): Promise<void> {
    if (this.initialized) return;
    const progress = (stage: InitProgress['stage'], value: number, detail?: string): void => {
      this.options.onProgress?.(detail === undefined ? { stage, progress: value } : { stage, progress: value, detail });
    };

    progress('engine', 0.08);
    this.resize();
    this.installResizeHandlers();
    await yieldToBrowser();

    // Physics WASM is a separate chunk: it loads during the engine stage, in
    // parallel with nothing else, so the first frame is never blocked by it.
    progress('engine', 0.14, 'Физика');
    try {
      this.physicsWorld = await PhysicsWorld.create();
    } catch (error) {
      console.error('[engine] physics init failed', error);
      throw new Error('Не удалось загрузить физический движок (WASM)');
    }
    progress('engine', 0.24);

    progress('textures', 0.3);
    // Generated GLB models. A failure here must not brick the game: the scene
    // falls back to the primitive placeholder and logs the reason.
    const assets = new AssetLoader();
    this.assetLoader = assets;
    progress('models', 0.34, 'Модели');
    try {
      await assets.preloadRun((state) => {
        progress('models', 0.34 + (state.loaded / Math.max(1, state.total)) * 0.16, 'Модели');
      });
    } catch (error) {
      console.warn('[assets] model preload failed, using placeholder hero', error);
    }
    const hero = assets.cloneCharacter('hero');
    progress('models', 0.52);

    const scene = new DungeonScene({
      physics: this.physicsWorld,
      seed: this.dungeonSceneSeed,
      hero,
      assets,
      onNotify: (message) => this.options.onMessage?.(message),
      onHaptic: (kind) => hapticImpact(kind),
      onSound: (id) => audio.playSound(id),
      onDeath: (summary) => this.options.onDeath?.(summary),
      floor: resolveStartFloor(),
      metaBonuses: this.options.metaBonuses,
      startingRations: this.options.startingRations,
    });
    this.physicsWorld.primeQueries();
    this.gameScene = scene;
    if (this.physicsDebugRequested) scene.setPhysicsDebug?.(true);
    this.scene.add(scene.root);
    // The renderer reads background/fog from the scene it renders, not from the
    // child root, so the scene's atmosphere has to be lifted one level up.
    this.scene.background = scene.root.background;
    this.scene.fog = scene.root.fog;
    scene.applyQuality(this.quality.preset);
    applyShadowPreset(this.renderer, this.quality.preset);
    await yieldToBrowser();

    this.postfx = new PostFX({
      renderer: this.renderer,
      scene: this.scene,
      camera: this.camera,
      width: this.canvas.clientWidth || window.innerWidth,
      height: this.canvas.clientHeight || window.innerHeight,
      preset: this.quality.preset,
    });
    this.rig.setTarget(scene.followTarget, true);
    this.rig.snap();
    await yieldToBrowser();

    // Procedural audio: the backend loads lazily, so this starts the 18 decoded
    // buffers in the background while the HUD fades in. A failure is silent by
    // design — `loadAudio` never rejects.
    progress('audio', 0.78, 'Звук');
    await loadAudio();
    audio.startAmbience();
    await yieldToBrowser();

    this.initialized = true;
    progress('ready', 1);
  }

  start(): void {
    if (!this.initialized || this.disposed) return;
    this.perf.reset();
    this.loop.start(this.tick);
  }

  pause(): void {
    this.loop.pause();
  }

  resume(): void {
    if (!this.initialized || this.disposed) return;
    // Drop the stats window that spans the pause: it would read as a huge frame
    // time and could trigger a false quality downgrade.
    this.perf.reset();
    this.physicsWorld?.resetAccumulator();
    this.loop.resume();
  }

  /** Manual quality override (settings). Auto-quality resumes from the new tier. */
  setQuality(level: QualityLevel): void {
    this.quality.setLevel(level);
  }

  /** Applies a camera drag delta in CSS pixels (wired to the mobile input layer). */
  rotateCamera(dx: number, dy: number): void {
    this.rig.applyPointerDelta(dx, dy);
  }

  /** Applies a pinch factor (>1 zoom out). */
  zoomCamera(factor: number): void {
    this.rig.applyZoomFactor(factor);
  }

  /**
   * Forwards stick input to the scene, resolving it against the camera yaw.
   * Called by the touch layer on every stick move (≤60 Hz).
   */
  setMoveInput(input: MoveInput): void {
    const scene = this.gameScene;
    if (!scene) return;
    if (input.magnitude <= 0) {
      scene.setMoveInput({ x: 0, z: 0, magnitude: 0 });
      return;
    }
    const direction = cameraRelativeMove(input.x, input.y, this.rig.yaw);
    scene.setMoveInput({ x: direction.x, z: direction.y, magnitude: input.magnitude });
  }

  /** Routes a HUD action to the active scene. */
  triggerAction(action: InputAction): void {
    this.gameScene?.triggerAction(action);
  }

  /** Boss health bar data, or null when no boss is engaged. */
  getBossState(): { name: string; ratio: number; phase: number } | null {
    return this.gameScene?.getBossState?.() ?? null;
  }

  /** Applies meta upgrades bought in the menu to the live run. */
  setMetaBonuses(bonuses: StatBonuses, startingRations = 0): void {
    this.gameScene?.setMetaBonuses?.(bonuses, startingRations);
  }

  /** Current interaction offer (drives the ⚡ button visibility). */
  getInteractionHint(): InteractionHint | null {
    return this.gameScene?.getInteractionHint() ?? null;
  }

  /** Latest performance snapshot (last completed 500 ms window). */
  getStats(): FrameStats {
    return this.perf.stats;
  }

  /** Executed fixed physics steps (diagnostics / E2E). */
  getPhysicsStepCount(): number {
    return this.physicsWorld?.stepCount ?? 0;
  }

  /** Starts a fresh run in the same engine and WebGL context. */
  restartRun(seed?: number): void {
    this.gameScene?.restartRun?.(seed);
    this.perf.reset();
    this.physicsWorld?.resetAccumulator();
    this.loop.resume();
  }

  /** Eats one ration (HUD button); the scene owns the actual effect. */
  eatRation(): void {
    this.gameScene?.eatRation?.();
  }

  /** End-of-run summary, or null while the player is alive. */
  getRunSummary(): RunSummary | null {
    return this.gameScene?.getSummary?.() ?? null;
  }

  /** Dev-only: hurt the player (`?kill=1` for the death-screen smoke test). */
  debugHurt(amount: number): void {
    this.gameScene?.debugHurt?.(amount);
  }

  /** Dev-only: grant run experience (`?xp=N`). */
  debugGrantXp(amount: number): void {
    this.gameScene?.debugGrantXp?.(amount);
  }

  /** Dev-only: drop the player next to the boss arena (`?boss=1`). */
  debugBossArena(): void {
    const scene = this.gameScene;
    if (!scene?.debugBossPosition) return;
    const arena = scene.debugBossPosition();
    if (!arena) return;
    scene.teleportTo?.({ x: arena.x + 5, z: arena.z });
  }

  /** Dev-only: put a training skeleton in front of the player (`?dummy=1`). */
  debugSpawnDummy(): void {
    this.gameScene?.debugSpawnDummy?.(1.8);
  }

  /** Dev-only collider wireframes. */
  setPhysicsDebug(enabled: boolean): void {
    this.gameScene?.setPhysicsDebug?.(enabled);
    this.physicsDebugRequested = enabled;
  }

  /** Inventory panel data; null before the scene is built. */
  getInventorySnapshot(): InventorySnapshot | null {
    return this.gameScene?.getInventorySnapshot?.() as InventorySnapshot | null ?? null;
  }

  /** Equips a bag item; returns false when the scene rejects it. */
  equipItem(uid: number): boolean {
    return this.gameScene?.equipItem?.(uid) ?? false;
  }

  unequipItem(slot: ItemSlotId): boolean {
    return this.gameScene?.unequipItem?.(slot) ?? false;
  }

  /** Scene diagnostics for the dev bridge; null before the scene is built. */
  getDebugSceneSnapshot(): DebugSceneSnapshot | null {
    return this.gameScene?.getDebugSnapshot() ?? null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.loop.stop();
    for (const fn of this.cleanup) fn();
    this.cleanup = [];
    this.gameScene?.dispose();
    this.gameScene = null;
    this.postfx?.dispose();
    this.postfx = null;
    this.physicsWorld?.dispose();
    this.physicsWorld = null;
    this.assetLoader?.dispose();
    this.assetLoader = null;
    this.scene.clear();
    this.rendererBundle.dispose();
  }

  private readonly tick = (dt: number, elapsed: number): void => {
    const scene = this.gameScene;
    if (!scene) return;
    // Hit-stop: combat asks for a few frames of slow motion on impact. The
    // timer runs on the real delta, so the freeze always ends on time.
    const requested = scene.consumeHitStop?.();
    if (requested) this.hitStop.trigger(requested);
    this.hitStop.update(dt);
    const scale = this.hitStop.scale;
    const simDt = dt * scale;
    // Fixed-rate simulation first, then visuals on the (possibly slowed) delta.
    this.physicsWorld?.step(simDt);
    scene.update(simDt, elapsed);
    this.rig.setTarget(scene.followTarget);
    const shake = scene.shakeAmount ?? 0;
    if (shake > 0) {
      this.rig.addShake(shake);
      scene.consumeShake?.();
    }
    this.rig.update(dt);

    this.postfx?.render(dt);
    this.perf.tick(dt, this.renderer);
    // Counters describe a single frame: read them in PerfMonitor, then clear.
    this.renderer.info.reset();
    this.quality.update();
  };

  private handleQualityChange(level: QualityLevel, preset: QualityPreset): void {
    if (!this.gameScene) return;
    applyShadowPreset(this.renderer, preset);
    this.gameScene.applyQuality(preset);
    this.postfx?.applyPreset(preset);
    this.resize();
    this.options.onQualityChange?.(level);
    console.info(`[quality] switched to ${level} (${preset.label})`);
  }

  /**
   * Camera obstruction probe: casts from the follow target towards the boom
   * direction. Returns the hit distance or Infinity.
   */
  private probeCamera(origin: Vector3, direction: Vector3, maxDistance: number): number {
    const scene = this.gameScene;
    if (!scene) return Number.POSITIVE_INFINITY;

    // Physics ray first: it matches the colliders the player actually bumps into
    // and is ~10× cheaper than traversing scene meshes.
    const exclusion = scene.getPlayerCollider?.() ?? null;
    const physicsHit = this.physicsWorld?.raycast(origin, direction, maxDistance, exclusion ?? undefined);
    if (physicsHit) return physicsHit.distance;

    // Fallback for scenes without physics (menus, debug scenes).
    this.raycaster.set(origin, direction);
    this.raycaster.near = 0.05;
    this.raycaster.far = maxDistance;
    const hits = this.raycaster.intersectObjects(scene.collisionObjects, false);
    const first = hits[0];
    return first ? first.distance : Number.POSITIVE_INFINITY;
  }

  private resize(): void {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    if (width === 0 || height === 0) return;
    resizeRenderer(this.renderer, this.quality.preset, width, height, window.devicePixelRatio || 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    // Composer works in CSS pixels and applies the pixel ratio itself.
    this.postfx?.setSize(width, height);
  }

  private installResizeHandlers(): void {
    const onResize = (): void => this.resize();
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    const observer =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => this.resize())
        : null;
    observer?.observe(this.canvas);
    this.cleanup.push(() => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      window.visualViewport?.removeEventListener('resize', onResize);
      observer?.disconnect();
    });
  }
}
