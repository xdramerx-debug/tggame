import type { FrameStats, InitProgress, QualityLevel } from '@/types/engine';
import type { InputAction, InteractionHint, MoveInput } from '@/input/types';
import type { DebugSnapshot } from '@/game/debug';
import { Engine } from './core/Engine';
import { hapticSelection } from '@/telegram/haptic';

export interface GameHostCallbacks {
  readonly onProgress?: (progress: InitProgress) => void;
  readonly onStats?: (stats: FrameStats) => void;
  readonly onQualityChange?: (level: QualityLevel) => void;
  readonly onMessage?: (message: string) => void;
}

/**
 * Singleton that owns the WebGL canvas and the engine across React screens.
 *
 * React must not remount the canvas: every remount would recreate the WebGL
 * context (300–800 ms on mobile). The canvas is mounted once by `<GameCanvas>`
 * and the engine lives here for the whole session.
 */
class GameHost {
  private engine: Engine | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private bootPromise: Promise<Engine> | null = null;
  private callbacks: GameHostCallbacks = {};
  private pendingQuality: QualityLevel | null = null;

  setCallbacks(callbacks: GameHostCallbacks): void {
    this.callbacks = callbacks;
  }

  /** Called by the canvas element's ref callback; keeps the host in sync. */
  attachCanvas(canvas: HTMLCanvasElement | null): void {
    this.canvas = canvas;
  }

  get isBooted(): boolean {
    return this.engine !== null;
  }

  getEngine(): Engine | null {
    return this.engine;
  }

  /**
   * Creates the engine once. Concurrent calls share the same promise.
   * @throws if the canvas is not mounted or WebGL is unavailable
   */
  boot(initialQuality: QualityLevel = 'medium'): Promise<Engine> {
    if (this.engine) return Promise.resolve(this.engine);
    if (this.bootPromise) return this.bootPromise;
    const canvas = this.canvas;
    if (!canvas) return Promise.reject(new Error('GameHost: canvas is not attached'));

    this.bootPromise = (async () => {
      const engine = new Engine({
        canvas,
        initialQuality: this.pendingQuality ?? initialQuality,
        onProgress: (progress) => this.callbacks.onProgress?.(progress),
        onStats: (stats) => this.callbacks.onStats?.(stats),
        onQualityChange: (level) => {
          this.callbacks.onQualityChange?.(level);
          hapticSelection();
        },
        onMessage: (message) => this.callbacks.onMessage?.(message),
      });
      await engine.init();
      if (this.pendingQuality) engine.setQuality(this.pendingQuality);
      this.engine = engine;
      return engine;
    })();

    return this.bootPromise.catch((error: unknown) => {
      this.bootPromise = null;
      throw error;
    });
  }

  start(): void {
    this.engine?.start();
  }

  pause(): void {
    this.engine?.pause();
  }

  resume(): void {
    this.engine?.resume();
  }

  setQuality(level: QualityLevel): void {
    this.pendingQuality = level;
    this.engine?.setQuality(level);
  }

  rotateCamera(dx: number, dy: number): void {
    this.engine?.rotateCamera(dx, dy);
  }

  zoomCamera(factor: number): void {
    this.engine?.zoomCamera(factor);
  }

  setMoveInput(input: MoveInput): void {
    this.engine?.setMoveInput(input);
  }

  triggerAction(action: InputAction): void {
    this.engine?.triggerAction(action);
  }

  getInteractionHint(): InteractionHint | null {
    return this.engine?.getInteractionHint() ?? null;
  }

  /** Dev-only: spawn one training skeleton in front of the player. */
  spawnDummy(): void {
    this.engine?.debugSpawnDummy();
  }

  /** Dev-only: toggle Rapier collider wireframes. */
  setPhysicsDebug(enabled: boolean): void {
    this.engine?.setPhysicsDebug(enabled);
  }

  /** Diagnostics consumed by the dev bridge (Playwright + manual checks). */
  getDebugSnapshot(): DebugSnapshot | null {
    const engine = this.engine;
    const scene = engine?.getDebugSceneSnapshot();
    if (!engine || !scene) return null;
    const stats = engine.getStats();
    return {
      camera: {
        yaw: engine.rig.yaw,
        pitch: engine.rig.pitch,
        distance: engine.rig.distance,
      },
      scene,
      quality: engine.qualityLevel,
      fps: stats?.fps ?? 0,
      physicsSteps: engine.getPhysicsStepCount(),
    };
  }

  dispose(): void {
    this.engine?.dispose();
    this.engine = null;
    this.bootPromise = null;
  }
}

export const gameHost = new GameHost();
