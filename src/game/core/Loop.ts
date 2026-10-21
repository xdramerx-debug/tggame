/** Callback invoked once per animation frame. */
export type FrameCallback = (dtSeconds: number, elapsedSeconds: number) => void;

/** Maximum frame delta we forward; prevents physics explosions after a tab stall. */
const MAX_DT = 0.1;

/**
 * requestAnimationFrame loop with pause/resume and delta clamping.
 *
 * Deliberately tiny: game systems receive `dt` and are responsible for their own
 * fixed-step accumulators. Pausing stops RAF entirely (battery + thermal).
 */
export class Loop {
  private rafId: number | null = null;
  private lastTime = 0;
  private elapsed = 0;
  private paused = false;
  private callback: FrameCallback | null = null;

  get isRunning(): boolean {
    return this.rafId !== null;
  }

  get isPaused(): boolean {
    return this.paused;
  }

  start(callback: FrameCallback): void {
    this.callback = callback;
    if (this.rafId !== null) return;
    this.lastTime = performance.now();
    this.paused = false;
    this.rafId = requestAnimationFrame(this.tick);
  }

  pause(): void {
    this.paused = true;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  resume(): void {
    if (!this.callback || this.rafId !== null) return;
    this.paused = false;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.pause();
    this.callback = null;
  }

  private readonly tick = (now: number): void => {
    if (this.paused) return;
    this.rafId = requestAnimationFrame(this.tick);
    const raw = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (raw <= 0) return;
    const dt = Math.min(raw, MAX_DT);
    this.elapsed += dt;
    this.callback?.(dt, this.elapsed);
  };
}
