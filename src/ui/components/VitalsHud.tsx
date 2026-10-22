import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { gameHost } from '@/game/GameHost';

export interface Vitals {
  readonly hp: number;
  readonly maxHp: number;
  readonly stamina: number;
  readonly kills: number;
  readonly deaths: number;
  readonly floor: number;
  readonly enemies: number;
  readonly gold: number;
  readonly items: number;
}

const INITIAL: Vitals = {
  hp: 100,
  maxHp: 100,
  stamina: 100,
  kills: 0,
  deaths: 0,
  floor: 1,
  enemies: 0,
  gold: 0,
  items: 0,
};

/**
 * Polls combat vitals for the HUD.
 *
 * The engine writes into WebGL from its own loop and must never re-render React
 * per frame, so the HUD samples the debug snapshot on a 10 Hz timer instead.
 * Values are rounded and de-duplicated, which keeps React at a couple of
 * renders per second during a fight.
 */
export function useVitals(): Vitals {
  const [vitals, setVitals] = useState<Vitals>(INITIAL);

  useEffect(() => {
    const poll = (): void => {
      const snapshot = gameHost.getDebugSnapshot();
      const scene = snapshot?.scene;
      if (!scene) return;
      const next: Vitals = {
        hp: Math.round(scene.hp ?? INITIAL.hp),
        maxHp: Math.round(scene.maxHp ?? INITIAL.maxHp),
        stamina: Math.round(scene.stamina ?? INITIAL.stamina),
        kills: scene.kills ?? 0,
        deaths: scene.deaths ?? 0,
        floor: scene.floor ?? 1,
        enemies: scene.enemies ?? 0,
        gold: scene.gold ?? 0,
        items: scene.items ?? 0,
      };
      setVitals((previous) => (sameVitals(previous, next) ? previous : next));
    };

    poll();
    const timer = window.setInterval(poll, 100);
    return () => window.clearInterval(timer);
  }, []);

  return vitals;
}

function sameVitals(a: Vitals, b: Vitals): boolean {
  return (
    a.hp === b.hp &&
    a.maxHp === b.maxHp &&
    a.stamina === b.stamina &&
    a.kills === b.kills &&
    a.deaths === b.deaths &&
    a.floor === b.floor &&
    a.enemies === b.enemies &&
    a.gold === b.gold &&
    a.items === b.items
  );
}

export function HealthBar({ value, max, color }: { readonly value: number; readonly max: number; readonly color: string }): ReactElement {
  const percent = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div className="h-2.5 w-[15vw] max-w-[130px] overflow-hidden rounded-sm border border-black/80 bg-black/70">
      <div
        className="h-full transition-[width] duration-200"
        style={{ width: `${percent}%`, background: color }}
        data-testid="vital-fill"
        data-percent={Math.round(percent)}
      />
    </div>
  );
}

/** Low-health vignette; pure CSS, no per-frame work. */
export function DangerVignette({ hp, maxHp }: { readonly hp: number; readonly maxHp: number }): ReactElement | null {
  const ratio = maxHp > 0 ? hp / maxHp : 1;
  if (ratio > 0.3) return null;
  return (
    <div
      className="pointer-events-none absolute inset-0 z-20 transition-opacity duration-200"
      style={{
        opacity: 1 - ratio / 0.3,
        background: 'radial-gradient(ellipse at center, transparent 42%, rgba(120, 12, 12, 0.55) 100%)',
      }}
      data-testid="danger-vignette"
    />
  );
}
