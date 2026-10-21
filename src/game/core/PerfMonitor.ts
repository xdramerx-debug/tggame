import type { WebGLRenderer } from 'three';
import type { FrameStats, QualityLevel } from '@/types/engine';

export interface PerfMonitorOptions {
  /** Called at most 4 times per second with a fresh snapshot. */
  readonly onStats?: (stats: FrameStats) => void;
  /** Sampling window in ms. */
  readonly windowMs?: number;
  readonly quality?: () => QualityLevel;
}

interface PerformanceMemory {
  readonly usedJSHeapSize: number;
}

/**
 * Frame-time accountant.
 *
 * Uses a fixed sampling window instead of per-frame EMA: window FPS is stable
 * on 60/90/120 Hz screens and does not feed a single long frame into the
 * auto-quality decision. The first second after `reset()` is discarded because
 * shader compilation and texture upload produce deliberate spikes.
 */
export class PerfMonitor {
  private frames = 0;
  private windowStart = 0;
  private worstFrameMs = 0;
  private smoothedFps = 0;
  private started = false;
  private lastDrawCalls = 0;
  private lastTriangles = 0;
  private lastPrograms = 0;
  private lastTextures = 0;
  private readonly windowMs: number;
  private lastStats: FrameStats = {
    fps: 0,
    frameMs: 0,
    worstFrameMs: 0,
    drawCalls: 0,
    triangles: 0,
    programs: 0,
    textures: 0,
    memoryMb: 0,
    quality: 'medium',
    settling: false,
  };

  constructor(private readonly options: PerfMonitorOptions = {}) {
    this.windowMs = options.windowMs ?? 500;
  }

  /** Smoothed FPS used by the auto-quality controller. */
  get fps(): number {
    return this.smoothedFps;
  }

  get stats(): FrameStats {
    return this.lastStats;
  }

  reset(): void {
    this.frames = 0;
    this.worstFrameMs = 0;
    this.windowStart = 0;
    this.started = false;
    this.smoothedFps = 0;
  }

  /**
   * Records one rendered frame.
   * @param dtSeconds frame delta reported by the loop
   * @param renderer renderer to read draw-call/triangle counters from
   */
  tick(dtSeconds: number, renderer: WebGLRenderer): void {
    const now = performance.now();
    if (!this.started) {
      this.started = true;
      this.windowStart = now;
      return;
    }

    this.frames += 1;
    // Renderer counters are reset by the engine after every tick, so the values
    // here describe the frame that was just rendered.
    const info = renderer.info;
    this.lastDrawCalls = info.render.calls;
    this.lastTriangles = info.render.triangles;
    this.lastPrograms = info.programs?.length ?? 0;
    this.lastTextures = info.memory.textures;

    const frameMs = dtSeconds * 1000;
    if (frameMs > this.worstFrameMs) this.worstFrameMs = frameMs;

    const elapsed = now - this.windowStart;
    if (elapsed < this.windowMs) return;

    const windowFps = (this.frames * 1000) / elapsed;
    // Ignore the very first window: it usually contains compile/upload stalls.
    const isFirstWindow = this.smoothedFps === 0;
    this.smoothedFps = isFirstWindow ? windowFps : this.smoothedFps * 0.55 + windowFps * 0.45;

    const memory = (performance as Performance & { memory?: PerformanceMemory }).memory;
    const memoryMb = memory ? Math.round((memory.usedJSHeapSize / (1024 * 1024)) * 10) / 10 : 0;

    this.lastStats = {
      fps: Math.round(this.smoothedFps * 10) / 10,
      frameMs: Math.round((elapsed / Math.max(1, this.frames)) * 10) / 10,
      worstFrameMs: Math.round(this.worstFrameMs * 10) / 10,
      drawCalls: this.lastDrawCalls,
      triangles: this.lastTriangles,
      programs: this.lastPrograms,
      textures: this.lastTextures,
      memoryMb,
      quality: this.options.quality?.() ?? 'medium',
      settling: false,
    };
    this.options.onStats?.(this.lastStats);

    this.frames = 0;
    this.worstFrameMs = 0;
    this.windowStart = now;
  }
}
