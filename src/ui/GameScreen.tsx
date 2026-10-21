import { useEffect } from 'react';
import type { ReactElement } from 'react';
import { gameHost } from '@/game/GameHost';
import { useGameStore } from '@/store/useGameStore';
import { PerfOverlay } from './components/PerfOverlay';
import { useDevCameraDrag } from './hooks/useDevCameraDrag';
import { hapticImpact } from '@/telegram/haptic';
import { setCloseConfirmation } from '@/telegram/viewport';

function Bar({ label, value, color }: { readonly label: string; readonly value: number; readonly color: string }): ReactElement {
  return (
    <div className="flex items-center gap-1.5" aria-label={label}>
      <span className="w-4 text-[10px] font-bold uppercase tracking-wider text-[#9aa3ae]">{label}</span>
      <div className="h-2.5 w-[15vw] max-w-[130px] overflow-hidden rounded-sm border border-black/80 bg-black/70">
        <div className="h-full transition-[width] duration-200" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}

/**
 * In-run screen. Stage 1 shows the test arena, a read-only HUD skeleton and the
 * pause path; the full HUD arrives with the combat loop (stages 6–8).
 */
export function GameScreen(): ReactElement {
  const setScreen = useGameStore((state) => state.setScreen);

  useDevCameraDrag(true);

  useEffect(() => {
    setCloseConfirmation(true);
    return () => setCloseConfirmation(false);
  }, []);

  const pauseToMenu = (): void => {
    hapticImpact('light');
    gameHost.pause();
    setScreen('menu');
  };

  return (
    <div className="safe-pad pointer-events-none absolute inset-0 fade-enter">
      <div className="flex items-start justify-between p-3">
        <div className="hud-panel flex flex-col gap-1.5 px-2.5 py-2" style={{ opacity: 'var(--hud-opacity)' }}>
          <Bar label="HP" value={100} color="linear-gradient(90deg,#7d1f1f,#b33a3a)" />
          <Bar label="ST" value={82} color="linear-gradient(90deg,#2f5c52,#4a7c8c)" />
          <Bar label="HG" value={64} color="linear-gradient(90deg,#6b4e2e,#c9a227)" />
          <div className="mt-0.5 flex items-center gap-2">
            <span className="text-[11px] font-semibold text-gold">Lv.1</span>
            <span className="text-[10px] uppercase tracking-widest text-[#5a6470]">Тест-арена</span>
          </div>
        </div>

        <div className="pointer-events-auto flex gap-2">
          <button
            type="button"
            className="hud-panel flex h-[48px] w-[48px] items-center justify-center text-lg active:scale-95"
            aria-label="Меню"
            onPointerDown={() => hapticImpact('light')}
            onClick={pauseToMenu}
            data-testid="pause-button"
          >
            ☰
          </button>
          <button
            type="button"
            className="hud-panel flex h-[48px] w-[48px] items-center justify-center text-lg opacity-40"
            aria-label="Инвентарь (откроется на этапе 7)"
            aria-disabled="true"
            disabled
          >
            🎒
          </button>
        </div>
      </div>

      <PerfOverlay />

      <div className="pointer-events-none absolute inset-x-0 bottom-[calc(var(--safe-bottom)+10px)] flex justify-center">
        <p className="hud-panel hud-outline px-3 py-1 text-center text-[11px] leading-snug text-[#9aa3ae]">
          Этап 1 · тестовая сцена. Камера: свайп (dev) · джойстик и кнопки — этап 2
        </p>
      </div>
    </div>
  );
}
