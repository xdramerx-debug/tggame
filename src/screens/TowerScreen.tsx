import { useMemo } from 'react';
import type { ReactElement } from 'react';
import { buildTowerFloor, stageToUnits } from '../game/stages';
import { powerOf } from '../game/stats';
import { FACTION_META } from '../game/constants';
import { fmt, useGameStore } from '../state/gameStore';
import { useDerived } from '../state/derived';
import { SectionTitle } from '../components/ui';

/** Башня (§6): endless mode, first-clear rewards — «запасная» цель. */
export function TowerScreen(): ReactElement {
  const game = useGameStore((s) => s.game);
  const { power } = useDerived();
  const startBattle = useGameStore((s) => s.startBattle);
  const floor = game.tower.floor;
  const def = useMemo(() => buildTowerFloor(floor), [floor]);
  const units = useMemo(() => stageToUnits(def), [def]);
  const enemyPower = useMemo(() => units.reduce((s, u) => s + powerOf(u.stats), 0), [units]);

  return (
    <div className="screen-scroll">
      <SectionTitle>🗼 Башня Эха</SectionTitle>
      <div className="panel" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 44 }}>🗼</div>
        <div className="title-lg">Этаж {floor}</div>
        <div className="small muted">Рекорд: этаж {game.tower.bestFloor} · бесконечный режим</div>
        <div className="row" style={{ justifyContent: 'center', marginTop: 10, gap: 4 }}>
          {units.map((u, i) => (
            <span key={i} className="hero-avatar" style={{ width: 38, height: 38, fontSize: 19, borderColor: FACTION_META[u.def.faction].color }}>{u.def.emoji}</span>
          ))}
        </div>
        <div className="row-between" style={{ marginTop: 10 }}>
          <span className="small">Сила врага: <b style={{ color: enemyPower > power ? 'var(--danger)' : 'var(--ok)' }}>{fmt(enemyPower)}</b></span>
          <span className="small">Ваша сила: <b>{fmt(power)}</b></span>
        </div>
        <div className="panel panel-tight" style={{ marginTop: 8, textAlign: 'left' }}>
          <div className="tiny">Награда за ПЕРВЫЙ проход этажа:</div>
          <div className="small">
            🪙 {fmt(def.firstReward.gold ?? 0)} · 📘 {fmt(def.firstReward.heroExp ?? 0)} · 🔷 {def.firstReward.shards ?? 0}
            {def.firstReward.crystals ? ` · 💎 ${def.firstReward.crystals}` : ''}{def.firstReward.souls ? ` · 👻 ${def.firstReward.souls}` : ''}
          </div>
          <div className="tiny">Повторный проход: 🪙 {fmt(def.repeatReward.gold ?? 0)} · 📘 {fmt(def.repeatReward.heroExp ?? 0)}</div>
        </div>
        <button className="btn btn-cta btn-wide" style={{ marginTop: 12 }} onClick={() => { startBattle('tower'); }}>⚔️ Штурмовать этаж</button>
        <div className="tiny" style={{ marginTop: 6 }}>Каждый 5-й этаж — усиленный страж с босс-статами</div>
      </div>
      <div style={{ height: 16 }} />
    </div>
  );
}
