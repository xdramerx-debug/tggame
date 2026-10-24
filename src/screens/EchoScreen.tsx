import type { ReactElement } from 'react';
import { ECHO_BUFFS, SOUL_CAP } from '../game/constants';
import { useGameStore } from '../state/gameStore';
import { SectionTitle } from '../components/ui';

/**
 * «Эхо павших» (14.1): every defeat leaves soul shards (1–3 by fallen count).
 * Spend them on a temporary buff — or save for the Soul Forge. Buffs don't
 * stack, they replace each other. Cap: 20 shards.
 */
export function EchoScreen(): ReactElement {
  const game = useGameStore((s) => s.game);
  const activate = useGameStore((s) => s.activateEchoBuff);
  const souls = game.resources.souls;
  const active = game.echo.buff;
  const activeDef = ECHO_BUFFS.find((b) => b.kind === active?.kind);

  return (
    <div className="screen-scroll">
      <SectionTitle right={<span className="res-chip">👻 {souls} / {SOUL_CAP}</span>}>👻 Эхо павших</SectionTitle>

      <div className="panel" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 40 }}>👻</div>
        <div className="small muted" style={{ margin: '6px 0' }}>
          Каждый проигранный бой оставляет эхо — {souls > 0 ? `у вас ${souls} осколков душ.` : 'осколки душ падают с павших героев (1–3 за бой).'}
        </div>
        <div className="tiny">Всего собрано за игру: {game.echo.totalEarned} · Поражений: {game.stats.battlesLost} · Кап запаса: {SOUL_CAP}</div>
      </div>

      {active ? (
        <div className="panel" style={{ marginTop: 10, borderColor: 'var(--soul)' }}>
          <div className="row-between">
            <div>
              <div className="title-md">Активен: «{activeDef?.name}»</div>
              <div className="tiny">{activeDef?.desc}</div>
            </div>
            <span className="res-chip">⏳ {active.battlesLeft} бой(я)</span>
          </div>
          <div className="tiny" style={{ marginTop: 6 }}>Баффы не складываются — новый бафф заменит текущий.</div>
        </div>
      ) : null}

      <SectionTitle>Баффы эха</SectionTitle>
      <div className="col">
        {ECHO_BUFFS.map((b) => (
          <div key={b.kind} className="list-row">
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 13 }}>{b.name}</div>
              <div className="tiny">{b.desc}</div>
            </div>
            <button className={`btn btn-sm ${souls >= b.cost ? 'btn-gold' : ''}`} disabled={souls < b.cost} onClick={() => { activate(b.kind); }}>
              {b.cost} 👻
            </button>
          </div>
        ))}
      </div>

      <div className="panel panel-tight" style={{ marginTop: 12 }}>
        <div className="tiny">
          💡 Осколки также нужны «Кузнице душ» (8 👻 за ковку). Выбор «сейчас или потом» — за вами:
          бафф на ближайшие бои или шанс на легендарный предмет.
        </div>
      </div>
      <div style={{ height: 16 }} />
    </div>
  );
}
