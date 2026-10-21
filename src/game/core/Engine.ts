import { PerspectiveCamera, Raycaster, Scene } from 'three';
import type { Vector3, WebGLRenderer } from 'three';
import type { FrameStats, InitProgress, QualityLevel, QualityPreset } from '@/types/engine';
import type { GameScene } from '@/types/scene';
import { createRenderer, applyShadowPreset, resizeRenderer } from './Renderer';
import { QualityController } from './Quality';
import { PerfMonitor } from './PerfMonitor';
import { Loop } from './Loop';
import { CameraRig } from './CameraRig';
import { PostFX } from '@/game/visual/PostFX';
import { TestScene } from '@/game/scenes/TestScene';

export interface EngineOptions {
  readonly canvas: HTMLCanvasElement;
  readonly initialQuality?: QualityLevel;
  readonly onProgress?: (progress: InitProgress) => void;
  readonly onStats?: (stats: FrameStats) => void;
  readonly onQualityChange?: (level: QualityLevel) => void;
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
  private readonly raycaster = new Raycaster();
  private gameScene: GameScene | null = null;
  private postfx: PostFX | null = null;
  private cleanup: (() => void)[] = [];
  private disposed = false;
  private initialized = false;

  constructor(options: EngineOptions) {
    this.options = options;
    this.canvas = options.canvas;
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

  get qualityLevel(): QualityLevel {
    return this.quality.current;
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

    progress('textures', 0.3);
    const scene = new TestScene();
    this.gameScene = scene;
    this.scene.add(scene.root);
    scene.applyQuality(this.quality.preset);
    applyShadowPreset(this.renderer, this.quality.preset);
    await yieldToBrowser();

    progress('models', 0.55);
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

    progress('audio', 0.78);
    // TODO(stage-10): preload the procedural audio manifest before enabling the HUD.
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
    this.scene.clear();
    this.rendererBundle.dispose();
  }

  private readonly tick = (dt: number, elapsed: number): void => {
    const scene = this.gameScene;
    if (!scene) return;
    scene.update(dt, elapsed);
    this.rig.setTarget(scene.followTarget);
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
