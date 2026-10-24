import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { SOUL_CAP } from '../game/constants';
import { computeOffline } from '../game/offline';
import { fmt, useGameStore } from '../state/gameStore';
import { useDerived } from '../state/derived';
import { ResourceChip } from './ui';

/** Ticking clock kept out of render so components stay pure. */
function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => { setNow(Date.now()); }, intervalMs);
    return () => { window.clearInterval(t); };
  }, [intervalMs]);
  return now;
}

export function TopBar(): ReactElement {
  const res = useGameStore((s) => s.game.resources);
  const game = useGameStore((s) => s.game);
  const { power } = useDerived();
  const setScreen = useGameStore((s) => s.setScreen);
  const now = useNow();

  // метка на иконке, если оффлайн-кап близок к заполнению (§2)
  const off = computeOffline(game, now);
  const nearCap = off?.nearCap === true;

  return (
    <div className="topbar">
      <button className="res-chip" style={{ border: 'none', background: 'transparent', padding: '4px 2px' }} onClick={() => { setScreen('home'); }}>
        <span style={{ fontSize: 16 }}>🔮</span>
        <span style={{ fontWeight: 900, fontSize: 12 }}>Сила {fmt(power)}</span>
      </button>
      <ResourceChip icon="🪙" value={fmt(res.gold)} title="Золото" dot={nearCap} />
      <ResourceChip icon="💎" value={fmt(res.crystals)} title="Кристаллы Эха" />
      <ResourceChip icon="🔷" value={fmt(res.shards)} title="Шарды" />
      <ResourceChip icon="👻" value={`${res.souls}/${SOUL_CAP}`} title="Осколки душ" />
      <ResourceChip icon="📜" value={String(res.scrolls)} title="Свитки призыва" />
    </div>
  );
}
