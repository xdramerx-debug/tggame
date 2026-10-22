import { useCallback, useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { gameHost } from '@/game/GameHost';
import { installDebugBridge } from '@/game/debug';
import { useGameStore } from '@/store/useGameStore';
import { PerfOverlay } from './components/PerfOverlay';
import { InputLayer } from '@/input';
import type { InteractionHint } from '@/input/types';
import { hapticImpact } from '@/telegram/haptic';
import { setCloseConfirmation } from '@/telegram/viewport';
import { DangerVignette, HealthBar, useVitals } from './components/VitalsHud';
import { InventorySheet } from './InventorySheet';

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

function Bar({
  label,
  value,
  max = 100,
  color,
}: {
  readonly label: string;
  readonly value: number;
  readonly max?: number;
  readonly color: string;
}): ReactElement {
  return (
    <div className="flex items-center gap-1.5" aria-label={label}>
      <span className="w-4 text-[10px] font-bold uppercase tracking-wider text-[#9aa3ae]">{label}</span>
      <HealthBar value={value} max={max} color={color} />
    </div>
  );
}

/**
 * In-run screen: HUD skeleton, touch controls and the pause path.
 *
 * The HUD values are static until the survival systems arrive (stage 8); the
 * input layer underneath is already the final one.
 */
/** Short-lived toast in the upper third; never blocks input (200 ms fade). */
function HudToast(): ReactElement | null {
  const message = useGameStore((state) => state.message);
  const clearMessage = useGameStore((state) => state.clearMessage);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => clearMessage(), 1800);
    return () => window.clearTimeout(timer);
  }, [message, clearMessage]);

  if (!message) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-[22%] z-40 flex justify-center">
      <p key={message.id} className="fade-enter hud-panel hud-outline px-4 py-2 text-center text-[13px] font-semibold text-gold">
        {message.text}
      </p>
    </div>
  );
}

export function GameScreen(): ReactElement {
  const setScreen = useGameStore((state) => state.setScreen);
  const interactionHint = useInteractionHint();
  const vitals = useVitals();
  const [inventoryOpen, setInventoryOpen] = useState(false);

  useEffect(() => {
    setCloseConfirmation(true);
    return () => setCloseConfirmation(false);
  }, []);

  useEffect(() => installDebugBridge(() => gameHost.getDebugSnapshot()), []);

  // Dev-only collider wireframes (`?physics=1`) and a training dummy (`?dummy=1`).
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const params = new URLSearchParams(window.location.search);
    gameHost.setPhysicsDebug(params.get('physics') === '1');
    if (params.get('dummy') === '1') gameHost.spawnDummy();
  }, []);

  // The bag pauses the run: the panel is modal and the player must not be hit
  // while reading item stats.
  const openInventory = useCallback((): void => {
    hapticImpact('light');
    setInventoryOpen(true);
    gameHost.setMoveInput({ x: 0, y: 0, magnitude: 0 });
    gameHost.pause();
  }, []);

  const closeInventory = useCallback((): void => {
    setInventoryOpen(false);
    gameHost.resume();
  }, []);

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
          <Bar label="HP" value={vitals.hp} max={vitals.maxHp} color="linear-gradient(90deg,#7d1f1f,#b33a3a)" />
          <Bar label="ST" value={vitals.stamina} color="linear-gradient(90deg,#2f5c52,#4a7c8c)" />
          <Bar label="HG" value={64} color="linear-gradient(90deg,#6b4e2e,#c9a227)" />
          <div className="mt-0.5 flex items-center gap-2">
            <span className="text-[11px] font-semibold text-gold">Lv.1</span>
            <span className="text-[10px] uppercase tracking-widest text-[#5a6470]" data-testid="floor-label">
              Этаж {vitals.floor}
            </span>
            <span className="text-[10px] uppercase tracking-widest text-[#5a6470]" data-testid="kill-label">
              ☠ {vitals.kills}
            </span>
            <span className="text-[10px] uppercase tracking-widest text-gold/80" data-testid="gold-label">
              ◈ {vitals.gold}
            </span>
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
            className="hud-panel relative flex h-[48px] w-[48px] items-center justify-center text-lg active:scale-95"
            aria-label={`Инвентарь, предметов: ${vitals.items}`}
            onPointerDown={() => hapticImpact('light')}
            onClick={openInventory}
            data-testid="inventory-button"
          >
            🎒
            {vitals.items > 0 ? (
              <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-gold px-1 text-[10px] font-bold leading-[18px] text-black">
                {vitals.items}
              </span>
            ) : null}
          </button>
        </div>
      </div>

      <InventorySheet open={inventoryOpen} onClose={closeInventory} />
      <DangerVignette hp={vitals.hp} maxHp={vitals.maxHp} />
      <HudToast />
      <PerfOverlay />

      <div className="pointer-events-none absolute inset-x-0 bottom-[calc(var(--safe-bottom)+6px)] z-0 flex justify-center">
        <p className="hud-panel hud-outline px-3 py-1 text-center text-[11px] leading-snug text-[#9aa3ae]">
          Этап 7 · лут и снаряжение · ?seed=42 · ?quality=low
        </p>
      </div>
    </div>
  );
}
