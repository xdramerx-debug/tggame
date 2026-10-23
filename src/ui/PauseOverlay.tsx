import type { ReactElement } from 'react';
import { motion } from 'framer-motion';
import { hapticImpact } from '@/telegram/haptic';
import { audio } from '@/game/audio';
import { useBackButton } from '@/telegram/useBackButton';

interface PauseOverlayProps {
  readonly open: boolean;
  readonly floor: number;
  readonly level: number;
  readonly kills: number;
  readonly onResume: () => void;
  readonly onSettings: () => void;
  readonly onMenu: () => void;
}

/**
 * Pause overlay.
 *
 * The engine stops the RAF loop while this is open (zero battery cost), so it has
 * to offer everything a player might need mid-run without forcing them to quit:
 * resume, settings (sound, quality) and the way out. The run itself is not saved —
 * "В меню" abandons it, which is why the destructive button is last, quiet and
 * visually separated from "Продолжить".
 *
 * Animation is 180 ms; nothing here blocks input longer than that.
 */
export function PauseOverlay({
  open,
  floor,
  level,
  kills,
  onResume,
  onSettings,
  onMenu,
}: PauseOverlayProps): ReactElement | null {
  // Native back arrow = "resume": leaving the run needs the explicit button.
  useBackButton(open ? onResume : null);
  if (!open) return null;
  return (
    <motion.div
      className="absolute inset-0 z-40 flex items-center justify-center px-6"
      style={{ background: 'radial-gradient(ellipse at center, rgba(8,10,14,0.82) 0%, rgba(3,4,6,0.94) 75%)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
      data-testid="pause-overlay"
    >
      <div className="hud-panel flex w-full max-w-md flex-col gap-3 px-5 py-5">
        <div className="flex items-baseline justify-between">
          <h2 className="hud-outline text-lg font-semibold tracking-[0.16em] text-gold">ПАУЗА</h2>
          <span className="text-[11px] uppercase tracking-widest text-[#5a6470]">
            этаж {floor} · ур. {level} · ☠ {kills}
          </span>
        </div>

        <button
          type="button"
          className="hud-panel flex min-h-[56px] items-center justify-center border-gold/80 text-base font-semibold text-gold active:scale-[0.97]"
          style={{ background: 'linear-gradient(180deg, rgba(201,162,39,0.22), rgba(0,0,0,0.65))' }}
          onPointerDown={() => hapticImpact('medium')}
          onClick={() => {
            audio.playSound('ui');
            onResume();
          }}
          data-testid="pause-resume"
        >
          Продолжить
        </button>

        <button
          type="button"
          className="hud-panel flex min-h-[56px] items-center justify-center text-base text-[#e8e3d6] active:scale-[0.97]"
          onPointerDown={() => hapticImpact('light')}
          onClick={() => {
            audio.playSound('ui');
            onSettings();
          }}
          data-testid="pause-settings"
        >
          Настройки
        </button>

        <button
          type="button"
          className="mt-1 flex min-h-[48px] items-center justify-center rounded-lg border border-white/5 text-sm text-[#9aa3ae] active:scale-[0.97]"
          onPointerDown={() => hapticImpact('light')}
          onClick={() => {
            audio.playSound('ui');
            onMenu();
          }}
          data-testid="pause-menu"
        >
          В меню (забег будет потерян)
        </button>
      </div>
    </motion.div>
  );
}
