import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import { gameHost } from '@/game/GameHost';

export interface BossState {
  readonly name: string;
  readonly ratio: number;
  readonly phase: number;
}

/** Polls the scene at 8 Hz: a health bar does not need every frame on mobile. */
function useBossState(): BossState | null {
  const [state, setState] = useState<BossState | null>(null);

  useEffect(() => {
    const poll = (): void => {
      const next = gameHost.getBossState();
      setState((previous) => {
        if (previous === null && next === null) return previous;
        if (previous && next && Math.abs(previous.ratio - next.ratio) < 0.002 && previous.phase === next.phase) {
          return previous;
        }
        return next;
      });
    };
    poll();
    const timer = window.setInterval(poll, 125);
    return () => window.clearInterval(timer);
  }, []);

  return state;
}

/**
 * Boss health bar pinned under the top HUD.
 *
 * Deliberately slim and non-interactive: it must never cover the boss body on a
 * landscape phone, where the top 15 % of the screen is the only free space.
 * Phase dots fill with each enrage step so the player can read the escalation
 * without another toast.
 */
export function BossBar(): ReactElement | null {
  const boss = useBossState();
  if (!boss) return null;
  const percent = Math.max(0, Math.min(100, boss.ratio * 100));

  return (
    <div
      className="pointer-events-none absolute left-1/2 top-[6%] z-30 w-[46vw] max-w-md -translate-x-1/2"
      data-testid="boss-bar"
      data-phase={boss.phase}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="hud-outline truncate text-[12px] font-semibold uppercase tracking-[0.16em] text-[#e8b4a6]">
          {boss.name}
        </span>
        <div className="flex gap-1" aria-hidden="true">
          {[1, 2, 3].map((step) => (
            <span
              key={step}
              className={`h-1.5 w-1.5 rounded-full ${boss.phase >= step - 1 ? 'bg-[#c8342e]' : 'bg-white/20'}`}
            />
          ))}
        </div>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full border border-[#5a1c18] bg-black/70">
        <div
          className="h-full rounded-full transition-[width] duration-200"
          style={{
            width: `${percent}%`,
            background: 'linear-gradient(90deg, #7d1a16, #c8342e 60%, #e8703f)',
          }}
        />
      </div>
    </div>
  );
}
