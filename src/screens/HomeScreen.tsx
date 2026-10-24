import { useMemo } from 'react';
import type { ReactElement } from 'react';
import { ECHO_BUFFS, FACTION_META, LABYRINTH_UNLOCK_STAGE } from '../game/constants';
import { buildStage, stageToUnits, idleRatesPerHour } from '../game/stages';
import { powerOf } from '../game/stats';
import { chapterOf } from '../game/stages';
import { fmt, useGameStore } from '../state/gameStore';
import { useDerived } from '../state/derived';
import type { GameState } from '../game/types';
import { HeroAvatar, SectionTitle } from '../components/ui';

export function HomeScreen(): ReactElement {
  const game = useGameStore((s) => s.game);
  const { power, heroes: teamHeroes } = useDerived();
  const startBattle = useGameStore((s) => s.startBattle);
  const setScreen = useGameStore((s) => s.setScreen);
  const activatePact = useGameStore((s) => s.activatePact);
  const ftue = game.ftue;

  const stage = game.campaign.stage;
  const stageDef = useMemo(() => buildStage(stage), [stage]);
  const enemyUnits = useMemo(() => stageToUnits(stageDef), [stageDef]);
  const enemyPower = useMemo(() => enemyUnits.reduce((s, u) => s + powerOf(u.stats), 0), [enemyUnits]);
  const rates = useMemo(() => idleRatesPerHour(game), [game]);
  const ch = chapterOf(stage);
  const edge = power / Math.max(1, enemyPower);

  const echoBuff = ECHO_BUFFS.find((b) => b.kind === game.echo.buff?.kind);

  return (
    <div className="screen-scroll">
      {/* Campaign stage card */}
      <div className="panel" style={{ background: 'linear-gradient(145deg, var(--panel2), var(--panel))' }}>
        <div className="row-between">
          <div>
            <div className="small">Глава {ch.chapter} · {ch.name}</div>
            <div className="title-lg">{stageDef.boss ? `👹 БОСС: ${stageDef.name}` : `Этап ${stage}`}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div className="small">Сила врага</div>
            <div style={{ fontWeight: 900, color: enemyPower > power ? 'var(--danger)' : 'var(--ok)' }}>{fmt(enemyPower)}</div>
          </div>
        </div>
        <div className="row" style={{ marginTop: 10, justifyContent: 'center', gap: 4 }}>
          {enemyUnits.map((u, i) => (
            <div key={i} className="hero-avatar" style={{ width: 40, height: 40, fontSize: 20, borderColor: FACTION_META[u.def.faction].color }}>
              {u.def.emoji}
            </div>
          ))}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <div className="progress-line">
            <div className="progress-fill" style={{ width: `${Math.min(100, edge * 50)}%` }} />
          </div>
          <span className="tiny">{edge >= 1.15 ? '✅ Состав сильнее — в бой!' : edge >= 0.85 ? '⚖️ Равный бой: исход решат позиции и ауры' : '⚠️ Враг сильнее: прокачай состав или смени позиции'}</span>
        </div>
      </div>

      {/* Main CTA */}
      <div style={{ margin: '14px 0' }}>
        <button className={`btn btn-cta btn-wide ${!ftue.done && ftue.step <= 1 ? 'pulse-cta' : ''}`} style={{ minHeight: 60, fontSize: 18 }} onClick={() => { startBattle('campaign'); }}>
          ⚔️ В БОЙ {stageDef.boss ? '(босс)' : ''}
        </button>
      </div>

      {/* Echo of the fallen (14.1) */}
      <div className="panel panel-tight">
        <div className="row-between">
          <div className="row">
            <span style={{ fontSize: 20 }}>👻</span>
            <div>
              <div className="title-md" style={{ fontSize: 13 }}>Эхо павших</div>
              <div className="tiny">
                {game.echo.buff
                  ? `«${echoBuff?.name}»: ещё ${game.echo.buff.battlesLeft} бой(я)`
                  : `Осколков душ: ${game.resources.souls} · поражение не бывает пустым`}
              </div>
            </div>
          </div>
          <button className="btn btn-sm" onClick={() => { setScreen('echo'); }}>{game.echo.buff ? 'Заменить' : 'Баффы'}</button>
        </div>
      </div>

      {/* Shadow pact (14.4) */}
      <div className="panel panel-tight" style={{ marginTop: 8 }}>
        <div className="row-between">
          <div className="row">
            <span style={{ fontSize: 20 }}>🌒</span>
            <div>
              <div className="title-md" style={{ fontSize: 13 }}>Пакт с тенью</div>
              <div className="tiny">
                {game.pact.slot !== null
                  ? `Слот ${game.pact.slot + 1}: +30% урона в следующем бою`
                  : '+30% урона одному герою на 1 бой. Цена — дебафф после боя'}
              </div>
            </div>
          </div>
          {game.pact.slot !== null ? (
            <button className="btn btn-sm" onClick={() => { useGameStore.getState().removePactForCrystals(); }}>Снять 30💎</button>
          ) : (
            <div className="row" style={{ gap: 4 }}>
              {game.team.map((uid, i) => uid && i < 4 ? (
                <button key={i} className="btn btn-sm" onClick={() => { activatePact(i); }} title={`Пакт на слот ${i + 1}`}>{i + 1}</button>
              ) : null)}
            </div>
          )}
        </div>
      </div>

      {/* Team overview + FTUE step 2 CTA */}
      <SectionTitle right={<button className="btn btn-sm" onClick={() => { setScreen('squad'); }}>Изменить состав</button>}>
        Отряд
      </SectionTitle>
      <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {teamHeroes.map((h) => (
          <button key={h.uid} className="hero-card" style={{ width: 76, padding: 6 }} onClick={() => { setScreen('heroes'); }}>
            <HeroAvatar hero={h} />
            <div className="tiny" style={{ fontWeight: 800 }}>ур. {h.level}</div>
          </button>
        ))}
        {teamHeroes.length === 0 ? <div className="muted small">Состав пуст — зайдите в «Отряд»</div> : null}
      </div>

      {/* Idle income hint */}
      <div className="panel panel-tight" style={{ marginTop: 12 }}>
        <div className="row-between">
          <div className="tiny">⏳ Авто-доход: {fmt(rates.gold)} 🪙/час · {fmt(rates.exp)} опыта/час (кап 12 ч)</div>
        </div>
      </div>

      {/* Quick modes */}
      <SectionTitle>Режимы</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <button className="btn" onClick={() => { setScreen('tower'); }}>🗼 Башня · эт. {game.tower.floor}</button>
        <button className="btn" disabled={!game.labyrinth.unlocked} onClick={() => { setScreen('labyrinth'); }}>
          {game.labyrinth.unlocked ? `🪞 Лабиринт · эт. ${game.labyrinth.floor}` : `🪞 Лабиринт (с этапа ${LABYRINTH_UNLOCK_STAGE})`}
        </button>
        <button className="btn" onClick={() => { setScreen('forge'); }}>⚒️ Кузница душ</button>
        <button className="btn" onClick={() => { setScreen('quests'); }}>📋 Задания</button>
      </div>

      {/* Next goal (§9) */}
      <div className="panel panel-tight" style={{ marginTop: 12, borderColor: 'var(--gold)' }}>
        <div className="tiny">🎯 Следующая цель</div>
        <div style={{ fontWeight: 800, fontSize: 13 }}>{nextGoal(game)}</div>
      </div>
      <div style={{ height: 16 }} />
    </div>
  );
}

function nextGoal(game: GameState): string {
  const levels = Object.values(game.heroes).map((h) => h.level);
  const teamSize = game.team.filter(Boolean).length;
  if (!game.ftue.done && game.ftue.step === 2) return 'Улучшить героя до следующего уровня';
  if (teamSize < 2) return 'Собери отряд: добавь героев в состав';
  if (levels.length > 0 && Math.max(...levels) < 10 && game.campaign.stage <= 4) return 'Улучшить героя до 10 уровня';
  if (game.campaign.stage % 10 !== 0) return `Победить ещё ${10 - (game.campaign.stage % 10)} врагов до босса (этап ${game.campaign.stage})`;
  return `Одолеть босса этапа ${game.campaign.stage}`;
}
