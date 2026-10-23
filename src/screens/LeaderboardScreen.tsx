import { useMemo } from 'react';
import type { ReactElement } from 'react';
import { getPlayerName } from '../platform/telegram';
import { fmt, useGameStore } from '../state/gameStore';
import { useDerived } from '../state/derived';
import { SectionTitle } from '../components/ui';

/**
 * Leaderboard (§6): at MVP stage — squad power & tower floor.
 * Prototype uses deterministic mock rivals; the server-driven board plugs in later.
 */
const RIVALS = [
  { name: 'Гримjaw', power: 480_000, tower: 62 },
  { name: 'LadyVortex', power: 355_000, tower: 54 },
  { name: 'Кощей_228', power: 268_000, tower: 47 },
  { name: 'MoonShard', power: 205_000, tower: 41 },
  { name: 'Тихий_Дон', power: 158_000, tower: 36 },
  { name: 'xX_Echo_Xx', power: 121_000, tower: 30 },
  { name: 'Барон Суббота', power: 92_000, tower: 24 },
  { name: 'NikaStorm', power: 68_000, tower: 18 },
  { name: 'Странник99', power: 45_000, tower: 12 },
  { name: 'Пепел', power: 24_000, tower: 6 },
];

export function LeaderboardScreen(): ReactElement {
  const { power } = useDerived();
  const tower = useGameStore((s) => s.game.tower.bestFloor);
  const name = getPlayerName();

  const rows = useMemo(() => {
    const list = [...RIVALS.map((r) => ({ ...r, me: false })), { name: `${name} (вы)`, power, tower, me: true }];
    return list.sort((a, b) => b.power - a.power);
  }, [power, tower, name]);

  return (
    <div className="screen-scroll">
      <SectionTitle>🏆 Доска лидеров</SectionTitle>
      <div className="panel panel-tight">
        <div className="tiny">Сезонная доска: сила отряда и рекорд башни. Гильдии — после MVP.</div>
      </div>
      <div className="col" style={{ marginTop: 10 }}>
        {rows.map((r, i) => (
          <div key={r.name} className="list-row" style={r.me ? { borderColor: 'var(--gold)' } : undefined}>
            <b style={{ width: 28, textAlign: 'center', fontSize: 14 }}>{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</b>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 13 }}>{r.name}</div>
              <div className="tiny">🗼 башня: этаж {r.tower}</div>
            </div>
            <b>{fmt(r.power)}</b>
          </div>
        ))}
      </div>
      <div style={{ height: 16 }} />
    </div>
  );
}
