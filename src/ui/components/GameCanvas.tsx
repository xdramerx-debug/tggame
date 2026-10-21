import { useEffect, useRef } from 'react';
import type { ReactElement } from 'react';
import { gameHost } from '@/game/GameHost';
import { useGameStore } from '@/store/useGameStore';
import { useSettingsStore } from '@/store/useSettingsStore';

/**
 * The one and only WebGL canvas.
 *
 * Mounted for the whole app session (even on menu screens) because creating a
 * WebGL context costs hundreds of milliseconds on mobile. Visibility is driven
 * by the active screen; pointer events are ignored unless we are in-game.
 */
export function GameCanvas(): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const screen = useGameStore((state) => state.screen);
  const setProgress = useGameStore((state) => state.setProgress);
  const setBooted = useGameStore((state) => state.setBooted);
  const setBootError = useGameStore((state) => state.setBootError);
  const setStats = useGameStore((state) => state.setStats);
  const setQuality = useGameStore((state) => state.setQuality);

  useEffect(() => {
    gameHost.setCallbacks({
      onProgress: (progress) => setProgress(progress),
      onStats: (stats) => setStats(stats),
      onQualityChange: (level) => setQuality(level),
    });
  }, [setProgress, setStats, setQuality]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    gameHost.attachCanvas(canvas);
    let cancelled = false;
    const boot = async (): Promise<void> => {
      try {
        const engine = await gameHost.boot();
        if (!cancelled) {
          setBooted(true);
          // Apply the persisted quality preference once the renderer exists.
          const preference = useSettingsStore.getState().quality;
          if (preference !== 'auto') engine.setQuality(preference);
          engine.pause();
        }
      } catch (error) {
        console.error('[boot] engine init failed', error);
        if (!cancelled) {
          setBootError(error instanceof Error ? error.message : 'Не удалось запустить 3D-движок');
          setBooted(true);
        }
      }
    };
    void boot();
    return () => {
      cancelled = true;
      gameHost.attachCanvas(null);
    };
  }, [setBooted, setBootError]);

  const visible = screen === 'game';

  return (
    <div
      className="pointer-events-none fixed inset-0 transition-opacity duration-200"
      style={{ opacity: visible ? 1 : 0 }}
      aria-hidden={!visible}
    >
      <canvas
        ref={canvasRef}
        id="game-canvas"
        className="h-full w-full"
        style={{ pointerEvents: visible ? 'auto' : 'none' }}
        data-testid="game-canvas"
      />
    </div>
  );
}
