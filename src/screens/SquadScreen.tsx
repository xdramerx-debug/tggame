import { useState } from 'react';
import type { ReactElement } from 'react';
import { getHeroDef } from '../game/heroes';
import { computeStats } from '../game/stats';
import type { HeroState } from '../game/types';
import { fmt, heroPower, useGameStore } from '../state/gameStore';
import { useDerived } from '../state/derived';
import { HeroAvatar, Modal, SectionTitle } from '../components/ui';

/**
 * Squad (§3): 2 front + 4 back. Front row takes the hits — the layout itself
 * is a decision. Tap a slot to assign, tap again to remove; auras are live.
 */
export function SquadScreen(): ReactElement {
  const game = useGameStore((s) => s.game);
  const { auras, power } = useDerived();
  const setSlot = useGameStore((s) => s.setSlot);
  const swapSlots = useGameStore((s) => s.swapSlots);
  const [pickFor, setPickFor] = useState<number | null>(null);
  const [swapMode, setSwapMode] = useState<number | null>(null);

  const team = game.team;
  const heroAt = (i: number): HeroState | undefined => {
    const uid = team[i];
    return uid ? game.heroes[uid] : undefined;
  };

  const onSlotTap = (i: number): void => {
    if (swapMode !== null) {
      if (swapMode !== i) swapSlots(swapMode, i);
      setSwapMode(null);
      return;
    }
    setPickFor(i);
  };

  const slotBox = (i: number, label: string): ReactElement => {
    const h = heroAt(i);
    return (
      <button key={i} className={`slot-box ${h ? 'filled' : ''} ${swapMode === i ? 'selected' : ''}`} style={{ flex: 1, minHeight: 92 }} onClick={() => { onSlotTap(i); }}>
        <span className="slot-label">{label}</span>
        {h ? (
          <div className="col" style={{ alignItems: 'center', gap: 2 }}>
            <HeroAvatar hero={h} breath={false} />
            <div className="tiny" style={{ fontWeight: 800 }}>{getHeroDef(h.defId).name}</div>
            <div className="tiny">ур.{h.level} · {fmt(heroPower(h, auras))}</div>
          </div>
        ) : (
          <span className="muted" style={{ fontSize: 22 }}>＋</span>
        )}
      </button>
    );
  };

  return (
    <div className="screen-scroll">
      <SectionTitle
        right={<span className="res-chip">⚡ Сила отряда: {fmt(power)}</span>}
      >
        Состав · 6 героев
      </SectionTitle>

      <div className="panel">
        <div className="tiny" style={{ textAlign: 'center', marginBottom: 6 }}>ПЕРЕДНИЙ РЯД — принимает основной урон. Ставьте танков первыми!</div>
        <div className="row" style={{ gap: 8 }}>
          {slotBox(0, 'ФРОНТ 1')}
          {slotBox(1, 'ФРОНТ 2')}
        </div>
        <div className="tiny" style={{ textAlign: 'center', margin: '10px 0 6px' }}>ЗАДНИЙ РЯД — урон и поддержка. Обычные атаки идут слева направо: фронт 1 → фронт 2 → задний ряд</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          {slotBox(2, 'ТЫЛ 1')}
          {slotBox(3, 'ТЫЛ 2')}
          {slotBox(4, 'ТЫЛ 3')}
          {slotBox(5, 'ТЫЛ 4')}
        </div>
        <div className="row" style={{ marginTop: 10, justifyContent: 'center', gap: 8 }}>
          <button className="btn btn-sm" onClick={() => { setSwapMode(swapMode === null ? 0 : null); }}>
            {swapMode === null ? '⇄ Поменять местами' : `Выберите пару (первый: ${swapMode + 1})`}
          </button>
        </div>
      </div>

      {/* Auras */}
      <SectionTitle>Ауры отряда</SectionTitle>
      <div className="panel">
        {auras.length === 0 ? (
          <div className="small muted">
            Пока нет активных аур. Соберите моно-фракцию (6 одинаковых), микс «Разрушение» (2 Тень + 2 Тьма + 2 Бездна),
            «Искупление» (2 Свет + 2 Лес + 2 Крепость), «Радугу» (6 разных фракций) или 2 танков / 2 лекарей.
          </div>
        ) : (
          <div className="col" style={{ gap: 6 }}>
            {auras.map((a) => (
              <div key={a.id} className="row" style={{ gap: 8 }}>
                <span className="aura-chip">✦ {a.name}</span>
                <span className="tiny">{a.desc}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Team stats preview */}
      <SectionTitle>Характеристики отряда</SectionTitle>
      <div className="panel">
        <div className="col" style={{ gap: 4 }}>
          {team.map((uid, i) => {
            const h = uid ? game.heroes[uid] : undefined;
            if (!h) return <div key={i} className="tiny muted">Слот {i + 1}: пусто</div>;
            const st = computeStats(h, { auras });
            const d = getHeroDef(h.defId);
            return (
              <div key={i} className="row-between">
                <span className="small">{d.emoji} <b>{d.name}</b> · {i < 2 ? 'фронт' : 'тыл'}</span>
                <span className="tiny">HP {fmt(st.hp)} · ATK {fmt(st.atk)} · SPD {st.spd}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ height: 16 }} />

      {/* Hero picker */}
      {pickFor !== null ? (
        <Modal title={`Слот ${pickFor + 1} (${pickFor < 2 ? 'передний ряд' : 'задний ряд'})`} onClose={() => { setPickFor(null); }}>
          <div className="col">
            {team[pickFor] ? (
              <button className="btn" onClick={() => { setSlot(pickFor, null); setPickFor(null); }}>➖ Убрать из отряда</button>
            ) : null}
            <div className="hero-grid" style={{ marginTop: 4 }}>
              {Object.values(game.heroes).map((h) => {
                const d = getHeroDef(h.defId);
                const inTeam = team.includes(h.uid);
                return (
                  <button
                    key={h.uid}
                    className={`hero-card ${inTeam ? 'selected' : ''}`}
                    onClick={() => { setSlot(pickFor, h.uid); setPickFor(null); }}
                  >
                    <HeroAvatar hero={h} breath={false} />
                    <div style={{ fontWeight: 800, fontSize: 10, textAlign: 'center' }}>{d.name}</div>
                    <div className="tiny">ур.{h.level} · {inTeam ? 'в отряде' : fmt(heroPower(h, auras))}</div>
                  </button>
                );
              })}
            </div>
            {Object.keys(game.heroes).length === 0 ? (
              <div className="muted small">Героев пока нет — начните с призыва</div>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
