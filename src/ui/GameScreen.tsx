import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { gameHost } from '@/game/GameHost';
import { installDebugBridge } from '@/game/debug';
import { useGameStore } from '@/store/useGameStore';
import { PerfOverlay } from './components/PerfOverlay';
import { InputLayer } from '@/input';
import type { InteractionHint } from '@/input/types';
import { hapticImpact } from '@/telegram/haptic';
import { setCloseConfirmation } from '@/telegram/viewport';

/** Polls the scene for an interaction offer; cheap and only while in a run. */
function useInteractionHint(): InteractionHint | null {
  const [hint, setHint] = useState<InteractionHint | null>(null);

  useEffect(() => {
    const poll = (): void => {
      const next = gameHost.getInteractionHint();
      setHint((previous) => {
        if (previous === next) return previous;
        if (previous && next && previous.available === next.available && previous.label === next.label) {
          return previous;
        }
        return next;
      });
    };
    poll();
    const timer = window.setInterval(poll, 150);
    return () => window.clearInterval(timer);
  }, []);

  return hint;
}

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
 * In-run screen: HUD skeleton, touch controls and the pause path.
 *
 * The HUD values are static until the survival systems arrive (stage 8); the
 * input layer underneath is already the final one.
 */
export function GameScreen(): ReactElement {
  const setScreen = useGameStore((state) => state.setScreen);
  const interactionHint = useInteractionHint();

  useEffect(() => {
    setCloseConfirmation(true);
    return () => setCloseConfirmation(false);
  }, []);

  useEffect(() => installDebugBridge(() => gameHost.getDebugSnapshot()), []);

  const pauseToMenu = (): void => {
    hapticImpact('light');
    gameHost.setMoveInput({ x: 0, y: 0, magnitude: 0 });
    gameHost.pause();
    setScreen('menu');
  };

  return (
    <div className="safe-pad absolute inset-0 fade-enter">
      {/* Input surface sits under the HUD; HUD itself is pointer-transparent. */}
      <InputLayer interactionHint={interactionHint} />

      <div className="pointer-events-none relative z-30 flex items-start justify-between p-3">
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

      <div className="pointer-events-none absolute inset-x-0 bottom-[calc(var(--safe-bottom)+6px)] z-0 flex justify-center">
        <p className="hud-panel hud-outline px-3 py-1 text-center text-[11px] leading-snug text-[#9aa3ae]">
          Этап 2 · стик — движение, свайп — камера, пинч — зум, тап — удар
        </p>
      </div>
    </div>
  );
}
