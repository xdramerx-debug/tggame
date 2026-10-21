import type { QualityLevel, QualityPreset } from '@/types/engine';

/**
 * Presets from the tech spec. Keep them in one place: renderer, post-processing,
 * lights and particle systems all read from the active preset instead of
 * scattering magic numbers around the codebase.
 */
export const QUALITY_PRESETS: Readonly<Record<QualityLevel, QualityPreset>> = {
  high: {
    level: 'high',
    label: 'Высокое',
    shadowMapSize: 2048,
    ssao: true,
    bloom: true,
    particleRatio: 1,
    renderScale: 1,
    maxPixelRatio: 2,
    downgradeBelowFps: 45,
    upgradeAboveFps: 58,
    targetFps: 60,
    maxPointLights: 4,
    anisotropy: 4,
  },
  medium: {
    level: 'medium',
    label: 'Среднее',
    shadowMapSize: 1024,
    ssao: false,
    bloom: true,
    particleRatio: 0.6,
    renderScale: 0.85,
    maxPixelRatio: 1.75,
    downgradeBelowFps: 45,
    upgradeAboveFps: 55,
    targetFps: 50,
    maxPointLights: 4,
    anisotropy: 2,
  },
  low: {
    level: 'low',
    label: 'Низкое',
    shadowMapSize: 0,
    ssao: false,
    bloom: false,
    particleRatio: 0.4,
    renderScale: 0.7,
    maxPixelRatio: 1.5,
    downgradeBelowFps: 30,
    upgradeAboveFps: 48,
    targetFps: 30,
    maxPointLights: 2,
    anisotropy: 1,
  },
};

export const QUALITY_ORDER: readonly QualityLevel[] = ['low', 'medium', 'high'];

/** Next tier in the given direction, or `null` when already at the edge. */
export function stepQuality(level: QualityLevel, direction: 'up' | 'down'): QualityLevel | null {
  const index = QUALITY_ORDER.indexOf(level);
  const nextIndex = direction === 'up' ? index + 1 : index - 1;
  return QUALITY_ORDER[nextIndex] ?? null;
}

export interface QualityDecisionInput {
  readonly current: QualityLevel;
  /** Smoothed FPS of the last window. */
  readonly fps: number;
  /** Seconds spent at the current tier; prevents oscillation right after a switch. */
  readonly secondsAtTier: number;
  /** True when the app is paused/backgrounded — never switch while paused. */
  readonly paused: boolean;
  /** At least this many seconds must pass after a switch before another one. */
  readonly cooldownSec?: number;
}

/**
 * Pure decision function for adaptive quality.
 *
 * Rules (from the spec, plus anti-oscillation):
 * - FPS < 45 (downgrade threshold of the current preset) for ≥2 s → go down one tier.
 * - FPS > upgrade threshold for ≥6 s → go up one tier (only if headroom exists).
 * - Never switch while paused or during the cooldown window (4 s).
 */
export function decideQuality(input: QualityDecisionInput): QualityLevel | null {
  const { current, fps, secondsAtTier, paused } = input;
  const cooldownSec = input.cooldownSec ?? 4;
  if (paused || secondsAtTier < cooldownSec) return null;

  const preset = QUALITY_PRESETS[current];
  if (fps <= 0) return null;

  if (fps < preset.downgradeBelowFps && secondsAtTier >= 2) {
    return stepQuality(current, 'down');
  }
  if (fps > preset.upgradeAboveFps && secondsAtTier >= 6) {
    return stepQuality(current, 'up');
  }
  return null;
}

/** Effective backing-store size for a viewport, clamped by preset and device limits. */
export function computeRenderSize(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number,
  preset: QualityPreset,
): { width: number; height: number; pixelRatio: number } {
  const pixelRatio = Math.min(devicePixelRatio || 1, preset.maxPixelRatio) * preset.renderScale;
  return {
    width: Math.max(1, Math.floor(cssWidth * pixelRatio)),
    height: Math.max(1, Math.floor(cssHeight * pixelRatio)),
    pixelRatio,
  };
}

export interface QualityControllerOptions {
  readonly initial: QualityLevel;
  readonly onChange: (level: QualityLevel, preset: QualityPreset) => void;
  readonly getFps: () => number;
  readonly isPaused: () => boolean;
  /** Injected clock (ms) so the controller is testable without timers. */
  readonly now?: () => number;
}

/**
 * Stateful wrapper around {@link decideQuality}. Tracks how long the app has
 * been running at the current tier and only asks for a switch when the pure
 * decision function says so.
 */
export class QualityController {
  private level: QualityLevel;
  private tierSinceMs: number;
  private lastSwitchMs: number;
  private readonly now: () => number;

  constructor(private readonly options: QualityControllerOptions) {
    this.level = options.initial;
    this.now = options.now ?? (() => performance.now());
    this.tierSinceMs = this.now();
    // No switch has happened yet: allow the first auto-decision immediately.
    this.lastSwitchMs = Number.NEGATIVE_INFINITY;
  }

  get current(): QualityLevel {
    return this.level;
  }

  get preset(): QualityPreset {
    return QUALITY_PRESETS[this.level];
  }

  /** Called once per frame; cheap (a few comparisons). */
  update(): void {
    const nowMs = this.now();
    const next = decideQuality({
      current: this.level,
      fps: this.options.getFps(),
      secondsAtTier: (nowMs - this.tierSinceMs) / 1000,
      paused: this.options.isPaused(),
      cooldownSec: 4,
    });
    if (!next || next === this.level) return;
    // Extra guard: never bounce between tiers faster than 8 s.
    if (nowMs - this.lastSwitchMs < 8000) return;
    this.apply(next, nowMs);
  }

  /** Force a tier (settings screen / debug). */
  setLevel(level: QualityLevel): void {
    if (level === this.level) return;
    this.apply(level, this.now());
  }

  private apply(level: QualityLevel, nowMs: number): void {
    this.level = level;
    this.tierSinceMs = nowMs;
    this.lastSwitchMs = nowMs;
    this.options.onChange(level, QUALITY_PRESETS[level]);
  }
}
