import type { ReactElement } from 'react';
import { LABYRINTH_FLOORS, LABYRINTH_MODS, LABYRINTH_UNLOCK_STAGE } from '../game/constants';
import { fmt, useGameStore } from '../state/gameStore';
import { useDerived } from '../state/derived';
import { SectionTitle } from '../components/ui';

/**
 * «Лабиринт отражений» (14.3): PvE against copies of your own team with
 * modifiers you see BEFORE the fight. 5 floors, weekly reset.
 */
export function LabyrinthScreen(): ReactElement {
  const game = useGameStore((s) => s.game);
  const { power } = useDerived();
  const startBattle = useGameStore((s) => s.startBattle);
  const setScreen = useGameStore((s) => s.setScreen);

  if (!game.labyrinth.unlocked) {
    return (
      <div className="screen-scroll">
        <SectionTitle>🪞 Лабиринт отражений</SectionTitle>
        <div className="panel" style={{ textAlign: 'center', padding: 28 }}>
          <div style={{ fontSize: 44, opacity: 0.5 }}>🔒</div>
          <div className="title-md">Открывается после {LABYRINTH_UNLOCK_STAGE}-го этапа кампании</div>
          <div className="small muted" style={{ margin: '8px 0 14px' }}>Сейчас пройдено: {game.campaign.maxStage}</div>
          <button className="btn btn-cta" onClick={() => { setScreen('home'); }}>К кампании</button>
        </div>
      </div>
    );
  }

  const floor = game.labyrinth.floor;
  const mod = LABYRINTH_MODS[(floor - 1) % LABYRINTH_MODS.length];

  return (
    <div className="screen-scroll">
      <SectionTitle>🪞 Лабиринт отражений</SectionTitle>
      <div className="panel" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 44 }}>🪞</div>
        <div className="title-lg">Этаж {floor} из {LABYRINTH_FLOORS}</div>
        <div className="small muted">Вы сражаетесь с копиями собственного отряда. Неделя: {game.labyrinth.weekKey} · полных прохождений: {game.labyrinth.completedWeeks}</div>

        <div className="panel panel-tight" style={{ marginTop: 12, borderColor: 'var(--soul)', textAlign: 'left' }}>
          <div className="tiny">МОДИФИКАТОР ЭТАЖА (виден до боя — можно сменить состав):</div>
          <div style={{ fontWeight: 800 }}>⚠️ {mod?.name}</div>
          <div className="small">{mod?.desc}</div>
        </div>

        <div className="row" style={{ justifyContent: 'center', gap: 6, margin: '10px 0' }}>
          {Array.from({ length: LABYRINTH_FLOORS }, (_, i) => (
            <span key={i} className={`res-chip ${i + 1 === floor ? '' : ''}`} style={i + 1 < floor ? { opacity: 0.5 } : i + 1 === floor ? { borderColor: 'var(--gold)' } : undefined}>
              {i + 1 < floor ? '✅' : i + 1 === floor ? '⚔️' : '🔒'} {i + 1}
            </span>
          ))}
        </div>

        <div className="panel panel-tight" style={{ textAlign: 'left' }}>
          <div className="tiny">Награда за этаж: 👻 {2 + floor} осколков душ · 🔷 {10 * floor} шардов</div>
          <div className="tiny">Полный проход: 💎 100 + редкий герой Мара 🦇</div>
          <div className="tiny" style={{ marginTop: 4 }}>Ваша сила: {fmt(power)} — если копия побеждает вас легко, у состава есть слабое место</div>
        </div>

        <button className="btn btn-cta btn-wide" style={{ marginTop: 12 }} onClick={() => { startBattle('labyrinth'); }}>🪞 Войти в отражение</button>
        <button className="btn btn-wide" style={{ marginTop: 8 }} onClick={() => { setScreen('squad'); }}>⚔️ Изменить состав</button>
      </div>
      <div style={{ height: 16 }} />
    </div>
  );
}
