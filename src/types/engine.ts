/** Quality tiers the renderer can switch between at runtime. */
export type QualityLevel = 'high' | 'medium' | 'low';

/** Static knobs of a single quality tier. All values are mobile-calibrated. */
export interface QualityPreset {
  readonly level: QualityLevel;
  readonly label: string;
  /** Shadow map edge in pixels; 0 disables the shadow pass entirely. */
  readonly shadowMapSize: 0 | 512 | 1024 | 2048;
  readonly ssao: boolean;
  readonly bloom: boolean;
  /** Fraction of particle budget that may be alive at once. */
  readonly particleRatio: number;
  /** Backing-store multiplier (0.7 = render at 70% and upscale). */
  readonly renderScale: number;
  /** Hard cap for devicePixelRatio to protect fill-rate on retina phones. */
  readonly maxPixelRatio: number;
  /** FPS below which the controller downgrades after the settle window. */
  readonly downgradeBelowFps: number;
  /** FPS above which an upgrade is considered. */
  readonly upgradeAboveFps: number;
  /** Animation/UI target used by the frame governor. */
  readonly targetFps: number;
  readonly maxPointLights: number;
  readonly anisotropy: number;
}

/** Asset pipeline stages shown on the splash screen. */
export type InitStage = 'engine' | 'textures' | 'models' | 'audio' | 'ready';

export interface InitProgress {
  readonly stage: InitStage;
  /** 0..1 within the whole pipeline. */
  readonly progress: number;
  readonly detail?: string;
}

/** Snapshot of runtime performance, consumed by the dev overlay and auto-quality. */
export interface FrameStats {
  readonly fps: number;
  /** Exponential moving average of frame time in ms. */
  readonly frameMs: number;
  /** Worst frame observed during the last sampling window, ms. */
  readonly worstFrameMs: number;
  readonly drawCalls: number;
  readonly triangles: number;
  readonly programs: number;
  readonly textures: number;
  readonly memoryMb: number;
  readonly quality: QualityLevel;
  /** True while the quality controller is deliberately holding a tier switch. */
  readonly settling: boolean;
}
