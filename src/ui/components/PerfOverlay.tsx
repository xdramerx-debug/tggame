import type { ReactElement } from 'react';
import { useGameStore } from '@/store/useGameStore';

const QUALITY_LABEL: Record<string, string> = { high: 'HIGH', medium: 'MED', low: 'LOW' };

function isEnabled(): boolean {
  if (import.meta.env.DEV) return new URLSearchParams(window.location.search).get('perf') !== '0';
  return new URLSearchParams(window.location.search).get('perf') === '1';
}

/**
 * Dev-only performance HUD (spec: FPS log in dev builds).
 * Reads throttled stats from the store — it never touches the render loop.
 */
export function PerfOverlay(): ReactElement | null {
  const stats = useGameStore((state) => state.stats);
  const screen = useGameStore((state) => state.screen);
  if (!isEnabled() || !stats || screen !== 'game') return null;

  const fpsColor = stats.fps >= 50 ? '#7fc47f' : stats.fps >= 35 ? '#c9a227' : '#b33a3a';

  return (
    <div
      className="hud-panel pointer-events-none absolute left-1/2 top-[calc(var(--safe-top)+8px)] z-20 -translate-x-1/2 px-3 py-1.5 font-mono text-[11px] leading-tight text-[#c8ccd2]"
      data-testid="perf-overlay"
    >
      <div className="flex items-center gap-3">
        <span style={{ color: fpsColor }}>{stats.fps.toFixed(1)} FPS</span>
        <span>{stats.frameMs.toFixed(1)} ms</span>
        <span>worst {stats.worstFrameMs.toFixed(0)}</span>
        <span>{stats.drawCalls} calls</span>
        <span>{(stats.triangles / 1000).toFixed(1)}k tris</span>
        <span className="text-gold">{QUALITY_LABEL[stats.quality] ?? stats.quality}</span>
      </div>
    </div>
  );
}
