import type { QualityLevel } from '@/types/engine';
import type { DebugSceneSnapshot } from '@/types/scene';

export type { DebugSceneSnapshot };

/** Read-only diagnostics exposed to dev tooling and Playwright. */
export interface DebugSnapshot {
  readonly camera: { readonly yaw: number; readonly pitch: number; readonly distance: number };
  readonly scene: DebugSceneSnapshot;
  readonly quality: QualityLevel;
  readonly fps: number;
  /** Fixed physics steps executed since boot (proves the simulation advances). */
  readonly physicsSteps: number;
}

interface TenebrisBridge {
  getState: () => DebugSnapshot | null;
  version: string;
}

declare global {
  interface Window {
    __TENEBRIS__?: TenebrisBridge;
  }
}

/**
 * Publishes a read-only snapshot on `window.__TENEBRIS__` so Playwright can
 * assert camera/hero state without reaching into React internals.
 * Development builds only — production bundles never install the bridge.
 */
export function installDebugBridge(getState: () => DebugSnapshot | null): () => void {
  if (!import.meta.env.DEV) return () => undefined;
  window.__TENEBRIS__ = { getState, version: '0.3.0' };
  return () => {
    if (window.__TENEBRIS__?.getState === getState) delete window.__TENEBRIS__;
  };
}
