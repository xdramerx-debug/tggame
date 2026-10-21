import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { useGameStore } from '@/store/useGameStore';
import type { InitStage } from '@/types/engine';

const STAGES: { stage: InitStage; label: string }[] = [
  { stage: 'engine', label: 'Движок' },
  { stage: 'textures', label: 'Текстуры' },
  { stage: 'models', label: 'Модели' },
  { stage: 'audio', label: 'Звук' },
];

const ORDER: InitStage[] = ['engine', 'textures', 'models', 'audio', 'ready'];

function stageIndex(stage: InitStage): number {
  const index = ORDER.indexOf(stage);
  return index < 0 ? 0 : index;
}

/** Splash: logo + real boot pipeline progress, never longer than the boot itself. */
export function SplashScreen(): ReactElement {
  const progress = useGameStore((state) => state.progress);
  const current = stageIndex(progress.stage);
  const [hint, setHint] = useState('Тени пробуждаются…');

  useEffect(() => {
    const timer = window.setTimeout(() => setHint('Поверните телефон горизонтально'), 2200);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div
      className="safe-pad fade-enter absolute inset-0 flex flex-col items-center justify-center gap-6"
      style={{ background: 'radial-gradient(circle at 50% 42%, #1e2a3a 0%, #0b0e14 68%)' }}
      data-testid="splash"
    >
      <div className="flex flex-col items-center gap-1">
        <h1
          className="font-display text-[13vw] leading-none tracking-[0.22em] text-gold sm:text-6xl"
          style={{ textShadow: '0 0 24px rgba(201,162,39,0.35), 0 4px 12px rgba(0,0,0,0.9)' }}
        >
          TENEBRIS
        </h1>
        <div className="gold-divider w-40" />
        <p className="hud-outline mt-2 text-xs tracking-[0.3em] text-[#9aa3ae]">ПОДЗЕМЕЛЬЕ ЖДЁТ</p>
      </div>

      <div className="w-[62%] max-w-md">
        <div
          className="h-2 w-full overflow-hidden rounded-full border border-black/70 bg-black/60"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress.progress * 100)}
        >
          <div
            className="h-full rounded-full transition-[width] duration-200 ease-out"
            style={{
              width: `${Math.round(progress.progress * 100)}%`,
              background: 'linear-gradient(90deg, #6b4e2e, #c9a227)',
            }}
          />
        </div>
        <ul className="mt-3 flex justify-between text-[11px] uppercase tracking-widest">
          {STAGES.map((item, index) => {
            const done = index < current;
            const active = index === current;
            return (
              <li
                key={item.stage}
                className={
                  done ? 'text-gold' : active ? 'text-[#e8e3d6]' : 'text-[#5a6470]'
                }
              >
                {done ? '✓ ' : active ? '• ' : ''}
                {item.label}
              </li>
            );
          })}
        </ul>
      </div>

      <p className="hud-outline max-h-8 text-center text-sm text-[#9aa3ae]">{hint}</p>
    </div>
  );
}
