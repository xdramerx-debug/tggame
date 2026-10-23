import type { ReactElement } from 'react';
import { motion } from 'framer-motion';
import type { RunSummary } from '@/game/scenes/DungeonScene';
import { hapticImpact } from '@/telegram/haptic';
import { audio } from '@/game/audio';

interface DeathScreenProps {
  readonly summary: RunSummary;
  /** Embers granted by this run (paid out by the meta store). */
  readonly reward: number;
  readonly onRestart: () => void;
  readonly onAltar: () => void;
  readonly onMenu: () => void;
}

function Stat({ label, value }: { readonly label: string; readonly value: string }): ReactElement {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[10px] uppercase tracking-widest text-[#5a6470]" data-testid={`death-${label}`}>
        {label}
      </span>
      <span className="hud-outline text-lg font-semibold text-[#e8e3d6]">{value}</span>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

/**
 * End-of-run screen.
 *
 * Shown while the engine loop is paused, so it costs no frames. The fade is
 * 200 ms (spec: no transition longer than 300 ms) and the buttons are 56 px
 * tall touch targets; both actions live in one row so a thumb can reach them.
 */
export function DeathScreen({ summary, reward, onRestart, onAltar, onMenu }: DeathScreenProps): ReactElement {
  const starved = summary.cause === 'starvation';
  const won = summary.cause === 'victory';
  return (
    <motion.div
      className="safe-pad absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 px-6"
      style={{
        background: won
          ? 'radial-gradient(ellipse at center, rgba(26,18,6,0.82) 0%, rgba(6,6,8,0.96) 70%)'
          : 'radial-gradient(ellipse at center, rgba(20,6,8,0.82) 0%, rgba(4,5,8,0.96) 70%)',
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      data-testid="death-screen"
    >
      <div className="text-center">
        {won ? (
          <h1 className="font-display text-3xl tracking-[0.16em] text-gold" data-testid="victory-title">
            СМОТРИТЕЛЬ ПОВЕРЖЕН
          </h1>
        ) : (
          <h1 className="font-display text-3xl tracking-[0.16em] text-[#c8342e]">ВЫ ПОГИБЛИ</h1>
        )}
        <p className="mt-1 text-[13px] text-[#9aa3ae]">
          {won ? 'Подземелье замолчало. Пока что.' : starved ? 'Голод оказался сильнее тьмы' : 'Подземелье забрало ещё одного'}
        </p>
      </div>

      <div className="hud-panel grid w-full max-w-md grid-cols-3 gap-y-3 px-4 py-3" data-testid="death-summary">
        <Stat label="Этаж" value={String(summary.floor)} />
        <Stat label="Убийств" value={String(summary.kills)} />
        <Stat label="Время" value={formatDuration(summary.seconds)} />
        <Stat label="Золото" value={String(summary.gold)} />
        <Stat label="Уровень" value={`${summary.level ?? 1} · ${summary.xp} xp`} />
        <Stat label="Предметы" value={String(summary.items)} />
      </div>

      <div className="hud-panel flex min-h-[48px] items-center gap-2 border-gold/60 px-4" data-testid="death-reward" data-embers={reward}>
        <span aria-hidden="true">🔥</span>
        <span className="hud-outline text-base font-semibold text-gold">+{reward}</span>
        <span className="text-[11px] uppercase tracking-widest text-[#9aa3ae]">углей в алтарь</span>
      </div>

      <div className="flex w-full max-w-md gap-3">
        <button
          type="button"
          className="hud-panel flex min-h-[56px] flex-1 items-center justify-center border-gold/80 text-base font-semibold text-gold active:scale-[0.97]"
          style={{ background: 'linear-gradient(180deg, rgba(201,162,39,0.22), rgba(0,0,0,0.65))' }}
          onPointerDown={() => hapticImpact('medium')}
          onClick={() => {
            audio.playSound('ui');
            onRestart();
          }}
          data-testid="death-restart"
        >
          Новый забег
        </button>
        <button
          type="button"
          className="hud-panel flex min-h-[56px] flex-1 items-center justify-center text-base text-[#e8e3d6] active:scale-[0.97]"
          onPointerDown={() => hapticImpact('light')}
          onClick={() => {
            audio.playSound('ui');
            onAltar();
          }}
          data-testid="death-altar"
        >
          Алтарь
        </button>
        <button
          type="button"
          className="hud-panel flex min-h-[56px] flex-1 items-center justify-center text-base text-[#e8e3d6] active:scale-[0.97]"
          onPointerDown={() => hapticImpact('light')}
          onClick={() => {
            audio.playSound('ui');
            onMenu();
          }}
          data-testid="death-menu"
        >
          В меню
        </button>
      </div>
    </motion.div>
  );
}
